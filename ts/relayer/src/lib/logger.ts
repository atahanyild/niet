export function log(level: "info" | "warn" | "error", msg: string, extra?: unknown): void {
  const ts = new Date().toISOString();
  const line = extra !== undefined
    ? `[${ts}] ${level.padEnd(5)} ${msg} ${safeJson(extra)}`
    : `[${ts}] ${level.padEnd(5)} ${msg}`;
  if (level === "error") console.error(line);
  else console.log(line);
}

function safeJson(x: unknown): string {
  try {
    return JSON.stringify(x, (_k, v) => (typeof v === "bigint" ? v.toString() : v));
  } catch {
    return String(x);
  }
}
