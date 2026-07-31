#!/usr/bin/env node
// Probe voor de myPOS Ultra in ECR-modus op het lokale netwerk.
//
// Doel: vaststellen op welke poort de terminal luistert en welk protocol hij
// spreekt. Er zijn twee kandidaten:
//
//   A. Semi-Integrated: kale TCP-socket, één JSON-blob, HMAC-SHA256 signature.
//      Afgeleid uit myPOS' eigen SDK (developermypos/mypos-js,
//      resources/devices/semi-integrated/base-request.js). Dit is de enige
//      variant waarvoor echte myPOS-broncode bestaat.
//
//   B. HTTP: POST /payment met een platte JSON-body zonder authenticatie.
//      Circuleert online, maar staat in geen enkele myPOS-bron. Waarschijnlijk
//      verzonnen — we toetsen hem omdat uitsluiten goedkoop is.
//
// Standaard doet dit script alleen een poortscan plus een passieve banner-lees:
// er gaat geen betaalopdracht naar de terminal. Pas met --pay stuurt hij een
// echte payment-request; de terminal wordt dan wakker en toont een bedrag.
//
// Gebruik:
//   node mypos-ecr-probe.mjs --host 10.42.0.5
//   node mypos-ecr-probe.mjs --host 10.42.0.5 --pay 0.01 \
//        --tid 12345678 --api-key KEY --api-secret SECRET

import net from "node:net";
import crypto from "node:crypto";

const DEFAULT_PORTS = [7900, 8888, 5000, 8080, 9100, 4444, 6000, 1234];
const CONNECT_TIMEOUT_MS = 1500;
const BANNER_WAIT_MS = 3000;
const PAYMENT_WAIT_MS = 90000;

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    if (!argv[i].startsWith("--")) continue;
    const key = argv[i].slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith("--")) {
      out[key] = true;
    } else {
      out[key] = next;
      i++;
    }
  }
  return out;
}

const args = parseArgs(process.argv.slice(2));

if (!args.host) {
  console.error(`
Geen --host opgegeven.

  node mypos-ecr-probe.mjs --host <ip-van-ultra> [opties]

Opties:
  --ports 7900,8888    Poorten om te scannen (default: ${DEFAULT_PORTS.join(",")})
  --pay 0.01           Stuur een echte payment-request van dit bedrag
  --tid <tid>          Terminal ID (verplicht bij --pay, tenzij --sn)
  --sn <serial>        Serienummer van de terminal (alternatief voor --tid)
  --api-key <key>      myPOS api_key (verplicht bij --pay)
  --api-secret <sec>   myPOS api_secret (verplicht bij --pay)
  --fingerprint        Stuur een reeks onschuldige frames en dump wat de
                       terminal terugstuurt, om te bepalen welk protocol hij
                       spreekt. Verstuurt GEEN betaalopdracht.
  --http               Toets ook de HTTP-hypothese (POST /payment)

Sleutels kunnen ook via de omgeving, wat de voorkeur heeft: CLI-argumenten zijn
op Linux zichtbaar in de procestabel voor elke andere gebruiker.

  export MYPOS_API_KEY=...
  export MYPOS_API_SECRET=...
`);
  process.exit(1);
}

// Env gaat voor op CLI-argumenten, zodat het secret niet in de shell-history
// of de procestabel belandt.
const apiKey = process.env.MYPOS_API_KEY || args["api-key"];
const apiSecret = process.env.MYPOS_API_SECRET || args["api-secret"];

const host = args.host;
const ports = args.ports
  ? String(args.ports).split(",").map((p) => Number(p.trim()))
  : DEFAULT_PORTS;

const log = (...a) => console.log(...a);
const hr = () => log("─".repeat(64));

// ── Poortscan ────────────────────────────────────────────────────────────────

function checkPort(port) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let settled = false;
    const done = (open) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(open);
    };
    socket.setTimeout(CONNECT_TIMEOUT_MS);
    socket.once("connect", () => done(true));
    socket.once("timeout", () => done(false));
    socket.once("error", () => done(false));
    socket.connect(port, host);
  });
}

