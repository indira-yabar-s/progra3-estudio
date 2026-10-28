import { useEffect, useRef } from 'react';

/**
 * Luces suaves detrás del hero. Solo anima transform/opacity y se pausa en cuanto el
 * borde superior del hero pasa por debajo de la cabecera (que sí tiene backdrop-filter):
 * así nunca hay un blur recalculándose sobre algo que se mueve.
 */
export function HeroAurora() {
  const lights = useRef<HTMLDivElement>(null);
  const sentinel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = sentinel.current;
    if (!el || !('IntersectionObserver' in window)) return;
    const obs = new IntersectionObserver(
      ([entry]) => lights.current?.setAttribute('data-paused', String(!entry?.isIntersecting)),
      { rootMargin: '-96px 0px 0px 0px' },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);
  return (
    <>
      <div
        ref={sentinel}
        className="pointer-events-none absolute inset-x-0 top-0 h-px"
        aria-hidden="true"
      />
      <div ref={lights} className="hero-aurora" data-paused="true" aria-hidden="true">
        <span />
        <span />
        <span />
      </div>
    </>
  );
}
