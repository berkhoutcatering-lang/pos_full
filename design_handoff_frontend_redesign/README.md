# Handoff: Hop & Bites — Full Front-end Redesign

> **Prompt for Claude Code** — paste or reference this file when asking Claude Code to do the redesign. It is self-sufficient: everything needed (tokens, component sources, hi-fi reference screens) is in this folder.

---

## Overview

Redesign the entire front-end of the Hop & Bites POS application (Next.js App Router + Supabase) to match the **Hop & Bites design system**: warm offwhite surfaces, antraciet (charcoal) ink & chrome, hop-green as the single action accent, BBQ-brick red reserved for destructive actions, ember-amber for attention/discounts. Flat, high-contrast, touch-first, angular (near-zero border radius). One typeface: **Hanken Grotesk**.

All UI copy is **Dutch** (the reference files contain the exact copy to use).

## About the Design Files

The files under `design-reference/` are **design references created in HTML/JSX for a browser prototype** — they show the intended look and behavior but are **not production code to copy directly**. The task is to **recreate these designs inside the existing Next.js codebase** using its established patterns: App Router server components + `"use client"` shells, the existing DAL (`@/lib/dal/*`), Supabase realtime subscriptions, and the existing route structure. Do not replace data logic — restyle and restructure the rendering layer.

**Prototype-only artifacts — do NOT port these:**
- `Stage` (fixed 1920×1080 scaling wrapper) — real screens should be normal responsive/full-viewport layouts.
- `DemoNav` (floating screen-switcher pill) and `TweaksDrawer` — demo chrome only. The tweak *defaults* are the chosen design: antraciet top bar, receipt on the left, "ruim" tile density, KDS in columns.
- The in-memory shared order store (`seedOrders`, `addOrder`, `bumpOrder`) — replace with the existing Supabase order flow / realtime subscriptions already in the codebase.
- Lucide via CDN — use the `lucide-react` npm package (icon names in the reference map 1:1, e.g. `chef-hat` → `ChefHat`).

## Fidelity

**High-fidelity.** Colors, typography, spacing, radii, copy and component anatomy are final. Recreate pixel-perfectly using the design tokens. Where the existing app has functionality the mock simplifies (e.g. real auth errors, real menu data, modifier flows), keep the functionality and apply the design language to it.

## Setup (do this first)

1. **Tokens**: copy `design-system/tokens/*.css` and `design-system/styles.css` into the app (e.g. `app/styles/`) and import from the root layout, OR map every token into the Tailwind theme (`tailwind.config`) keeping the exact values. The CSS custom properties are the source of truth — see "Design Tokens" below for the key values.
2. **Font**: load **Hanken Grotesk** (weights 400–800) via `next/font/google`, expose as `--font-sans`.
3. **Tabular numbers**: add the `.hb-tabular` utility (in `tokens/typography.css`); apply to every price, quantity, total, time and order number. Also give it `white-space: nowrap` so `€ 9,50` never line-breaks.
4. **Core components**: port the 8 design-system components in `design-system/components/` to typed React components in the codebase's component folder: `Button`, `Badge`, `CategoryTab`, `FunctionButton`, `OrderLine`, `ProductButton`, `QtyStepper`, `NumPad`. Keep their props and visual anatomy exactly; convert inline styles to the project's styling convention (Tailwind classes referencing the tokens is fine).

## Screens / Views

Map each reference file to the existing route. Open `design-reference/Hop & Bites App.html` in a browser to see everything live (bottom pill navigates between screens).

### 1. Login — `app/(auth)/login/page.tsx`  *(ref: `app/auth.jsx` → `Login`)*
- 50/50 split grid. **Left**: `--charcoal-900` brand panel — H&B monogram block (charcoal-800, radius 16) + wordmark "Hop **&** Bites" (the `&` in `--hop-500`), eyebrow "BBQ · CATERING" (letter-spacing 0.2em, charcoal-400); hero line "Strak afrekenen, de hele service door." at 56px/1.05 weight 800; status footer with green dot.
- **Right**: centered 460px form on `--bg-app`. Labels: 13px/700 uppercase, `--text-muted`. Inputs: 60px tall, `--paper-bright`, 1px `--line-strong`, radius `--radius-md`, 19px/600 text; focus = `--focus-ring`. Submit: primary `Button` (hop-600), 64px tall, full width, "Inloggen". Keep the existing server action + error display, restyled (error: brick-600 text on brick-100 panel).

