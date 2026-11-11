# Heatmap acuarela sobre dibujos para colorear

Visualización de datos en el navegador: cargas un dibujo de líneas, el programa
detecta sus zonas cerradas, cargas un CSV y cada registro —una persona— se pinta
como una mancha de acuarela dentro de su zona. Al superponerse en `multiply`, las manchas
se oscurecen como pigmento real y aparece el mapa de calor.

Son dos pantallas con ciclos de vida distintos. **El mural** (`/`) es la
página pública: la ilustración y el recuadro para sumar personas. **El studio**
(`/studio`) es el laboratorio interno, con todos los parámetros, donde se
afina cómo se mapean los datos a la acuarela.

Astro, sitio estático: el HTML se prerenderiza y el motor de acuarela corre
entero en el navegador. El backend (Supabase) todavía no está conectado; hoy
los registros viven en `localStorage`.

## Arrancar

```bash
npm install
npm run dev      # http://localhost:4321  (/ el mural, /studio el laboratorio)
npm run build    # astro build -> dist/
npm run check    # astro check (typecheck de .astro y .ts)
```

Botón **Ejemplo (flor)**: carga el mandala de `public/samples/`, crea 12 zonas
automáticas y pinta las 295 personas del CSV de ejemplo de un solo clic. Los
datos de ejemplo son ficticios y están generados al azar.

## Flujo

1. **1 · Dibujo** — carga PNG/JPG/SVG. Se rasteriza a un canvas de trabajo
   (lado mayor ≤ 2000 px). Los sliders de *umbral*, *engrosar líneas*,
   *área mínima* y *margen interno* vuelven a detectar al soltarlos, conservando
   las zonas ya nombradas (se reconstruyen desde sus semillas).
2. **2 · Zonas** — clic en una región para crear una zona; **shift+clic** la
   agrega a la zona seleccionada (y shift+clic de nuevo la quita). *Auto-zonas*
   toma las N regiones más grandes. Exporta/importa `<dibujo>.zones.json`.
3. **3 · Datos** — CSV con `id`, `zona`, `valor` y los campos de la persona:
   `nombre`, `edad`, `ocupacion`, `lugar_origen`, `estado_animo`, `mensaje`
   ("qué te gustaría decir") y `fecha`. Cualquier columna extra también aparece
   en el tooltip. El `valor` se normaliza con el mín/máx del dataset o con un
   rango fijo configurable.
4. **4 · Personas** — recuadro para registrar a alguien nuevo (los mismos
   campos, con la fecha de hoy por defecto; *Al azar* los completa y *Generar*
   agrega N personas sorteadas), buscador por nombre —al elegir un resultado la
   vista salta al render, marca su mancha con un círculo y muestra su ficha— y
   el enlace a la pantalla de registro.
5. **5 · Colocación** — *aleatorio puro* u *Poisson disk*, con semilla global
   y botón de re-sembrar.
6. **6 · Acuarela** — radio, capas, opacidad, deformación, humedad, borde,
   sangrado, grano del papel, 4 paletas + paleta propia, y la capa de líneas.
7. **7 · Filtros** — por zona, por rango de valor y por prefijo de ID.
8. **8 · Advertencias** — agrupadas por tipo (zona inexistente, checksum
   inválido, zona del ID que no coincide, valor no numérico, id generado).
9. **9 · Exportar** — PNG 1x/2x/4x (re-renderizado real, no escalado) y CSV con
   las coordenadas finales (`id, zona, valor, x, y`).

## El mural (`/`)

La pantalla para mostrar o dejar en un puesto: la ilustración a pantalla
completa y, arriba a la derecha, dos iconos —lupa y persona+— que abren su
recuadro. Mientras están cerrados no se ve nada más que el mural. Se abre uno
por vez, el mismo icono lo cierra y `Esc` también.

