const Database = require("better-sqlite3");

/**
 * Creates a logger that writes to a sqlite database.
 *
 * Note: `ctx` is a context which is an arbitrary way to link log
 * messages to each other. Think: request id, session id, module, etc.
 *
 * @param {string} path The path to the sqlite database.
 *   Default is to use `:memory:`.
 *
 * @param {number} maxAge The maximum age of a log entry in milliseconds;
 *   default: 30 days; messages older than this are periodically deleted.
 *   0 to disable.
 *
 * @param {number} maxAgeInterval How often to check for old messages in milliseconds;
 *   default: 24 hours.
 *
 * @param {boolean} teeStderr Whether to also log to stderr.
 *
 * @returns {object} An object with the following methods:
 *
 * ```
 * getLogger(ctx, maxLevel) -> {
 *   debug: (msg, data) => void,
 *   info: (msg, data) => void,
 *   warn: (msg, data) => void,
 *   error: (msg, data) => void}
 * }
 * ```
 * - `data` is anything you want to log with the message; it will be serialized to JSON.
 * - `maxLevel` can also be 'debug', 'info', 'warn', 'error'
 *
 * ```
 * getMessages({ levels, ctxs, after, before, limit }) =>
 *   [{ ctx, level, levelName, msg, data, ctime }]
 * ```
 * - JSON data is deserialized before being returned.
 */

function sqliteLogger({ path, maxAge, maxAgeInterval, teeStderr }) {
  const namedLevels = { debug: 0, info: 1, warn: 2, error: 3 };

  const reverseNamedLevels = { 0: "DEBUG", 1: "INFO", 2: "WARN", 3: "ERROR" };

  path = path || ":memory:";

  maxAge = (maxAge !== undefined && maxAge) || 30 * 24 * 60 * 60 * 1000;

  maxAgeInterval =
    (maxAgeInterval !== undefined && maxAgeInterval) || 24 * 60 * 60 * 1000;

  const stderrStream = teeStderr && process.stderr;

  const db = new Database(path);

  db.pragma("journal_mode = WAL");

  db.exec(`
    create table if not exists msgs (
        id integer primary key autoincrement,
        ctx text,
        level int,
        msg text,
        data json,
        ctime datetime default current_timestamp
    )
  `);

  if (path !== ":memory:") {
    db.exec(
      "create index if not exists idx_obvious on msgs (ctime, ctx, level)"
    );
  }

  const log = (ctx, level, msg, data) => {
    data = data ? JSON.stringify(data) : null;

    db.prepare(
      "insert into msgs (ctx, level, msg, data) values (?, ?, ?, ?)"
    ).run(ctx, level, msg, data);

    const levelName = reverseNamedLevels[level].padEnd(5);
    stderrStream?.write(
      `${levelName} [${new Date().toISOString()}] [${ctx}] ${msg}\n`
    );
  };

  let timeout;

  if (maxAge > 0) {
    const purge = () => {
      db.prepare("delete from msgs where ctime < datetime('now', ?)").run(
        `-${maxAge / 1000} seconds`
      );

      db.exec(`vacuum`);

      timeout = setTimeout(purge, maxAgeInterval);
    };

    purge();
  }

  const nop = () => {};

  return {
    getLogger: (ctx, maxLevel) => {
      if (typeof maxLevel === "string") {
        maxLevel = namedLevels[maxLevel.toLowerCase()];
      } else {
        maxLevel = maxLevel === undefined && namedLevels.info;
      }

      return {
        debug: maxLevel <= 0 ? log.bind(null, ctx, 0) : nop,
        info: maxLevel <= 1 ? log.bind(null, ctx, 1) : nop,
        warn: maxLevel <= 2 ? log.bind(null, ctx, 2) : nop,
        error: maxLevel <= 3 ? log.bind(null, ctx, 3) : nop,
      };
    },

    getMessages: ({ levels, ctxs, after, before, limit }) => {
      const clauses = [];
      const params = [];

      let sql = "select ctx, level, msg, data, ctime from msgs";

      if (levels) {
        levels = levels.map((x) => parseInt(x, 10)).filter((x) => !isNaN(x));

        if (levels.length > 0) {
          clauses.push(
            `level in (${Array(levels.length).fill("?").join(",")})`
          );

          params.push(...levels);
        }
      }

      if (ctxs) {
        clauses.push(`ctx in (${Array(ctxs.length).fill("?").join(",")})`);
        params.push(...ctxs);
      }

      if (after) {
        clauses.push("ctime > ?");
        params.push(after);
      }

      if (before) {
        clauses.push("ctime < ?");
        params.push(before);
      }

      if (clauses.length > 0) {
        sql += " where " + clauses.join(" and ");
      }

      sql += " order by ctime desc";

      if (limit) {
        sql += " limit ?";
        params.push(limit);
      }

      return db
        .prepare(sql)
        .all(params)
        .map((row) => ({
          ...row,
          ctime: new Date(row.ctime),
          levelName: reverseNamedLevels[row.level],
          data: row.data ? JSON.parse(row.data) : null,
        }));
    },

    close: () => {
      if (timeout) clearTimeout(timeout);
      db.close();
    },
  };
}

module.exports = sqliteLogger;
