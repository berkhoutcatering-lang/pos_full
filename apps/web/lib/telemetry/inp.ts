"use client"
import { onINP, onLCP, onCLS, type Metric } from "web-vitals"

// Pillar 4 Foodtruck-First INP field harness. Reports CWV metrics to the
// /api/metrics ingest endpoint so we have FIELD data (CrUX-style), not
// just Lighthouse-CI lab data. The Checkly monitor `pillar-4-inp-p75`
// reads the aggregated p75 from this same endpoint.

const METRICS_ENDPOINT = "/api/metrics/vitals"

function report(metric: Metric) {
  if (typeof navigator === "undefined") return
  const body = JSON.stringify({
    name: metric.name,
    value: metric.value,
    rating: metric.rating,
    id: metric.id,
    delta: metric.delta,
    nav_type: metric.navigationType,
    path: window.location.pathname,
    ts: Date.now(),
  })
  // sendBeacon survives page-unload; falls back to fetch keep-alive.
  if (navigator.sendBeacon) {
    navigator.sendBeacon(METRICS_ENDPOINT, body)
  } else {
    void fetch(METRICS_ENDPOINT, {
      method: "POST",
      body,
      keepalive: true,
      headers: { "Content-Type": "application/json" },
    })
  }
}

let started = false
export function startVitalsReporting() {
  if (started || typeof window === "undefined") return
  started = true
  onINP(report)
  onLCP(report)
  onCLS(report)
}