- **Registrar** (persona+): los siete campos, con la fecha de hoy por defecto.
  Al sumar, el mural se vuelve a pintar, la mancha nueva queda marcada con un
  círculo, aparece el agradecimiento por nombre abajo y el recuadro se cierra
  solo para dejarla a la vista. La zona se sortea entre los pétalos, así que no
  hay nada que elegir.
- **Buscar** (lupa): por nombre, sin importar acentos ni mayúsculas. Al elegir
  un resultado se marca su mancha y se abre su ficha.

Carga sola el mural de ejemplo (`flor.png` + `flor.zones.json` +
`datos_ejemplo.csv`) y el resto de los parámetros quedan fijos en los mismos
valores por defecto de la app completa. Pasando el mouse por cualquier mancha
aparece la ficha de esa persona.

### Los datos no salen del dispositivo

No hay backend ni base: `public/samples/datos_ejemplo.csv` es de **solo
lectura** y nunca se modifica. Lo que se registra en esta pantalla se guarda en
el `localStorage` del navegador (`mural.personas.v1`, ver `src/data/repo/localRepo.ts`)
y se pinta junto a las personas del CSV de ejemplo. Es por navegador y por
dispositivo: no se comparte ni se sube a ningún lado.

Como el navegador puede borrar sus datos, el recuadro de registro trae abajo un
bloque con la copia local:

- **Descargar copia** — baja un CSV con las personas registradas en este
  dispositivo, con las mismas columnas que `datos_ejemplo.csv` (`id, zona,
  valor, nombre, edad, ocupacion, lugar_origen, estado_animo, mensaje, fecha`).
  Sirve de respaldo, para pasar a otra máquina y para cargarlo después en un
  servicio gestionado.
- **Importar copia** — vuelve a cargar ese CSV (o el JSON interno). Los ids
  repetidos se omiten, así reimportar no duplica a nadie.
- **Borrar mis registros** — vacía lo guardado en este dispositivo; pide un
  segundo toque para confirmar. No toca el CSV de ejemplo.

En modo privado, o si el navegador no deja escribir, el mural sigue andando y
el recuadro avisa que conviene bajar una copia antes de cerrar.

## El ánimo es el color

`estado_animo` toma uno de nueve valores (`radiante`, `contento`, `esperanzado`,
`tranquilo`, `pensativo`, `nostálgico`, `cansado`, `inquieto`, `triste`) y cada
uno tiene un `valor` base en `[0,1]` con un jitter determinista derivado del ID
(`src/data/person.ts`). Por eso el mapa de calor se lee como un mapa de ánimos,
y dos personas igual de contentas no pintan exactamente del mismo color. Si el
CSV trae su propia columna `valor`, se respeta tal cual.

## Convención de IDs

`ZONA-CATEGORIA-YYYYMMDD-RNNN-CC`, p. ej. `ZONA06-PERSONA-20261016-R296-M2`.
Las personas registradas desde el panel usan la categoría `PERSONA` y un `RNNN`
mayor al último en uso, así nunca pisan un ID existente.

`CC` es un checksum de 2 caracteres base36 derivado (FNV-1a) de las partes
anteriores. `src/ids/idCodec.ts` expone `parseId` y `generateId`; si el CSV no
trae `id`, se genera uno y se reporta en advertencias.

## Cómo está hecho

- **Detección de zonas** — binarización por luminancia (respetando alfa) →
  dilatación opcional para cerrar huecos → transformada de distancia euclidiana
  exacta (Felzenszwalb–Huttenlocher) → etiquetado de componentes conexos por
  flood fill de scanline sobre el fondo. Se descarta la región exterior (la que
  toca el borde) y las menores al área mínima.
- **Semillas estables** — de cada región se guarda su píxel más interior (mayor
  distancia a la tinta). Por eso el `.zones.json` pesa menos de 1 KB y sobrevive
  a cambios de umbral o de resolución del dibujo.
- **Margen interno** — los centros de las manchas solo se colocan en píxeles con
  `distancia a la tinta >= margen`, así ninguna queda pegada a la línea.
