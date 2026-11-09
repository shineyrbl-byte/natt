// Browser stand-in for node:sqlite's DatabaseSync, backed by sql.js (SQLite
// compiled to WebAssembly). Call setSqlJs() before the first `new DatabaseSync`.
//
// Statements are prepared on each call and freed right after, because
// sql.js frees every open statement when the database is exported (saved).
let SQL = null;
let initialBytes = null;

export function setSqlJs(sqlJs, bytes = null) {
  SQL = sqlJs;
  initialBytes = bytes;
}

export class DatabaseSync {
  constructor() {
    if (!SQL) throw new Error('sql.js is not loaded');
    this.raw = new SQL.Database(initialBytes || undefined);
  }

  exec(sql) {
    this.raw.exec(sql);
  }

  prepare(sql) {
    const raw = this.raw;
    const withStmt = (params, fn) => {
      const stmt = raw.prepare(sql);
      try {
        if (params.length) stmt.bind(params.map((p) => (p === undefined ? null : p)));
        return fn(stmt);
      } finally {
        stmt.free();
      }
    };
    return {
      run: (...params) =>
        withStmt(params, (stmt) => {
          stmt.step();
          return { changes: raw.getRowsModified() };
        }),
      get: (...params) => withStmt(params, (stmt) => (stmt.step() ? stmt.getAsObject() : undefined)),
      all: (...params) =>
        withStmt(params, (stmt) => {
          const rows = [];
          while (stmt.step()) rows.push(stmt.getAsObject());
          return rows;
        }),
    };
  }

  export() {
    return this.raw.export();
  }
}
