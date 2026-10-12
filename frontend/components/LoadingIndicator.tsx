import Logo from "./Logo";

export default function LoadingIndicator() {
  return (
    <div className="flex items-start gap-3 animate-rise" role="status" aria-live="polite">
      <Logo size={28} />
      <div className="flex items-center gap-3 rounded-2xl border border-line bg-surface px-4 py-3">
        <span className="flex items-center gap-1" aria-hidden="true">
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className="h-1.5 w-1.5 animate-dot rounded-full bg-accent"
              style={{ animationDelay: `${i * 0.16}s` }}
            />
          ))}
        </span>
        <span className="text-sm text-muted">Asking the Super Agent…</span>
      </div>
    </div>
  );
}
