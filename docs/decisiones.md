# Registro de decisiones

Decisiones tomadas de forma autónoma durante la construcción de Telar, con su motivo. El formato es
el de un _Architecture Decision Record_ corto: contexto → decisión → consecuencias.

---

### D1. Núcleo en TypeScript puro, separado de la UI

**Contexto:** el verificador debe correr en un Web Worker y tener cobertura alta.
**Decisión:** `src/core/telarc` no importa React ni el DOM.
**Consecuencias:** se testea en Node con Vitest (rápido), se puede reutilizar en otra interfaz o en
un CLI, y el Worker solo importa el núcleo.

### D2. Compilar el AST a microinstrucciones en vez de interpretar el árbol directamente

**Contexto:** el intérprete debe ser una máquina de estados donde cada paso atómico es un evento, y
los estados deben poder compararse (hashing).
**Decisión:** el compilador baja el AST a una lista plana de instrucciones por hilo (`load`,
`store`, `lock`, `wait`…), con un contador de programa por hilo.
**Consecuencias:** un estado es un conjunto de arreglos pequeños, fácil de clonar y de convertir en
clave. Un intérprete sobre el AST necesitaría guardar "continuaciones" (dónde ibas en cada bloque
anidado), mucho más difícil de comparar.

### D3. Granularidad: un paso por acceso a memoria compartida; lo local es invisible

**Contexto:** demasiados pasos = explosión de estados; muy pocos = se esconden races.
**Decisión:** cada lectura/escritura de una global, y cada operación de sincronización, es un paso.
Las instrucciones sobre variables locales se ejecutan "pegadas" al paso anterior (no las ve otro
hilo). Se detecta un bucle local infinito tras 10 000 instrucciones.
**Consecuencias:** `counter++` muestra la race clásica con solo 4 pasos y los programas del curso
tienen decenas o cientos de estados, no millones.

### D4. `&&` y `||` leen ambas globales antes de evaluar

**Contexto:** en C++ el cortocircuito evita leer el lado derecho.
**Decisión:** el compilador emite un `LOAD` por cada lectura que aparece en la expresión, en orden,
y luego evalúa con cortocircuito sobre los valores ya leídos.
**Consecuencias:** simplifica mucho el compilador. Puede generar una lectura extra (y en un caso raro
reportar una race en una lectura que C++ no haría). Documentado como limitación.

### D5. `wait` = "soltar y dormir" + "re-tomar"; sin despertares espurios

**Decisión:** `cv.wait(lk)` se compila en dos pasos. No se modelan despertares espurios.
**Consecuencias:** se ven claramente los dos momentos en la traza. Como los ejemplos correctos usan
`while (cond) cv.wait(lk);`, el resultado coincide con C++ real; el bug de "notificación perdida"
se detecta igual. Los despertares espurios se explican en la lección 4.

### D6. `notify_one` no determinista

**Decisión:** con _k_ hilos dormidos, `notify_one` genera _k_ transiciones distintas.
**Consecuencias:** se exploran todas las elecciones del planificador, como exige el estándar.

### D7. `scoped_lock` atómico

**Decisión:** `scoped_lock(a, b)` es un único paso habilitado solo si todos los mutex están libres.
**Consecuencias:** modela la garantía de `std::lock` (todos o ninguno, sin deadlock) sin simular su
algoritmo interno de reintentos.

### D8. Detección de races con relojes vectoriales a lo largo de cada camino del DFS

**Contexto:** el enunciado pide happens-before con relojes vectoriales.
**Decisión:** el estado de HB (relojes, último escritor y lectores por variable) viaja con cada
marco de la pila del DFS, pero **no** forma parte del hash del estado.
**Consecuencias:** el espacio de estados no explota. La contracara: si un estado se alcanza por dos
historias distintas, solo se analiza la primera. Como HB detecta races aunque los accesos no
coincidan en el tiempo, en la práctica la race aparece ya en el primer camino. Se reporta **una race
por variable** para no repetir el mismo bug.

### D9. POR = sleep sets + ample sets estáticos con análisis de locksets