// Verbind en luister zonder iets te sturen. Sommige ECR-implementaties sturen
// uit zichzelf een hello/status-frame zodra je verbindt.
function readBanner(port) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    const chunks = [];
    const done = () => {
      socket.destroy();
      resolve(Buffer.concat(chunks));
    };
    socket.setTimeout(BANNER_WAIT_MS);
    socket.once("connect", () => setTimeout(done, BANNER_WAIT_MS));
    socket.on("data", (d) => chunks.push(d));
    socket.once("timeout", done);
    socket.once("error", done);
    socket.connect(port, host);
  });
}

function describe(buf) {
  if (!buf.length) return "(niets ontvangen)";
  const ascii = buf.toString("utf8");
  const printable = /^[\x20-\x7e\r\n\t]*$/.test(ascii);
  const hex = buf.subarray(0, 64).toString("hex").replace(/(..)/g, "$1 ").trim();
  return printable ? `ascii: ${ascii.trim()}` : `hex: ${hex}${buf.length > 64 ? " …" : ""}`;
}

// ── Fingerprint: welk protocol luistert hier eigenlijk? ─────────────────────

// De terminal zwijgt tot je iets stuurt, dus een passieve lees zegt niks. Deze
// modus stuurt een reeks kandidaat-frames en dumpt letterlijk wat er terugkomt.
// Bewust géén betaalopdrachten: een onbekend of ongeldig commando hoort een
// foutantwoord op te leveren, en juist dát foutantwoord verraadt de familie.
//
//   * los JSON            -> myPOS semi-integrated (wat de pi-bridge nu spreekt)
//   * 0x15 (NAK)          -> klassiek ECR, byte-georiënteerd
//   * 0x02 ... 0x03 LRC   -> PAX POSLink-familie
//   * lengte-prefix       -> length-framed binair protocol

/** PAX-stijl frame: STX + payload + ETX + LRC (XOR over payload..ETX). */
function paxFrame(payload) {
  const body = Buffer.from(payload, "ascii")
  const withEtx = Buffer.concat([body, Buffer.from([0x03])])
  let lrc = 0
  for (const b of withEtx) lrc ^= b
  return Buffer.concat([Buffer.from([0x02]), withEtx, Buffer.from([lrc])])
}

/** 2-byte big-endian lengte-prefix, gangbaar bij length-framed protocollen. */
function lenPrefixed(payload) {
  const body = Buffer.from(payload, "ascii")
  const len = Buffer.alloc(2)
  len.writeUInt16BE(body.length)
  return Buffer.concat([len, body])
}

const FINGERPRINT_FRAMES = [
  { name: "json-plain", data: Buffer.from('{"method":"status"}', "ascii") },
  { name: "json-newline", data: Buffer.from('{"method":"status"}\n', "ascii") },
  { name: "json-len-prefixed", data: lenPrefixed('{"method":"status"}') },
  { name: "pax-stx-etx-lrc", data: paxFrame("A00") },
  { name: "enq-0x05", data: Buffer.from([0x05]) },
  { name: "single-newline", data: Buffer.from("\n", "ascii") },
  { name: "garbage", data: Buffer.from("HELLO", "ascii") },
]

function fingerprintOne(port, frame, waitMs = 2500) {
  return new Promise((resolve) => {
    const socket = new net.Socket()
    const chunks = []
    let closedEarly = false
    const done = () => {
      socket.destroy()
      resolve({ reply: Buffer.concat(chunks), closedEarly })
    }
    const timer = setTimeout(done, waitMs)
    socket.once("connect", () => socket.write(frame.data))
    socket.on("data", (d) => chunks.push(d))
    socket.once("close", () => {
      closedEarly = true
      clearTimeout(timer)
      done()
    })
    socket.once("error", () => {
      clearTimeout(timer)
      done()
    })
    socket.connect(port, host)
  })
}

