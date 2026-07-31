#!/usr/bin/env node
// IPP-probe voor de myPOS Ultra in ECR-modus.
//
// IPP is myPOS' eigen terminal-protocol. Het staat niet in hun publieke docs,
// maar hun .NET-SDK implementeert het en die is te lezen:
// github.com/developermypos/myPOS-SDK-dotNET -> myPOS-SDK/myPOSTerminal.dll
// ("Library for communication via IPP protocol with traditional myPOS Devices",
// v2.0.0.1). De demo-app verbindt er via TCP mee:
//
//   tcpClientTerminal = new TcpClient(ip, port);
//   t.Initialize(tcpClientTerminal.GetStream());
//
// Wire-formaat (uit IPPProcessor.GetDataForSending / ReceiveMessage):
//
//   [2 bytes lengte, big-endian, INCLUSIEF deze twee bytes]
//   NAAM=WAARDE\r\n
//   NAAM=WAARDE\r\n
//   ...
//
// Velden zijn ASCII. Uitzonderingen: DATA en CERT hebben zelf weer een 2-byte
// lengteprefix en zijn binair; DISPLAY_TEXT_* is UTF-8; CHAIN/FINGERPRINT/
// PRINT_DATA zijn ruwe bytes tot CRLF.
//
// Elk verzoek begint met PROTOCOL=IPP, VERSION=200, METHOD=<naam>, SID=<uuid>.
// Antwoorden dragen STAGE en STATUS. STAGE 5 is het eind van een transactie.
//
// Géén HMAC, géén api_key — dat hoort bij een ander (ouder) myPOS-protocol.
//
// Gebruik:
//   node mypos-ipp-probe.mjs --host 192.168.1.135 --port 7900 --status
//   node mypos-ipp-probe.mjs --host 192.168.1.135 --port 7900 --pay 0.01

import net from "node:net";
import crypto from "node:crypto";
import { pathToFileURL } from "node:url";

// Alleen de CLI draaien als dit bestand rechtstreeks wordt aangeroepen, zodat
// encodeIpp/decodeIpp los importeerbaar en testbaar blijven.
const isCli =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

const args = {};
for (let i = 2; i < process.argv.length; i++) {
  const a = process.argv[i];
  if (!a.startsWith("--")) continue;
  const next = process.argv[i + 1];
  if (next === undefined || next.startsWith("--")) args[a.slice(2)] = true;
  else { args[a.slice(2)] = next; i++; }
}

if (isCli && !args.host) {
  console.error(`
  node mypos-ipp-probe.mjs --host <ip> [--port 7900] [opties]

Opties:
  --status          Stuur GET_STATUS (veilig, start geen transactie)
  --pay <bedrag>    Stuur PURCHASE, bijv. --pay 0.01
  --reference <ref> Referentie bij de betaling (default: PROBE-<tijd>)
  --timeout <ms>    Wachttijd op het volgende bericht (default 120000)

  --password <code>   Voeg PASSWORD=<code> toe aan het verzoek
  --credential <code> Voeg CREDENTIAL=<code> toe aan het verzoek
  --both <code>       Beide velden tegelijk, als je niet weet welke het is

PASSWORD en CREDENTIAL zijn veldnamen uit myPOSTerminal.dll. Als de terminal
een code toont die de kassa moet meesturen, is dit vermoedelijk waar hij hoort.
`);
  process.exit(1);
}

const HOST = args.host;
const PORT = Number(args.port ?? 7900);
const TIMEOUT_MS = Number(args.timeout ?? 120000);
const CURRENCY_EUR = 978;

// ── IPP-codec ───────────────────────────────────────────────────────────────

/** Bouwt één IPP-frame: 2-byte lengte (inclusief zichzelf) + NAAM=WAARDE\r\n. */
export function encodeIpp(fields) {
  const parts = [];
  for (const [name, value] of fields) {
    parts.push(Buffer.from(`${name}=${value}\r\n`, "ascii"));
  }
  const body = Buffer.concat(parts);
  const total = body.length + 2;
  const head = Buffer.alloc(2);
  head.writeUInt16BE(total);
  return Buffer.concat([head, body]);
}