**Contexto:** los sleep sets solos reducen _transiciones_ pero casi no reducen _estados_ cuando hay
caché de estados.
**Decisión:** se agregan ample sets estáticos: un paso "seguro" (independiente de todo lo futuro de
los demás hilos) se explora solo. Para saber si un acceso está protegido se calcula un
**must-lockset** por instrucción (análisis de flujo de datos con intersección en las uniones).
Se respeta la condición de ciclo C3.
**Consecuencias:** en "Hilos independientes" se pasa de 6 859 a 55 estados. Un test verifica en
todos los ejemplos que con y sin POR se encuentran los mismos errores y resultados. En ejemplos muy
sincronizados el ahorro es pequeño (el mutex ya ordena todo), y Telar lo muestra con honestidad.

### D10. Traza mínima con BFS sobre el grafo explorado

**Decisión:** el DFS guarda el grafo de estados; luego un BFS da el camino más corto a cada estado
con error. Para races se re-verifica la traza corta; si no reproduce la race, se usa la del DFS.
**Consecuencias:** el deadlock clásico se muestra en 2 pasos, la race del contador en 3. "Más
corta" significa _más corta dentro del espacio explorado_ (con POR activado).

### D11. "Ahorro de POR" medido de verdad

**Decisión:** por defecto se explora dos veces (con y sin POR) y se muestran ambos números. Se
puede desactivar en Opciones.
**Consecuencias:** el doble de trabajo, pero los números del panel son reales y no estimados.

### D12. Monaco empaquetado localmente, solo con lo necesario

**Contexto:** `@monaco-editor/react` carga Monaco desde un CDN por defecto (no funciona offline).
**Decisión:** se importa `monaco-editor/editor/editor.api` más las contribuciones usadas (buscar,
plegado, hover, comentarios…) y el lenguaje C++; se configura `loader.config({ monaco })`. El
lenguaje TelarC se define con Monarch y hay dos temas (claro/oscuro).
**Consecuencias:** funciona offline. El chunk pesa ~3 MB (840 kB gzip) y se carga _lazy_ solo en el
verificador; se subió el aviso de tamaño de chunk y el límite de precache del service worker.
_Actualización (rendimiento):_ ahora se carga con el patrón _facade_ (ver D20).

### D13. Router propio por hash (`#/ruta`)

**Contexto:** GitHub Pages no reescribe rutas a `index.html` (un refresh en `/aprende` daría 404).
**Decisión:** router mínimo con `useSyncExternalStore` sobre `location.hash`.
**Consecuencias:** sin dependencias extra, funciona en Pages y offline. Las URLs llevan `#`.

### D14. i18n propia y tipada

**Decisión:** diccionarios `es.ts`/`en.ts`; el tipo de `en` es `Record<keyof typeof es, string>`,
así que TypeScript falla si falta una traducción. El núcleo devuelve mensajes bilingües
(`{ es, en }`).
**Consecuencias:** cero dependencias, 2 idiomas completos en la interfaz. El **contenido del curso**
está solo en español (es para el curso de UTEC); en inglés se muestra un aviso. El formato JSON
permite agregar traducciones después.

### D15. Contenido del curso en JSON (no MDX)

**Decisión:** lecciones, preguntas y simulacros en JSON con un esquema TypeScript
(`schema.ts`) y un renderizador de markdown mínimo propio (sin `innerHTML`).
**Consecuencias:** el contenido se valida con tests (5 preguntas por lección, exactamente una
correcta, explicación por opción, el ejemplo de "Abrir en Telar" existe, 15 preguntas en el
simulacro…). Se puede generar o editar con cualquier herramienta. Las posiciones de las respuestas
correctas se balancearon para que no estén siempre en la misma letra.

### D16. Progreso en `localStorage` con Zustand `persist`

**Decisión:** lecciones vistas (se marca al llegar al resumen final), respuestas por pregunta
(último intento) y mejor nota del simulacro. Nota vigesimal (0–20), aprobado con 11.
**Consecuencias:** sin backend ni cuentas; el progreso es por navegador. Hay un botón para borrarlo.

### D17. Estilo: Tailwind v4 + tokens CSS

