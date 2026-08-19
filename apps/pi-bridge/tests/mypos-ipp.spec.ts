import { describe, expect, it } from "vitest"
import {
  encodeFrame,
  formatAmount,
  parseFields,
  takeFrames,
} from "../src/services/mypos-ipp.js"

// The wire format is the one part of the LAN route we cannot re-derive from a
// running terminal at test time, so it is pinned here against the frames the
// real myPOS Ultra (software 2.3.3) sent on 2026-08-19.

describe("IPP framing", () => {
  it("prefixes with a length that counts itself", () => {
    const frame = encodeFrame([
      ["PROTOCOL", "IPP"],
      ["VERSION", "202"],
      ["METHOD", "PING"],
    ])
    expect(frame.readUInt16BE(0)).toBe(frame.length)
    expect(frame.subarray(2).toString("ascii")).toBe(
      "PROTOCOL=IPP\r\nVERSION=202\r\nMETHOD=PING\r\n",
    )
  })

  it("round-trips a frame", () => {
    const frame = encodeFrame([
      ["PROTOCOL", "IPP"],
      ["AMOUNT", "0.01"],
    ])
    const { frames, rest } = takeFrames(frame)
    expect(rest.length).toBe(0)
    expect(frames).toEqual([{ PROTOCOL: "IPP", AMOUNT: "0.01" }])
  })

  it("waits for the rest of a frame that arrives in pieces", () => {
    const frame = encodeFrame([["PROTOCOL", "IPP"]])
    const head = takeFrames(frame.subarray(0, 5))
    expect(head.frames).toHaveLength(0)
    expect(head.rest.length).toBe(5)

    const whole = takeFrames(Buffer.concat([head.rest, frame.subarray(5)]))
    expect(whole.frames).toEqual([{ PROTOCOL: "IPP" }])
  })

  it("splits two frames delivered in one chunk", () => {
    const a = encodeFrame([["METHOD", "PURCHASE"], ["STAGE", "1"]])
    const b = encodeFrame([["METHOD", "PURCHASE"], ["STAGE", "11"]])
    const { frames, rest } = takeFrames(Buffer.concat([a, b]))
    expect(frames.map((f) => f.STAGE)).toEqual(["1", "11"])
    expect(rest.length).toBe(0)
  })

  it("keeps values containing '=' intact", () => {
    // Receipt rows are free text and do come back with punctuation in them.
    expect(parseFields(Buffer.from("CUSTOM_ROW1=A=B\r\n", "ascii"))).toEqual({
      CUSTOM_ROW1: "A=B",
    })
  })

  it("drops a desynced buffer instead of looping on it", () => {
    const junk = Buffer.from([0x00, 0x01, 0x41, 0x42])
    const { frames, rest } = takeFrames(junk)
    expect(frames).toHaveLength(0)
    expect(rest.length).toBe(0)
  })

  it("parses the approved purchase the Ultra actually returned", () => {
    const final = parseFields(
      Buffer.from(
        [
          "PROTOCOL=IPP",
          "VERSION=202",
          "METHOD=PURCHASE",
          "STAGE=5",
          "STATUS=0",
          "TX_STATUS=0",
          "AUTH_CODE=P00291",
          "APPROVAL=00",
          "RRN=623120552024",
          "AMOUNT=0.01",
          "PAN_MASKED=**** 3839",
          "ENTRY_MODE=P",
          "STAN=4",
          "SIGNATURE_NOT_REQ=1",
          "AID_NAME=Maestro",
          "",
        ].join("\r\n"),
        "ascii",
      ),
    )
    expect(final.STAGE).toBe("5")
    expect(final.STATUS).toBe("0")
    expect(final.TX_STATUS).toBe("0")
    expect(final.RRN).toBe("623120552024")
    expect(final.AUTH_CODE).toBe("P00291")
  })
})

describe("amount formatting", () => {
  it("sends euros with two decimals, not cents", () => {
    // A factor-100 mistake here charges a customer 100x — the terminal takes
    // AMOUNT=0.01 for one cent, while our own domain speaks cents.
    expect(formatAmount(1)).toBe("0.01")
    expect(formatAmount(950)).toBe("9.50")
    expect(formatAmount(123456)).toBe("1234.56")
  })
})
