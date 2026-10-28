# Rendimiento

Registro de la optimización de rendimiento de Telar: qué se midió, qué se cambió y cuál fue el
resultado. Todas las mediciones se hicieron sobre el **build de producción** (`npm run build` +
`npm run preview`), no sobre el servidor de desarrollo.

## Cómo se midió

### Lighthouse (modo móvil)

- Lighthouse 13.6 por línea de comandos, `--form-factor=mobile`, categoría _Performance_,
  con la simulación de red y CPU de Lighthouse (equivalente a un celular de gama media con 4G).
- Chromium headless. Cada ruta se midió **2–3 veces** y se informa el rango.
- El modo ligero se activa solo en equipos con ≤ 4 núcleos, y la máquina de medición tiene
  4 núcleos. Por eso la portada se midió dos veces: **visita nueva** (modo ligero automático) y
  **modo normal forzado** (perfil de Chrome con `lite: false` guardado en `localStorage`).

### Fluidez (FPS)

Lighthouse mide la carga, pero no el _lag_ al hacer scroll. Para eso hay un benchmark propio con
Playwright:

- Pantalla de celular (390×844, `deviceScaleFactor` 2) y **CPU 4 veces más lenta**
  (`Emulation.setCPUThrottlingRate`).
- Se cuentan los frames con `requestAnimationFrame` durante 3 s **en reposo** y 3 s **haciendo
  scroll** (14 px por frame).
- _Jank_ = porcentaje de frames que tardan más de 25 ms (menos de 40 FPS).

## Resultados

### Lighthouse Performance (móvil)

| Ruta                                   |  Antes |   Después |
| -------------------------------------- | -----: | --------: |
| **Portada** `#/` (visita nueva)        | 94–100 |   **100** |
| **Portada** `#/` (modo normal forzado) |      — |   **100** |
| **Verificador** `#/verificador`        |  50–58 | **95–96** |
| Aprende `#/aprende`                    |     95 | **95–96** |
| Lección `#/aprende/concurrencia/mutex` |     95 | **95–96** |

Métricas clave del verificador (antes → después): **LCP 8.0–8.6 s → 2.8–2.9 s**,
**TBT 670–1 190 ms → 10–70 ms**, peso de la página **1 103 KiB → 272 KiB**.
En Aprende el **CLS bajó de 0.058 a 0**, gracias a los skeletons con la misma geometría que la
página real.

### Fluidez con CPU 4× más lenta

| Ruta                    | Antes (reposo / scroll)   | Después, modo normal      | Después, modo ligero |
| ----------------------- | ------------------------- | ------------------------- | -------------------- |
| Portada                 | 32 / 31 FPS · 81–87% jank | **60 / 60 FPS · 0% jank** | **60 / 60 FPS · 0%** |
| Aprende                 | 32 / 27 FPS · 82–94% jank | **60 / 60 FPS · 0%**      | —                    |
| Lección                 | 31 / 32 FPS · 85–89% jank | **60 / 60 FPS · 0%**      | —                    |
| Verificador (con traza) | 31 / 32 FPS · 76–78% jank | **60 / 60 FPS · 0%**      | **60 / 60 FPS · 0%** |

Antes de optimizar, la página iba a ~31 FPS **incluso sin tocar nada**. Eso mostraba que el
problema era el fondo animado, no el contenido.

## Qué causaba el lag

1. **Manchas de luz con `filter: blur(80px)` animadas.** Tres círculos de casi media pantalla, con
   blur, moviéndose sin parar. Un blur grande se recalcula en cada frame: el navegador repintaba
   toda la pantalla 60 veces por segundo.
2. **`backdrop-filter: blur(18px)` en todas las tarjetas** (unas 40 por página). Cada tarjeta
   desenfoca lo que tiene detrás, y como el fondo se movía, había que volver a desenfocar todo en
   cada frame.

## Qué se cambió

### 1. Fondo sin blur, en su propia capa

- Las manchas ahora son `radial-gradient` con borde suave. Se ven igual, porque el degradado ya es
  difuso, pero **no usan `filter`**.
