import type { HTMLAttributes, ReactNode } from 'react';

interface GlassCardProps extends HTMLAttributes<HTMLDivElement> {
  strong?: boolean;
  glow?: boolean;
  as?: 'div' | 'section' | 'article' | 'aside';
  children?: ReactNode;
}

export function GlassCard({
  strong,
  glow,
  as: Tag = 'div',
  className = '',
  children,
  ...rest
}: GlassCardProps) {
  return (
    <Tag
      className={`glass ${strong ? 'glass-strong' : ''} ${glow ? 'glow-border' : ''} ${className}`}
      {...rest}
    >
      {children}
    </Tag>
  );
}

export function CardHeader({
  icon,
  title,
  hint,
  actions,
}: {
  icon?: ReactNode;
  title: ReactNode;
  hint?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-3 px-4 pt-4 pb-2">
      <div className="min-w-0">
        <h2 className="font-display flex items-center gap-2 text-sm font-bold tracking-wide uppercase">
          {icon && <span className="text-accent">{icon}</span>}
          {title}
        </h2>
        {hint && <p className="text-muted mt-0.5 text-xs">{hint}</p>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-1">{actions}</div>}
    </div>
  );
}
