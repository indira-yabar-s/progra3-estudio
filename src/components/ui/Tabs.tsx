import { useId, useRef, type KeyboardEvent, type ReactNode } from 'react';

export interface TabItem<K extends string> {
  key: K;
  label: ReactNode;
  icon?: ReactNode;
}

/** Pestañas accesibles (role="tablist", flechas para navegar). */
export function Tabs<K extends string>({
  items,
  value,
  onChange,
  label,
}: {
  items: TabItem<K>[];
  value: K;
  onChange: (k: K) => void;
  label: string;
}) {
  const id = useId();
  const refs = useRef<(HTMLButtonElement | null)[]>([]);

  const onKey = (e: KeyboardEvent, i: number) => {
    let j = -1;
    if (e.key === 'ArrowRight') j = (i + 1) % items.length;
    if (e.key === 'ArrowLeft') j = (i - 1 + items.length) % items.length;
    if (j >= 0) {
      e.preventDefault();
      onChange(items[j]!.key);
      refs.current[j]?.focus();
    }
  };

  return (
    <div
      role="tablist"
      aria-label={label}
      className="bg-glass border-line flex gap-1 overflow-x-auto rounded-2xl border p-1"
    >
      {items.map((it, i) => {
        const active = it.key === value;
        return (
          <button
            key={it.key}
            ref={(el) => {
              refs.current[i] = el;
            }}
            id={`${id}-${it.key}`}
            role="tab"
            type="button"
            aria-selected={active}
            tabIndex={active ? 0 : -1}
            onClick={() => onChange(it.key)}
            onKeyDown={(e) => onKey(e, i)}
            className={`flex shrink-0 items-center gap-1.5 rounded-xl px-3 py-1.5 text-sm font-semibold transition-colors ${
              active
                ? 'bg-accent/15 text-fg shadow-[inset_0_0_0_1px_var(--glass-border)]'
                : 'text-muted hover:text-fg'
            }`}
          >
            {it.icon}
            {it.label}
          </button>
        );
      })}
    </div>
  );
}
