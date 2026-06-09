// ULID helpers inlined locally so the Pi-bridge Docker build is
// self-contained (no workspace dep). Mirror of
// packages/shared/src/ulid.ts — keep in sync.

import { ulid, monotonicFactory } from "ulid"

export function newId(): string {
  return ulid()
}

const monotonic = monotonicFactory()

export function newMonotonicId(): string {
  return monotonic()
}

export const ULID_RE = /^[0123456789ABCDEFGHJKMNPQRSTVWXYZ]{26}$/

export function isUlid(value: unknown): value is string {
  return typeof value === "string" && ULID_RE.test(value)
}
