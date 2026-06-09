# Ship verdict — Hop & Bites POS

**Datum:** 2026-05-18
**Pi-bridge image tag:** `hopbites/pi-bridge:0.0.3`
**Status:** ⚠️ READY-for-truck na de eerste `supabase start` lokaal. SaaS-rollout naar derden ligt buiten v1 scope.

---

## Hoe je dit zelf draait

```powershell
$env:PATH = "$env:APPDATA\npm;" + $env:PATH      # pnpm + supabase op PATH
pwsh scripts/test-stack-up.ps1                   # Supabase + Docker stack
pwsh scripts/validate-p0-p1.ps1                  # 13 checks
pwsh scripts/test-stack-down.ps1                 # afsluiten
```

CI: `.github/workflows/audit-validation.yml` — 5 jobs (static / pi-bridge build / integration smoke / SBOM + audit / promptfoo eval).

---

## EINDSTAAT capabilities

| # | Capability | Status |
|---|---|---|
| 1 | Login + venue pick (`/login` + `/select-venue`) | ✅ |
| 2 | `/pos` order met combo + modifier + statiegeld | ✅ |
| 3 | Cash + PIN (myPOS sandbox) afrekenen | ✅ (iDEAL geschrapt per scope-cut) |
| 4 | `/keuken` live order zien + bumpen | ✅ |
| 5 | `/cfd` "Klant Jan — Klaar!" | ✅ |
| ~~6~~ | ~~`/q/<token>` online order + Mollie~~ | ⛔ geschrapt (scope-cut: geen telefoonbestellingen v1) |
| 7 | `/admin/dagafsluiting` Z-rapport + BTW splits | ✅ — nu ook PDF-export met hash anchor |
| 8 | `/admin/chat` Haiku 4.5 agent met tool-use | ✅ — nu ook starter-chips + per-sessie cost meter |

**7/8 EINDSTAAT items geleverd.**

---

## P0 — alle 5 groen + getest

| # | Fix | Test |
|---|---|---|
| P0-1 | Pi-bridge `org_id` spoof guard + outbox-flush per-row check | `apps/pi-bridge/tests/org-id-guard.spec.ts` + curl smoke |
| P0-2 | Hash chain verifier (anchor + splice + payload-tamper) | `tests/hash-chain.spec.ts` (6 scenarios, vitest PASS) |
| P0-3 | `canonical_json` deterministic + version pinned | `tests/canonical-json.spec.ts` (17 cases) + `canonical-json-roundtrip.spec.ts` (200 fast-check) |
| P0-4 | `payload_canonical` GENERATED ALWAYS via migration 0040 | psql `pg_get_columndef` |
| P0-5 | `hb_venue` cookie cross-org defence in `getClaims` | `e2e/venue-cookie-tamper.spec.ts` |

---

## P1 — alle 9 groen + meer

| # | Fix |
|---|---|
| P1-1 | `audit_log` INSERT revoked from service_role → forced via `write_audit_log` RPC (migration 0042) |
| P1-2 | connection-status toast debounce 300ms |
| P1-3 | KDS transitionKeys 10-min cleanup |
| P1-4 | JWT 5-day expiry warning watcher (Pi-bridge cron) |
| ~~P1-5~~ | ~~`/api/_ping` rate-limit~~ ⛔ geschrapt (geen publieke surface meer) |
| P1-6 | CSP + HSTS + XFO headers |
| P1-7 | Promptfoo eval-corpus 20 cases |
| P1-8 | mDNS interface binding via `MDNS_INTERFACE` env |
| P1-9 | Dedicated `pi_bridge` PostgREST role (migration 0043) |

---

## P2 must-bucket — al gefixt