**Decisión:** colores como variables CSS (`--accent`, `--t0…t5` para hilos) con valores distintos en
`.dark`; utilidades `.glass`, `.glow-border`, `.text-gradient`. Fuentes autoalojadas con
`@fontsource` (Bricolage Grotesque para títulos, Inter para texto, JetBrains Mono para código).
**Consecuencias:** las fuentes funcionan offline (no Google Fonts). `prefers-reduced-motion`
desactiva todas las animaciones, incluidas las luces del fondo.
_Actualización (rendimiento):_ el vidrio ya no usa `backdrop-filter` en todas las tarjetas (ver D21).

### D18. Despliegue en GitHub Pages con GitHub Actions

**Decisión:** un workflow `ci.yml`: lint, formato, tipos, tests + cobertura (umbral 80%), build y
Playwright en cada push; en `main` sube `dist/` y despliega con `actions/deploy-pages`.
`base` de Vite = `/progra3-estudio/` en build y preview.
**Consecuencias:** cada push a `main` publica una versión verificada. Activar Pages requiere una vez
_Settings → Pages → Source: GitHub Actions_ (el token del workflow no tiene permiso para crearlo).

### D19. Nombre del repositorio

**Decisión:** el proyecto vive en el repo existente `progra3-estudio` (creado para esto); la app se
llama **Telar**.
**Consecuencias:** la URL pública es `https://indira-yabar-s.github.io/progra3-estudio/`. Si se
renombra el repo, basta cambiar `BASE_PATH` (variable de entorno) o el valor por defecto en
`vite.config.ts`.

---

### D20. Monaco con patrón _facade_

**Contexto:** el verificador tenía Lighthouse móvil 50–58, porque Monaco (~840 kB gzip) bloqueaba el
hilo principal al entrar (TBT ~700–1 200 ms, LCP ~8 s).
**Decisión:** al entrar se muestra el código real resaltado, con la misma fuente y alto de línea.
Monaco se carga recién al hacer clic o escribir en el editor, o al pulsar Verificar. El Web Worker
se crea recién al verificar.
**Consecuencias:** Lighthouse 95–96 y peso inicial de 272 KiB. La primera interacción con el editor
espera la carga de Monaco, que el service worker ya dejó en caché (casi instantánea después de la
primera visita).

### D21. Fondo y vidrio pensados para la GPU

**Contexto:** con CPU 4× más lenta, la app iba a ~31 FPS **en reposo**. La causa eran las manchas
con `filter: blur(80px)` animadas y el `backdrop-filter: blur(18px)` de ~40 tarjetas.
**Decisión:** el fondo usa `radial-gradient` estáticos en su propia capa. Solo tres luces dentro del
hero animan `transform`/`opacity`, y se pausan si el hero pasa bajo la cabecera o si la pestaña se
oculta. El `backdrop-filter` (10 px) quedó solo en la cabecera, el reproductor fijo y el aviso de
la PWA.
**Consecuencias:** 60 FPS con 0% de frames lentos en todas las rutas. El aspecto se mantiene,
porque sobre gradientes suaves el blur casi no se notaba. Detalle en
[`rendimiento.md`](rendimiento.md).

### D22. Modo ligero automático

**Decisión:** el interruptor "Modo ligero" (sin blur ni luces animadas) se activa solo en la primera
visita si `navigator.hardwareConcurrency <= 4` o `prefers-reduced-motion`. Se guarda en
`localStorage` y se aplica antes de pintar.
**Consecuencias:** los equipos modestos reciben la versión más liviana sin configurar nada. Un
equipo de 4 núcleos rápido también entra en modo ligero, pero el usuario puede desactivarlo con un
clic.

## Limitaciones conocidas

- Solo variables `int` y `bool` (sin arreglos, punteros ni funciones definidas por el usuario).
- No hay `std::atomic` ni órdenes de memoria débiles: el modelo es **consistencia secuencial** (más
  fuerte que el modelo real de C++); las data races se detectan igual por HB.
- Los asserts finales se evalúan con todos los hilos terminados (equivale a hacer `join` de todos).
- Las races se detectan sobre los caminos explorados (ver D8).
- El árbol de estados dibuja como máximo 2 500 nodos.