- El fondo es **estático** y vive en su propia capa del compositor (`will-change: transform`,
  `transform: translateZ(0)`, `contain: strict`): hacer scroll no lo repinta.
- Lo único animado son tres luces **dentro del hero de la portada**. Animan **solo `transform` y
  `opacity`**, cada una en su capa (`will-change`). Así la GPU las mueve sin repintar.

### 2. `backdrop-filter` solo donde aporta

- `.glass` ya **no** lleva `backdrop-filter`: sobre un fondo de gradientes suaves, el blur no se
  notaba.
- El blur real (`.glass-blur`, **10 px**) quedó solo en 3 elementos flotantes: la **cabecera**, el
  **reproductor fijo** de trazas y el **aviso de la PWA**.
- Las luces del hero **se pausan** cuando el hero pasa por debajo de la cabecera (lo detecta un
  `IntersectionObserver` sobre un centinela de 1 px). Así nunca hay un blur sobre algo que se
  mueve.

### 3. Animaciones pausadas con la pestaña oculta

Con `visibilitychange`, se agrega la clase `tab-hidden` al `<html>`, que pone
`animation-play-state: paused` a todo.

### 4. Modo ligero

- Es un botón con una pluma en la cabecera. Quita todo el blur y las luces del hero, y vuelve la
  cabecera casi opaca para que siga legible.
- **Se activa solo** en la primera visita si `navigator.hardwareConcurrency <= 4` o si el sistema
  pide `prefers-reduced-motion`. La decisión se guarda en `localStorage` (`telar:settings`) y el
  usuario la puede cambiar.
- Se aplica **antes de pintar** (script en `index.html`), así no hay un destello del modo normal.

### 5. Code splitting y carga diferida

- La portada solo descarga React, la app base y las fuentes: **~240 KiB en total**. Un test e2e
  (`e2e/performance.spec.ts`) verifica que **no** pide `CodeEditor`, `VerifierPage`,
  `verifier.worker` ni `editor.worker`.
- El verificador y Aprende se cargan con `React.lazy` + `Suspense`. Cada módulo declara su
  **skeleton** en `registry.ts`, con la misma geometría que la página real (por eso el CLS es 0).
- **Monaco (~840 kB gzip) se carga con el patrón _facade_.** Al entrar al verificador se muestra
  el código real resaltado, con la misma fuente y alto de línea. Monaco se descarga recién al hacer
  clic en el editor, al escribir o al pulsar **Verificar**. El service worker igual lo deja en
  caché en segundo plano (precache), así que activarlo después es casi instantáneo y funciona
  offline.
- El **Web Worker** del verificador se crea recién al pulsar Verificar.

### 6. Bundle

- Se agregó `rollup-plugin-visualizer`: `npm run analyze` genera `stats/bundle.html` (treemap) y
  `stats/bundle.json`.
- Tamaños (gzip) del bundle inicial: `react-dom` ~99 KiB (sumado por módulo), iconos `lucide-react`
  ~8 KiB (con tree-shaking, solo los usados) y el código de la app ~10 KiB. Monaco va en su propio
  chunk diferido.
- Se eliminaron las dependencias que no se usaban: `@testing-library/react` y `jsdom`.
- Monaco se importa desde `editor.api` con solo las contribuciones necesarias, no desde
  `editor.main` (que trae más de 80 lenguajes). Recortar más contribuciones ahorraría menos del 5%,
  porque el resto es el núcleo del editor.

## Cómo reproducir las mediciones

```bash
npm run build
```

```bash
npm run preview
```

```bash
npx lighthouse "http://localhost:4173/progra3-estudio/#/" --form-factor=mobile --only-categories=performance --view
```

```bash
npm run analyze
```

Los FPS se midieron con un script de Playwright: CPU throttling 4× vía CDP y conteo de frames con
`requestAnimationFrame` (ver la sección _Cómo se midió_).

## Límites de la medición

- Son mediciones de laboratorio en `localhost` con la simulación de Lighthouse. En GitHub Pages
  influyen la latencia real y el CDN.
- El benchmark de FPS corre en Chromium headless con rasterizado por software. Es un buen proxy de
  un equipo modesto, pero no reemplaza probar en un celular real.