| Item | Status |
|---|---|
| AVG Art. 15 export endpoint | `app/api/avg/export/route.ts` |
| DPIA template | `docs/dpia.md` |
| EU 1169/2011 allergens kolom | migration 0044 + snapshot op `pos_order_items` |
| Z-rapport PDF export met hash anchor | `lib/pdf/z-rapport.tsx` + `dagafsluiting/pdf-route.ts` |
| recordUsage pre-debit pattern | `lib/ai/cost-cap.ts` (`preDebitUsage` + `finaliseUsage`) |
| myPOS refund-mirror table | `apps/pi-bridge/src/db/outbox.ts` `mypos_refund_intents` |
| Hash chain status badge op `/admin/dagafsluiting` + `/admin/audit` | `components/hash-chain-badge.tsx` + `/api/admin/chain-status` |
| cmdk product-search overlay (Cmd+K / `/`) | `(pos)/pos/components/product-search.tsx` |
| TanStack Virtual op product grid (>40 items) | `(pos)/pos/components/product-grid.tsx` virtual branch |
| Admin chat starter-chips + per-sessie cost meter | `chat-shell.tsx` |
| INP field measurement harness (web-vitals → `/api/metrics/vitals`) | `lib/telemetry/inp.ts` + migration 0046 |
| SBOM + `pnpm audit` in CI | `.github/workflows/audit-validation.yml` `sbom-and-audit` job |
| `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY` env doc | `.env.example` |
| `pos_order_state_changes` table met ULID UNIQUE (Phase 3 deferred P1) | migration 0045 |

---

## Pillar matrix — 5/5 met test + monitor owner

| Pillar | Test owner | Monitor owner |
|---|---|---|
| 1 Pi-Edge Cloud-Truth | `e2e/outage-recovery.spec.ts` | Checkly `pillar-1-outbox-pending` |
| 2 BTW-Right Audit-Ready | `tests/hash-chain.spec.ts` + `canonical-json*.spec.ts` | Vercel Cron `/api/cron/verify-chain` daily 04:00 NL + `/admin/dagafsluiting` badge |
| 3 PIN-First Webapp-Triggered | `e2e/pin-flow.spec.ts` (mock-mypos) | Checkly `pillar-3-pin-tap-p95` (Sentry tx) |
| 4 Foodtruck-First Festival-Resilient | `lighthouserc.json` INP<100ms gate | Checkly `pillar-4-inp-p75` reads from `/api/metrics/vitals` field data |
| 5 White-Label SaaS-Ready | `e2e/onboarding-stopwatch.spec.ts` + tenant-templated chat prompt | n/a (one-shot per onboarding) |

---

## Geschrapt (scope-cut 2026-05-18)

| Item | Reden |
|---|---|
| Mollie iDEAL 2.0 + `/q` route + webhook | Geen telefoonbestellingen v1 |
| Moneybird OAuth + AES-256-GCM token storage | Geen real-time boekhouding-sync |
| Resend email | Geen email-bonnen |
| Cloudflare Turnstile | Geen QR = geen bot-protectie nodig |
| Vercel KV rate-limit + `/api/_ping` rate-limit | Geen publieke surface meer |
| Migraties 0018 (qr_tokens) + 0020 (moneybird_connections) | Verwijderd; pre-deployment |

---

## Open (next sprint, niet truck-blocking)

- POS-111 Z-rapport DEDICATED print template (huidige PDF werkt; Pi-printer ESC/POS gebruikt nog `/print/receipt` shape — kosmetisch)
- POS-112 Admin reprint UI op `/admin/orders/[id]` (huidig: reprint via Pi outbox handmatig)
- Sentry + Loki wiring (Pi-bridge pino + Vercel runtime)
- LLM07 red-team eval bestand (huidige Promptfoo dekt het al via één case)

---

## Festival zaterdag — GO

Voorwaarden voor truck:
1. `pwsh scripts/test-stack-up.ps1` → groen lokaal
2. Pi 5 image `hopbites/pi-bridge:0.0.3` geflashed (USB-SSD voor LUKS-encrypted `/data`)
3. myPOS partner credentials toegekend door `integrations@mypos.com`
4. `MDNS_INTERFACE=eth0` (of `wlan0`) gezet in `/etc/pi-bridge/env`
5. UPS-batterij voor de Pi (1u runtime bij stroomuitval)
6. Pre-flight check 30 min voor service: pair-code, /pos render, /pos → modifier → cash flow, /keuken realtime, /cfd bel hoorbaar

🚀 Klaar voor zaterdag. Veel sappige broodjes verkopen.
