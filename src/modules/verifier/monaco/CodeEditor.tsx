import Editor, { type OnMount } from '@monaco-editor/react';
import { useEffect, useRef, useState } from 'react';
import type { Diagnostic, SourceLoc } from '@/core/telarc/diagnostics';
import { useT } from '@/i18n';
import { useIsDark } from '@/lib/useIsDark';
import { monaco } from './setup';

export interface ThreadMarker {
  thread: number;
  name: string;
  loc: SourceLoc;
}

interface Props {
  value: string;
  onChange?: (v: string) => void;
  language?: 'telarc' | 'cpp';
  readOnly?: boolean;
  diagnostic?: Diagnostic | null;
  /** Línea que acaba de ejecutarse en el paso actual. */
  current?: SourceLoc | null;
  /** Línea donde está cada hilo (lo próximo que va a ejecutar). */
  threads?: ThreadMarker[];
  /** Líneas implicadas en el error seleccionado. */
  errorLocs?: SourceLoc[];
  onRun?: () => void;
  /** Enfocar el editor al montarse (cuando se activa desde la vista previa). */
  autoFocus?: boolean;
  height?: string;
  ariaLabel: string;
}

export default function CodeEditor({
  value,
  onChange,
  language = 'telarc',
  readOnly,
  diagnostic,
  current,
  threads,
  errorLocs,
  onRun,
  autoFocus,
  height = '100%',
  ariaLabel,
}: Props) {
  const { locale } = useT();
  const dark = useIsDark();
  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);
  const decoRef = useRef<monaco.editor.IEditorDecorationsCollection | null>(null);
  const [ready, setReady] = useState(false);
  const runRef = useRef(onRun);
  useEffect(() => {
    runRef.current = onRun;
  }, [onRun]);

  const onMount: OnMount = (editor) => {
    editorRef.current = editor;
    decoRef.current = editor.createDecorationsCollection();
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => runRef.current?.());
    if (autoFocus) editor.focus();
    setReady(true);
  };

  // Marcadores de error de compilación (subrayado ondulado + mensaje al pasar el mouse).
  useEffect(() => {
    const model = editorRef.current?.getModel();
    if (!model) return;
    const markers: monaco.editor.IMarkerData[] = diagnostic
      ? [
          {
            severity: monaco.MarkerSeverity.Error,
            message: diagnostic.message[locale],
            startLineNumber: diagnostic.loc.line,
            startColumn: diagnostic.loc.col,
            endLineNumber: diagnostic.loc.endLine,
            endColumn: Math.max(diagnostic.loc.endCol, diagnostic.loc.col + 1),
          },
        ]
      : [];
    monaco.editor.setModelMarkers(model, 'telarc', markers);
  }, [diagnostic, locale, value, ready]);

  // Decoraciones de la traza: línea de cada hilo, paso actual y líneas del error.
  useEffect(() => {
    const deco: monaco.editor.IModelDeltaDecoration[] = [];
    for (const l of errorLocs ?? []) {
      deco.push({
        range: new monaco.Range(l.line, 1, l.endLine, 1),
        options: { isWholeLine: true, className: 'telar-error-line' },
      });
    }
    const perLine = new Map<number, ThreadMarker[]>();
    for (const t of threads ?? []) {
      perLine.set(t.loc.line, [...(perLine.get(t.loc.line) ?? []), t]);
    }
    const model = editorRef.current?.getModel();
    for (const [line, ts] of perLine) {
      const first = ts[0]!;
      const endCol = model && line <= model.getLineCount() ? model.getLineMaxColumn(line) : 1;
      deco.push({
        range: new monaco.Range(line, 1, line, endCol),
        options: {
          isWholeLine: true,
          className: `telar-tline-${first.thread % 6}`,
          glyphMarginClassName: `telar-thread-glyph telar-t${first.thread % 6}`,
          after: {
            content: `  ◂ ${ts.map((t) => t.name).join(', ')}`,
            inlineClassName: `telar-after telar-after-t${first.thread % 6}`,
          },
        },
      });
    }
    if (current) {
      deco.push({
        range: new monaco.Range(current.line, 1, current.line, 1),
        options: { isWholeLine: true, className: 'telar-current-line' },
      });
      editorRef.current?.revealLineInCenterIfOutsideViewport(current.line);
    }
    decoRef.current?.set(deco);
  }, [threads, current, errorLocs, ready]);

  return (
    <Editor
      height={height}
      value={value}
      language={language}
      theme={dark ? 'telar-dark' : 'telar-light'}
      onChange={(v) => onChange?.(v ?? '')}
      onMount={onMount}
      loading={<div className="text-muted grid h-full place-items-center text-sm">…</div>}
      options={{
        readOnly,
        ariaLabel,
        fontFamily: "'JetBrains Mono Variable', ui-monospace, monospace",
        fontLigatures: true,
        fontSize: 14,
        lineHeight: 22,
        minimap: { enabled: false },
        scrollBeyondLastLine: false,
        glyphMargin: !readOnly,
        folding: true,
        lineNumbersMinChars: 3,
        renderLineHighlight: 'line',
        padding: { top: 12, bottom: 12 },
        smoothScrolling: true,
        tabSize: 2,
        automaticLayout: true,
        scrollbar: { verticalScrollbarSize: 8, horizontalScrollbarSize: 8 },
        fixedOverflowWidgets: true,
      }}
    />
  );
}
