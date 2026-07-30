"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

export default function ResumeUpload({ big }: { big?: boolean }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const [state, setState] = useState<"idle" | "uploading" | "error">("idle");
  const [message, setMessage] = useState("");

  async function upload(file: File) {
    setState("uploading");
    setMessage("");
    const fd = new FormData();
    fd.set("file", file);
    try {
      const res = await fetch("/api/resume/upload", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Upload failed");
      setState("idle");
      setMessage(`Imported: ${data.parsed.roles} roles, ${data.parsed.skills} skills — review below`);
      router.push(`/resumes?v=${data.resumeId}`);
      router.refresh();
    } catch (e) {
      setState("error");
      setMessage((e as Error).message);
    }
  }

  return (
    <div className={big ? "text-center" : "inline-block"}>
      <input
        ref={inputRef}
        type="file"
        accept=".pdf,.docx,.doc,.txt,.md"
        className="hidden"
        onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])}
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={state === "uploading"}
        className={big ? "btn btn-dark btn-lg" : "btn btn-dark btn-sm"}
      >
        {state === "uploading" ? "⏳ Reading your resume…" : "⬆ Upload resume (PDF / DOCX)"}
      </button>
      {message && (
        <p className={`hint mt-2 ${state === "error" ? "!text-[var(--red)]" : "!text-[var(--green)]"}`}>
          {message}
        </p>
      )}
      {big && (
        <p className="hint mt-2">
          PDF, DOCX or TXT. Kite reads it into your profile and resume editor, and generates a
          tailored ATS version of it for every job it applies to.
        </p>
      )}
    </div>
  );
}
