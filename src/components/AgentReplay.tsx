"use client";

import { useState } from "react";

export type Shot = { file: string; caption: string };

// Watch exactly what the agent did: real screenshots of the application form
// at each step, with the step-by-step log beside them.
export default function AgentReplay({
  jobId,
  shots,
  log,
  result,
}: {
  jobId: number;
  shots: Shot[];
  log: string;
  result: string;
}) {
  const [i, setI] = useState(shots.length ? shots.length - 1 : 0);
  const [showLog, setShowLog] = useState(false);
  if (!shots.length) return null;
  const current = shots[Math.min(i, shots.length - 1)];

  return (
    <div className="panel !rounded-2xl overflow-hidden">
      <div className="flex items-center gap-3 px-5 py-3 border-b border-[var(--border)] flex-wrap">
        <h2 className="font-bold">🎬 Watch what the agent did</h2>
        <span className={`status status-${result === "submitted" ? "submitted" : result === "dry-run" ? "needs_you" : "failed"}`}>
          {result}
        </span>
        <button className="btn btn-sm ml-auto" onClick={() => setShowLog(!showLog)}>
          {showLog ? "Hide" : "Show"} step log
        </button>
      </div>

      <div className="grid lg:grid-cols-[1fr_16rem]">
        <div className="bg-[var(--panel-2)] p-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`/api/shot/${jobId}/${current.file}`}
            alt={current.caption}
            className="w-full rounded-xl border border-[var(--border)] bg-white"
          />
          <div className="flex items-center justify-between mt-3">
            <button className="btn btn-sm" onClick={() => setI(Math.max(0, i - 1))} disabled={i === 0}>
              ← Prev
            </button>
            <span className="text-sm font-semibold">
              Step {i + 1} of {shots.length} · {current.caption}
            </span>
            <button
              className="btn btn-sm"
              onClick={() => setI(Math.min(shots.length - 1, i + 1))}
              disabled={i >= shots.length - 1}
            >
              Next →
            </button>
          </div>
        </div>

        <div className="p-3 space-y-2 max-h-[28rem] overflow-y-auto">
          {shots.map((s, idx) => (
            <button
              key={s.file}
              onClick={() => setI(idx)}
              className={`w-full text-left rounded-xl border p-1.5 ${
                idx === i ? "border-[var(--coral)]" : "border-[var(--border)]"
              }`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`/api/shot/${jobId}/${s.file}`} alt={s.caption} className="w-full rounded-lg bg-white" />
              <span className="hint block mt-1 px-1">{idx + 1}. {s.caption}</span>
            </button>
          ))}
        </div>
      </div>

      {showLog && (
        <pre className="text-xs bg-[var(--dark)] text-green-200 p-4 overflow-x-auto whitespace-pre-wrap">
          {log || "(no log)"}
        </pre>
      )}
    </div>
  );
}
