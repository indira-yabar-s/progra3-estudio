import { AlertTriangle, GraduationCap, Lightbulb } from 'lucide-react';
import { CodeBlock } from '@/components/ui/CodeBlock';
import { Markdown } from '@/components/ui/Markdown';
import type { Section } from '../content/schema';

const CALLOUT = {
  tip: { icon: Lightbulb, tone: 'var(--read)' },
  warning: { icon: AlertTriangle, tone: 'var(--warn)' },
  exam: { icon: GraduationCap, tone: 'var(--accent)' },
} as const;

export function LessonSection({ section }: { section: Section }) {
  switch (section.type) {
    case 'text':
      return <Markdown text={section.md} className="text-[16px]" />;
    case 'analogy':
      return (
        <aside className="glass glow-border print-page my-4 p-5">
          <p className="font-display flex items-center gap-2 text-lg font-bold">
            <span className="text-2xl" aria-hidden="true">
              {section.emoji}
            </span>
            {section.title}
          </p>
          <Markdown text={section.md} className="mt-1 text-[15px]" />
        </aside>
      );
    case 'code':
      return (
        <div className="print-page my-4">
          <p className="font-display font-bold">{section.title}</p>
          <CodeBlock code={section.code} caption="C++17" />
          {section.explain && (
            <Markdown text={section.explain} className="text-muted text-[15px]" />
          )}
        </div>
      );
    case 'callout': {
      const { icon: Icon, tone } = CALLOUT[section.variant];
      return (
        <div
          className="print-page my-4 flex gap-3 rounded-2xl border p-4"
          style={{ borderColor: tone, background: `color-mix(in srgb, ${tone} 8%, transparent)` }}
        >
          <Icon size={20} style={{ color: tone }} className="mt-1 shrink-0" aria-hidden="true" />
          <Markdown text={section.md} className="min-w-0 text-[15px]" />
        </div>
      );
    }
  }
}
