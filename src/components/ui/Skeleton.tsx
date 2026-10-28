import type { CSSProperties } from 'react';

/** Bloque de carga con brillo que se desplaza (solo transform: barato de animar). */
export function Bone({ className = '', style }: { className?: string; style?: CSSProperties }) {
  return <div className={`skeleton rounded-xl ${className}`} style={style} aria-hidden="true" />;
}

/** Skeleton genérico de página. */
export function PageSkeleton({ label }: { label: string }) {
  return (
    <div
      className="mx-auto max-w-5xl px-4 pt-8 pb-16"
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <span className="sr-only">{label}</span>
      <Bone className="h-12 w-2/3 max-w-lg" />
      <Bone className="mt-4 h-5 w-full max-w-2xl" />
      <div className="mt-8 grid gap-3 sm:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="glass p-4">
            <Bone className="h-3 w-24" />
            <Bone className="mt-3 h-7 w-3/4" />
          </div>
        ))}
      </div>
      <div className="glass mt-8 grid gap-2 p-5">
        <Bone className="h-6 w-48" />
        {[0, 1, 2, 3, 4].map((i) => (
          <Bone key={i} className="h-14 w-full" />
        ))}
      </div>
    </div>
  );
}
