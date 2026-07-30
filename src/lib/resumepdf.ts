// Renders a tailored ATS resume to PDF with the agent's browser, so every
// application uploads a resume rewritten for that specific job.
import path from "path";
import fs from "fs";
import { getDb, getProfile, Application } from "./db";
import { ResumeContent } from "./ats";
import { launchBrowser } from "./browser";

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function renderResumeHtml(content: ResumeContent): string {
  const p = getProfile();
  const contact = [p.location, p.email, p.phone, p.linkedin.replace(/^https?:\/\//, "")]
    .filter(Boolean)
    .map(esc)
    .join(" | ");
  const section = (title: string, body: string) =>
    body
      ? `<h2 style="font-size:11.5px;letter-spacing:.05em;border-bottom:1px solid #111;padding-bottom:2px;margin:14px 0 6px">${title}</h2>${body}`
      : "";

  const exp = (content.experience ?? [])
    .map(
      (e) => `<div style="margin-top:8px">
        <div style="display:flex;justify-content:space-between;align-items:baseline">
          <b>${esc(e.title)}${e.company ? ` — ${esc(e.company)}` : ""}</b>
          <span style="font-size:10px;color:#444">${esc([e.start, e.end].filter(Boolean).join(" – "))}</span>
        </div>
        <ul style="margin:3px 0 0 18px;padding:0">
          ${e.bullets.filter(Boolean).map((b) => `<li style="margin-bottom:2px">${esc(b)}</li>`).join("")}
        </ul>
      </div>`
    )
    .join("");

  const edu = (content.education ?? [])
    .map(
      (e) => `<div style="display:flex;justify-content:space-between;margin-top:4px">
        <span><b>${esc(e.school || e.degree)}</b>${e.school && e.degree ? ` — ${esc(e.degree)}` : ""}</span>
        <span style="font-size:10px;color:#444">${esc(e.year ?? "")}</span>
      </div>`
    )
    .join("");

  return `<!doctype html><html><head><meta charset="utf-8"></head>
  <body style="font-family:Arial,Helvetica,sans-serif;font-size:11px;line-height:1.45;color:#111;margin:36px 44px">
    <h1 style="text-align:center;font-size:20px;margin:0">${esc(p.full_name || "Resume")}</h1>
    <p style="text-align:center;font-size:10px;color:#333;margin:4px 0 0">${contact}</p>
    ${section("PROFESSIONAL SUMMARY", content.summary ? `<p style="margin:0">${esc(content.summary)}</p>` : "")}
    ${section("SKILLS", content.skills?.length ? `<p style="margin:0">${esc(content.skills.join(", "))}</p>` : "")}
    ${section("EXPERIENCE", exp)}
    ${section("EDUCATION", edu)}
  </body></html>`;
}

// Returns the path of the tailored PDF for an application (cached per update).
export async function ensureTailoredPdf(appId: number): Promise<string | null> {
  const db = getDb();
  const app = db.prepare("SELECT * FROM applications WHERE id = ?").get(appId) as
    | Application
    | undefined;
  if (!app?.tailored_resume_json) return null;

  const dir = path.join(process.cwd(), "data", "uploads");
  fs.mkdirSync(dir, { recursive: true });
  const profile = getProfile();
  const fileBase = `${(profile.full_name || "resume").replace(/[^\w]+/g, "_")}_resume_app${appId}`;
  const filePath = path.join(dir, `${fileBase}.pdf`);
  if (fs.existsSync(filePath) && fs.statSync(filePath).mtime > new Date(app.updated_at + "Z")) {
    return filePath;
  }

  const browser = await launchBrowser();
  if (!browser) return null;
  try {
    const page = await browser.newPage();
    await page.setContent(renderResumeHtml(JSON.parse(app.tailored_resume_json)), {
      waitUntil: "load",
    });
    await page.pdf({ path: filePath, format: "Letter" });
    return filePath;
  } catch {
    return null;
  } finally {
    await browser.close();
  }
}
