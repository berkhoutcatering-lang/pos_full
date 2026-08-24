"use client"

/**
 * De betaalterminal aan de USB van dit kassascherm.
 *
 * Chrome op een desktop mag een seriële poort openen (WebSerial). Dit scherm
 * staat toch de hele dag open, dus het kan de kabel vasthouden en de bytes
 * doorgeven aan de Pi. Dat scheelt een los programma dat een poort op het
 * netwerk openzet, een firewallregel, en een vast IP voor dit apparaat.
 *
 * Waarom de kabel en niet WiFi op de terminal: hangt hij aan een WiFi-netwerk
 * zonder internet, dan stuurt Android het bankverkeer daarheen in plaats van
 * over de simkaart, en mislukt elke transactie. Aan een kabel staat zijn WiFi
 * uit en is de sim de enige uitweg.
 *
 * Hier wordt niets van betalen begrepen. De Pi zegt "open", "schrijf dit",
 * "sluit"; wij doen dat en sturen terug wat eruit komt. Alle logica over
 * bedragen, stages en bonnen blijft op de Pi, zodat een herladen tabblad nooit
 * een betaling kan kwijtraken.
 */

/**
 * WebSerial staat niet in de standaard TypeScript-bibliotheek. Alleen wat we
 * gebruiken zelf beschrijven scheelt een dependency — en dus een image-build,
 * want node_modules op de Pi zijn niet via het deploy-script bij te werken.
 */
interface SerialPortInfo {
  usbVendorId?: number
  usbProductId?: number
}
interface SerialPort {
  readable: ReadableStream<Uint8Array> | null
  writable: WritableStream<Uint8Array> | null
  open(options: { baudRate: number }): Promise<void>
  close(): Promise<void>
  getInfo(): SerialPortInfo
}
interface SerialApi {
  getPorts(): Promise<SerialPort[]>
  requestPort(options?: { filters?: SerialPortInfo[] }): Promise<SerialPort>
}
declare global {
  interface Navigator {
    readonly serial: SerialApi
  }
}

const PI_BASE = "https://hopbites.local:3001"

/** myPOS' USB-leverancier-id — hiermee toont Chrome alleen de terminal. */
const MYPOS_USB_VENDOR = 0x294a

export type TerminalLinkState =
  | "unsupported"
  | "idle"
  | "connecting"
  | "linked"
  | "error"

interface Command {
  op: "open" | "write" | "close"
  session: string
  baud?: number
  data?: string
}

function toBase64(bytes: Uint8Array): string {
  let s = ""
  for (const b of bytes) s += String.fromCharCode(b)
  return btoa(s)
}

function fromBase64(data: string): Uint8Array {
  const raw = atob(data)
  const out = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i)
  return out
}

