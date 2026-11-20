const minute = 60_000;
const day = 24 * 60 * minute;

function integerSetting(value, fallback, minimum, maximum) {
  if (value === undefined) return fallback;
  if (!/^\d+$/.test(String(value))) return null;
  const number = Number(value);
  return Number.isSafeInteger(number) && number >= minimum && number <= maximum ? number : null;
}

export function quotaSettings(env) {
  const daily = integerSetting(env.DAILY_REQUEST_LIMIT, 24, 0, 300);
  const burst = integerSetting(env.BURST_REQUEST_LIMIT, 4, 1, 20);
  return daily === null || burst === null ? null : { daily, burst };
}

// A single named object owns the global budget. One synchronous SQLite transaction
// reserves both counters before the caller is permitted to contact the model.
export class Quota {
  constructor(ctx, env) {
    this.storage = ctx.storage;
    this.settings = quotaSettings(env);
    const sql = this.storage.sql;
    sql.exec("CREATE TABLE IF NOT EXISTS calls (at_ms INTEGER NOT NULL, client TEXT NOT NULL)");
    sql.exec("CREATE INDEX IF NOT EXISTS calls_at ON calls(at_ms)");
    sql.exec("CREATE INDEX IF NOT EXISTS calls_client_at ON calls(client, at_ms)");
  }

  reserve(client, now) {
    if (!this.settings || this.settings.daily === 0) return { allowed: false, wait: 60 };
    const start = Math.floor(now / day) * day;
    const { daily, burst } = this.settings;
    const sql = this.storage.sql;
    return this.storage.transactionSync(() => {
      // Retain yesterday's last minute across the midnight UTC boundary.
      sql.exec("DELETE FROM calls WHERE at_ms <= ?", Math.min(start - 1, now - minute));
      const today = sql.exec("SELECT COUNT(*) AS n FROM calls WHERE at_ms >= ?", start).one().n;
      if (today >= daily) {
        return { allowed: false, wait: Math.max(1, Math.ceil((start + day - now) / 1000)) };
      }
      const recent = sql.exec(
        "SELECT COUNT(*) AS n, MIN(at_ms) AS first FROM calls WHERE client = ? AND at_ms > ?",
        client, now - minute,
      ).one();
      if (recent.n >= burst) {
        return { allowed: false, wait: Math.max(1, Math.ceil((recent.first + minute - now) / 1000)) };
      }
      sql.exec("INSERT INTO calls (at_ms, client) VALUES (?, ?)", now, client);
      return { allowed: true };
    });
  }

  async fetch(request) {
    if (request.method !== "POST" || new URL(request.url).pathname !== "/reserve") {
      return new Response(null, { status: 404 });
    }
    const client = await request.text();
    if (!/^[a-f0-9]{64}$/.test(client)) return new Response(null, { status: 400 });
    return Response.json(this.reserve(client, Date.now()));
  }
}
