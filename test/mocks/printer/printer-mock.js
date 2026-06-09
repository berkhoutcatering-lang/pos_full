// ESC/POS TCP sink op poort 9100.
//   - Accept any TCP connection
//   - Log incoming bytes (hex) naar stdout
//   - Append bytes naar /output/last-print.bin (overwrite on each connect)
//   - ACK ten slotte zodat node-thermal-printer's isPrinterConnected() true
//     teruggeeft

import net from "node:net"
import fs from "node:fs"
import path from "node:path"

const PORT = 9100
const OUT_DIR = "/output"
const OUT_FILE = path.join(OUT_DIR, "last-print.bin")
const LOG_FILE = path.join(OUT_DIR, "print-log.jsonl")

try {
  fs.mkdirSync(OUT_DIR, { recursive: true })
} catch {}

function hexDump(buf) {
  return Array.from(buf)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join(" ")
}

const server = net.createServer((socket) => {
  const chunks = []
  const remote = `${socket.remoteAddress}:${socket.remotePort}`
  console.log(`[printer] connect from ${remote}`)
  socket.on("data", (chunk) => {
    chunks.push(chunk)
  })
  socket.on("end", () => {
    const full = Buffer.concat(chunks)
    console.log(
      `[printer] ${remote} sent ${full.length} bytes\n  hex: ${hexDump(full.slice(0, 64))}${full.length > 64 ? "…" : ""}`,
    )
    try {
      fs.writeFileSync(OUT_FILE, full)
      fs.appendFileSync(
        LOG_FILE,
        JSON.stringify({
          ts: new Date().toISOString(),
          remote,
          bytes: full.length,
          hex_prefix: hexDump(full.slice(0, 32)),
        }) + "\n",
      )
    } catch (err) {
      console.error("[printer] write failed:", err)
    }
  })
  socket.on("error", (err) => {
    console.error(`[printer] socket error ${remote}:`, err.message)
  })
})

server.listen(PORT, "0.0.0.0", () => {
  console.log(`[printer] mock listening on tcp://0.0.0.0:${PORT}`)
})
