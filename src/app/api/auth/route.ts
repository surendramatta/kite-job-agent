import { NextRequest, NextResponse } from "next/server";
import { getSetting, setSetting } from "@/lib/db";
import {
  createSessionToken,
  hashPassword,
  sessionCookieOptions,
  verifyPassword,
} from "@/lib/auth";

export const dynamic = "force-dynamic";

function validEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export async function POST(req: NextRequest) {
  const form = await req.formData();
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const password = String(form.get("password") ?? "");

  if (!validEmail(email)) {
    return NextResponse.redirect(new URL("/login?error=email", req.url), 303);
  }

  if (password.length < 6) {
    return NextResponse.redirect(new URL("/login?error=short", req.url), 303);
  }

  const storedEmail = getSetting("kite_email");
  const storedPassword = getSetting("kite_password");

  // First login creates the private owner account.
  if (!storedEmail || !storedPassword) {
    setSetting("kite_email", email);
    setSetting("kite_password", hashPassword(password));
  } else {
    const emailMatches = storedEmail.toLowerCase() === email;
    const passwordMatches = verifyPassword(password, storedPassword);

    if (!emailMatches || !passwordMatches) {
      return NextResponse.redirect(new URL("/login?error=wrong", req.url), 303);
    }
  }

  const response = NextResponse.redirect(new URL("/dashboard", req.url), 303);
  response.cookies.set("kite_auth", createSessionToken(), sessionCookieOptions);
  return response;
}
