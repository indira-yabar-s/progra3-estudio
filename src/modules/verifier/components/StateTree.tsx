import { Maximize, Network, ZoomIn, ZoomOut } from 'lucide-react';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent,
  type WheelEvent,
} from 'react';
import { CardHeader, GlassCard } from '@/components/ui/GlassCard';
import type { TreeNode } from '@/core/telarc/verify';
import { useT, formatNumber } from '@/i18n';
import { threadColor } from '../describe';
import { layoutTree } from '../treeLayout';

export function StateTree({
  nodes,
  truncated,
  total,
}: {
  nodes: TreeNode[];
  truncated: boolean;
  total: number;
}) {
  const { t, locale } = useT();
  const layout = useMemo(() => layoutTree(nodes), [nodes]);
  const boxRef = useRef<HTMLDivElement>(null);
  const [view, setView] = useState({ k: 1, x: 0, y: 0 });
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<number | null>(null);

  const fit = useCallback(() => {
    const el = boxRef.current;
    if (!el) return;
    const w = el.clientWidth;
    const h = el.clientHeight;
    const k = Math.min(
      2,
      Math.max(0.05, Math.min((w - 40) / (layout.width + 20), (h - 40) / (layout.height + 20))),
    );
    setView({ k, x: (w - layout.width * k) / 2, y: 24 });
  }, [layout]);

  useEffect(fit, [fit]);

  const zoomAt = (factor: number, px: number, py: number) =>
    setView((v) => {
      const k = Math.min(8, Math.max(0.03, v.k * factor));
      const f = k / v.k;
      return { k, x: px - (px - v.x) * f, y: py - (py - v.y) * f };
    });

  const onWheel = (e: WheelEvent) => {
    const r = boxRef.current!.getBoundingClientRect();
    zoomAt(e.deltaY < 0 ? 1.15 : 1 / 1.15, e.clientX - r.left, e.clientY - r.top);
  };

  useEffect(() => {
    // Evita que la página haga scroll mientras se hace zoom con la rueda.
    const el = boxRef.current;
    if (!el) return;
    const block = (e: globalThis.WheelEvent) => e.preventDefault();
    el.addEventListener('wheel', block, { passive: false });
    return () => el.removeEventListener('wheel', block);
  }, []);

  const onPointerDown = (e: PointerEvent) => {
    (e.target as Element).setPointerCapture?.(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
  };
  const onPointerMove = (e: PointerEvent) => {
    const prev = pointers.current.get(e.pointerId);
    if (!prev) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const pts = [...pointers.current.values()];
    if (pts.length === 2) {
      const d = Math.hypot(pts[0]!.x - pts[1]!.x, pts[0]!.y - pts[1]!.y);
      if (pinch.current) {
        const r = boxRef.current!.getBoundingClientRect();
        zoomAt(
          d / pinch.current,
          (pts[0]!.x + pts[1]!.x) / 2 - r.left,
          (pts[0]!.y + pts[1]!.y) / 2 - r.top,
        );
      }
      pinch.current = d;
      return;
    }
    setView((v) => ({ ...v, x: v.x + e.clientX - prev.x, y: v.y + e.clientY - prev.y }));
  };
  const onPointerUp = (e: PointerEvent) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinch.current = null;
  };

  const center = () => {
    const el = boxRef.current!;
    return [el.clientWidth / 2, el.clientHeight / 2] as const;
  };

  return (
    <GlassCard>
      <CardHeader
        icon={<Network size={16} />}
        title={t('tree.title')}
        hint={t('tree.hint')}
        actions={
          <>
            <button
              type="button"
              className="btn btn-ghost btn-icon"
              onClick={() => zoomAt(1.3, ...center())}
              aria-label={t('tree.zoomIn')}
              title={t('tree.zoomIn')}
            >
              <ZoomIn size={16} />
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-icon"
              onClick={() => zoomAt(1 / 1.3, ...center())}
              aria-label={t('tree.zoomOut')}
              title={t('tree.zoomOut')}
            >
              <ZoomOut size={16} />
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-icon"
              onClick={fit}
              aria-label={t('tree.reset')}
              title={t('tree.reset')}
            >
              <Maximize size={16} />
            </button>
          </>
        }
      />
      <div
        ref={boxRef}
        className="border-line relative mx-4 h-[420px] cursor-grab touch-none overflow-hidden rounded-2xl border active:cursor-grabbing"
        onWheel={onWheel}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        data-testid="state-tree"
      >
        <svg width="100%" height="100%" role="img" aria-label={t('tree.title')}>
          <g transform={`translate(${view.x},${view.y}) scale(${view.k})`}>
            {nodes.map((n) => {
              if (n.parent < 0) return null;
              const a = layout.pos[n.parent]!;
              const b = layout.pos[n.id]!;
              return (
                <path
                  key={`e${n.id}`}
                  d={`M${a.x},${a.y} C${a.x},${(a.y + b.y) / 2} ${b.x},${(a.y + b.y) / 2} ${b.x},${b.y}`}
                  fill="none"
                  stroke={n.error ? 'var(--err)' : threadColor(n.thread)}
                  strokeOpacity={n.error ? 0.8 : 0.45}
                  strokeWidth={1.4 / Math.sqrt(view.k)}
                  vectorEffect="non-scaling-stroke"
                />
              );
            })}
            {nodes.map((n) => {
              const p = layout.pos[n.id]!;
              return (
                <circle
                  key={n.id}
                  cx={p.x}
                  cy={p.y}
                  r={n.id === 0 ? 7 : n.error ? 6 : 4.5}
                  fill={n.error ? 'var(--err)' : n.id === 0 ? 'var(--fg)' : threadColor(n.thread)}
                  stroke={n.terminal ? 'var(--fg)' : 'var(--bg)'}
                  strokeWidth={n.terminal ? 1.8 : 1}
                >
                  <title>{`#${n.id} · depth ${n.depth}`}</title>
                </circle>
              );
            })}
          </g>
        </svg>
      </div>
      <div className="text-muted flex flex-wrap items-center gap-3 px-4 py-3 text-xs">
        <span className="flex items-center gap-1.5">
          <span className="bg-err size-2.5 rounded-full" /> {t('tree.legendError')}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="border-fg size-2.5 rounded-full border-2" /> {t('tree.legendTerminal')}
        </span>
        {truncated && (
          <span className="text-warn">
            {t('tree.truncated', {
              shown: formatNumber(nodes.length, locale),
              total: formatNumber(total, locale),
            })}
          </span>
        )}
      </div>
    </GlassCard>
  );
}
