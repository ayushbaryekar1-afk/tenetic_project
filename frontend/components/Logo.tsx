export default function Logo({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" className="shrink-0">
      <rect width="32" height="32" rx="7" fill="#0B5D6B" />
      <path d="M8 9.5h16v3.5h-6.2V24h-3.6V13H8z" fill="#fff" />
    </svg>
  );
}
