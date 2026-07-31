#!/usr/bin/env node
// Haalt de terminals van je myPOS-account op, zodat je de TID en het
// serienummer van de Ultra hebt zonder door de terminalmenu's te spitten.
//
// Deze API is cloud-only en heeft dus internet nodig: draai dit op je laptop,
// niet op de Pi. Het is puur lezen (GET), er wordt niets gewijzigd.
//
// Endpoints en headers zijn afgeleid uit myPOS' eigen SDK
// (developermypos/mypos-js, resources/abstract/api-request.js +
// devices-api-request.js).
//
// Gebruik:
//   export MYPOS_API_KEY='<klantnummer>'
//   export MYPOS_API_SECRET='<klantgeheim>'
//   node mypos-devices.mjs

import crypto from "node:crypto";
import { request as httpsRequest } from "node:https";

// fetch() weigert een body op GET, en dat is precies wat deze API vereist:
// POST /v1/devices antwoordt 405, GET /v1/devices antwoordt 400 met
// "A non-empty request body is required". node:https kent die beperking niet.
function rawRequest(method, urlString, headers, bodyString) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlString);
    const req = httpsRequest(
      {
        hostname: url.hostname,
        port: url.port || 443,
        path: url.pathname + url.search,
        method,
        headers: {
          ...headers,
          ...(bodyString === undefined
            ? {}
            : { "Content-Length": Buffer.byteLength(bodyString) }),
        },
      },
      (res) => {
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () =>
          resolve({ status: res.statusCode, text: Buffer.concat(chunks).toString("utf8") }),
        );
      },
    );
    req.on("error", reject);
    req.setTimeout(20000, () => req.destroy(new Error("timeout")));
    if (bodyString !== undefined) req.write(bodyString);
    req.end();
  });
}

const args = Object.fromEntries(
  process.argv
    .slice(2)
    .map((a, i, arr) => (a.startsWith("--") ? [a.slice(2), arr[i + 1]?.startsWith("--") === false ? arr[i + 1] : true] : null))
    .filter(Boolean),
);

const apiKey = process.env.MYPOS_API_KEY || args["api-key"];
const apiSecret = process.env.MYPOS_API_SECRET || args["api-secret"];
const sandbox = Boolean(args.sandbox);

if (!apiKey || !apiSecret) {
  console.error(`
Geen sleutels gevonden.

  export MYPOS_API_KEY='<klantnummer>'
  export MYPOS_API_SECRET='<klantgeheim>'
  node mypos-devices.mjs [--sandbox]

Te vinden op merchant.mypos.com → Integraties → REST API.
`);
  process.exit(1);
}

const AUTH_HOST = sandbox ? "https://sandbox-auth-api.mypos.com" : "https://auth-api.mypos.com";
const DEVICES_HOST = sandbox ? "https://sandbox-devices-api.mypos.com" : "https://devices-api.mypos.com";

// 'webhooks' is bevestigd werkend (token 24u geldig); 'devices' wordt met een
// HTTP 400 geweigerd. De rest staat er nog achter voor het geval myPOS de
// scopes uitbreidt.
const SCOPES = ["webhooks", "devices webhooks", null, "devices"];

async function getToken(scope) {
  const body = new URLSearchParams({ grant_type: "client_credentials" });
  if (scope) body.set("scope", scope);

  const res = await fetch(`${AUTH_HOST}/oauth/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${Buffer.from(`${apiKey}:${apiSecret}`).toString("base64")}`,
    },
    body,
    signal: AbortSignal.timeout(20000),
  });

  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    return { ok: false, status: res.status, raw: text };
  }
  if (!res.ok || !json.access_token) {
    return { ok: false, status: res.status, raw: json };
  }
  return { ok: true, token: json.access_token, scope: json.scope, expiresIn: json.expires_in };
}

// Vastgesteld: /v1/devices bestaat en is GET-only (POST → 405), maar eist een
// body (GET zonder body → 400). Alleen de vorm van die body is nog onbekend, dus
// we proberen de gangbare paginatie-varianten.
const VARIANTS = [
  { method: "GET", path: "/v1/devices", body: {} },
  { method: "GET", path: "/v1/devices", body: { page: 1, size: 50 } },
  { method: "GET", path: "/v1/devices", body: { page: 1, pageSize: 50 } },
  { method: "GET", path: "/v1/devices", body: { pageNumber: 1, pageSize: 50 } },
  { method: "GET", path: "/v1/devices", body: { offset: 0, limit: 50 } },
  { method: "GET", path: "/v1/devices", body: { filter: {} } },
];