### 2. Venue select — `app/(app)/select-venue/page.tsx`  *(ref: `auth.jsx` → `VenueSelect`)*
- Centered 720px column on `--bg-app`. Eyebrow "HOP & BITES" (hop-700), 44px/800 title "Kies je locatie", subtitle with logged-in user.
- One row per venue: white card, 1px `--line-strong`, radius `--radius-lg`, 24px padding; 64px square icon block (accent color per venue: brick/amber/hop), 23px/800 name, 15px muted subline, chevron right. Hover: border takes the venue accent.

### 3. Launcher / home — `app/(app)/page.tsx`  *(ref: `auth.jsx` → `Launcher`)*
- 96px `--charcoal-900` header: monogram + wordmark + venue eyebrow; ghost "Uitloggen" button (1px charcoal-700 border).
- Body: greeting 40px/800, then a 4-column grid of role tiles (Kassa/hop, Keuken/brick, Klantscherm/charcoal, Beheer/amber): white card, 76px icon block in the accent, role eyebrow (12px caps), 28px/800 title, muted description, "Openen →" in the accent. Min height 280px, hover = accent border.

### 4. Kassa — `app/(pos)/pos/`  *(ref: `kassa.jsx` — the flagship; study it closely)*
Layout: charcoal top bar (76px), then a 12px-gutter two-column body on `--bg-app`:
- **Left column, 520px fixed**: Bon (receipt) panel on `--paper` + below it a 360px numpad cell ("quantity-first" entry: typed number shows "3× — tik nu een product", next product tap adds 3).
- **Right column**: product area (vertical group rail 136px wide: Eten/Drinken/Extra · horizontal category bar with counts · 4-col product tile grid, tiles min 124px) + bottom dock 232px tall: `FunctionGrid` 2×2 (Korting · In de wacht · Splitsen · Retour=danger variant) · 92px utility strip (Lade/Klant/Notitie) · payment column (charcoal total strip with 38px tabular total, big **PIN** key in hop-600 + **Contant** key in white, ghost "Op rekening").
- Receipt: header "Bestelling" + item-count `Badge`; `OrderLine` rows (selected = hop-100 tint); selecting a line reveals a hop-50 action bar with `QtyStepper` + brick delete; totals block (Subtotaal / Korting in amber / Totaal 36px tabular + "incl. 9% btw").
- **Payment overlay**: modal on `rgba(27,32,29,0.55)`; method choice (two large cards: PIN/Contactloos, Contant) → green check-circle success state "Betaald · € …" + "Nieuwe bon" primary button. Paying sends the order to the kitchen (existing flow).
- **Split overlay**: 2×/3×/4×/5× selector (active = charcoal-900), per-person amount in hop-700 at 40px.
- Toast: charcoal-900 pill, bottom-center, hop-500 check icon, e.g. "Bon in de wacht gezet".

### 5. Keuken (KDS) — `app/(pos)/keuken/`  *(ref: `keuken.jsx`)*
- 84px charcoal header: home button, ChefHat + "Keuken", station filter chips (Alle/Grill), right side: open count, sound toggle, "Live" dot.
- Three equal columns on `--paper` panels: **Geplaatst** (accent `--charcoal-500`), **In bereiding** (`--amber-600`), **Klaar** (`--hop-600`). Column header: 12px color swatch + icon + title + count.
- Order card: white, 1px `--line-strong`, **6px left stripe in the column's status color**; header row = order number (24px/800 tabular) + customer + age chip (clock icon + m/s, colored by age: <4m hop, <8m amber, ≥8m brick); item rows = qty (hop-700, tabular) beside a name block, modifiers underneath in muted ("+ Extra kaas"); full-width 64px bump button **in the column's status color**: "Start bereiding" (grey) / "Klaar" (amber) / "Uitgegeven" (green).
- Cards age live (tick every second). Keep the existing realtime subscription + bump actions.

