import { Fragment, type ReactNode } from 'react';
import { CodeBlock } from './CodeBlock';

/**
 * Renderizador de markdown mínimo y seguro (sin innerHTML) para el contenido
 * del curso: párrafos, **negrita**, *cursiva*, `código`, listas, ### títulos y
 * bloques ```cpp.
 */
export function Markdown({ text, className = '' }: { text: string; className?: string }) {
  return <div className={`prose-telar ${className}`}>{renderBlocks(text)}</div>;
}

function renderBlocks(text: string): ReactNode[] {
  const lines = text.replace(/\r/g, '').split('\n');
  const out: ReactNode[] = [];
  let i = 0;
  let key = 0;
  while (i < lines.length) {
    const line = lines[i]!;
    if (line.trim() === '') {
      i++;
      continue;
    }
    if (line.startsWith('```')) {
      const lang = line.slice(3).trim() || 'cpp';
      const code: string[] = [];
      i++;
      while (i < lines.length && !lines[i]!.startsWith('```')) code.push(lines[i++]!);
      i++;
      out.push(<CodeBlock key={key++} code={code.join('\n')} language={lang} />);
      continue;
    }
    if (line.startsWith('### ')) {
      out.push(<h3 key={key++}>{inline(line.slice(4))}</h3>);
      i++;
      continue;
    }
    if (/^\s*[-*] /.test(line) || /^\s*\d+\. /.test(line)) {
      const ordered = /^\s*\d+\. /.test(line);
      const items: string[] = [];
      while (i < lines.length && (/^\s*[-*] /.test(lines[i]!) || /^\s*\d+\. /.test(lines[i]!))) {
        items.push(lines[i]!.replace(/^\s*([-*]|\d+\.) /, ''));
        i++;
      }
      const List = ordered ? 'ol' : 'ul';
      out.push(
        <List key={key++}>
          {items.map((it, j) => (
            <li key={j}>{inline(it)}</li>
          ))}
        </List>,
      );
      continue;
    }
    const para: string[] = [];
    while (
      i < lines.length &&
      lines[i]!.trim() !== '' &&
      !lines[i]!.startsWith('```') &&
      !lines[i]!.startsWith('### ') &&
      !/^\s*([-*]|\d+\.) /.test(lines[i]!)
    ) {
      para.push(lines[i++]!);
    }
    out.push(<p key={key++}>{inline(para.join(' '))}</p>);
  }
  return out;
}

/** Formato en línea: `código`, **negrita** y *cursiva*. */
function inline(text: string): ReactNode {
  const parts = text.split(/(`[^`]+`|\*\*[^*]+\*\*|\*[^*]+\*)/g);
  return parts.map((p, i) => {
    if (p.startsWith('`') && p.endsWith('`') && p.length > 1)
      return <code key={i}>{p.slice(1, -1)}</code>;
    if (p.startsWith('**') && p.endsWith('**') && p.length > 3)
      return <strong key={i}>{p.slice(2, -2)}</strong>;
    if (p.startsWith('*') && p.endsWith('*') && p.length > 2)
      return <em key={i}>{p.slice(1, -1)}</em>;
    return <Fragment key={i}>{p}</Fragment>;
  });
}
