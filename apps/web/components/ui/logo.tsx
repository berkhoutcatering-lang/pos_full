import { cn } from "@/lib/cn"

export interface LogoProps {
  /** Rendered height in px; width scales with the image ratio (744×386). */
  h?: number
  className?: string
  style?: React.CSSProperties
}

/** Het echte Hop & Bites-logo (hopbel + vork, gouden serif-wordmark,
 *  transparante PNG). Hoogte-gestuurd; werkt op licht én donker. Vervangt
 *  het oude typografische "H&B"-monogram overal. */
export function Logo({ h = 52, className, style }: LogoProps) {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- statisch logo
    // uit /public; next/image's optimizer staat uit op de Pi-build en de
    // PWA moet het asset 1-op-1 kunnen precachen.
    <img
      src="/logo.png"
      alt="Hop & Bites"
      className={cn("block w-auto select-none", className)}
      style={{ height: h, ...style }}
      draggable={false}
    />
  )
}