### 6. Klantscherm (CFD) — `app/(pos)/cfd/`  *(ref: `cfd.jsx`)*
- Full dark (`--charcoal-900`). 110px header: wordmark, "JOUW BESTELLING · LIVE" center eyebrow, live clock (36px tabular).
- Two halves split by a charcoal-700 hairline. **Left "In bereiding"** (flame icon, amber): 3-col grid of charcoal-800 cards showing the **order number** (38px/800) + state line ("Op de grill" amber / "In de wacht" muted). **Right "Klaar — kom afhalen!"** (hop-500 heading): 2-col grid of hop-600 cards, order number at 52px/900, gentle scale pulse (1→1.025, 1.6s; respect `prefers-reduced-motion`).
- Footer strip: "Bedankt & eet smakelijk — Hop & Bites BBQ".

### 7. Beheer — `app/(admin)/admin/*`  *(ref: `admin.jsx` + `admin-pages.jsx`)*
Shell: 260px fixed `--charcoal-900` sidebar (monogram + "BEHEER" eyebrow; nav grouped under **Operationeel** and **Beheer** section heads; active item = hop-600 fill, white text; items that work offline get a hop-500 dot; "Naar start" ghost button pinned bottom) + scrollable offwhite content (`32px 40px` padding) with a topline (venue name left; "Pi-bridge · online" + avatar right).

Every page starts with `PageHead`: eyebrow (12px caps, hop-700) / 34px/800 title / muted subtitle / optional action `Button` right.

- **Dashboard** (`/admin`): 4 `StatCard`s (Omzet/hop, Orders/charcoal, Gem. bon/amber, BTW/brick — 34px icon block + caps label + 32px tabular value); "Orders per uur" bar chart (hop-300 bars, current hour hop-600, hour labels); "Betaalmethoden" card (proportional segmented bar PIN/Contant/iDEAL with color-dot legend) + "Best verkocht" list.
- **Voorraad**: 3 StatCards (laag/uitverkocht/categorieën); per category a 2-col grid of counter cards: item name + status `Badge` ("Bijna op" amber ≤5, "Uitverkocht" danger =0), − / count (24px tabular, brick when 0) / + steppers (44px, `--paper`).
- **Beschikbaarheid** & **Menu** (`/admin/menu`): category sections (12px accent swatch + label) with white list panels; rows: name + sublabel, stock `Badge`, price (tabular, right-aligned), and a 56×32 toggle (hop-600 on / charcoal-300 off, animated knob). Off rows at 55% opacity. *Intended split:* Beschikbaarheid = toggles only (fast, offline); Menu = full item editing.
- **Prijs (tijdelijk)**: "Happy hour — bier" toggle card (amber-100 fill when active, −20% on beer) + "Actieve overrides" stat; price table with base price struck through and override in amber-600.
- **Apparaten**: 3-col grid of device cards (icon block charcoal-800, status dot hop/amber/brick + label, name 18px/800, type + detail muted). Pi-bridge card highlighted: hop-50 fill, hop-300 border, hop-600 icon block.
- **Dagafsluiting**: Z-bon as a 560px receipt-style card on `--paper` with dashed dividers: header, orders/bruto/btw/gemiddelde, per-method amounts, "Totaal afgerekend" big tabular row, hop-50 footer note "Kasverschil € 0,00 · lade geteld en bevestigd". Primary action: "Print Z-bon". Keep `computeZReport` data.
- **Personeel**: table (Naam/Rol/PIN/Status) — avatar initials in charcoal-800, role `Badge` (Manager=accent, Kassier=neutral, Keuken=amber), masked PIN, status dot. Action: "Nieuw personeel".
- **Thema**: accent picker (4 swatches: hop/brick/amber/antraciet) + logo drop zone; right card = live klantscherm preview that re-tints with the chosen accent.
- **AI-gebruik**: 3 StatCards + month progress bar (brick when >85%) + per-feature horizontal bars.
- **Audit log**: white panel of rows — time (tabular) / icon chip / action 15px/700 + detail muted / actor.
- **AI-chat**: 760px chat card — AI bubbles `--paper` with border, user bubbles hop-600 white, suggestion chips (hop-50 fill, hop-300 border, consumed when used), input row + hop send button. Wire to the existing chat backend.

