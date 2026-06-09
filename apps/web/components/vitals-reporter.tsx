"use client"
import { useEffect } from "react"
import { startVitalsReporting } from "@/lib/telemetry/inp"

export function VitalsReporter() {
  useEffect(() => {
    startVitalsReporting()
  }, [])
  return null
}
