/** Logo de Telar: tres hilos que se entrecruzan formando una "T". */
export function Logo({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
      <defs>
        <linearGradient id="telar-g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="var(--accent)" />
          <stop offset="0.5" stopColor="var(--accent-2)" />
          <stop offset="1" stopColor="var(--accent-3)" />
        </linearGradient>
      </defs>
      <rect x="2" y="2" width="60" height="60" rx="18" fill="url(#telar-g)" opacity="0.18" />
      <rect
        x="2.5"
        y="2.5"
        width="59"
        height="59"
        rx="17.5"
        fill="none"
        stroke="url(#telar-g)"
        strokeOpacity="0.6"
      />
      <path
        d="M14 20 C 26 14, 38 26, 50 20"
        stroke="var(--t0)"
        strokeWidth="5"
        fill="none"
        strokeLinecap="round"
      />
      <path
        d="M32 22 C 26 32, 38 40, 32 50"
        stroke="var(--t1)"
        strokeWidth="5"
        fill="none"
        strokeLinecap="round"
      />
      <path
        d="M18 34 C 26 30, 38 38, 46 34"
        stroke="var(--t2)"
        strokeWidth="3"
        fill="none"
        strokeLinecap="round"
        opacity="0.85"
      />
      <circle cx="32" cy="22" r="3.5" fill="var(--fg)" />
    </svg>
  );
}
