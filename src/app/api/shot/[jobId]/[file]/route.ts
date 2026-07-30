import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ jobId: string; file: string }> }
) {
  const { jobId, file } = await ctx.params;
  if (!/^\d+$/.test(jobId) || !/^[\w.-]+\.png$/.test(file)) {
    return NextResponse.json({ error: "bad path" }, { status: 400 });
  }
  const p = path.join(process.cwd(), "data", "runs", jobId, file);
  if (!fs.existsSync(p)) return NextResponse.json({ error: "not found" }, { status: 404 });
  return new NextResponse(new Uint8Array(fs.readFileSync(p)), {
    headers: { "Content-Type": "image/png", "Cache-Control": "no-store" },
  });
}
