import { NextRequest, NextResponse } from "next/server";
import { getSetting } from "@/lib/db";
import { verifySessionToken } from "@/lib/auth";

export const dynamic = "force-dynamic";

export function GET(req: NextRequest) {
  const stored = getSetting("kite_password");
  if (!stored) return NextResponse.json({ ok: true });
  const cookie = req.cookies.get("kite_auth")?.value ?? "";
  try {
    if (verifySessionToken(cookie)) return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[auth-check]", error);
  }
  return NextResponse.json({ ok: false }, { status: 401 });
}
