import { type NextRequest } from "next/server"
import { updateSession } from "@/lib/supabase/middleware"

// Next.js 16: `middleware.ts` is deprecated in favor of `proxy.ts` to
// clarify the network boundary. Body + matcher unchanged.

export default async function proxy(request: NextRequest) {
  return await updateSession(request)
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|sw\\.js|workbox-.*\\.js|manifest\\.json|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
}
