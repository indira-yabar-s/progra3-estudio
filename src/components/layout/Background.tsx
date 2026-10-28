/** Fondo con manchas de luz animadas muy suaves (se detienen con prefers-reduced-motion). */
export function Background() {
  return (
    <div className="aurora" aria-hidden="true">
      <div className="blob b1" />
      <div className="blob b2" />
      <div className="blob b3" />
    </div>
  );
}
