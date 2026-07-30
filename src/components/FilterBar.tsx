"use client";

import { useRouter, usePathname } from "next/navigation";
import { useRef, useState } from "react";

const JOB_TYPES = ["Full-time", "Part-time", "Contract", "Internship"];
const DATE_OPTIONS = [
  { v: "", l: "Any time" },
  { v: "1", l: "Past 24 hours" },
  { v: "3", l: "Past 3 days" },
  { v: "7", l: "Past week" },
  { v: "30", l: "Past month" },
];
const EXP_LEVELS = ["Entry", "Mid", "Senior", "Lead"];

export default function FilterBar({
  q,
  sp,
  sources = [],
}: {
  q: string;
  sp: Record<string, string>;
  sources?: string[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const formRef = useRef<HTMLFormElement>(null);
  const [open, setOpen] = useState(false);

  function submit() {
    const fd = new FormData(formRef.current!);
    const params = new URLSearchParams();
    for (const [k, v] of fd.entries()) {
      if (v && String(v).trim()) params.set(k, String(v));
    }
    router.push(`${pathname}?${params.toString()}`);
  }

  const active = ["workplace", "jobtype", "days", "salary", "exp", "source", "location"].filter(
    (k) => sp[k]
  ).length;

  return (
    <form
      ref={formRef}
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      className="space-y-3"
    >
      <div className="flex items-center gap-3 panel !rounded-2xl px-4 py-1">
        <span className="text-sm font-semibold text-[var(--muted)] whitespace-nowrap border-r border-[var(--border)] pr-3">
          🔍
        </span>
        <input
          name="q"
          defaultValue={q}
          className="flex-1 py-2.5 text-sm outline-none bg-transparent"
          placeholder="Search job title, company, or keyword…"
        />
        <input
          name="location"
          defaultValue={sp.location ?? ""}
          className="w-44 py-2.5 text-sm outline-none bg-transparent border-l border-[var(--border)] pl-3"
          placeholder="📍 City or Remote"
        />
        <button className="btn btn-dark btn-sm">Search</button>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <select name="workplace" defaultValue={sp.workplace ?? ""} className="filter-pill" onChange={submit}>
          <option value="">Workplace</option>
          <option value="remote">🏠 Remote</option>
          <option value="onsite">🏢 On-site</option>
        </select>

        <select name="jobtype" defaultValue={sp.jobtype ?? ""} className="filter-pill" onChange={submit}>
          <option value="">Job type</option>
          {JOB_TYPES.map((t) => (
            <option key={t} value={t.toLowerCase()}>{t}</option>
          ))}
        </select>

        <select name="days" defaultValue={sp.days ?? ""} className="filter-pill" onChange={submit}>
          {DATE_OPTIONS.map((d) => (
            <option key={d.v} value={d.v}>{d.l}</option>
          ))}
        </select>

        <select name="exp" defaultValue={sp.exp ?? ""} className="filter-pill" onChange={submit}>
          <option value="">Experience</option>
          {EXP_LEVELS.map((l) => (
            <option key={l} value={l.toLowerCase()}>{l}</option>
          ))}
        </select>

        <button type="button" className="filter-pill" onClick={() => setOpen(!open)}>
          {open ? "− Fewer filters" : "+ More filters"}
        </button>

        {active > 0 && (
          <button type="button" className="filter-pill !text-[var(--coral)]" onClick={() => router.push(pathname)}>
            ✕ Clear {active}
          </button>
        )}

        <select name="sort" defaultValue={sp.sort ?? "match"} className="filter-pill ml-auto" onChange={submit}>
          <option value="match">Sort: Best match</option>
          <option value="new">Sort: Newest</option>
        </select>
      </div>

      {open && (
        <div className="panel !rounded-2xl p-4 grid sm:grid-cols-3 gap-3">
          <div>
            <span className="label">Minimum salary</span>
            <input name="salary" type="number" defaultValue={sp.salary ?? ""} className="input !text-xs" placeholder="e.g. 90000" />
          </div>
          <div>
            <span className="label">Source</span>
            <select name="source" defaultValue={sp.source ?? ""} className="select !text-xs">
              <option value="">All sources</option>
              <option value="direct">⚡ Company career pages only</option>
              {sources.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>
          <div>
            <span className="label">Company contains</span>
            <input name="companyq" defaultValue={sp.companyq ?? ""} className="input !text-xs" placeholder="e.g. Stripe" />
          </div>
          <div className="sm:col-span-3">
            <button className="btn btn-dark btn-sm">Apply filters</button>
          </div>
        </div>
      )}
    </form>
  );
}
