const Database = require("better-sqlite3");

/**
 * Creates a logger that writes to a sqlite database.
 *
 * Note: `ctx` is a context which is an arbitrary way to link log messages to each other.
 * Think: request id, session id, module, etc.
 *
 * @param {string} path The path to the sqlite database. Default is to use `:memory:`.
 * @param {number} maxAge The maximum age of a log entry in milliseconds; default: 30 days; messages older than this are periodically deleted. 0 to disable.
 * @param {number} maxAgeInterval How often to check for old messages in milliseconds; default: 24 hours.
 * @param {boolean} teeStderr Whether to also log to stderr.
 * @returns {object} An object with the following methods:
 * - `getLogger(ctx, maxLevel) -> {debug: (msg, data) => void, info: (msg, data) => void, warn: (msg, data) => void, error: (msg, data) => void}`
 *   - `data` is anything you want to log with the message; it will be serialized to JSON.
 *   - `maxLevel` can also be 'debug', 'info', 'warn', 'error'
 * - `getMessages({ levels, ctxs, after, before, limit }) -> [{ ctx, level, msg, ctime }]`
 */

function sqliteLogger({ path, maxAge, maxAgeInterval, teeStderr }) {
  const namedLevels = { debug: 0, info: 1, warn: 2, error: 3 };
  const reverseNamedLevels = { 0: 'DEBUG', 1: 'INFO', 2: 'WARN', 3: 'ERROR' };

  path = path || ":memory:";
  maxAge = maxAge || 30 * 24 * 60 * 60 * 1000;
  maxAgeInterval = maxAgeInterval || 24 * 60 * 60 * 1000;
  const stderrStream = teeStderr && process.stderr;

  const db = new Database(path);
  db.pragma("journal_mode = WAL");
  db.exec(`create table if not exists msgs (id integer primary key autoincrement,
    ctx text, level int, msg text, ctime datetime default current_timestamp)`);
  if (path !== ':memory:')
    db.exec('create index if not exists idx_obvious on msgs (ctime, ctx, level)');

  const log = (ctx, level, msg) => {
    db.prepare("insert into msgs (ctx, level, msg) values (?, ?, ?)").run(ctx, level, msg);
    stderrStream?.write(`${reverseNamedLevels[level]} [${ctx}] [${new Date().toISOString()}] ${msg}\n`);
  }

  let interval;

  if (maxAge > 0) {
    interval = setInterval(() => {
        db.prepare('delete from msgs where ctime < datetime("now", ?)').run(`-${maxAge / 1000} seconds`);
        db.exec(`vacuum`);
      },
      maxAgeInterval,
    );
  }

  const nop = () => {};

  return {
    getLogger: (ctx, maxLevel) => {
      if (typeof maxLevel === 'string') maxLevel = namedLevels[maxLevel.toLowerCase()];
      else maxLevel = maxLevel === undefined && namedLevels.info;
      return {
        debug: maxLevel <= 0 ? log.bind(null, ctx, 0) : nop,
        info: maxLevel <= 1 ? log.bind(null, ctx, 1) : nop,
        warn: maxLevel <= 2 ? log.bind(null, ctx, 2) : nop,
        error: maxLevel <= 3 ? log.bind(null, ctx, 3) : nop,
      }
    },
    getMessages: ({ levels, ctxs, after, before, limit }) => {
      let sql = 'select ctx, level, msg, ctime from msgs';
      const clauses = [];
      const params = [];
      if (levels) {
        levels = levels.map(x => parseInt(x, 10)).filter(x => !isNaN(x));
        if (levels.length > 0) {
          clauses.push(`level in (${Array(levels.length).fill('?').join(',')})`);
          params.push(...levels);
        }
      }
      if (ctxs) {
        clauses.push(`ctx in (${Array(ctxs.length).fill('?').join(',')})`);
        params.push(...ctxs);
      }
      if (after) {
        clauses.push('ctime > ?');
        params.push(after);
      }
      if (before) {
        clauses.push('ctime < ?');
        params.push(before);
      }
      if (clauses.length > 0) sql += ' where ' + clauses.join(' and ');
      sql += ' order by ctime desc';
      if (limit) {
        sql += ' limit ?';
        params.push(limit);
      }
      return db.prepare(sql).all(params).map(row => ({
        ...row, ctime: new Date(row.ctime), namedLevel: reverseNamedLevels[row.level]
      }));
    },
    close: () => {
      if (interval) clearInterval(interval);
      db.close();
    }
  };
}

module.exports = sqliteLogger;