/**
 * Resaltado de sintaxis liviano para C++/TelarC en las lecciones (sin cargar Monaco).
 * Devuelve tokens con una clase de color.
 */
export type TokenClass = 'kw' | 'type' | 'str' | 'num' | 'com' | 'fn' | 'pre' | 'plain';

export interface HlToken {
  text: string;
  cls: TokenClass;
}

const KEYWORDS = new Set([
  'if',
  'else',
  'while',
  'for',
  'return',
  'thread',
  'assert',
  'true',
  'false',
  'auto',
  'const',
  'void',
  'struct',
  'class',
  'public',
  'private',
  'new',
  'delete',
  'nullptr',
  'using',
  'namespace',
  'template',
  'typename',
  'break',
  'continue',
  'static',
  'this',
  'do',
  'switch',
  'case',
  'default',
  'operator',
  'virtual',
  'override',
  'try',
  'catch',
  'throw',
  'mutable',
]);
const TYPES = new Set([
  'int',
  'bool',
  'char',
  'double',
  'float',
  'long',
  'size_t',
  'string',
  'vector',
  'std',
  'mutex',
  'thread',
  'lock_guard',
  'unique_lock',
  'scoped_lock',
  'condition_variable',
  'condition_variable_any',
  'promise',
  'future',
  'async',
  'launch',
  'atomic',
  'queue',
  'shared_future',
  'packaged_task',
]);

const RE =
  /(\/\/[^\n]*|\/\*[\s\S]*?\*\/)|("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])')|(#\s*\w+[^\n]*)|(\b\d+(?:\.\d+)?\b)|([A-Za-z_]\w*)(?=\s*\()|([A-Za-z_]\w*)|(\s+|[^\w\s])/g;

export function highlight(code: string): HlToken[] {
  const out: HlToken[] = [];
  let m: RegExpExecArray | null;
  RE.lastIndex = 0;
  while ((m = RE.exec(code))) {
    const [text, com, str, pre, num, fn, word] = m;
    let cls: TokenClass = 'plain';
    if (com) cls = 'com';
    else if (str) cls = 'str';
    else if (pre) cls = 'pre';
    else if (num) cls = 'num';
    else if (fn) cls = KEYWORDS.has(fn) ? 'kw' : TYPES.has(fn) ? 'type' : 'fn';
    else if (word) cls = KEYWORDS.has(word) ? 'kw' : TYPES.has(word) ? 'type' : 'plain';
    out.push({ text, cls });
  }
  return out;
}
