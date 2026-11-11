# Proyecto: Heatmap Acuarela sobre Dibujos para Colorear

## Objetivo

Construye una aplicación web de visualización de datos que funcione con **cualquier dibujo de líneas** (estilo libro para colorear). El usuario carga un dibujo (el elemento base), el programa detecta sus zonas cerradas, el usuario elige y nombra las zonas, carga un CSV de registros y cada registro se dibuja como un **punto con efecto de acuarela** colocado en una **posición aleatoria dentro de su zona**, con un color que depende de su valor. La superposición de puntos debe producir un efecto de mapa de calor.

## Stack

- Vite + TypeScript, sin framework pesado (vanilla o Preact si hace falta UI).
- Render con Canvas 2D (offscreen canvas para máscaras y capas).
- PapaParse para leer el CSV.
- Sin backend: todo corre en el navegador. La configuración se guarda y se carga como JSON.

## Flujo de uso

1. **Cargar dibujo**: PNG, JPG o SVG de líneas negras sobre fondo blanco.
2. **Detección de zonas**: se detectan automáticamente todas las regiones cerradas.
3. **Selección de zonas**: el usuario hace clic en las zonas para seleccionarlas, nombrarlas (ej. `cabeza`, `ala_izq`) y opcionalmente agrupar varias regiones bajo un mismo nombre. Las zonas no seleccionadas se ignoran.
4. **Guardar/cargar configuración** del dibujo (`<dibujo>.zones.json`) para reutilizarla.
5. **Cargar CSV** de registros.
6. **Render**: puntos de acuarela dentro de sus zonas, con las líneas del dibujo encima.
7. **Explorar**: tooltip con hover, filtros y leyenda.
8. **Exportar** PNG en alta resolución.

## Requisitos detallados

### 1. Carga del dibujo
- Rasterizar cualquier formato a un canvas de trabajo (máx. ~2000 px del lado mayor, conservando la proporción).
- Binarizar con un umbral configurable (slider) para separar líneas del fondo.
- Opción de **engrosar líneas** (dilatación de 1 a 3 px) para cerrar huecos pequeños y evitar que zonas se "fuguen" entre sí.
- Si el SVG trae cada parte como un `<path>` independiente, ofrecer usar los paths directamente como zonas (con `Path2D` + `isPointInPath`).

### 2. Detección de zonas
- Etiquetado de componentes conexos (connected components, 4-conectividad) sobre los píxeles de fondo.
- Descartar la región exterior (la que toca el borde de la imagen) y las regiones menores a un área mínima configurable.
- Guardar cada zona como máscara (`Uint8Array` o bitmap), con su bounding box y su lista de píxeles válidos.
- Mostrar las zonas detectadas con un color pastel distinto al pasar el mouse.

### 3. Selección y nombrado de zonas
- Clic sobre una zona: seleccionarla y pedir un nombre (input inline).
- Shift + clic: agregar regiones a una zona existente (agrupar).
- Panel lateral con la lista de zonas: renombrar, eliminar y ver el conteo de registros asignados.
- Exportar e importar la configuración en JSON:

```json
{
  "drawing": "mariposa.png",
  "width": 1600,
  "height": 1200,
  "threshold": 128,
  "dilate": 1,
  "zones": [
    { "name": "ala_izq", "seedPoints": [[420, 510]] },
    { "name": "cabeza", "seedPoints": [[800, 300], [812, 340]] }
  ]
}
```

Guarda **puntos semilla** (no máscaras) para que el JSON sea ligero. Al cargarlo, las zonas se reconstruyen a partir de esas semillas.

### 4. Datos de entrada (CSV)

Columnas mínimas: `id`, `zona` y `valor`. Las columnas extra se muestran en el tooltip.

```csv
id,zona,valor,fecha,categoria
ALA_IZQ-ENC01-20261015-R001-K7,ala_izq,0.82,2026-10-15,encuesta
CABEZA-ENC01-20261015-R002-M3,cabeza,0.31,2026-10-15,encuesta
```

- `valor` es numérico. Se normaliza a [0, 1] usando el mínimo y máximo del dataset, o con un rango fijo configurable.
- Registros con una zona inexistente: reportarlos en un panel de advertencias y no dibujarlos.

### 5. Convención de IDs (el ID contiene la información)

Formato: `ZONA-CATEGORIA-YYYYMMDD-RNNN-CC`

- `ZONA`: nombre de la zona en mayúsculas.
- `CATEGORIA`: código corto del origen del dato (encuesta, lote, etc.).
- `YYYYMMDD`: fecha.
- `RNNN`: número de registro.
- `CC`: checksum de 2 caracteres (por ejemplo, un hash corto de las partes anteriores) para detectar errores de captura.

Implementa:
- `parseId(id)`: devuelve un objeto con las partes y si el checksum es válido.
- `generateId(parts)`: genera IDs nuevos con su checksum.
- Si el CSV no trae `id`, generarlo automáticamente.
- Si la zona codificada en el ID no coincide con la columna `zona`, mostrar una advertencia.

