import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import { ensureTailoredPdf } from "@/lib/resumepdf";

export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const filePath = await ensureTailoredPdf(Number(id));
  if (!filePath) {
    return NextResponse.json(
      { error: "No tailored resume for this application yet (or browser not installed)" },
      { status: 404 }
    );
  }
  const buf = fs.readFileSync(filePath);
  return new NextResponse(new Uint8Array(buf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filePath.split("/").pop()}"`,
    },
  });
}
