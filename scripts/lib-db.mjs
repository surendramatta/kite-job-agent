import { createRequire } from "module";
const require = createRequire(import.meta.url);
function openAny(file) {
  try {
    const B = require("better-sqlite3");
    const d = new B(file);
    d.prepare("SELECT 1").get();
    return d;
  } catch {
    const { DatabaseSync } = require("node:sqlite");
    const db = new DatabaseSync(file);
    const wrap = (sql) => {
      const st = db.prepare(sql);
      const named = new Set((sql.match(/[@:$][a-zA-Z_][a-zA-Z0-9_]*/g) ?? []).map((x) => x.slice(1)));
      const norm = (p) => {
        if (p.length === 1 && p[0] && typeof p[0] === "object" && !Array.isArray(p[0])) {
          const picked = {};
          for (const k of named) if (k in p[0]) picked[k] = p[0][k];
          return [Object.keys(picked).length ? picked : p[0]];
        }
        return p;
      };
      return {
        get: (...p) => st.get(...norm(p)),
        all: (...p) => st.all(...norm(p)),
        run: (...p) => { const r = st.run(...norm(p)); return { changes: Number(r.changes), lastInsertRowid: Number(r.lastInsertRowid) }; },
      };
    };
    return {
      prepare: wrap,
      exec: (sql) => db.exec(sql),
      pragma: (sql) => { try { return db.prepare("PRAGMA " + sql).all(); } catch { db.exec("PRAGMA " + sql); return []; } },
      transaction: (fn) => (arg) => { db.exec("BEGIN"); try { fn(arg); db.exec("COMMIT"); } catch (e) { db.exec("ROLLBACK"); throw e; } },
      close: () => db.close(),
    };
  }
}
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dataDir = path.join(root, "data");
fs.mkdirSync(dataDir, { recursive: true });

export function openDb() {
  const oldPath = path.join(dataDir, "tsenta.db");
  const newPath = path.join(dataDir, "kite.db");
  if (fs.existsSync(oldPath) && !fs.existsSync(newPath)) fs.renameSync(oldPath, newPath);
  const db = openAny(newPath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.exec(fs.readFileSync(path.join(root, "src", "lib", "schema.sql"), "utf-8"));
  return db;
}

export function getSetting(db, key, fallback = "") {
  const row = db.prepare("SELECT value FROM settings WHERE key = ?").get(key);
  return row ? row.value : fallback;
}
