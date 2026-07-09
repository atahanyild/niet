export const runtime = "nodejs";

export function GET() {
  return Response.json({ ok: true, version: "0.1.0" });
}
