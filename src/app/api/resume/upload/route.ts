import { NextRequest, NextResponse } from "next/server";
import path from "path";
import fs from "fs";
import { getDb, setSetting } from "@/lib/db";
import { parseResumeText } from "@/lib/resumeparse";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
  }
  if (file.size > 10 * 1024 * 1024) {
    return NextResponse.json({ error: "File too large (max 10 MB)" }, { status: 400 });
  }

  const buf = Buffer.from(await file.arrayBuffer());
  const ext = path.extname(file.name).toLowerCase();

  let text = "";
  try {
    if (ext === ".pdf") {
      const { PDFParse } = await import("pdf-parse");
      const parser = new PDFParse({ data: new Uint8Array(buf) });
      const result = await parser.getText();
      await parser.destroy();
      text = result.text ?? "";
    } else if (ext === ".docx" || ext === ".doc") {
      const mammoth = await import("mammoth");
      const result = await mammoth.extractRawText({ buffer: buf });
      text = result.value ?? "";
    } else if (ext === ".txt" || ext === ".md") {
      text = buf.toString("utf-8");
    } else {
      return NextResponse.json(
        { error: "Use a PDF, DOCX or TXT file" },
        { status: 400 }
      );
    }
  } catch (e) {
    return NextResponse.json(
      { error: `Could not read the file: ${(e as Error).message.split("\n")[0]}` },
      { status: 400 }
    );
  }

  if (text.trim().length < 40) {
    return NextResponse.json(
      { error: "Couldn't extract text — if this is a scanned PDF, paste the text into the editor instead" },
      { status: 400 }
    );
  }

  // Keep the original file so the apply agent can upload it into ATS forms.
  const uploadsDir = path.join(process.cwd(), "data", "uploads");
  fs.mkdirSync(uploadsDir, { recursive: true });
  const safeName = `${Date.now()}-${file.name.replace(/[^\w.-]/g, "_")}`;
  const filePath = path.join(uploadsDir, safeName);
  fs.writeFileSync(filePath, buf);
  if (ext === ".pdf") setSetting("resume_pdf_path", filePath);

  const { content, contact } = parseResumeText(text);

  const db = getDb();
  const count = (db.prepare("SELECT COUNT(*) n FROM resumes").get() as { n: number }).n;
  const name = file.name.replace(/\.[^.]+$/, "").slice(0, 40) || "Imported resume";
  const info = db
    .prepare("INSERT INTO resumes (name, content_json, is_default, file_path) VALUES (?, ?, ?, ?)")
    .run(name, JSON.stringify(content), count === 0 ? 1 : 0, filePath);

  // Complete the profile from the resume: contact fields, headline, summary,
  // skills, experience and education (only where the profile is still empty).
  const sets: string[] = [];
  const vals: string[] = [];
  const headline = content.experience?.[0]?.title ?? "";
  const map: [string, string | undefined][] = [
    ["full_name", contact.name],
    ["email", contact.email],
    ["phone", contact.phone],
    ["linkedin", contact.linkedin],
    ["headline", headline],
    ["summary", content.summary],
  ];
  for (const [col, val] of map) {
    if (val) {
      sets.push(`${col} = CASE WHEN ${col} = '' THEN ? ELSE ${col} END`);
      vals.push(val);
    }
  }
  if (content.skills?.length) {
    sets.push(`skills_json = CASE WHEN skills_json IN ('', '[]') THEN ? ELSE skills_json END`);
    vals.push(JSON.stringify(content.skills));
  }
  if (content.experience?.length) {
    sets.push(`experience_json = CASE WHEN experience_json IN ('', '[]') THEN ? ELSE experience_json END`);
    vals.push(JSON.stringify(content.experience));
  }
  if (content.education?.length) {
    sets.push(`education_json = CASE WHEN education_json IN ('', '[]') THEN ? ELSE education_json END`);
    vals.push(JSON.stringify(content.education));
  }
  if (sets.length) db.prepare(`UPDATE profile SET ${sets.join(", ")} WHERE id = 1`).run(...vals);

  return NextResponse.json({
    ok: true,
    resumeId: Number(info.lastInsertRowid),
    parsed: {
      skills: content.skills?.length ?? 0,
      roles: content.experience?.length ?? 0,
      education: content.education?.length ?? 0,
    },
  });
}
