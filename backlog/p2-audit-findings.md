# P2 audit findings — backlog triage (post-scope-cut 2026-05-18)

After the scope-cut (no Mollie / Moneybird / Resend / AES-GCM / Cloudflare
Turnstile / Vercel KV / rate-limit) several P2 items dissolve. What remains:

## Must (juridisch / compliance — al gefixt)

- **AVG export endpoint** `/api/avg/export?customer_email=…` — Article 15
  right-of-access. JSON dump op verzoek (geen email). Live in
  `apps/web/app/api/avg/export/route.ts`.
- **DPIA template** in `docs/dpia.md`.

## Should (next sprint)

- **SBOM in CI** — `cyclonedx-bom` + `pnpm audit --prod`, threshold zero
  critical / ≤5 high.
- **Z-rapport dedicated print template** — split van `/print/receipt`
  zodat de Z-bon een eigen header + Z-nummer + hash-chain anchor heeft.
- **Admin reprint UI** — `/admin/orders/[id]` met "Print bon opnieuw"
  (24h dedup via Pi `print_log`).
- **`NEXT_SERVER_ACTIONS_ENCRYPTION_KEY`** — multi-instance Vercel.

## Could (on-trigger)

- Pi OS hardening automation script
- Sentry + Loki wiring (Pi-bridge pushes pino → loki)
- CFD "~5min wachttijd" schatter
- INP field harness via `web-vitals` lib
- recordUsage pre-debit pattern (Anthropic kosten-discipline)
- LLM07 red-team eval bestand

## Geschrapt (scope-cut)

| Item | Reden |
|---|---|
| Mollie iDEAL 2.0 + webhook + /q route | Geen telefoonbestellingen meer in v1 |
| Moneybird OAuth + sync + AES-GCM tokens | Geen real-time boekhouding |
| Resend email | Geen mailtjes |
| Cloudflare Turnstile | Geen QR-route = geen bot-protectie nodig |
| Vercel KV rate-limit + `/api/_ping` rate-limit + `/q` rate-limit | Geen publieke surface meer (alleen auth-gated kassa) |
| Migrations `0018_qr_tokens.sql` + `0020_moneybird_connection.sql` | Verwijderd; geen prod-deploys ooit gehad |

## Verzonden tickets

- POS-101 AVG export — ✅ gedaan
- POS-102 DPIA template — ✅ gedaan
- POS-110 SBOM in CI — TODO
- POS-111 Z-rapport print template — TODO
- POS-112 Admin reprint UI — TODO
- POS-113 NEXT_SERVER_ACTIONS_ENCRYPTION_KEY — TODO
