import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { tick } from "@/lib/worker";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

function safeEqual(a: string, b: string) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

export async function POST(req: NextRequest) {
  const expected = process.env.KITE_WORKER_SECRET ?? "";
  const supplied = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (!expected || !safeEqual(expected, supplied)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  try {
    await tick(true);
    return NextResponse.json({ ok: true, ranAt: new Date().toISOString() });
  } catch (error) {
    const message = error instanceof Error ? error.message : "worker tick failed";
    console.error("[worker-tick]", error);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
