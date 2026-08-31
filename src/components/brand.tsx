export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <span className="brand">
      <span className="brand-mark" aria-hidden="true">
        <svg viewBox="0 0 32 32" fill="none">
          <path d="M8 7h10a8 8 0 0 1 0 16H8V7Z" stroke="currentColor" strokeWidth="3.4" />
          <path
            d="m12 16 4 4L26 9"
            stroke="currentColor"
            strokeWidth="3.4"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </span>
      {!compact && (
        <span>
          ClosePilot<span className="brand-dot">.</span>
        </span>
      )}
    </span>
  );
}
