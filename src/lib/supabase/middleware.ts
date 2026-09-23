import { createServerClient } from "@supabase/ssr"
import { NextResponse, type NextRequest } from "next/server"

/** Routes that are reachable without an authenticated session. */
const PUBLIC_ROUTES = ["/login"]

/**
 * Refreshes the Supabase auth session on every request and enforces access:
 * unauthenticated users are redirected to /login, and signed-in users hitting
 * /login are bounced to the app. Follows the @supabase/ssr Next.js pattern —
 * the returned response carries the refreshed auth cookies, so it must be the
 * response that middleware returns.
 */
export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // IMPORTANT: do not run code between createServerClient and getUser() — it
  // refreshes the session and any intervening logic can cause random logouts.
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { pathname } = request.nextUrl
  const isPublicRoute = PUBLIC_ROUTES.some(
    (route) => pathname === route || pathname.startsWith(`${route}/`)
  )

  if (!user && !isPublicRoute) {
    const url = request.nextUrl.clone()
    url.pathname = "/login"
    // Preserve where the user was headed so we can return them after login.
    if (pathname !== "/") url.searchParams.set("redirect", pathname)
    return NextResponse.redirect(url)
  }

  if (user && isPublicRoute) {
    const url = request.nextUrl.clone()
    url.pathname = "/products"
    url.search = ""
    return NextResponse.redirect(url)
  }

  return supabaseResponse
}