/**
 * Haalt complete frames uit een streambuffer. De lengte in de header telt de
 * twee headerbytes mee, dus de body is lengte-2.
 */
export function decodeIpp(buffer) {
  const frames = [];
  let offset = 0;
  while (buffer.length - offset >= 2) {
    const total = buffer.readUInt16BE(offset);
    if (total < 2) {
      // Onzin-lengte; verder lezen heeft geen zin.
      return { frames, rest: Buffer.alloc(0), broken: true };
    }
    if (buffer.length - offset < total) break;
    const body = buffer.subarray(offset + 2, offset + total);
    frames.push(parseFields(body));
    offset += total;
  }
  return { frames, rest: buffer.subarray(offset), broken: false };
}

/** Splitst een body in velden. Binaire velden worden als hex bewaard. */
function parseFields(body) {
  const fields = {};
  let i = 0;
  while (i < body.length) {
    const eq = body.indexOf(0x3d, i); // '='
    if (eq < 0) break;
    const name = body.subarray(i, eq).toString("ascii");
    i = eq + 1;

    if (name === "DATA" || name === "CERT") {
      // Eigen 2-byte lengteprefix, daarna binair.
      const len = (body[i] << 8) + body[i + 1];
      const start = i;
      fields[name] = { binary: true, hex: body.subarray(start, start + len).toString("hex"), size: len };
      i = start + len;
      if (body[i] === 0x0d && body[i + 1] === 0x0a) i += 2;
      continue;
    }

    const crlf = body.indexOf("\r\n", i, "ascii");
    const end = crlf < 0 ? body.length : crlf;
    const raw = body.subarray(i, end);
    const printable = raw.every((b) => (b >= 0x20 && b <= 0x7e) || b === 0x09);
    fields[name] = printable ? raw.toString("ascii") : { binary: true, hex: raw.toString("hex"), size: raw.length };
    i = end + 2;
  }
  return fields;
}

/**
 * PASSWORD en CREDENTIAL zijn veldnamen uit myPOSTerminal.dll. In ERP-modus
 * toont de terminal een 9-cijferige code; het vermoeden is dat die hier hoort.
 * Welke van de twee namen het is, weten we niet — vandaar --both.
 */
function authFields() {
  const out = [];
  const both = args.both;
  const password = args.password ?? (both ? both : null);
  const credential = args.credential ?? (both ? both : null);
  if (password) out.push(["PASSWORD", String(password)]);
  if (credential) out.push(["CREDENTIAL", String(credential)]);
  return out;
}

function newRequest(method, extra = []) {
  return encodeIpp([
    ["PROTOCOL", "IPP"],
    ["VERSION", "200"],
    ["METHOD", method],
    ["SID", crypto.randomUUID()],
    ...authFields(),
    ...extra,
  ]);
}

// ── Conversatie ─────────────────────────────────────────────────────────────

const STAGE_MEANING = {
  "1": "verzoek ontvangen",
  "2": "kaart gelezen",
  "3": "pincode",
  "4": "HOST-COMMUNICATIE — terminal vraagt de kassa om door te sturen",
  "5": "transactie afgerond",
  "11": "presenteer kaart",
  "12": "DCC-aanbod",
  "13": "voer pincode in",
};

function describeFrame(f) {
  const method = f.METHOD ?? "?";
  const stage = f.STAGE ?? "-";
  const status = f.STATUS ?? "-";
  const meaning = STAGE_MEANING[stage] ? ` (${STAGE_MEANING[stage]})` : "";
  return `METHOD=${method}  STAGE=${stage}${meaning}  STATUS=${status}`;
}