- **Posición estable por registro** — la semilla del PRNG (mulberry32) de cada
  punto sale del hash de su `id`, no de su orden en el CSV: agregar registros no
  mueve los existentes.
- **Recorte por zona** — cada zona se pinta en su propia capa, se recorta con
  `destination-in` contra su máscara (dilatada por el *sangrado*) y se compone
  sobre el papel en `multiply`.
- **Manchas** — polígono base de 8-12 vértices, subdividido 3-5 niveles
  insertando puntos medios desplazados con ruido gaussiano perpendicular; luego
  N capas translúcidas de unas pocas variantes del polígono, más strokes de
  borde para el pigmento acumulado en la orilla.
- **Color** — rampa de 256 pasos interpolada en OKLab, no en RGB.

## Verificado en el navegador

| Criterio | Resultado |
|---|---|
| Misma semilla → misma imagen | idéntico `toDataURL()` entre renders |
| Agregar un registro no mueve los existentes | 0 puntos desplazados |
| La pintura no invade otras zonas | 0/1000 puntos fuera de su máscara |
| 1000 puntos en menos de 3 s | 176 ms (colocación + render) |
| Export PNG 4x | 2960×2960 en 406 ms |
| Tooltip con ID decodificado y checksum | validado |
| Registrar una persona y encontrarla por nombre | 301 registros, 301 IDs únicos |
| Refactor a `core/scene.ts` no mueve nada | mismas posiciones antes y después |
| Alta en el mural sobrevive a recargar | 2 altas, 2 IDs únicos, 297 manchas |
| Descargar copia e importarla de vuelta | CSV con las 10 columnas del dataset; 1 de 3 sumado, repetidos omitidos |
| Borrar mis registros (dos toques) | 297 → 295 manchas, `localStorage` en `[]` |
| Iconos: uno abierto por vez, `Esc` cierra | verificado |

## Estructura

Tres capas con dependencias en un solo sentido: `core` no conoce a nadie,
`io`/`data` conocen a `core`, y las pantallas conocen a todos. Lo que importa
para el futuro es que **solo `src/mural/` migra** si cambia el framework.

```
astro.config.mjs     sitio estático, sin adapter
src/
  pages/             index.astro (el mural) · studio.astro (el laboratorio)
  layouts/Base.astro la cáscara HTML compartida

  core/              EL MOTOR · cero DOM · cero framework · cero fetch
    types/           dataset · zone · placement · render · warning
    platform/        surface  ← el único punto del núcleo que crea un lienzo
    zones/           binarize · morphology · connectedComponents · zoneMask
    sampling/        prng · grid · randomInMask · poissonInMask
    render/          watercolor · paper · palette · compose · legend
    ids/             idCodec
    scene.ts         detectar, reconstruir zonas y colocar registros

  io/                navegador, no framework
    readers/         drawing (PNG/JPG/SVG) · csv
    writers/         csv (salida) · download
    zonesConfig.ts   construir y leer el `.zones.json`

  data/              el dominio de la encuesta
    person.ts        campos, ánimos y generador aleatorio
    repo/localRepo   las altas de este dispositivo (localStorage)

  ui/                widgets vanilla: controls · zonePanel · tooltip ·
                     filters · personPanel · registroForm · blob
  mural/             LA PÁGINA PÚBLICA — lo único que migraría
  studio/            EL LABORATORIO — se queda en TypeScript vanilla
  styles/app.css     tokens del tema y clases de componente

public/samples/      flor.png · datos_ejemplo.csv · flor.zones.json
```

Los imports entre capas van por alias (`@core/*`, `@io/*`, `@data/*`,
`@ui/*`); dentro de `core/` son relativos. Así, mover el núcleo a su propio
paquete más adelante es cambiar el mapeo en `tsconfig.json` y nada más.

En desarrollo, `window.__heatmap` expone el estado y las funciones principales
para inspeccionar o automatizar desde la consola.
