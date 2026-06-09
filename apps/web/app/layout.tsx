import "./globals.css"
import type { Metadata, Viewport } from "next"
import { Hanken_Grotesk } from "next/font/google"
import { getActiveTheme } from "@/lib/dal/theme"
import { VitalsReporter } from "@/components/vitals-reporter"

const hanken = Hanken_Grotesk({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-hanken",
  display: "swap",
})

export const metadata: Metadata = {
  title: "Hop & Bites POS",
  description: "Foodtruck POS",
  manifest: "/manifest.json",
  icons: {
    icon: [
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: "/apple-touch-icon.png",
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Hop & Bites",
  },
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor: "#1B201D",
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const theme = await getActiveTheme()
  return (
    <html lang="nl" data-theme={theme.preset} className={hanken.variable}>
      <body>
        {children}
        <VitalsReporter />
      </body>
    </html>
  )
}