### 6. Colocación aleatoria dentro de la zona
- Elegir posiciones aleatorias solo entre los píxeles válidos de la máscara de la zona, respetando un margen interno (erosión) para que el centro del punto no quede pegado a la línea.
- Dos modos (toggle):
  - **Aleatorio puro**: permite aglomeraciones, lo que da un look orgánico.
  - **Poisson disk sampling** (algoritmo de Bridson) restringido a la máscara: distribución pareja.
- **Semilla aleatoria** configurable (PRNG con seed, por ejemplo mulberry32) para que el mismo dataset produzca siempre la misma imagen. Botón "re-sembrar".
- La posición de cada registro debe ser estable: deriva la semilla de cada punto de su `id`, para que agregar registros no mueva los existentes.

### 7. Render de acuarela (lo más importante visualmente)

Cada punto se pinta como una mancha de acuarela:
1. Polígono base: un círculo de N vértices (~10).
2. Deformación recursiva: subdividir las aristas e insertar puntos medios desplazados con ruido gaussiano (3 a 5 niveles).
3. Dibujar de 20 a 40 capas del polígono, cada una con una variación aleatoria extra y una opacidad de 3–6%.
4. Aplicar `globalCompositeOperation = 'multiply'` para que las manchas se oscurezcan al superponerse como pigmento real. Esto genera el mapa de calor de forma natural.
5. Agregar un borde ligeramente más oscuro (acumulación de pigmento en la orilla), hecho con algunas capas finales de menor radio inverso o con stroke de baja opacidad.

Parámetros configurables: radio base, número de capas, opacidad, nivel de deformación y "humedad" (difuminado).

- **Recorte**: la pintura se recorta (clip) con la máscara de su zona. Agrega un slider de "sangrado" (0–4 px de dilatación de la máscara) para permitir que se salga un poco.
- **Textura de papel**: un fondo con ruido sutil (grano) y el color crema (`#FAF6EE`) de base.
- **Líneas encima**: dibujar las líneas originales del dibujo al final, en una capa superior.

### 8. Paleta de color
- Escala continua de pigmentos para `valor` normalizado: índigo `#2E3A6B` → turquesa `#3E8E8A` → ocre `#D9A441` → carmín `#B23A48`.
- Interpolar en el espacio OKLCH o LAB (no RGB) para que las transiciones se vean naturales.
- Ofrecer 2 o 3 paletas alternativas y la opción de definir una propia.

### 9. Interacción
- **Hover sobre un punto**: tooltip con el ID decodificado (cada parte etiquetada), la zona, el valor y las columnas extra.
- **Filtros**: por zona, por rango de valor y por prefijo de ID.
- **Leyenda**: un gradiente dibujado como una pincelada de acuarela, con los valores mínimo y máximo.
- Para el hit-testing, usa un índice espacial simple (grid) sobre los centros de los puntos.

### 10. Exportación
- PNG a 1x, 2x y 4x. Re-renderiza a mayor resolución; no escales la imagen.
- Exportar un CSV con las coordenadas finales de cada punto (`id, zona, valor, x, y`).

## Estructura sugerida

```
src/
  main.ts
  io/          loadDrawing.ts, loadCsv.ts, zonesConfig.ts
  zones/       binarize.ts, morphology.ts, connectedComponents.ts, zoneMask.ts
  sampling/    prng.ts, randomInMask.ts, poissonInMask.ts
  render/      watercolor.ts, paper.ts, palette.ts, compose.ts, legend.ts
  ids/         idCodec.ts
  ui/          zonePanel.ts, tooltip.ts, filters.ts, controls.ts
public/samples/
  mariposa.png, datos_ejemplo.csv, mariposa.zones.json
```

## Datos y dibujo de ejemplo

Genera un dibujo de prueba simple (por ejemplo, una mariposa o una flor de líneas negras con 6 a 10 zonas cerradas) y un CSV con unos 300 registros distribuidos de forma desigual entre las zonas y con valores variados. Así el efecto de mapa de calor se nota desde el primer render.

## Orden de trabajo (milestones)

1. Cargar dibujo, binarizar y detectar zonas, con visualización de zonas al hacer hover.
2. Seleccionar y nombrar zonas, y guardar/cargar el JSON.
3. Cargar el CSV, el codec de IDs y el panel de advertencias.
4. Colocación aleatoria con seed (ambos modos).
5. Render de acuarela, recorte, papel y líneas encima.
6. Tooltip, filtros y leyenda.
7. Exportación PNG y CSV.

Al terminar cada milestone, verifica en el navegador que funcione antes de continuar.

## Criterios de aceptación
- Funciona con cualquier dibujo de líneas cerradas, no solo con el de ejemplo.
- El mismo dataset con la misma seed produce exactamente la misma imagen.
- Agregar un registro nuevo no mueve los puntos existentes.
- La pintura nunca invade otras zonas (salvo el sangrado configurado).
- Donde hay más puntos, el color se ve más intenso (efecto heatmap por multiply).
- El render de unos 1000 puntos tarda menos de 3 segundos.
- El tooltip muestra el ID decodificado y valida el checksum.
