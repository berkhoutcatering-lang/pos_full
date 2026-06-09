// Ambient module declaration for `mdns` — the upstream package ships
// no TypeScript types. Only the surface we actually use is declared.

declare module "mdns" {
  export interface Advertisement {
    start(): void
    stop(): void
  }
  export interface ServiceType {
    name: string
    protocol: string
  }
  export function tcp(name: string): ServiceType
  export function createAdvertisement(
    serviceType: ServiceType,
    port: number,
    options?: {
      name?: string
      txtRecord?: Record<string, string>
      networkInterface?: string
    },
  ): Advertisement
}
