// Hop & Bites — menu data for the POS UI kit.
// Two-axis navigation: GROUPS (vertical rail) → CATEGORIES (horizontal bar) → products.
// Built around the two real items (Langós Pulled Pork/Chicken @ €9,50).
window.HB_MENU = {
  groups: [
    { id: 'eten',    label: 'Eten',     icon: 'beef',     cats: ['langos', 'sides', 'sauzen'] },
    { id: 'drinken', label: 'Drinken',  icon: 'cup-soda', cats: ['fris', 'bier', 'warm'] },
    { id: 'extra',   label: "Extra's",  icon: 'plus',     cats: ['extra'] },
  ],
  categories: {
    langos: { label: 'Langós',          accent: 'var(--brick-600)' },
    sides:  { label: 'Frites & sides',  accent: 'var(--amber-600)' },
    sauzen: { label: 'Sauzen',          accent: 'var(--hop-600)' },
    fris:   { label: 'Fris & water',    accent: 'var(--charcoal-500)' },
    bier:   { label: 'Bier',            accent: 'var(--hop-700)' },
    warm:   { label: 'Warme dranken',   accent: 'var(--brick-700)' },
    extra:  { label: 'Toppings',        accent: 'var(--hop-700)' },
  },
  products: {
    langos: [
      { id: 'l-pork',    name: 'Langós Pulled Pork',     price: 9.5 },
      { id: 'l-chick',   name: 'Langós Pulled Chicken',  price: 9.5 },
      { id: 'l-brisket', name: 'Langós Beef Brisket',    price: 11.0 },
      { id: 'l-klas',    name: 'Langós Klassiek',        price: 7.0, sublabel: 'knofl. & kaas' },
      { id: 'l-veg',     name: 'Langós Veggie',          price: 8.5, sublabel: 'gegr. groenten' },
      { id: 'l-mini',    name: 'Mini Langós',            price: 5.0, sublabel: 'kids' },
    ],
    sides: [
      { id: 's-friet',   name: 'Frietjes',               price: 4.0, sublabel: '+ saus' },
      { id: 's-zoet',    name: 'Zoete friet',            price: 5.0 },
      { id: 's-slaw',    name: 'Coleslaw',               price: 3.5 },
      { id: 's-mais',    name: 'Maïskolf',               price: 4.0 },
      { id: 's-bonen',   name: 'Gerookte bonen',         price: 4.5 },
    ],
    sauzen: [
      { id: 'sa-bbq',    name: 'BBQ Smokehouse',         price: 1.0 },
      { id: 'sa-knof',   name: 'Knoflooksaus',           price: 1.0 },
      { id: 'sa-chip',   name: 'Chipotle mayo',          price: 1.0 },
      { id: 'sa-mayo',   name: 'Mayonaise',              price: 0.75 },
      { id: 'sa-heet',   name: 'Hete saus',              price: 1.0 },
    ],
    fris: [
      { id: 'd-fris',    name: 'Frisdrank',              price: 2.5 },
      { id: 'd-water',   name: 'Water',                  price: 2.0 },
      { id: 'd-sap',     name: 'Vers sap',               price: 3.0 },
      { id: 'd-thee',    name: 'Huis-ijsthee',           price: 3.0 },
    ],
    bier: [
      { id: 'b-spec',    name: 'Speciaalbier',           price: 4.5, sublabel: 'hop!' },
      { id: 'b-pils',    name: 'Pils',                   price: 3.0 },
      { id: 'b-radler',  name: 'Radler 0.0',             price: 3.5 },
      { id: 'b-ipa',     name: 'IPA',                    price: 4.5 },
    ],
    warm: [
      { id: 'w-koffie',  name: 'Koffie',                 price: 2.5 },
      { id: 'w-thee',    name: 'Verse thee',             price: 2.5 },
      { id: 'w-capp',    name: 'Cappuccino',             price: 3.0 },
      { id: 'w-choc',    name: 'Warme choc',             price: 3.0 },
    ],
    extra: [
      { id: 'e-meat',    name: 'Extra pulled meat',      price: 3.0 },
      { id: 'e-kaas',    name: 'Extra kaas',             price: 1.0 },
      { id: 'e-jala',    name: 'Jalapeños',              price: 0.75 },
      { id: 'e-ui',      name: 'Gebakken uitjes',        price: 0.75 },
    ],
  },
};