async function callDevices(token, variant) {
  const { status, text } = await rawRequest(
    variant.method,
    `${DEVICES_HOST}${variant.path}`,
    {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
      "API-Key": apiKey,
      "Content-Type": "application/json",
      "X-Request-ID": crypto.randomUUID(),
    },
    variant.body === undefined ? undefined : JSON.stringify(variant.body),
  );
  try {
    return { status, body: JSON.parse(text) };
  } catch {
    return { status, body: text };
  }
}

// Haalt de lijst uit de respons, ongeacht in welke envelope myPOS hem stopt.
function extractDevices(body) {
  if (Array.isArray(body)) return body;
  for (const key of ["data", "devices", "items", "results", "terminals", "content"]) {
    if (Array.isArray(body?.[key])) return body[key];
  }
  return null;
}

const main = async () => {
  console.log(`myPOS Devices — ${sandbox ? "SANDBOX" : "PRODUCTIE"}`);
  console.log("─".repeat(64));

  let token = null;
  for (const scope of SCOPES) {
    process.stdout.write(`  token aanvragen (scope: ${scope ?? "geen"})… `);
    const result = await getToken(scope);
    if (result.ok) {
      console.log(`ok — scope "${result.scope}", geldig ${result.expiresIn}s`);
      token = result.token;
      break;
    }
    console.log(`mislukt (HTTP ${result.status})`);
    if (result.status === 401) {
      console.log(`
  HTTP 401 betekent dat het klantnummer/klantgeheim niet geaccepteerd wordt.
  Controleer of je ze compleet hebt gekopieerd, en of je op merchant.mypos.com
  onder Integraties → REST API niet per ongeluk nieuwe referenties hebt
  gegenereerd (dan zijn de oude ongeldig).
`);
      process.exit(2);
    }
  }

  if (!token) {
    console.log("\n  Geen enkele scope leverde een token op. Ruwe respons hierboven.");
    process.exit(2);
  }

  console.log("─".repeat(64));
  console.log(`\n  Endpoint-varianten aftasten op ${DEVICES_HOST}\n`);

  let devices = null;
  let winner = null;

  for (const variant of VARIANTS) {
    const label = `${variant.method} ${variant.path} ${JSON.stringify(variant.body)}`.padEnd(52);
    const { status, body } = await callDevices(token, variant);
    const found = extractDevices(body);

    if (found) {
      console.log(`  ${label} HTTP ${status} — ${found.length} terminal(s) ✓`);
      devices = found;
      winner = variant;
      break;
    }

    // Een 400 met een ándere klacht dan "geen body" is informatief: dan is de
    // route raak en klopt alleen de body-vorm nog niet.
    const hint =
      typeof body === "object" && body?.errors
        ? JSON.stringify(body.errors)
        : typeof body === "object" && body?.title
          ? body.title
          : String(body).slice(0, 120);
    console.log(`  ${label} HTTP ${status} — ${hint}`);
  }

  if (!devices) {
    console.log(`
  Geen enkele variant leverde een lijst op. De sleutels zijn geldig (het token
  kwam er immers uit), dus dit is een kwestie van de juiste route vinden.

  Stuur de statuscodes hierboven mee naar integrations@mypos.com met de vraag
  wat het huidige endpoint is om terminals en hun TID op te vragen.

  Dit blokkeert de probe overigens niet: de TID staat ook op de terminal zelf,
  onder Settings → About Terminal, en op de sticker aan de onderkant.
`);
    return;
  }

  console.log(`\n  Werkende route: ${winner.method} ${winner.path}\n`);

  if (!devices.length) {
    console.log("  Geen terminals gevonden op dit account.");
    return;
  }

  for (const d of devices) {
    console.log(`  ${"─".repeat(60)}`);
    for (const [k, v] of Object.entries(d)) {
      if (v === null || typeof v === "object") continue;
      console.log(`  ${k.padEnd(24)} ${v}`);
    }
  }
  console.log(`  ${"─".repeat(60)}`);
  console.log(`
  Zoek je Ultra op in bovenstaande lijst. Het veld met de TID (vaak "tid",
  "terminal_id" of "id") gebruik je als --tid in mypos-ecr-probe.mjs; het
  serienummer als --sn.
`);
};

main().catch((e) => {
  console.error("\nOnverwachte fout:", e.message);
  process.exit(1);
});
