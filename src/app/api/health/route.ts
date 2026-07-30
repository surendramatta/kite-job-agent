import { NextResponse } from "next/server";
import { getDb, getSetting } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const db = getDb();
    const pending = (db.prepare("SELECT COUNT(*) n FROM apply_queue WHERE state IN ('pending','processing')").get() as { n: number }).n;
    db.prepare("SELECT 1").get();
    return NextResponse.json({
      ok: true,
      database: "ok",
      pendingApplications: pending,
      lastWorkerTick: getSetting("agent_last_tick", "never"),
      lastWorkerError: getSetting("agent_last_error", ""),
      time: new Date().toISOString(),
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, database: "error", error: error instanceof Error ? error.message : "unknown error" },
      { status: 503 }
    );
  }
}
