# Standalone migrations (archived 2026-06-09)

These are the **original** POS migrations (`0001`–`0060`) from when the Hop & Bites
POS targeted its **own dedicated Supabase project**. They create a self-contained
tenant model (`orgs` / `venues` / `memberships`), an `audit_log` table, and an
`ai_usage` table.

On 2026-06-09 the POS was moved onto the **shared BBQ Architect Supabase project**
(`oheilybckvtsczmbczot`), which already hosts `organizations` / `organization_members`
/ `gerechten` / `ai_usage` / a different `audit_log`. The live schema is now defined by
the consolidated migrations in `../migrations/`:

- `00000000000001_shared_base_shim.sql` — local-dev-only stub of the BBQ tables the POS depends on (no-op on production).
- `20260609144022_pos_phase_a_tenant_foundation.sql` — `pos_role`/`manager_pin_hash`/`pos_tier`, `venues`, RLS helpers.
- `20260609144438_pos_phase_b1_audit_webhooks_theme.sql` — `pos_audit_log` (was `audit_log`), `webhook_events`, `org_theme_settings`.
- `20260609144642_pos_phase_b2_menu_orders_kds.sql` — `pos_menu_items` (linked to `gerechten`), orders, payments, KDS, etc.
- `20260609144836_pos_phase_c_ai_usage_extend.sql` — extends BBQ's `ai_usage` with `venue_id`/`prompt_version`/`latency_ms`.

Key differences vs. these archived files:
- `orgs` → `organizations`; `memberships` → `organization_members` (+ `pos_role`, `status='active'` in every policy).
- `audit_log` → `pos_audit_log` (BBQ already has its own `audit_log`).
- `ai_usage` reuses BBQ's existing table (column-name mapping in app code).
- `current_org_id()` is **not** redefined — the POS adopts BBQ's existing function.

Kept for historical reference only. Do **not** apply these.
