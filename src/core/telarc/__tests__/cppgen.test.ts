import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { expr, toCpp } from '../cppgen';
import { EXAMPLES } from '../examples';
import { parse } from '../parser';

const hasGpp = (() => {
  try {
    execFileSync('g++', ['--version'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
})();

describe('generador de C++', () => {
  it('usa std::thread, join y los tipos de la biblioteca estándar', () => {
    const cpp = toCpp(EXAMPLES[1]!.source);
    expect(cpp).toContain('#include <mutex>');
    expect(cpp).toContain('std::mutex m;');
    expect(cpp).toContain('std::thread t1([] {');
    expect(cpp).toContain('t1.join();');
    expect(cpp).toContain('assert(counter == 2);');
    expect(cpp).toContain('counter++;');
  });

  it('usa condition_variable_any si se espera directo sobre un mutex', () => {
    const cpp = toCpp(
      'mutex m; condition_variable cv; thread t { m.lock(); cv.wait(m); m.unlock(); }',
    );
    expect(cpp).toContain('std::condition_variable_any cv;');
  });

  it('pone paréntesis solo donde hacen falta', () => {
    const p = parse(
      'int x = (1 + 2) * 3 - (4 - 5) + 6 - 7; bool b = !(x > 1) && (true || false); thread t {}',
    );
    const [a, b] = p.globals;
    if (a?.kind !== 'var' || b?.kind !== 'var') throw new Error();
    expect(expr(a.init!)).toBe('(1 + 2) * 3 - (4 - 5) + 6 - 7');
    expect(expr(b.init!)).toBe('!(x > 1) && (true || false)');
  });

  it('genera promise/future, guards e if/else', () => {
    const cpp = toCpp(`
      promise<int> p; future<int> f = p.get_future(); mutex a, b; int r;
      thread t1 { scoped_lock lk(a, b); if (r > 0) { r = 1; } else { r = 2; } p.set_value(r); }
      thread t2 { int v = f.get(); { lock_guard<mutex> g(a); r = v; } }`);
    expect(cpp).toContain('std::future<int> f = p.get_future();');
    expect(cpp).toContain('std::scoped_lock lk(a, b);');
    expect(cpp).toContain('std::lock_guard<std::mutex> g(a);');
    expect(cpp).toContain('} else {');
    expect(cpp).toContain('int v = f.get();');
  });

  it.runIf(hasGpp)(
    'todos los ejemplos generan C++17 que compila con g++',
    () => {
      const dir = mkdtempSync(join(tmpdir(), 'telar-cpp-'));
      for (const ex of EXAMPLES) {
        const file = join(dir, `${ex.id}.cpp`);
        writeFileSync(file, toCpp(ex.source));
        expect(() =>
          execFileSync('g++', ['-std=c++17', '-fsyntax-only', '-Wall', '-Werror', file], {
            stdio: 'pipe',
          }),
        ).not.toThrow();
      }
    },
    120_000,
  );
});