## Interactions & Behavior

- Hit targets ≥48px everywhere (touch POS); function keys 72px+; payment keys largest on screen.
- Press feedback: `transform: scale(0.98)` on pointer-down for big touch keys; hover on cards = accent border (no shadows — the system is flat).
- Transitions: use token durations/easings (`--dur-base`, `--ease-out`, see `elevation.css`); toggles animate the knob's `left`.
- Toasts: charcoal pill bottom-center, auto-dismiss ~2.2s.
- KDS: re-render ages every 1s; bump moves order to the next column. CFD: live clock; ready-cards pulse (disable under `prefers-reduced-motion`).
- Quantity-first numpad: typed digits buffer, next product tap multiplies, buffer clears.
- Disabled states (e.g. pay/function keys with empty bon): 45% opacity + `not-allowed`.

## Design Tokens (source of truth: `design-system/tokens/`)

**Colors** — surfaces: `--offwhite #F4F1E8` (app bg), `--paper #FBF9F2` (receipt/panels), `#FFFFFF` (tiles/inputs). Ink/chrome: charcoal ramp `#1B201D → #B6BAB0` (900→300). Accent: hop ramp, primary `--hop-600 #34794D`, hover `#2B6440`, tints `#DCEBDD`/`#EDF4EC`. Destructive: `--brick-600 #B64536`. Attention: `--amber-600 #C2851C`. Borders: `#E3DECF` / strong `#D2CBB6`. Focus: `0 0 0 3px #9BC8A6`.

**Type** — Hanken Grotesk only; scale 12/14/16/18/20/24/30/40/52; weights 400–800; tabular lining figures on all numbers (`.hb-tabular`).

**Spacing/radii** — 4px base scale; radii are angular: md 3px (buttons/tiles), lg 4px (panels), xl 6px (dialogs). Layout constants: receipt 520px, top bar 76px, group rail 136px, numpad 248px, tile min-height 120px.

**Elevation** — flat; depth via borders and surface steps, no drop shadows (see `elevation.css`).

## State Management

Keep the app's existing state (Supabase + DAL + server actions). The reference's client state worth mirroring: selected receipt line, pending-quantity buffer, discount %, payment overlay step, KDS station filter, admin active nav item. Order status flow: `placed → preparing → ready → served`.

## Assets

No image assets. Icons: **lucide-react** (names used are visible throughout the reference JSX). Logo = typographic monogram "H&B" block + "Hop & Bites" wordmark with the `&` in hop-500 — build as a small `Logo` component.

## Files

- `design-reference/Hop & Bites App.html` — open in a browser; fully interactive prototype of every screen.
- `design-reference/app/*.jsx` — per-surface reference source: `auth.jsx` (login/venue/launcher), `kassa.jsx`, `keuken.jsx`, `cfd.jsx`, `admin.jsx` + `admin-pages.jsx`, `shared.jsx` (helpers; contains prototype-only Stage/DemoNav/Tweaks), `root.jsx` (routing glue), `menu.js` (placeholder menu data — replace with real menu from the DB).
- `design-system/tokens/*.css` — colors, typography, spacing, elevation, fonts (source of truth).
- `design-system/styles.css` — token entry point.
- `design-system/components/*.jsx` — the 8 core components to port.

## Suggested working order

1. Tokens + font + the 8 core components.
2. Kassa (flagship, most components exercised).
3. Keuken + Klantscherm (share the order-status color language).
4. Login → Venue select → Launcher.
5. Beheer shell, then Dashboard → Menu/Beschikbaarheid → Dagafsluiting → the rest.
6. Sweep: tabular nowrap on all money/numbers, 48px hit targets, focus rings, `prefers-reduced-motion`.
