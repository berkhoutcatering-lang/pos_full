import "server-only"
import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  pdf,
} from "@react-pdf/renderer"
import type { ZReport } from "@/lib/dal/dagafsluiting"

// Z-rapport PDF voor de boekhouder. Pillar #2 BTW-Right Audit-Ready.
// Drukt per BTW-klasse de excl/btw/incl uit, plus betaalmethode-split en
// het hash-chain anchor van de shift.closed event in audit_log. ESC/POS
// op de Pi-printer blijft de operationele bon; deze PDF is voor de
// boekhouder / Belastingdienst.

const styles = StyleSheet.create({
  page: { padding: 28, fontSize: 10, fontFamily: "Helvetica" },
  h1: { fontSize: 18, fontWeight: 700, marginBottom: 4 },
  h2: { fontSize: 12, fontWeight: 700, marginTop: 12, marginBottom: 6 },
  meta: { fontSize: 9, color: "#555", marginBottom: 8 },
  row: { flexDirection: "row", paddingVertical: 2, borderBottomWidth: 0.5, borderBottomColor: "#ddd" },
  cellL: { flex: 2 },
  cellR: { flex: 1, textAlign: "right" },
  total: { fontSize: 12, fontWeight: 700, marginTop: 8 },
  hash: { fontSize: 8, fontFamily: "Courier", marginTop: 12, color: "#666" },
})

interface ZReportPdfProps {
  report: ZReport
  tenant: { name: string; kvk: string; btw: string }
  venue_name: string
  audit_anchor?: { seq_id: number; hash_curr: string }
}

function fmtEur(c: number): string {
  return `EUR ${(c / 100).toFixed(2)}`
}

export function ZRapportDocument(props: ZReportPdfProps) {
  const { report, tenant, venue_name, audit_anchor } = props
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <Text style={styles.h1}>{tenant.name} — Z-rapport</Text>
        <Text style={styles.meta}>
          Venue {venue_name} · Datum {report.date} · KvK {tenant.kvk} · BTW {tenant.btw}
        </Text>

        <Text style={styles.h2}>BTW-splits</Text>
        <View style={styles.row}>
          <Text style={[styles.cellL, { fontWeight: 700 }]}>Klasse</Text>
          <Text style={[styles.cellR, { fontWeight: 700 }]}>Tarief</Text>
          <Text style={[styles.cellR, { fontWeight: 700 }]}>Excl.</Text>
          <Text style={[styles.cellR, { fontWeight: 700 }]}>BTW</Text>
          <Text style={[styles.cellR, { fontWeight: 700 }]}>Incl.</Text>
        </View>
        {Object.entries(report.btw_breakdown).map(([cls, b]) =>
          b.incl_cents > 0 ? (
            <View key={cls} style={styles.row}>
              <Text style={styles.cellL}>{cls}</Text>
              <Text style={styles.cellR}>{b.rate}%</Text>
              <Text style={styles.cellR}>{fmtEur(b.excl_cents)}</Text>
              <Text style={styles.cellR}>{fmtEur(b.btw_cents)}</Text>
              <Text style={styles.cellR}>{fmtEur(b.incl_cents)}</Text>
            </View>
          ) : null,
        )}
        <Text style={styles.total}>
          Totaal incl: {fmtEur(report.total_incl_cents)} · BTW totaal:{" "}
          {fmtEur(report.total_btw_cents)}
        </Text>

        <Text style={styles.h2}>Betaalmethoden</Text>
        <View style={styles.row}>
          <Text style={styles.cellL}>Contant</Text>
          <Text style={styles.cellR}>{fmtEur(report.payment_split.cash_cents)}</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.cellL}>PIN</Text>
          <Text style={styles.cellR}>{fmtEur(report.payment_split.pin_cents)}</Text>
        </View>

        <Text style={styles.h2}>Orders</Text>
        <View style={styles.row}>
          <Text style={styles.cellL}>Verkocht</Text>
          <Text style={styles.cellR}>{report.order_count}</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.cellL}>Voids</Text>
          <Text style={styles.cellR}>{report.void_count}</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.cellL}>Refunds</Text>
          <Text style={styles.cellR}>{report.refund_count}</Text>
        </View>

        {audit_anchor ? (
          <Text style={styles.hash}>
            SBA Fase 4 hash anchor (audit_log seq {audit_anchor.seq_id}):
            {"\n"}
            {audit_anchor.hash_curr}
          </Text>
        ) : null}
      </Page>
    </Document>
  )
}

export async function renderZRapportPdf(
  props: ZReportPdfProps,
): Promise<Buffer> {
  const blob = await pdf(<ZRapportDocument {...props} />).toBlob()
  const arr = await blob.arrayBuffer()
  return Buffer.from(arr)
}
