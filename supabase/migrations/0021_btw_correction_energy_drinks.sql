-- Phase 4 polish — 0021 BTW correction for energy drinks
-- Pillar #2 BTW-Right Audit-Ready.
--
-- Phase 1 research (2026-05-16) found that the Belastingdienst dranken-page
-- ALWAYS classifies non-alcoholic drinks <=1.2% alc as 9% BTW. This includes
-- energy drinks (Red Bull, Monster). Our seed 0016_seed_hopbites_menu.sql
-- had them as `soda_21` based on a confusion with the *verbruiksbelasting*
-- (consumption tax) — that's a separate per-litre accijns levied at the
-- importer level, NOT a BTW change.
--
-- This migration corrects ACTIVE menu items only. Historical
-- pos_order_items.btw_class is a snapshot at order time and stays
-- IMMUTABLE for bewaarplicht (Pillar #2 anti-pillar: snapshots never
-- change). Past orders keep their original rate; the SBA Fase 4 hash
-- chain is preserved.

update public.pos_menu_items
  set btw_class = 'food_9'::public.btw_class,
      updated_at = now()
where btw_class = 'soda_21'::public.btw_class
  and category = 'energy'
  and is_active = true;

-- Sanity: the only remaining 21% items should be alcohol_21 (bier/wijn/
-- cocktails) — the `soda_21` enum value is kept around so historical
-- pos_order_items rows can still reference it.
