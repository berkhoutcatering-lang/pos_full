import "./globals.css"
import type { Metadata, Viewport } from "next"
import { getActiveTheme } from "@/lib/dal/theme"
import { VitalsReporter } from "@/components/vitals-reporter"

export const metadata: Metadata = {
  title: "Hop & Bites POS",
  description: "Foodtruck POS",
  manifest: "/manifest.json",
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor: "#ff6b35",
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const theme = await getActiveTheme()
  return (
    <html lang="nl" data-theme={theme.preset}>
      <body>
        {children}
        <VitalsReporter />
      </body>
    </html>
  )
}
