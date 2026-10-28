/**
 * Monaco empaquetado localmente (no desde un CDN) para que el editor funcione offline.
 * Solo importamos el núcleo del editor y las contribuciones que usamos, no los
 * más de 80 lenguajes de editor.main.
 */
import * as monaco from 'monaco-editor/editor/editor.api.js';
import '@monaco-css/base/browser/ui/codicons/codicon/codicon.css';
import '@monaco-css/base/browser/ui/codicons/codicon/codicon-modifiers.css';
import 'monaco-editor/editor/browser/coreCommands.js';
import 'monaco-editor/editor/contrib/bracketMatching/browser/bracketMatching.js';
import 'monaco-editor/editor/contrib/clipboard/browser/clipboard.js';
import 'monaco-editor/editor/contrib/comment/browser/comment.js';
import 'monaco-editor/editor/contrib/contextmenu/browser/contextmenu.js';
import 'monaco-editor/editor/contrib/cursorUndo/browser/cursorUndo.js';
import 'monaco-editor/editor/contrib/find/browser/findController.js';
import 'monaco-editor/editor/contrib/folding/browser/folding.js';
import 'monaco-editor/editor/contrib/hover/browser/hoverContribution.js';
import 'monaco-editor/editor/contrib/linesOperations/browser/linesOperations.js';
import 'monaco-editor/editor/contrib/multicursor/browser/multicursor.js';
import 'monaco-editor/editor/contrib/wordHighlighter/browser/wordHighlighter.js';
import 'monaco-editor/editor/contrib/wordOperations/browser/wordOperations.js';
import 'monaco-editor/languages/definitions/cpp/register.js';
import EditorWorker from 'monaco-editor/editor/editor.worker.js?worker';
import { loader } from '@monaco-editor/react';

self.MonacoEnvironment = { getWorker: () => new EditorWorker() };

monaco.languages.register({ id: 'telarc', extensions: ['.telarc'], aliases: ['TelarC'] });

monaco.languages.setMonarchTokensProvider('telarc', {
  keywords: ['if', 'else', 'while', 'thread', 'assert', 'true', 'false'],
  types: [
    'int',
    'bool',
    'mutex',
    'condition_variable',
    'condition_variable_any',
    'lock_guard',
    'unique_lock',
    'scoped_lock',
    'promise',
    'future',
    'std',
  ],
  methods: ['lock', 'unlock', 'wait', 'notify_one', 'notify_all', 'set_value', 'get', 'get_future'],
  tokenizer: {
    root: [
      [/\/\/.*$/, 'comment'],
      [/\/\*/, 'comment', '@comment'],
      [/#.*$/, 'keyword.directive'],
      [/\d+/, 'number'],
      [
        /[a-zA-Z_]\w*/,
        {
          cases: {
            '@keywords': 'keyword',
            '@types': 'type',
            '@methods': 'method',
            '@default': 'identifier',
          },
        },
      ],
      [/[{}()[\]]/, '@brackets'],
      [/[=!<>]=?|&&|\|\||[+\-*/%]/, 'operator'],
    ],
    comment: [
      [/[^/*]+/, 'comment'],
      [/\*\//, 'comment', '@pop'],
      [/[/*]/, 'comment'],
    ],
  },
});

monaco.languages.setLanguageConfiguration('telarc', {
  comments: { lineComment: '//', blockComment: ['/*', '*/'] },
  brackets: [
    ['{', '}'],
    ['(', ')'],
    ['<', '>'],
  ],
  autoClosingPairs: [
    { open: '{', close: '}' },
    { open: '(', close: ')' },
    { open: '/*', close: ' */' },
  ],
  indentationRules: {
    increaseIndentPattern: /^.*\{[^}"']*$/,
    decreaseIndentPattern: /^\s*\}/,
  },
});

const shared = (dark: boolean): monaco.editor.ITokenThemeRule[] => [
  { token: 'comment', foreground: dark ? '8a74a6' : '9a86ad', fontStyle: 'italic' },
  { token: 'keyword', foreground: dark ? 'ff5ad9' : 'c0158b', fontStyle: 'bold' },
  { token: 'keyword.directive', foreground: dark ? 'e879f9' : 'a21caf' },
  { token: 'type', foreground: dark ? 'b69cff' : '6d28d9' },
  { token: 'method', foreground: dark ? '5eead4' : '0e7490' },
  { token: 'number', foreground: dark ? 'fcd34d' : 'b45309' },
  { token: 'operator', foreground: dark ? 'f0abfc' : '86198f' },
  { token: 'identifier', foreground: dark ? 'f7ecff' : '2a0f3d' },
];

monaco.editor.defineTheme('telar-dark', {
  base: 'vs-dark',
  inherit: true,
  rules: shared(true),
  colors: {
    'editor.background': '#00000000',
    'editor.lineHighlightBackground': '#ffffff08',
    'editorLineNumber.foreground': '#6f5a8a',
    'editorLineNumber.activeForeground': '#ff8ae6',
    'editorCursor.foreground': '#ff5ad9',
    'editor.selectionBackground': '#ff4fd833',
    'editorIndentGuide.background1': '#ffffff10',
    'editorGutter.background': '#00000000',
    'editorWidget.background': '#1d0e33',
    'editorHoverWidget.background': '#1d0e33',
    'editorHoverWidget.border': '#ff8ae655',
    'scrollbarSlider.background': '#ff8ae622',
  },
});

monaco.editor.defineTheme('telar-light', {
  base: 'vs',
  inherit: true,
  rules: shared(false),
  colors: {
    'editor.background': '#00000000',
    'editor.lineHighlightBackground': '#a21caf0a',
    'editorLineNumber.foreground': '#b3a0c4',
    'editorLineNumber.activeForeground': '#c0158b',
    'editorCursor.foreground': '#c0158b',
    'editor.selectionBackground': '#d6189a26',
    'editorGutter.background': '#00000000',
    'editorWidget.background': '#fdf7ff',
    'editorHoverWidget.background': '#fdf7ff',
    'editorHoverWidget.border': '#a21caf44',
  },
});

loader.config({ monaco });

export { monaco };
