import net from "node:net"
import fs from "node:fs"
import { execFile } from "node:child_process"
import { promisify } from "node:util"
import { logger } from "../utils/logger.js"
import {
  beginSession,
  closeSession,
  openSession,
  writeToSession,
} from "./mypos-web-link.js"

/**
 * De pijp onder IPP: een TCP-socket, een seriële poort, of de browser van het
 * kassascherm.
 *
 * Waarom er meer dan één is: hangt de terminal aan WiFi zonder internet, dan stuurt
 * Android het bankverkeer daarheen in plaats van over de simkaart en mislukt
 * elke transactie. Aan een USB-kabel staat WiFi uit, is de sim de enige uitweg,
 * en bestaat dat probleem niet. Bluetooth lost hetzelfde op en komt in Linux
 * ook binnen als seriële poort, dus dat is dezelfde code met een ander pad.
 *
 * En hangt die kabel niet aan de Pi maar aan het kassascherm, dan houdt de
 * browser daar de poort vast (WebSerial) en halen we de bytes daar op.
 *
 * De protocollaag erboven merkt van dit onderscheid niets: allebei leveren ze
 * bytes aan, nemen ze bytes aan, en vallen ze stil.
 */

const exec = promisify(execFile)

export interface IppLink {
  /** Klaar om te schrijven. Vuurt precies één keer. */
  onOpen(fn: () => void): void
  onData(fn: (chunk: Buffer) => void): void
  /** Te lang stil. De protocollaag bepaalt hoe lang dat is, per stage. */
  onIdle(fn: () => void): void
  onError(fn: (err: Error) => void): void
  onClose(fn: () => void): void
  write(data: Buffer): void
  /** Zet de stilte-teller opnieuw; 0 zet hem uit. */
  setIdleTimeout(ms: number): void
  destroy(): void
}

export interface TcpTarget {
  host: string
  port: number
}

export interface SerialTarget {
  /** Bijvoorbeeld /dev/ttyACM0 (USB) of /dev/rfcomm0 (Bluetooth). */
  serial: string
  baud: number
}

/** De kabel hangt aan het kassascherm; de browser daar geeft de bytes door. */
export interface BrowserTarget {
  browser: true
  baud: number
}

export type IppTarget = TcpTarget | SerialTarget | BrowserTarget

export function isSerial(target: IppTarget): target is SerialTarget {
  return "serial" in target
}

export function isBrowser(target: IppTarget): target is BrowserTarget {
  return "browser" in target
}

export function describeTarget(target: IppTarget): string {
  if (isSerial(target)) return target.serial
  if (isBrowser(target)) return "kassascherm"
  return `${target.host}:${target.port}`
}

function tcpLink(target: TcpTarget): IppLink {
  const socket = net.createConnection({ host: target.host, port: target.port })
  return {
    onOpen: (fn) => socket.on("connect", fn),
    onData: (fn) => socket.on("data", fn),
    onIdle: (fn) => socket.on("timeout", fn),
    onError: (fn) => socket.on("error", fn),
    onClose: (fn) => socket.on("close", fn),
    write: (d) => void socket.write(d),
    setIdleTimeout: (ms) => socket.setTimeout(ms),
    destroy: () => socket.destroy(),
  }
}

/**
 * Eén verzoek tegelijk over de kabel.
 *
 * Een TCP-verbinding per verzoek is gratis; een seriële poort is er maar één.
 * Zonder deze wachtrij zou de hartslag-PING dwars door een lopende betaling
 * heen schrijven, en dan raken beide antwoorden door elkaar — precies het soort
 * fout dat zich pas op een drukke zaterdag laat zien.
 */
let serialQueue: Promise<void> = Promise.resolve()

function withSerialLock<T>(fn: () => Promise<T>): Promise<T> {
  const run = serialQueue.then(fn, fn)
  // De keten mag niet breken op een mislukt verzoek; de volgende krijgt gewoon
  // zijn beurt.
  serialQueue = run.then(
    () => undefined,
    () => undefined,
  )
  return run
}

