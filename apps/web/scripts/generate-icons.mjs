// Generates the PWA install icons from a self-contained SVG (no font
// dependency — a foodtruck "burger" glyph drawn with shapes so it
// rasterizes identically on every OS). Placeholder brand art: swap the
// glyph for Sam's real logo when available, then re-run `node
// scripts/generate-icons.mjs` from apps/web.
//
// sharp ships as a transitive dep of Next (not a direct dep of this
// package), so under pnpm it is not resolvable from here directly — we
// locate it in the pnpm store instead. No network / no extra install.
import { fileURLToPath, pathToFileURL } from "node:url"
import { createRequire } from "node:module"
import { dirname, join } from "node:path"
import { readdirSync } from "node:fs"

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, "..", "..", "..")
const outDir = join(here, "..", "public")

const pnpmDir = join(root, "node_modules", ".pnpm")
const sharpDir = readdirSync(pnpmDir).find((d) => d.startsWith("sharp@"))
if (!sharpDir) throw new Error("sharp not found in pnpm store — run pnpm install")
const require = createRequire(import.meta.url)
const sharpEntry = require.resolve(join(pnpmDir, sharpDir, "node_modules", "sharp"))
const sharp = (await import(pathToFileURL(sharpEntry).href)).default

const BRAND = "#ff6b35"

// Burger glyph authored on a 100×100 canvas, centred in the maskable
// safe zone (10–90). White on brand orange.
const glyph = `
  <g fill="#ffffff">
    <path d="M26 44 a24 16 0 0 1 48 0 z" />
    <rect x="22" y="49" width="56" height="9" rx="4.5" />
    <rect x="24" y="61" width="52" height="13" rx="6" />
  </g>`

function squareIcon(size) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 100 100">
  <rect width="100" height="100" rx="22" fill="${BRAND}"/>
  ${glyph}
</svg>`
}

function maskableIcon(size) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 100 100">
  <rect width="100" height="100" fill="${BRAND}"/>
  ${glyph}
</svg>`
}

async function render(svg, file) {
  await sharp(Buffer.from(svg)).png().toFile(join(outDir, file))
  console.log("wrote", file)
}

await render(squareIcon(192), "icon-192.png")
await render(squareIcon(512), "icon-512.png")
await render(maskableIcon(512), "icon-512-maskable.png")
await render(squareIcon(180), "apple-touch-icon.png")