function converse(frame) {
  return new Promise((resolve, reject) => {
    const socket = new net.Socket();
    let buffer = Buffer.alloc(0);
    const seen = [];
    let sawHostStage = false;
    let settled = false;

    const finish = (fn) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      socket.destroy();
      fn();
    };
    const timer = setTimeout(
      () => finish(() => resolve({ seen, sawHostStage, reason: "timeout" })),
      TIMEOUT_MS,
    );

    socket.once("connect", () => {
      console.log(`  → ${frame.length} bytes: ${JSON.stringify(frame.subarray(2).toString("ascii"))}`);
      socket.write(frame);
    });

    socket.on("data", (chunk) => {
      buffer = Buffer.concat([buffer, chunk]);
      const { frames, rest, broken } = decodeIpp(buffer);
      buffer = rest;

      if (broken) {
        finish(() =>
          reject(new Error(`Onleesbaar frame. Ruwe bytes: ${chunk.subarray(0, 64).toString("hex")}`)),
        );
        return;
      }

      for (const f of frames) {
        seen.push(f);
        console.log(`  ← ${describeFrame(f)}`);
        for (const [k, v] of Object.entries(f)) {
          if (["PROTOCOL", "VERSION", "METHOD", "SID", "STAGE", "STATUS"].includes(k)) continue;
          const shown = typeof v === "string" ? v : `<${v.size} bytes binair>`;
          console.log(`       ${k.padEnd(22)} ${shown}`);
        }
        if (f.STAGE === "4") sawHostStage = true;
        if (f.STAGE === "5") {
          finish(() => resolve({ seen, sawHostStage, reason: "finished" }));
          return;
        }
      }
    });

    socket.once("error", (e) => finish(() => reject(new Error(`socket: ${e.message}`))));
    socket.once("close", () =>
      finish(() => resolve({ seen, sawHostStage, reason: "closed" })),
    );

    socket.connect(PORT, HOST);
  });
}

// ── Uitvoeren ───────────────────────────────────────────────────────────────

const main = async () => {
  console.log("─".repeat(70));
  console.log(`myPOS IPP-probe — ${HOST}:${PORT}`);
  console.log("─".repeat(70));

  let frame;
  if (args.pay) {
    const amount = Number(args.pay);
    if (!Number.isFinite(amount) || amount <= 0) {
      console.error(`--pay moet een positief bedrag zijn, kreeg: ${args.pay}`);
      process.exit(1);
    }
    console.log(`\nPURCHASE van ${amount.toFixed(2)} EUR — de terminal wordt wakker.`);
    console.log("Niet met een kaart doorgaan; laat de transactie aflopen of annuleer.\n");
    frame = newRequest("PURCHASE", [
      ["AMOUNT", amount.toFixed(2)],
      ["CURRENCY", String(CURRENCY_EUR)],
      ["REFERENCE", args.reference ?? `PROBE-${process.pid}`],
      ["FIXED_PINPAD", "0"],
    ]);
  } else {
    console.log("\nGET_STATUS — veilig, start geen transactie.\n");
    frame = newRequest("GET_STATUS");
  }

  const { seen, sawHostStage, reason } = await converse(frame);

  console.log("─".repeat(70));
  if (!seen.length) {
    console.log(`
Geen enkel IPP-frame terug (${reason}).

Controleer of ECR-POS Connect open op de voorgrond staat en of het IP en de
poort nog kloppen met wat de app toont.
`);
    return;
  }

  console.log(`\n${seen.length} frame(s) ontvangen, afgesloten met: ${reason}\n`);

  if (sawHostStage) {
    console.log(`LET OP — de terminal vroeg om HOST-COMMUNICATIE (STAGE 4).

Dat betekent dat hij de kassa gebruikt als netwerkpad naar de myPOS-host, in
plaats van zijn eigen simkaart. De Pi heeft dan alsnog internet nodig; de
ECR-route levert in dat geval geen offline-voordeel op.
`);
  } else if (reason === "finished") {
    console.log(`De transactie liep tot STAGE 5 zonder ooit om host-communicatie te vragen.

Dat is het goede scenario: de Ultra regelt de autorisatie zelf via zijn
simkaart, en de Pi heeft geen internet nodig.
`);
  }
};

if (isCli) {
  main().catch((e) => {
    console.error("\nFout:", e.message);
    process.exit(1);
  });
}
