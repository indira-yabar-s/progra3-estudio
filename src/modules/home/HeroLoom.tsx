/**
 * Ilustración del hero: dos hilos (t1, t2) intercalando sus pasos sobre un
 * telar, y el instante exacto de la data race marcado en rojo.
 */
const STEPS = [
  { t: 0, label: 'lee counter → 0' },
  { t: 1, label: 'lee counter → 0' },
  { t: 0, label: 'escribe counter = 1' },
  { t: 1, label: 'escribe counter = 1', race: true },
];

export function HeroLoom() {
  const W = 420;
  const lanes = [70, 150];
  const xs = STEPS.map((_, i) => 70 + i * 90);
  return (
    <svg
      viewBox={`0 0 ${W} 230`}
      className="w-full"
      role="img"
      aria-label="t1 y t2 leen 0 antes de escribir: se pierde un incremento"
    >
      {lanes.map((y, t) => (
        <g key={t}>
          <line
            x1="20"
            x2={W - 20}
            y1={y}
            y2={y}
            stroke={`var(--t${t})`}
            strokeOpacity="0.35"
            strokeWidth="2"
          />
          <text
            x="20"
            y={y - 14}
            className="fill-current font-mono text-[13px] font-bold"
            style={{ fill: `var(--t${t})` }}
          >
            t{t + 1}
          </text>
        </g>
      ))}
      {STEPS.slice(1).map((s, i) => {
        const prev = STEPS[i]!;
        const x0 = xs[i]!;
        const x1 = xs[i + 1]!;
        const y0 = lanes[prev.t]!;
        const y1 = lanes[s.t]!;
        return (
          <path
            key={i}
            d={`M${x0},${y0} C${(x0 + x1) / 2},${y0} ${(x0 + x1) / 2},${y1} ${x1},${y1}`}
            stroke="url(#hero-weft)"
            strokeWidth="2.5"
            fill="none"
            strokeLinecap="round"
          />
        );
      })}
      <defs>
        <linearGradient id="hero-weft" x1="0" x2="1">
          <stop offset="0" stopColor="var(--accent)" />
          <stop offset="1" stopColor="var(--accent-3)" />
        </linearGradient>
      </defs>
      {STEPS.map((s, i) => (
        <g key={i} className="animate-pop" style={{ animationDelay: `${300 + i * 220}ms` }}>
          {s.race && (
            <circle
              cx={xs[i]}
              cy={lanes[s.t]}
              r="14"
              fill="none"
              stroke="var(--err)"
              strokeWidth="2"
              className="animate-pulse-ring"
            />
          )}
          <circle
            cx={xs[i]}
            cy={lanes[s.t]}
            r="11"
            fill={s.race ? 'var(--err)' : `var(--t${s.t})`}
            stroke="var(--bg)"
            strokeWidth="3"
          />
          <text
            x={xs[i]}
            y={lanes[s.t]! + 4}
            textAnchor="middle"
            className="font-mono text-[11px] font-bold"
            fill="var(--bg)"
          >
            {i + 1}
          </text>
          <text
            x={xs[i]}
            y={s.t === 0 ? lanes[0]! + 32 : lanes[1]! + 32}
            textAnchor="middle"
            className="font-mono text-[10px]"
            fill="var(--fg-muted)"
          >
            {s.label}
          </text>
        </g>
      ))}
      <g transform="translate(20 200)">
        <rect
          width="380"
          height="24"
          rx="12"
          fill="var(--err)"
          fillOpacity="0.12"
          stroke="var(--err)"
          strokeOpacity="0.4"
        />
        <text
          x="190"
          y="16"
          textAnchor="middle"
          className="font-mono text-[11px] font-semibold"
          fill="var(--err)"
        >
          data race en counter · assert(counter == 2) falla
        </text>
      </g>
    </svg>
  );
}
