import type { Bilingual } from './diagnostics';
import type { FindingKind } from './verify';

export type ExampleLevel = 'basic' | 'intermediate' | 'advanced';

export interface TelarExample {
  id: string;
  title: Bilingual;
  level: ExampleLevel;
  source: string;
  /** Explicación del ejemplo (markdown sencillo). */
  explanation: Bilingual;
  /** "Qué deberías observar" al verificar. */
  observe: Bilingual[];
  /** Tipos de hallazgo que Telar DEBE encontrar (los tests lo comprueban). */
  expected: FindingKind[];
  /** Si es un reto: asserts que deben seguir en el código para darlo por superado. */
  challenge?: { requiredAsserts: string[]; hint: Bilingual };
}

export const EXAMPLES: TelarExample[] = [
  {
    id: 'contador-race',
    level: 'basic',
    title: { es: 'Contador con race condition', en: 'Counter with a race condition' },
    source: `// Dos hilos incrementan el mismo contador SIN protección.
// counter++ parece una sola operación, pero en realidad son dos:
// leer counter y escribir counter + 1.
int counter = 0;

thread t1 {
  counter++;
}

thread t2 {
  counter++;
}

// Esperamos que al final valga 2... ¿siempre?
assert(counter == 2);
`,
    explanation: {
      es: 'Es el bug de concurrencia más clásico. `counter++` se compila a **leer** y luego **escribir**. Si los dos hilos leen `0` antes de que alguno escriba, ambos escriben `1` y se pierde un incremento.',
      en: 'The most classic concurrency bug. `counter++` compiles to a **read** followed by a **write**. If both threads read `0` before either writes, both write `1` and one increment is lost.',
    },
    observe: [
      {
        es: 'Telar reporta una **data race** en `counter`: dos accesos sin relación happens-before.',
        en: 'Telar reports a **data race** on `counter`: two accesses with no happens-before relation.',
      },
      {
        es: 'El assert final falla con la traza: t1 lee 0 → t2 lee 0 → t1 escribe 1 → t2 escribe 1.',
        en: 'The final assert fails with the trace: t1 reads 0 → t2 reads 0 → t1 writes 1 → t2 writes 1.',
      },
      {
        es: 'Hay **2 resultados finales distintos** (1 y 2): el programa no es determinista.',
        en: 'There are **2 different final results** (1 and 2): the program is nondeterministic.',
      },
    ],
    expected: ['race', 'finalAssert', 'nondeterminism'],
  },
  {
    id: 'contador-mutex',
    level: 'basic',
    title: { es: 'Contador protegido con mutex', en: 'Counter protected by a mutex' },
    source: `// El mismo contador, ahora protegido con un mutex.
int counter = 0;
mutex m;

thread t1 {
  m.lock();      // entra a la sección crítica
  counter++;
  m.unlock();    // sale de la sección crítica
}

thread t2 {
  m.lock();
  counter++;
  m.unlock();
}

assert(counter == 2);
`,
    explanation: {
      es: 'El mutex garantiza **exclusión mutua**: solo un hilo a la vez ejecuta la sección crítica. Además, `unlock()` de un hilo *ocurre-antes* del `lock()` siguiente del otro, así que sus accesos quedan ordenados.',
      en: 'The mutex guarantees **mutual exclusion**: only one thread at a time runs the critical section. Also, one thread’s `unlock()` *happens-before* the other’s next `lock()`, so their accesses are ordered.',
    },
    observe: [
      {
        es: 'Sin errores: el assert se cumple en **todas** las intercalaciones.',
        en: 'No errors: the assert holds in **every** interleaving.',
      },
      {
        es: 'En el telar verás un hilo cruzado (arista happens-before) del unlock de un hilo al lock del otro.',
        en: 'In the loom you will see a crossing thread (happens-before edge) from one thread’s unlock to the other’s lock.',
      },
    ],
    expected: [],
  },
  {
    id: 'lock-guard',
    level: 'basic',
    title: { es: 'lock_guard (RAII)', en: 'lock_guard (RAII)' },
    source: `// lock_guard toma el mutex al crearse y lo suelta solo
// al salir del bloque { }. Así es imposible olvidar el unlock.
int counter = 0;
mutex m;

thread t1 {
  int i = 0;
  while (i < 2) {
    lock_guard<mutex> guard(m);
    counter++;
    i++;
  }   // aquí guard se destruye y suelta m
}

thread t2 {
  int i = 0;
  while (i < 2) {
    lock_guard<mutex> guard(m);
    counter++;
    i++;
  }
}

assert(counter == 4);
`,
    explanation: {
      es: '**RAII** (*Resource Acquisition Is Initialization*): el recurso se adquiere en el constructor y se libera en el destructor. Con `lock_guard` el mutex se libera aunque salgas del bloque por cualquier camino.',
      en: '**RAII** (*Resource Acquisition Is Initialization*): the resource is acquired in the constructor and released in the destructor. With `lock_guard` the mutex is released however you leave the block.',
    },
    observe: [
      { es: 'Sin errores en ninguna intercalación.', en: 'No errors in any interleaving.' },
      {
        es: 'En la traza, el paso “suelta (fin del bloque)” aparece en la llave de cierre del while.',
        en: 'In the trace, the “release (end of block)” step appears at the closing brace of the while.',
      },
    ],
    expected: [],
  },
  {
    id: 'deadlock-clasico',
    level: 'intermediate',
    title: { es: 'Deadlock clásico con dos mutex', en: 'Classic two-mutex deadlock' },
    source: `// Cada hilo toma los dos mutex... pero en orden distinto.
mutex a, b;
int x = 0;

thread t1 {
  a.lock();
  b.lock();
  x++;
  b.unlock();
  a.unlock();
}

thread t2 {
  b.lock();
  a.lock();
  x++;
  a.unlock();
  b.unlock();
}
`,
    explanation: {
      es: 'Si t1 toma `a` y justo después t2 toma `b`, cada uno espera el mutex que tiene el otro: **espera circular**. Es una de las 4 condiciones de Coffman (exclusión mutua, retener y esperar, no expropiación, espera circular).',
      en: 'If t1 takes `a` and right after t2 takes `b`, each waits for the mutex the other holds: **circular wait**. It is one of the 4 Coffman conditions (mutual exclusion, hold and wait, no preemption, circular wait).',
    },
    observe: [
      {
        es: 'Telar encuentra un **deadlock** con una traza de solo 2 pasos.',
        en: 'Telar finds a **deadlock** with a trace of only 2 steps.',
      },
      {
        es: 'El grafo de espera muestra el ciclo t1 → t2 → t1.',
        en: 'The wait-for graph shows the cycle t1 → t2 → t1.',
      },
    ],
    expected: ['deadlock'],
  },
  {
    id: 'orden-de-bloqueo',
    level: 'intermediate',
    title: { es: 'Solución: mismo orden de bloqueo', en: 'Fix: consistent lock ordering' },
    source: `// Solución: TODOS los hilos toman los mutex en el mismo orden (a y luego b).
// Así es imposible formar un ciclo de espera.
mutex a, b;
int x = 0;

thread t1 {
  a.lock();
  b.lock();
  x++;
  b.unlock();
  a.unlock();
}

thread t2 {
  a.lock();
  b.lock();
  x++;
  b.unlock();
  a.unlock();
}

assert(x == 2);
`,
    explanation: {
      es: 'Si numeramos los mutex y siempre los tomamos en orden creciente, nunca puede haber un ciclo en el grafo de espera: rompemos la condición de **espera circular**.',
      en: 'If we number the mutexes and always take them in increasing order, the wait-for graph can never have a cycle: we break the **circular wait** condition.',
    },
    observe: [
      { es: 'Sin deadlocks ni races.', en: 'No deadlocks or races.' },
      {
        es: 'Compara cuántos estados explora con POR y sin POR en las estadísticas.',
        en: 'Compare how many states it explores with and without POR in the stats.',
      },
    ],
    expected: [],
  },
  {
    id: 'scoped-lock',
    level: 'intermediate',
    title: {
      es: 'scoped_lock: varios mutex sin deadlock',
      en: 'scoped_lock: many mutexes, no deadlock',
    },
    source: `// scoped_lock (C++17) toma varios mutex a la vez con un algoritmo
// que evita el deadlock, aunque los pases en distinto orden.
mutex a, b;
int x = 0;

thread t1 {
  scoped_lock lk(a, b);
  x++;
}

thread t2 {
  scoped_lock lk(b, a);   // orden "al revés": igual es seguro
  x++;
}

assert(x == 2);
`,
    explanation: {
      es: '`std::scoped_lock` usa internamente `std::lock`, que toma todos los mutex o ninguno. En Telar se modela como un paso atómico que solo ocurre cuando todos están libres.',
      en: '`std::scoped_lock` uses `std::lock` internally, which takes all the mutexes or none. Telar models it as one atomic step that happens only when all are free.',
    },
    observe: [
      {
        es: 'Sin deadlock, a diferencia del ejemplo clásico.',
        en: 'No deadlock, unlike the classic example.',
      },
    ],
    expected: [],
  },
  {
    id: 'productor-consumidor',
    level: 'intermediate',
    title: {
      es: 'Productor–consumidor con condition_variable',
      en: 'Producer–consumer with condition_variable',
    },
    source: `// Buffer de tamaño 1. El productor pone 1 y 2; el consumidor los suma.
int buffer = 0;
bool lleno = false;
int suma = 0;
mutex m;
condition_variable cv;

thread productor {
  int i = 1;
  while (i <= 2) {
    unique_lock<mutex> lk(m);
    while (lleno) {
      cv.wait(lk);        // suelta m y duerme hasta un notify
    }
    buffer = i;
    lleno = true;
    cv.notify_all();      // despierta al consumidor
    i++;
  }
}

thread consumidor {
  int n = 0;
  while (n < 2) {
    unique_lock<mutex> lk(m);
    while (!lleno) {
      cv.wait(lk);
    }
    suma = suma + buffer;
    lleno = false;
    cv.notify_all();
    n++;
  }
}

assert(suma == 3);
`,
    explanation: {
      es: '`wait` hace tres cosas: **suelta el mutex**, **duerme** y, al despertar, **vuelve a tomar el mutex**. Se usa dentro de un `while` que revisa la condición, porque al despertar la condición podría ya no cumplirse (o el despertar podría ser espurio).',
      en: '`wait` does three things: **releases the mutex**, **sleeps** and, on waking, **re-acquires the mutex**. It is used inside a `while` that re-checks the condition, because on waking the condition might no longer hold (or the wake-up might be spurious).',
    },
    observe: [
      {
        es: 'Sin errores: nunca se pierde ni se duplica un elemento.',
        en: 'No errors: no item is ever lost or duplicated.',
      },
      {
        es: 'En el panel de mutex verás al consumidor “durmiendo en cv” mientras el buffer está vacío.',
        en: 'In the mutex panel you will see the consumer “sleeping on cv” while the buffer is empty.',
      },
    ],
    expected: [],
  },
  {
    id: 'notificacion-perdida',
    level: 'intermediate',
    title: {
      es: 'Notificación perdida (wait sin condición)',
      en: 'Lost wake-up (wait without a condition)',
    },
    source: `// BUG: el que espera no revisa ninguna condición.
// Si el notify ocurre ANTES del wait, nadie lo vuelve a despertar.
bool listo = false;
mutex m;
condition_variable cv;

thread esperador {
  unique_lock<mutex> lk(m);
  cv.wait(lk);            // debería ser: while (!listo) cv.wait(lk);
}

thread notificador {
  lock_guard<mutex> g(m);
  listo = true;
  cv.notify_one();
}
`,
    explanation: {
      es: 'Un `notify` no se “guarda”: si nadie está esperando en ese momento, se pierde. Por eso siempre se espera **una condición** (`while (!listo) cv.wait(lk);`), no un evento.',
      en: 'A `notify` is not “stored”: if nobody is waiting at that moment, it is lost. That is why you always wait for **a condition** (`while (!listo) cv.wait(lk);`), not for an event.',
    },
    observe: [
      {
        es: 'Telar reporta un **bloqueo permanente** sin ciclo de mutex.',
        en: 'Telar reports a **permanent block** without a mutex cycle.',
      },
      {
        es: 'Arréglalo con el while y vuelve a verificar.',
        en: 'Fix it with the while and verify again.',
      },
    ],
    expected: ['deadlock'],
  },
  {
    id: 'promise-future',
    level: 'basic',
    title: { es: 'promise / future', en: 'promise / future' },
    source: `// Un hilo calcula un valor y se lo "envía" a otro por un canal de un solo uso.
promise<int> p;
future<int> f = p.get_future();
int resultado = 0;

thread calculador {
  int x = 6 * 7;
  p.set_value(x);        // envía el valor
}

thread lector {
  int v = f.get();       // se bloquea hasta que haya valor
  resultado = v;
}

assert(resultado == 42);
`,
    explanation: {
      es: '`promise` es el extremo que **escribe** y `future` el que **lee**. `f.get()` bloquea hasta que llegue el valor y crea una relación happens-before: todo lo que hizo el calculador antes de `set_value` es visible para el lector después de `get`.',
      en: '`promise` is the **writing** end and `future` the **reading** end. `f.get()` blocks until the value arrives and creates a happens-before relation: everything the producer did before `set_value` is visible to the reader after `get`.',
    },
    observe: [
      { es: 'Sin errores en ninguna intercalación.', en: 'No errors in any interleaving.' },
      {
        es: 'El lector aparece “bloqueado” hasta que el calculador hace set_value.',
        en: 'The reader shows as “blocked” until the producer calls set_value.',
      },
    ],
    expected: [],
  },
  {
    id: 'filosofos',
    level: 'advanced',
    title: { es: 'Cena de los filósofos', en: 'Dining philosophers' },
    source: `// 3 filósofos en una mesa redonda y 3 tenedores (mutex).
// Cada uno toma el tenedor de su izquierda y luego el de su derecha.
mutex tenedor0, tenedor1, tenedor2;
bool comio0 = false;
bool comio1 = false;
bool comio2 = false;

thread filosofo0 {
  tenedor0.lock();
  tenedor1.lock();
  comio0 = true;
  tenedor1.unlock();
  tenedor0.unlock();
}

thread filosofo1 {
  tenedor1.lock();
  tenedor2.lock();
  comio1 = true;
  tenedor2.unlock();
  tenedor1.unlock();
}

thread filosofo2 {
  tenedor2.lock();
  tenedor0.lock();     // cierra el círculo: 2 → 0
  comio2 = true;
  tenedor0.unlock();
  tenedor2.unlock();
}
`,
    explanation: {
      es: 'Problema clásico de Dijkstra. Si todos toman su tenedor izquierdo a la vez, cada uno espera el derecho, que tiene su vecino: **ciclo de 3**. Solución: que el último filósofo tome primero el tenedor de menor número (`tenedor0` y luego `tenedor2`).',
      en: 'Dijkstra’s classic problem. If everyone grabs their left fork at once, each waits for the right one, held by their neighbor: **a 3-cycle**. Fix: the last philosopher takes the lower-numbered fork first (`tenedor0` then `tenedor2`).',
    },
    observe: [
      {
        es: 'El grafo de espera muestra un triángulo: filosofo0 → filosofo1 → filosofo2 → filosofo0.',
        en: 'The wait-for graph shows a triangle: filosofo0 → filosofo1 → filosofo2 → filosofo0.',
      },
      {
        es: 'Prueba la solución cambiando el orden en filosofo2.',
        en: 'Try the fix by changing the order in filosofo2.',
      },
    ],
    expected: ['deadlock'],
  },
  {
    id: 'banco',
    level: 'advanced',
    title: { es: 'Banco: transferencias (check-then-act)', en: 'Bank: transfers (check-then-act)' },
    source: `// Dos transferencias desde la cuenta A hacia la B.
// Cada acceso está protegido... pero la verificación y el retiro van por separado.
int cuentaA = 100;
int cuentaB = 0;
mutex mA, mB;

thread transferencia1 {
  mA.lock();
  bool alcanza = cuentaA >= 80;
  mA.unlock();
  if (alcanza) {
    scoped_lock lk(mA, mB);
    cuentaA = cuentaA - 80;
    cuentaB = cuentaB + 80;
  }
}

thread transferencia2 {
  mA.lock();
  bool alcanza = cuentaA >= 50;
  mA.unlock();
  if (alcanza) {
    scoped_lock lk(mA, mB);
    cuentaA = cuentaA - 50;
    cuentaB = cuentaB + 50;
  }
}

assert(cuentaA + cuentaB == 100);   // el dinero se conserva
assert(cuentaA >= 0);               // nunca queda en negativo
`,
    explanation: {
      es: 'No hay ninguna data race: todo acceso está bajo un mutex. Aun así el programa es incorrecto: entre “¿alcanza?” y “retira” otro hilo puede retirar. Es una **violación de atomicidad** (*check-then-act*). La verificación y el retiro deben ir en **la misma** sección crítica.',
      en: 'There is no data race: every access is under a mutex. Still, the program is wrong: between “is there enough?” and “withdraw” another thread can withdraw. It is an **atomicity violation** (*check-then-act*). The check and the withdrawal must be in **the same** critical section.',
    },
    observe: [
      {
        es: 'Telar NO reporta races, pero sí que falla `cuentaA >= 0`.',
        en: 'Telar reports NO races, but `cuentaA >= 0` fails.',
      },
      {
        es: 'Lección: “sin data races” no significa “correcto”.',
        en: 'Lesson: “no data races” does not mean “correct”.',
      },
    ],
    expected: ['finalAssert', 'nondeterminism'],
  },
  {
    id: 'independientes',
    level: 'advanced',
    title: { es: 'Hilos independientes (demo de POR)', en: 'Independent threads (POR demo)' },
    source: `// Tres hilos que NO comparten nada (salvo leer una constante).
// Sin POR hay que probar cada intercalación de sus pasos: ¡miles de estados!
// Con POR, Telar sabe que el orden entre pasos independientes no importa.
int limite = 4;   // solo se lee: leerla en cualquier orden da lo mismo
int a = 0;
int b = 0;
int c = 0;

thread t1 {
  while (a < limite) {
    a++;
  }
}

thread t2 {
  while (b < limite) {
    b++;
  }
}

thread t3 {
  while (c < limite) {
    c++;
  }
}

assert(a + b + c == 12);
`,
    explanation: {
      es: 'Dos pasos son **independientes** si no tocan la misma variable (o solo la leen). Ejecutar `a++` y luego `b++` deja el mismo estado que `b++` y luego `a++`. La **reducción de orden parcial** explora solo un representante de cada grupo de intercalaciones equivalentes.',
      en: 'Two steps are **independent** if they do not touch the same variable (or only read it). Running `a++` then `b++` leaves the same state as `b++` then `a++`. **Partial order reduction** explores only one representative of each group of equivalent interleavings.',
    },
    observe: [
      {
        es: 'En las estadísticas compara “estados con POR” vs “sin POR”: el ahorro es enorme.',
        en: 'In the stats compare “states with POR” vs “without POR”: the savings are huge.',
      },
      {
        es: 'El árbol de estados con POR es casi una línea recta.',
        en: 'The state tree with POR is almost a straight line.',
      },
    ],
    expected: [],
  },
  {
    id: 'reto-cuentas',
    level: 'advanced',
    title: { es: '🏆 Reto: arregla las transferencias', en: '🏆 Challenge: fix the transfers' },
    source: `// RETO: este programa tiene DOS bugs (un deadlock y una data race).
// Arréglalos sin borrar los assert. Telar te dirá cuando esté correcto.
int a = 50;
int b = 50;
int operaciones = 0;
mutex ma, mb;

thread t1 {
  ma.lock();
  mb.lock();
  a = a - 10;
  b = b + 10;
  mb.unlock();
  ma.unlock();
  operaciones++;
}

thread t2 {
  mb.lock();
  ma.lock();
  b = b - 20;
  a = a + 20;
  ma.unlock();
  mb.unlock();
  operaciones++;
}

assert(a + b == 100);
assert(operaciones == 2);
`,
    explanation: {
      es: 'Usa lo aprendido: orden de bloqueo consistente (o `scoped_lock`) y protege **todas** las variables compartidas.',
      en: 'Use what you learned: consistent lock order (or `scoped_lock`) and protect **every** shared variable.',
    },
    observe: [
      {
        es: 'Cuando no quede ningún hallazgo, Telar mostrará “¡Reto superado!”.',
        en: 'When no findings remain, Telar will show “Challenge passed!”.',
      },
    ],
    expected: ['deadlock', 'race', 'finalAssert', 'nondeterminism'],
    challenge: {
      requiredAsserts: ['a + b == 100', 'operaciones == 2'],
      hint: {
        es: 'Pista: ¿en qué orden toma cada hilo ma y mb? ¿Quién protege a operaciones?',
        en: 'Hint: in which order does each thread take ma and mb? Who protects operaciones?',
      },
    },
  },
];

export function findExample(id: string): TelarExample | undefined {
  return EXAMPLES.find((e) => e.id === id);
}

/** Un reto se supera si no hay hallazgos y siguen presentes los asserts requeridos. */
export function isChallengeSolved(
  example: TelarExample,
  source: string,
  findingsCount: number,
): boolean {
  if (!example.challenge || findingsCount > 0) return false;
  const compact = source.replace(/\s+/g, '');
  return example.challenge.requiredAsserts.every((a) =>
    compact.includes(`assert(${a.replace(/\s+/g, '')})`),
  );
}