async function fingerprint(port) {
  log(`\nFingerprint op poort ${port} — ${FINGERPRINT_FRAMES.length} frames, geen betaalopdrachten\n`)
  let anyReply = false

  for (const frame of FINGERPRINT_FRAMES) {
    const { reply, closedEarly } = await fingerprintOne(port, frame)
    const label = frame.name.padEnd(20)
    if (!reply.length) {
      log(`  ${label} → ${closedEarly ? "verbinding verbroken, geen antwoord" : "stil"}`)
      continue
    }
    anyReply = true
    log(`  ${label} → ${reply.length} bytes`)
    log(`  ${" ".repeat(20)}   hex   ${reply.subarray(0, 48).toString("hex").replace(/(..)/g, "$1 ").trim()}`)
    log(`  ${" ".repeat(20)}   ascii ${JSON.stringify(reply.subarray(0, 96).toString("utf8"))}`)
  }

  if (!anyReply) {
    log(`
  De terminal accepteert de verbinding maar antwoordt op geen enkel frame.
  Dat wijst meestal op één van deze twee:
    • POSLink Manager staat niet op de voorgrond (de listener weigert dan stil)
    • het verwacht eerst een handshake die wij niet kennen

  Zet de app op de voorgrond en draai dit opnieuw. Blijft het stil, dan hebben
  we de protocolspec van myPOS nodig — stuur deze output mee naar
  integrations@mypos.com met de vraag welk ECR-protocol de Ultra op poort
  ${port} spreekt.
`)
  }
}

// ── Hypothese A: Semi-Integrated over kale TCP ───────────────────────────────

// Bouwt het request exact zoals base-request.js dat doet. De sleutelvolgorde
// is onderdeel van het contract: de signature wordt berekend over
// JSON.stringify(params) vóórdat het signature-veld zelf wordt toegevoegd, en
// JSON.stringify respecteert insertion order. Undefined velden vallen weg.
function buildSemiIntegratedPayment({ amount, tid, sn, apiKey, apiSecret, trnRef }) {
  const params = {
    method: "payment",
    amount,
    tid,
    sn,
    api_key: apiKey,
    trn_ref: trnRef ?? crypto.randomUUID(),
  };
  params.signature = crypto
    .createHmac("sha256", apiSecret)
    .update(JSON.stringify(params))
    .digest("hex");
  return params;
}

function sendSemiIntegrated(port, payload, waitMs) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    const messages = [];
    let raw = Buffer.alloc(0);

    const finish = (reason) => {
      socket.destroy();
      resolve({ reason, messages, raw });
    };

    const timer = setTimeout(() => finish("timeout"), waitMs);

    socket.once("connect", () => {
      const data = JSON.stringify(payload);
      log(`  → verstuurd (${Buffer.byteLength(data)} bytes): ${data}`);
      socket.write(data);
    });

    socket.on("data", (d) => {
      raw = Buffer.concat([raw, d]);
      log(`  ← ${describe(d)}`);
      let parsed;
      try {
        parsed = JSON.parse(d.toString("utf8"));
      } catch {
        return; // geen JSON — mogelijk gefragmenteerd of een ander protocol
      }
      messages.push(parsed);
      // status 100 = bezig; de socket blijft open tot een eindstatus volgt.
      if (parseInt(parsed.status, 10) === 100) {
        log("     status 100 — terminal is bezig, wachten op eindstatus…");
        return;
      }
      clearTimeout(timer);
      finish("final");
    });

    socket.once("error", (e) => {
      clearTimeout(timer);
      log(`  ! socketfout: ${e.message}`);
      finish("error");
    });
    socket.once("close", () => {
      clearTimeout(timer);
      finish("closed");
    });

    socket.connect(port, host);
  });
}

// ── Hypothese B: HTTP POST /payment ─────────────────────────────────────────

async function tryHttp(port, amount) {
  const url = `http://${host}:${port}/payment`;
  const body = {
    amount: String(amount),
    currency: "EUR",
    reference_number: `PROBE-${Date.now()}`,
  };
  log(`  → POST ${url}`);
  log(`     ${JSON.stringify(body)}`);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15000),
    });
    const text = await res.text();
    log(`  ← HTTP ${res.status} ${res.statusText}`);
    log(`     ${text.slice(0, 500) || "(lege body)"}`);
    return true;
  } catch (e) {
    log(`  ! geen HTTP-antwoord: ${e.message}`);
    return false;
  }
}

// ── Uitvoeren ───────────────────────────────────────────────────────────────