function serialLink(target: SerialTarget): IppLink {
  const handlers = {
    open: () => {},
    data: (_c: Buffer) => {},
    idle: () => {},
    error: (_e: Error) => {},
    close: () => {},
  }

  let fd: number | null = null
  let idleTimer: NodeJS.Timeout | null = null
  let idleMs = 0
  let closed = false
  let release: (() => void) | null = null

  const rearm = () => {
    if (idleTimer) clearTimeout(idleTimer)
    idleTimer = null
    if (idleMs > 0 && !closed) {
      idleTimer = setTimeout(() => handlers.idle(), idleMs)
      idleTimer.unref()
    }
  }

  const shut = () => {
    if (closed) return
    closed = true
    if (idleTimer) clearTimeout(idleTimer)
    if (fd !== null) {
      try {
        fs.closeSync(fd)
      } catch {
        // Al dicht, of de kabel eruit. Niets aan te doen en niets te melden.
      }
      fd = null
    }
    release?.()
    release = null
    handlers.close()
  }

  void withSerialLock(
    () =>
      new Promise<void>((done) => {
        release = done
        if (closed) {
          done()
          return
        }
        open()
          .then(() => {
            if (closed) return
            handlers.open()
            rearm()
          })
          .catch((err: Error) => {
            handlers.error(err)
            shut()
          })
      }),
  )

  async function open() {
    // Node kent geen termios, dus de poort gaat met stty in raw-modus. Zonder
    // raw kauwt de regeldiscipline op bytes die toevallig op een newline of een
    // stuurteken lijken — en IPP-frames zijn binair, inclusief een
    // lengteprefix die van alles kan bevatten.
    await exec("stty", [
      "-F",
      target.serial,
      "raw",
      "-echo",
      "-echoe",
      "-echok",
      "-crtscts",
      String(target.baud),
    ])

    fd = fs.openSync(target.serial, "r+")
    const stream = fs.createReadStream("", { fd, autoClose: false })
    stream.on("data", (chunk) => {
      rearm()
      handlers.data(Buffer.from(chunk))
    })
    stream.on("error", (err: Error) => {
      if (!closed) handlers.error(err)
    })
    logger.debug({ port: target.serial, baud: target.baud }, "serial link open")
  }

  return {
    onOpen: (fn) => {
      handlers.open = fn
    },
    onData: (fn) => {
      handlers.data = fn
    },
    onIdle: (fn) => {
      handlers.idle = fn
    },
    onError: (fn) => {
      handlers.error = fn
    },
    onClose: (fn) => {
      handlers.close = fn
    },
    write: (data) => {
      if (fd === null || closed) return
      try {
        fs.writeSync(fd, data)
      } catch (err) {
        handlers.error(err as Error)
        shut()
        return
      }
      rearm()
    },
    setIdleTimeout: (ms) => {
      idleMs = ms
      rearm()
    },
    destroy: shut,
  }
}

/**
 * De browser als kabel.
 *
 * Anders dan bij de andere twee bellen wij hier niet uit: de kassapagina heeft
 * zich gemeld en haalt zijn werk op. Is er geen pagina gekoppeld, dan is dat
 * meteen een fout — wachten op een browser die er niet is levert alleen een
 * klant op die naar een leeg scherm kijkt.
 */
function browserLink(target: BrowserTarget): IppLink {
  const handlers = {
    open: () => {},
    data: (_c: Buffer) => {},
    idle: () => {},
    error: (_e: Error) => {},
    close: () => {},
  }

  let sessionId: string | null = null
  let idleTimer: NodeJS.Timeout | null = null
  let idleMs = 0
  let closed = false

  const rearm = () => {
    if (idleTimer) clearTimeout(idleTimer)
    idleTimer = null
    if (idleMs > 0 && !closed) {
      idleTimer = setTimeout(() => handlers.idle(), idleMs)
      idleTimer.unref()
    }
  }

  const shut = () => {
    if (closed) return
    closed = true
    if (idleTimer) clearTimeout(idleTimer)
    if (sessionId) closeSession(sessionId)
    sessionId = null
    handlers.close()
  }

  // Niet meteen: de aanroeper moet eerst zijn handlers kunnen zetten.
  setImmediate(() => {
    if (closed) return
    const id = openSession({
      onData: (chunk) => {
        rearm()
        handlers.data(chunk)
      },
      onError: (err) => {
        if (!closed) handlers.error(err)
      },
    })
    if (!id) {
      handlers.error(new Error("geen kassascherm met de terminal gekoppeld"))
      shut()
      return
    }
    sessionId = id
    beginSession(id, target.baud)
    handlers.open()
    rearm()
  })

  return {
    onOpen: (fn) => {
      handlers.open = fn
    },
    onData: (fn) => {
      handlers.data = fn
    },
    onIdle: (fn) => {
      handlers.idle = fn
    },
    onError: (fn) => {
      handlers.error = fn
    },
    onClose: (fn) => {
      handlers.close = fn
    },
    write: (data) => {
      if (!sessionId || closed) return
      writeToSession(sessionId, data)
      rearm()
    },
    setIdleTimeout: (ms) => {
      idleMs = ms
      rearm()
    },
    destroy: shut,
  }
}

export function openLink(target: IppTarget): IppLink {
  if (isSerial(target)) return serialLink(target)
  if (isBrowser(target)) return browserLink(target)
  return tcpLink(target)
}

/** Alleen voor tests: wacht tot de seriële wachtrij leeg is. */
export function _drainSerialQueue(): Promise<void> {
  return serialQueue
}
