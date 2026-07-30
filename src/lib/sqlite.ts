// SQLite adapter. Prefers better-sqlite3 when its native binary is present,
// and otherwise falls back to Node's built-in node:sqlite — so Kite runs on
// any machine without needing a compiler toolchain.
/* eslint-disable @typescript-eslint/no-explicit-any */

export type Stmt = {
  get: (...params: any[]) => any;
  all: (...params: any[]) => any[];
  run: (...params: any[]) => { changes: number; lastInsertRowid: number | bigint };
};

export type Db = {
  prepare: (sql: string) => Stmt;
  exec: (sql: string) => void;
  pragma: (sql: string) => any;
  transaction: <T>(fn: (arg: T) => void) => (arg: T) => void;
  close: () => void;
};

export function openDatabase(file: string): Db {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Better = require("better-sqlite3");
    const db = new Better(file);
    db.prepare("SELECT 1").get(); // prove the native binding actually loaded
    return db as Db;
  } catch {
    return nodeSqlite(file);
  }
}

function nodeSqlite(file: string): Db {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { DatabaseSync } = require("node:sqlite");
  const db = new DatabaseSync(file);

  const wrap = (sql: string): Stmt => {
    const stmt = db.prepare(sql);
    // node:sqlite rejects named parameters the SQL doesn't use, so pass only
    // the keys the statement actually references.
    const named = new Set((sql.match(/[@:$][a-zA-Z_][a-zA-Z0-9_]*/g) ?? []).map((m) => m.slice(1)));
    const norm = (params: any[]) => {
      if (params.length === 1 && params[0] && typeof params[0] === "object" && !Array.isArray(params[0])) {
        const src = params[0] as Record<string, unknown>;
        const picked: Record<string, unknown> = {};
        for (const k of named) if (k in src) picked[k] = src[k];
        return [Object.keys(picked).length ? picked : src];
      }
      return params;
    };
    // node:sqlite returns null-prototype rows; React can't hand those to
    // client components, so return plain objects.
    const plain = (r: any) => (r && typeof r === "object" ? { ...r } : r);
    return {
      get: (...p: any[]) => plain(stmt.get(...norm(p))),
      all: (...p: any[]) => (stmt.all(...norm(p)) as any[]).map(plain),
      run: (...p: any[]) => {
        const r = stmt.run(...norm(p));
        return { changes: Number(r.changes), lastInsertRowid: Number(r.lastInsertRowid) };
      },
    };
  };

  return {
    prepare: wrap,
    exec: (sql: string) => db.exec(sql),
    // better-sqlite3 style: pragma("journal_mode = WAL") / pragma("table_info(t)")
    pragma: (sql: string) => {
      const text = `PRAGMA ${sql}`;
      try {
        return db.prepare(text).all();
      } catch {
        db.exec(text);
        return [];
      }
    },
    transaction:
      <T,>(fn: (arg: T) => void) =>
      (arg: T) => {
        db.exec("BEGIN");
        try {
          fn(arg);
          db.exec("COMMIT");
        } catch (e) {
          db.exec("ROLLBACK");
          throw e;
        }
      },
    close: () => db.close(),
  };
}