const main = async () => {
  hr();
  log(`myPOS ECR probe — doel ${host}`);
  hr();

  log(`\nPoortscan (${ports.length} poorten, ${CONNECT_TIMEOUT_MS}ms per poort)…\n`);
  const open = [];
  for (const port of ports) {
    const isOpen = await checkPort(port);
    log(`  ${String(port).padEnd(6)} ${isOpen ? "OPEN" : "dicht"}`);
    if (isOpen) open.push(port);
  }

  if (!open.length) {
    log(`
Geen enkele poort open. Controleer:
  • Hangt de Ultra aan het WiFi-netwerk van de Pi?
  • Klopt het IP? (op de terminal: ECR-POS Connect toont IP en poort)
  • Staat ECR-POS Connect open op de voorgrond? De terminal weigert
    socketverbindingen als de app geminimaliseerd of gesloten is.
  • Zit de Ultra in hetzelfde subnet als de Pi (10.42.0.0/24)?
`);
    process.exit(2);
  }

  log(`\nOpen poorten: ${open.join(", ")}`);
  hr();

  log(`\nPassieve banner-lees (${BANNER_WAIT_MS}ms per poort, er wordt niets verstuurd)…\n`);
  for (const port of open) {
    const banner = await readBanner(port);
    log(`  poort ${port}: ${describe(banner)}`);
  }

  if (args.fingerprint) {
    hr();
    for (const port of open) await fingerprint(port);
    hr();
    return;
  }

  if (!args.pay) {
    hr();
    log(`
Klaar. Er is geen betaalopdracht verstuurd.

Weet je nog niet welk protocol de terminal spreekt? Draai dan eerst de
fingerprint — een reeks onschuldige frames, nog steeds geen betaalopdracht:

  node mypos-ecr-probe.mjs --host ${host} --ports ${open.join(",")} --fingerprint

Om het protocol daarna te bevestigen is een payment-request nodig:

  node mypos-ecr-probe.mjs --host ${host} --pay 0.01 \\
       --tid <TID> --api-key <KEY> --api-secret <SECRET>

De terminal wordt daarbij wakker en toont het bedrag. Niet doorgaan met de
kaart: laat de transactie op de terminal aflopen of annuleer hem.
`);
    return;
  }

  // --pay: echte betaalopdracht
  const amount = Number(args.pay);
  if (!Number.isFinite(amount) || amount <= 0) {
    console.error(`--pay moet een positief bedrag zijn, kreeg: ${args.pay}`);
    process.exit(1);
  }
  if (!args.tid && !args.sn) {
    console.error("--pay vereist --tid of --sn (de terminal moet identificeerbaar zijn).");
    process.exit(1);
  }
  if (!apiKey || !apiSecret) {
    console.error(
      "--pay vereist een api_key en api_secret, via MYPOS_API_KEY/MYPOS_API_SECRET of --api-key/--api-secret.",
    );
    process.exit(1);
  }

  hr();
  log(`\nHypothese A — Semi-Integrated (kale TCP + JSON + HMAC)\n`);

  const payload = buildSemiIntegratedPayment({
    amount,
    tid: args.tid || undefined,
    sn: args.sn || undefined,
    apiKey,
    apiSecret,
  });

  for (const port of open) {
    log(`\nPoort ${port}:`);
    const result = await sendSemiIntegrated(port, payload, PAYMENT_WAIT_MS);
    log(`  resultaat: ${result.reason}, ${result.messages.length} JSON-bericht(en)`);
    if (result.messages.length) {
      log(`  ✓ Poort ${port} spreekt het Semi-Integrated protocol.`);
      log(JSON.stringify(result.messages, null, 2));
      hr();
      return;
    }
  }

  if (args.http) {
    hr();
    log(`\nHypothese B — HTTP POST /payment\n`);
    for (const port of open) {
      log(`\nPoort ${port}:`);
      await tryHttp(port, amount);
    }
  }

  hr();
  log(`
Geen van de geteste protocollen leverde een bruikbaar antwoord.

Noteer wat er wél terugkwam (de hex/ascii-dumps hierboven) en stuur dat mee in
je aanvraag bij integrations@mypos.com — met een sample van het verkeer erbij
is de kans op een bruikbaar antwoord een stuk groter.
`);
};

main().catch((e) => {
  console.error("Onverwachte fout:", e);
  process.exit(1);
});
