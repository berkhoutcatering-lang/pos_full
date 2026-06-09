import { requireRole, requireVenue } from "@/lib/dal/auth"
import { computeZReport } from "@/lib/dal/dagafsluiting"
import { ZReportView } from "./z-report-view"

export const dynamic = "force-dynamic"

interface PageProps {
  searchParams: Promise<{ date?: string }>
}

export default async function DagafsluitingPage({ searchParams }: PageProps) {
  await requireRole("manager")
  const claims = await requireVenue()
  const { date } = await searchParams
  const todayAmsterdam = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Amsterdam",
  }).format(new Date())
  const targetDate = date ?? todayAmsterdam
  const report = await computeZReport({
    orgId: claims.orgId,
    venueId: claims.venueId,
    date: targetDate,
  })
  return <ZReportView report={report} />
}
