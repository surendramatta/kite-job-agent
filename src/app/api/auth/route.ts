import { NextRequest, NextResponse } from "next/server";
import { createHash } from "crypto";
import { getSetting, setSetting } from "@/lib/db";
import { createSessionToken, hashPassword, sessionCookieOptions, verifyPassword } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const form = await req.formData();
  const password = String(form.get("password") ?? "");
  if (password.length < 8) {
    return NextResponse.redirect(new URL("/login?error=short", req.url), 303);
  }

  const stored = getSetting("kite_password");
  if (!stored) {
    setSetting("kite_password", hashPassword(password));
  } else if (!verifyPassword(password, stored)) {
    // One-time upgrade path for installations that used Kite's legacy SHA-256 hash.
    const legacy = createHash("sha256").update(`kite:${password}`).digest("hex");
    if (stored === legacy) setSetting("kite_password", hashPassword(password));
    else return NextResponse.redirect(new URL("/login?error=wrong", req.url), 303);
  }

  const res = NextResponse.redirect(new URL("/dashboard", req.url), 303);
  res.cookies.set("kite_auth", createSessionToken(), sessionCookieOptions);
  return res;
}
