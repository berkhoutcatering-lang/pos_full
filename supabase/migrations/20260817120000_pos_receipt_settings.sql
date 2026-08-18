-- Bedrijfsgegevens op de kassabon.
--
-- Stonden hardcoded in de kassa-code met een verzonnen KvK- en BTW-nummer, en
-- die rolden zo uit de printer. Per venue, want het adres verschilt per
-- locatie terwijl KvK/BTW bij de rechtspersoon horen — die vul je dan gewoon
-- op elke venue hetzelfde in.
--
-- Alles is nullable met opzet: een lege waarde betekent "die regel niet
-- printen". Liever een bon zonder KvK dan een bon met een KvK die niet bestaat.

create table if not exists public.pos_receipt_settings (
  venue_id uuid primary key references public.venues(id) on delete cascade,
  org_id uuid not null references public.organizations(id) on delete cascade,

  -- Kop van de bon. legal_name is de naam waaronder je factureert; leeg =
  -- de naam van de venue.
  legal_name text,
  kvk text,
  btw_id text,
  address_line text,
  postal_code text,
  city text,
  phone text,
  website text,

  -- Vrije afsluitregels (max ~4 regels; de printer breekt op ~48 tekens).
  footer_text text,

  -- Logo bovenaan de bon. Het bestand zelf staat op de Pi
  -- (/etc/pi-bridge/receipt-logo.png, via pos-setup/logo.png op de
  -- bootpartitie) — hier staat alleen of hij geprint wordt.
  print_logo boolean not null default true,

  updated_at timestamptz not null default now()
);

create index if not exists pos_receipt_settings_org_idx
  on public.pos_receipt_settings (org_id);

alter table public.pos_receipt_settings enable row level security;

drop policy if exists "pos_receipt_settings_read_members" on public.pos_receipt_settings;
create policy "pos_receipt_settings_read_members" on public.pos_receipt_settings for select
  using (exists (select 1 from public.organization_members m
    where m.organization_id = pos_receipt_settings.org_id
      and m.user_id = (select auth.uid())
      and m.status = 'active'));

drop policy if exists "pos_receipt_settings_write_managers" on public.pos_receipt_settings;
create policy "pos_receipt_settings_write_managers" on public.pos_receipt_settings for all
  using (public.is_member_with_role(org_id, 'manager'))
  with check (public.is_member_with_role(org_id, 'manager'));

create or replace function public.touch_pos_receipt_settings()
returns trigger language plpgsql security definer set search_path = ''
as $$ begin NEW.updated_at := now(); return NEW; end $$;

drop trigger if exists pos_receipt_settings_touch on public.pos_receipt_settings;
create trigger pos_receipt_settings_touch before update on public.pos_receipt_settings
  for each row execute function public.touch_pos_receipt_settings();
