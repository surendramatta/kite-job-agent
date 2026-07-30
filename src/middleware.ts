import { NextRequest, NextResponse } from "next/server";

// Gate every page behind the login cookie. Validity is checked against the
// stored password hash by /api/auth/check (middleware can't touch SQLite).
export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (
    pathname.startsWith("/login") ||
    pathname.startsWith("/api/auth") ||
    pathname.startsWith("/_next") ||
    pathname === "/favicon.ico"
  ) {
    return NextResponse.next();
  }
  try {
    const check = await fetch(new URL("/api/auth/check", req.url), {
      headers: { cookie: req.headers.get("cookie") ?? "" },
    });
    if (check.status === 401) {
      return NextResponse.redirect(new URL("/login", req.url));
    }
  } catch {}
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