async function post(path: string, body: unknown) {
  return fetch(`${PI_BASE}${path}`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
}

export function webSerialSupported(): boolean {
  return typeof navigator !== "undefined" && "serial" in navigator
}

/**
 * Houdt de kabel vast en bedient de Pi tot `stop()` wordt aangeroepen.
 *
 * Eén instantie per pagina. Wordt de pagina herladen, dan meldt de nieuwe zich
 * opnieuw en neemt hij het over — de Pi geeft de kabel aan de laatste.
 */
export function createTerminalLink(onState: (s: TerminalLinkState, detail?: string) => void) {
  let stopped = false
  let linkId: string | null = null
  let port: SerialPort | null = null
  let reader: ReadableStreamDefaultReader<Uint8Array> | null = null
  let writer: WritableStreamDefaultWriter<Uint8Array> | null = null
  let session: string | null = null

  async function reportError(message: string) {
    if (session) await post("/terminal/link/error", { link_id: linkId, session, message }).catch(() => {})
  }

  /** Lezen tot de poort dichtgaat; alles wat binnenkomt gaat door naar de Pi. */
  async function pump(current: string) {
    if (!port?.readable) return
    const active = port.readable.getReader()
    reader = active
    try {
      for (;;) {
        const { value, done } = await active.read()
        if (done || stopped) break
        if (value && value.length > 0) {
          await post("/terminal/link/data", {
            link_id: linkId,
            session: current,
            data: toBase64(value),
          }).catch(() => {})
        }
      }
    } catch (err) {
      await reportError((err as Error).message)
    } finally {
      try {
        active.releaseLock()
      } catch {
        // Al losgelaten doordat de poort dichtging. Niets aan de hand.
      }
      reader = null
    }
  }

  async function openPort(cmd: Command) {
    if (!port) return
    session = cmd.session
    try {
      await port.open({ baudRate: cmd.baud ?? 115200 })
      writer = port.writable!.getWriter()
      void pump(cmd.session)
    } catch (err) {
      // "already open" is geen fout maar een sessie die niet netjes werd
      // afgesloten — dan gewoon doorgaan met de poort die er al is.
      const message = (err as Error).message
      if (!/already open/i.test(message)) {
        await reportError(message)
        return
      }
      if (!writer && port.writable) writer = port.writable.getWriter()
      void pump(cmd.session)
    }
  }

  async function closePort() {
    session = null
    try {
      await reader?.cancel()
    } catch {
      // De lezer kan al gestopt zijn doordat de kabel eruit ging.
    }
    try {
      writer?.releaseLock()
    } catch {
      // Idem.
    }
    writer = null
    try {
      await port?.close()
    } catch {
      // Dicht is dicht; een tweede poging helpt niet.
    }
  }

  async function handle(cmd: Command) {
    if (cmd.op === "open") return openPort(cmd)
    if (cmd.op === "close") return closePort()
    if (cmd.op === "write" && writer && cmd.data) {
      try {
        await writer.write(fromBase64(cmd.data))
      } catch (err) {
        await reportError((err as Error).message)
      }
    }
  }

  /** Long-poll bij de Pi. Een leeg antwoord is normaal: er wordt niet gepind. */
  async function loop() {
    while (!stopped && linkId) {
      try {
        const res = await fetch(
          `${PI_BASE}/terminal/link/next?link_id=${encodeURIComponent(linkId)}`,
          { credentials: "include", signal: AbortSignal.timeout(35_000) },
        )
        if (res.status === 204) continue
        if (!res.ok) throw new Error(`pi_${res.status}`)
        await handle((await res.json()) as Command)
      } catch (err) {
        if (stopped) return
        // De Pi even niet bereikbaar of de poll afgebroken. Rustig opnieuw —
        // hier hoort geen foutmelding op het kassascherm, dit gebeurt bij elke
        // herstart van de bridge.
        onState("connecting", (err as Error).message)
        await new Promise((r) => setTimeout(r, 2_000))
        if (!stopped) onState("linked")
      }
    }
  }

  return {
    /** Een eerder toegestane poort oppakken, zonder klik. */
    async resume(): Promise<boolean> {
      if (!webSerialSupported()) {
        onState("unsupported")
        return false
      }
      const ports = await navigator.serial.getPorts()
      const known = ports.find((p) => p.getInfo().usbVendorId === MYPOS_USB_VENDOR) ?? ports[0]
      if (!known) {
        onState("idle")
        return false
      }
      return this.use(known)
    },

    /** Poortkeuze door de gebruiker. Chrome eist hiervoor een echte klik. */
    async choose(): Promise<boolean> {
      if (!webSerialSupported()) {
        onState("unsupported")
        return false
      }
      try {
        const chosen = await navigator.serial.requestPort({
          filters: [{ usbVendorId: MYPOS_USB_VENDOR }],
        })
        return this.use(chosen)
      } catch {
        // De gebruiker klikte weg. Geen fout.
        onState("idle")
        return false
      }
    },

    async use(chosen: SerialPort): Promise<boolean> {
      onState("connecting")
      port = chosen
      stopped = false
      try {
        const res = await post("/terminal/link/attach", {})
        if (!res.ok) throw new Error(`pi_${res.status}`)
        linkId = ((await res.json()) as { link_id: string }).link_id
      } catch (err) {
        onState("error", (err as Error).message)
        return false
      }
      onState("linked")
      void loop()
      return true
    },

    async stop() {
      stopped = true
      const id = linkId
      linkId = null
      await closePort()
      if (id) await post("/terminal/link/detach", { link_id: id }).catch(() => {})
      onState("idle")
    },
  }
}
