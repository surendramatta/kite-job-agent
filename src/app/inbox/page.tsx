import Link from "next/link";
import { getDb, InboxMessage, timeAgo } from "@/lib/db";
import { logRecruiterReply, logOutboundReply, markInboxRead } from "@/lib/actions";
import { avatarColor } from "@/components/MatchCard";

export const dynamic = "force-dynamic";

const CATEGORIES = [
  { key: "", label: "All", color: "" },
  { key: "verification", label: "Verification", color: "text-[var(--blue)] border-[var(--blue)]/30" },
  { key: "rejection", label: "Rejection", color: "text-[var(--red)] border-[var(--red)]/30" },
  { key: "interview", label: "Interview", color: "text-[var(--green)] border-[var(--green)]/30" },
  { key: "assessment", label: "Assessment", color: "text-[var(--amber)] border-[var(--amber)]/30" },
  { key: "reminder", label: "Reminder", color: "text-[var(--amber)] border-[var(--amber)]/30" },
  { key: "offer", label: "Offer", color: "text-[var(--accent,#7c3aed)] border-purple-300" },
  { key: "applied", label: "Applied", color: "text-[var(--green)] border-[var(--green)]/30" },
];

type Msg = InboxMessage & { title: string; company: string; status: string };

export default async function InboxPage({
  searchParams,
}: {
  searchParams: Promise<{ cat?: string; m?: string; q?: string }>;
}) {
  const sp = await searchParams;
  const db = getDb();

  const where: string[] = ["m.direction = 'inbound'"];
  const params: unknown[] = [];
  if (sp.cat) {
    where.push("m.category = ?");
    params.push(sp.cat);
  }
  if (sp.q) {
    where.push("(m.subject LIKE ? OR m.body LIKE ? OR j.company LIKE ?)");
    params.push(`%${sp.q}%`, `%${sp.q}%`, `%${sp.q}%`);
  }
  const messages = db
    .prepare(
      `SELECT m.*, j.title, j.company, a.status FROM inbox_messages m
       JOIN applications a ON a.id = m.application_id
       JOIN jobs j ON j.id = a.job_id
       WHERE ${where.join(" AND ")}
       ORDER BY m.created_at DESC LIMIT 50`
    )
    .all(...params) as Msg[];

  const selected = sp.m
    ? (db
        .prepare(
          `SELECT m.*, j.title, j.company, a.status FROM inbox_messages m
           JOIN applications a ON a.id = m.application_id
           JOIN jobs j ON j.id = a.job_id WHERE m.id = ?`
        )
        .get(Number(sp.m)) as Msg | undefined)
    : undefined;

  if (selected && !selected.read) {
    db.prepare("UPDATE inbox_messages SET read = 1 WHERE id = ?").run(selected.id);
  }
  const thread = selected
    ? (db
        .prepare("SELECT * FROM inbox_messages WHERE application_id = ? ORDER BY created_at ASC")
        .all(selected.application_id) as InboxMessage[])
    : [];

  const apps = db
    .prepare(
      `SELECT a.id, j.title, j.company FROM applications a JOIN jobs j ON j.id = a.job_id
       WHERE a.status IN ('submitted','in_flight','needs_you','interviewing','offer')
       ORDER BY a.updated_at DESC`
    )
    .all() as { id: number; title: string; company: string }[];

  const qs = (extra: Record<string, string>) => {
    const p = new URLSearchParams();
    if (sp.cat) p.set("cat", sp.cat);
    if (sp.q) p.set("q", sp.q);
    for (const [k, v] of Object.entries(extra)) v ? p.set(k, v) : p.delete(k);
    return `/inbox?${p.toString()}`;
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 flex-wrap">
        {CATEGORIES.map((c) => (
          <Link
            key={c.key}
            href={c.key ? qs({ cat: c.key, m: "" }) : "/inbox"}
            className={`filter-pill ${(sp.cat ?? "") === c.key ? "filter-pill-active" : c.color}`}
          >
            {c.label}
          </Link>
        ))}
        <form method="GET" className="ml-auto flex gap-2">
          {sp.cat && <input type="hidden" name="cat" value={sp.cat} />}
          <input name="q" defaultValue={sp.q ?? ""} className="input !w-64 !py-1.5" placeholder="🔍 Search messages…" />
        </form>
        <form action={markInboxRead}>
          <button className="btn btn-ghost btn-sm">✓✓ Mark all read</button>
        </form>
      </div>

      <div className="panel !rounded-2xl grid md:grid-cols-[24rem_1fr] min-h-[28rem] overflow-hidden">
        {/* Message list */}
        <div className="border-r border-[var(--border)] divide-y divide-[var(--border)] overflow-y-auto max-h-[70vh]">
          {messages.length === 0 && (
            <div className="p-8 text-center text-[var(--muted)] text-sm">No messages{sp.cat ? " in this category" : " yet"}.</div>
          )}
          {messages.map((m) => (
            <Link
              key={m.id}
              href={qs({ m: String(m.id) })}
              className={`flex gap-3 p-3.5 hover:bg-[var(--panel-2)]/60 ${selected?.id === m.id ? "bg-[var(--panel-2)]" : ""}`}
            >
              <span className="avatar" style={{ background: avatarColor(m.from_name || m.company) }}>
                {(m.from_name || m.company).slice(0, 1).toUpperCase()}
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-baseline justify-between gap-2">
                  <span className="font-bold text-sm truncate">{m.from_name || m.company}</span>
                  <span className="hint shrink-0">{timeAgo(m.created_at)}</span>
                </span>
                <span className={`text-sm block truncate ${m.read ? "" : "font-semibold"}`}>
                  {!m.read && <span className="inline-block w-1.5 h-1.5 rounded-full bg-[var(--red)] mr-1.5 align-middle" />}
                  {m.subject || "(no subject)"}
                </span>
                <span className="hint block truncate">{m.body}</span>
              </span>
            </Link>
          ))}
        </div>

        {/* Reading pane */}
        <div className="p-6">
          {!selected ? (
            <div className="h-full flex items-center justify-center text-[var(--muted)] text-sm">
              Select a message to read
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div>
                  <h2 className="font-bold text-lg">{selected.subject || "(no subject)"}</h2>
                  <p className="hint mt-0.5">
                    {selected.from_name || "Recruiter"} · re:{" "}
                    <Link href={`/applications/${selected.application_id}`} className="underline">
                      {selected.title} at {selected.company}
                    </Link>
                  </p>
                </div>
                {selected.category && <span className="filter-pill">{selected.category}</span>}
              </div>
              <div className="space-y-3">
                {thread.map((t) => (
                  <div key={t.id} className={`text-sm p-4 rounded-xl ${t.direction === "inbound" ? "bg-[var(--panel-2)]" : "bg-[var(--green-soft)]"}`}>
                    <div className="hint mb-1.5">
                      {t.direction === "inbound" ? t.from_name || "Recruiter" : "You"} · {timeAgo(t.created_at)}
                    </div>
                    <div className="whitespace-pre-wrap leading-relaxed">{t.body}</div>
                  </div>
                ))}
              </div>
              <form action={logOutboundReply} className="flex gap-2">
                <input type="hidden" name="app_id" value={selected.application_id} />
                <input name="body" className="input" placeholder="Log your reply…" required />
                <button className="btn btn-dark btn-sm">Send</button>
              </form>
            </div>
          )}
        </div>
      </div>

      <details className="panel p-5 !rounded-2xl">
        <summary className="cursor-pointer font-bold text-sm">+ Log a recruiter email</summary>
        {apps.length === 0 ? (
          <p className="hint mt-3">No sent applications yet — emails attach to sent applications.</p>
        ) : (
          <form action={logRecruiterReply} className="grid sm:grid-cols-2 gap-3 mt-4">
            <div className="sm:col-span-2">
              <span className="label">Application</span>
              <select name="app_id" className="select" required>
                {apps.map((a) => (
                  <option key={a.id} value={a.id}>{a.company} — {a.title}</option>
                ))}
              </select>
            </div>
            <div><span className="label">From</span><input name="from_name" className="input" placeholder="Recruiter name" /></div>
            <div><span className="label">Subject</span><input name="subject" className="input" /></div>
            <div className="sm:col-span-2"><span className="label">Message</span><textarea name="body" className="textarea" rows={4} required /></div>
            <div>
              <span className="label">Category</span>
              <select name="category" className="select" defaultValue="interview">
                {CATEGORIES.filter((c) => c.key).map((c) => (
                  <option key={c.key} value={c.key}>{c.label}</option>
                ))}
              </select>
            </div>
            <div>
              <span className="label">Move status to</span>
              <select name="effect" className="select" defaultValue="needs_you">
                <option value="">Don&apos;t change</option>
                <option value="needs_you">Needs you</option>
                <option value="interviewing">Interviewing</option>
                <option value="offer">Offer</option>
                <option value="rejected">Rejected</option>
              </select>
            </div>
            <div className="flex items-end"><button className="btn btn-dark">Log email</button></div>
          </form>
        )}
      </details>
    </div>
  );
}
