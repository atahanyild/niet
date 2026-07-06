export function StatusPill({
  label,
  tone,
}: {
  label: string;
  tone: "idle" | "active" | "success" | "warn" | "error";
}) {
  const toneCls: Record<typeof tone, string> = {
    idle: "bg-neutral-800 text-neutral-400 border-neutral-700",
    active: "bg-blue-900/40 text-blue-300 border-blue-700 animate-pulse",
    success: "bg-emerald-900/40 text-emerald-300 border-emerald-700",
    warn: "bg-amber-900/40 text-amber-300 border-amber-700",
    error: "bg-red-900/40 text-red-300 border-red-700",
  };
  return (
    <span className={`inline-block rounded-full border px-3 py-1 text-xs font-medium ${toneCls[tone]}`}>
      {label}
    </span>
  );
}
