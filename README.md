# Mural de acuarela

Visualización de datos en el navegador: un dibujo de líneas, sus zonas cerradas
detectadas automáticamente, y cada registro —una persona— pintado como una
mancha de acuarela dentro de su zona. Al superponerse en `multiply`, las manchas
se oscurecen como pigmento real y aparece el mapa de calor.

**El producto es `index`** (`/`): el mural a pantalla completa, con sus datos
reales en Supabase y dos iconos al pie para sumarse o buscar a alguien.

**La ilustración es `public/Mural/bocetoactualizado.svg`**, la serpiente
emplumada en espiral: es la plantilla sobre la que se trabaja todo. La nombra un
solo módulo (`src/io/plantilla.ts`) del que tiran el mural, el Hero y el studio,
así que reemplazarla por una versión más trabajada del mismo trazo es cambiar el
archivo; mientras el trazo pase por donde pasaba, las semillas de su
`.zones.json` lo vuelven a encontrar. Se carga como SVG y el motor la rasteriza
al vuelo a un lienzo de 1918×2000.

Este boceto **todavía no cierra ninguna región**, así que no hay huecos que
delimitar: su `.zones.json` trae `close: 24` y las zonas salen del **relleno del
propio trazo** (ver *Dibujo sin cerrar*, más abajo). El boceto anterior sigue en
la carpeta con su `boceto.zones.json` —22 zonas de verdad, `close: 0`— y no
depende de nada de esto: apuntar `plantilla.ts` de vuelta a él lo devuelve al
aire tal como estaba.

Todo lo demás es banco de pruebas, y existe para una sola cosa: saber cómo queda
`index`. El lector de dibujos y de CSV sirve para entrar cualquier dibujo y
cualquier dataset; y **el studio** (`/studio`) es el laboratorio con los nueve
bloques de parámetros donde se afina cómo se mapean los datos a la acuarela.
Ninguno de los dos es la pantalla que se publica.

Los datos que hay hoy son **simulaciones**: `datos_ejemplo.csv` son 295
registros ficticios con el esquema real, ocupando el lugar de lo que vendrá de
Supabase.

## El stack

- **Astro 7**, sitio estático (`output: 'static'`): las dos páginas se
  prerenderizan como HTML vacío y el motor de acuarela corre entero en el
  navegador. Los `<script>` de los `.astro` son client-only, así que el render
  nunca se ejecuta en el build.
- **Tailwind CSS 4** vía `@tailwindcss/vite`. `src/styles/app.css` es la hoja
  raíz de las dos pantallas.
- **Canvas 2D** para todo el pintado, **PapaParse** para el CSV. Ninguna
  librería de UI: el DOM lo arman módulos TypeScript a mano.
- **Supabase** es la fuente de datos de `index`. **Todavía no está conectada**:
  no hay dependencia ni llamadas en el código. Hoy `index` lee el dataset
  simulado de `public/samples/` y guarda las altas en el `localStorage` del
  dispositivo (ver *Mientras Supabase no esté conectado*).

### Cómo se reparte el CSS

El markup no está en el HTML sino que lo construyen los módulos TS, así que el
escaneo de Tailwind incluye `@source "../**/*.ts"` además de `pages/` y
`layouts/`. Las clases se escriben siempre completas: un `bg-${x}` armado a mano
no lo ve el detector.

Lo estructural —flex, grid, tamaños, espaciado, hovers de un solo elemento— va
como utilidades en el TS que arma el DOM. En `app.css` quedan los tokens del
tema y las clases de componente, que son las que las utilidades no pueden
cubrir: estado conmutado con `classList` (`.btn.primary`, `.hint.ok`,
`.animo.sel`), pseudo-elementos y pseudo-clases de navegador (marcadores de
`<details>`, spinners del `number`), y las clases que se repiten decenas de
veces con el mismo sentido (`.btn`, `.ctl`, `.lbl`, `.txt`, `.panel`, `.tool`).
El ancho al que el kiosco pasa a teléfono vive en un solo lugar, como el
breakpoint `telefono:`.

`src/mural/mural.css` se importa desde `app.css` dentro de la capa
`components`, antes de las utilidades, para que lo inline siga pudiendo
pisarlo.

## Arrancar

```bash
npm install
npm run dev      # http://localhost:4321  (/ el mural, /studio el laboratorio)
npm run build    # astro build -> dist/  (sin /studio)
npm run preview  # sirve dist/
npm run check    # astro check (typecheck de .astro y .ts)
```

`/studio` existe **solo en `astro dev`**. Su pagina vive en
`src/studio/page.astro`, fuera de `src/pages/`, y `astro.config.mjs` inyecta la
ruta unicamente en dev: el build emite `index.html` y nada mas, asi que el
deploy no publica el laboratorio. La escotilla para compilarlo a proposito es
`STUDIO=1 npm run build`.

## El mural (`/`)

La pantalla que se publica: para dejar en un puesto o pasar de mano en mano. No
tiene controles —esos viven en el studio— y sus parámetros de render quedan
fijos en el código: semilla global `1234`, grano `0.5`, sin
sangrado, colocación aleatoria y la capa de líneas encima. Y **sin papel**: la
escena se compone transparente (`paper: false`, con la capa de líneas también
sin fondo) para que la ilustración quede a sangre sobre la página, sin el
recuadro que dibujaba el lienzo opaco. El papel sigue puesto en el studio —que
exporta una lámina acabada— y debajo del fondo del Hero, donde el velo de
cristal necesita algo que desenfocar.

Hoy arranca sola con la plantilla (`Mural/bocetoactualizado.svg` y su
`.zones.json`) y los 295 registros simulados de `datos_ejemplo.csv`.
Ese CSV es el sustituto temporal de la tabla de Supabase; todo lo que sigue en
esta sección es la pantalla de verdad. El `zona` que trae el CSV es caché de un
dibujo anterior: al cargarlo se remapea con la regla vigente, así el banco de
pruebas cae siempre sobre la ilustración que hay puesta.

Arriba no hay nada: la ilustración ocupa todo. Al pie, anclados abajo a la
derecha —y a lo ancho en teléfono, al alcance del pulgar, respetando el área
segura— hay dos iconos, lupa y persona+, que abren su recuadro **hacia arriba**.
Se abre uno por vez, el mismo icono lo cierra y `Esc` también.

### Sumarse: tres preguntas

El alta no es un formulario largo sino tres pasos, cada uno en una pantalla de
teléfono sin scrollear, con sus puntos de progreso arriba:

1. **¿Cómo te llamas?** — nombre (lo único obligatorio), edad, a qué te dedicas
   y de dónde eres. `Enter` avanza igual que el botón *Seguir*.
2. **¿Cómo estás hoy?** — los nueve ánimos en una cuadrícula de 3×3, pero no
   como lista: cada uno es **una mancha pintada con el pincel del mural**, con
   su color de verdad. Se ve de antemano qué va a quedar en el mural.
3. **¿Qué te gustaría decir?** — opcional. Debajo aparecen las frases sugeridas
   del ánimo elegido; un toque las copia al campo.

Al sumar, la tarjeta final trae la mancha en grande —sembrada con el ID, así es
exactamente la que quedó—, el nombre, dónde quedó ("entre los pétalos" si la
zona no tiene nombre propio), el ID completo y dos botones: **Ver mi mancha**,
que cierra el recuadro y deja el agradecimiento sobre el mural mientras la marca
late unos segundos, y **Sumar a otra persona**, que vuelve al paso 1 en blanco.

La zona no se elige: la decide el mapeo. Bajo la regla vigente es un pétalo
cualquiera, sorteado **de forma determinista desde el ID** —no con
`Math.random()`—, así se puede recalcular desde lo guardado.

### Buscar

Por nombre, sin importar acentos ni mayúsculas. Al elegir un resultado se marca
su mancha con un círculo que late y se abre su ficha. Con el mouse, además,
pasar por cualquier mancha muestra la ficha de esa persona.

### Mientras Supabase no esté conectado

El dataset simulado (`public/samples/datos_ejemplo.csv`) es de **solo lectura** y
nunca se modifica. Lo que se registra se guarda en el `localStorage` del
navegador (`mural.personas.v1`, ver `src/data/repo/localRepo.ts`) —las columnas
de la persona y la versión del mapeo que las ubicó— y se pinta junto a los
registros simulados. Es por navegador y por dispositivo: no se
comparte ni se sube a ningún lado, así que el mural de un teléfono no es el del
siguiente. Es exactamente lo que Supabase viene a resolver.

Como el navegador puede borrar sus datos, el recuadro de alta trae al pie un
`<details>` plegado, **Mis registros** —el respaldo es tarea de quien atiende el
puesto, no de quien se registra—:

- **Descargar copia** — baja `mural_registros_<fecha>.csv` con las personas
  registradas en este dispositivo, con las mismas diez columnas que
  `datos_ejemplo.csv` (`id, zona, valor, nombre, edad, ocupacion, lugar_origen,
  estado_animo, mensaje, fecha`). Sirve de respaldo, para pasar a otra máquina y
  para cargarlo después en un servicio gestionado.
- **Importar copia** — vuelve a cargar ese CSV (o el JSON interno). Se omiten
  los ids repetidos y los que ya están en el CSV de ejemplo, así reimportar no
  duplica a nadie.
- **Borrar mis registros** — vacía lo guardado en este dispositivo; pide un
  segundo toque dentro de cinco segundos para confirmar. No toca el CSV de
  ejemplo.

En modo privado, o si el navegador no deja escribir, el mural sigue andando y el
recuadro avisa que conviene bajar una copia antes de cerrar.

## El studio (`/studio`)

El laboratorio: cualquier dibujo, cualquier dataset, todos los parámetros. No se
publica y no es parte del producto; es el banco donde se comprueba el mapeo de
zonas y se afina el render hasta ver cómo va a quedar `index`. Se queda en
TypeScript vanilla.

1. **1 · Dibujo** — carga PNG/JPG/SVG. Se rasteriza a un canvas de trabajo
   (lado mayor ≤ 2000 px). Los sliders de *umbral*, *engrosar líneas*,
   *área mínima* y *margen interno* vuelven a detectar al soltarlos, conservando
   las zonas ya nombradas (se reconstruyen desde sus semillas). El botón
   **Plantilla del mural** carga `Mural/bocetoactualizado.svg` con sus zonas
   —las mismas que ve `index`— y pinta las 295 personas del
   CSV de un solo clic; los datos de ejemplo son ficticios y están generados al
   azar.
2. **2 · Zonas** — clic en una región para crear una zona; **shift+clic** la
   agrega a la zona seleccionada (y shift+clic de nuevo la quita). *Auto-zonas*
   toma las N regiones más grandes. Exporta/importa `<dibujo>.zones.json`.
3. **3 · Datos** — CSV con `id`, `zona`, `valor` y los campos de la persona:
   `nombre`, `edad`, `ocupacion`, `lugar_origen`, `estado_animo`, `mensaje`
   ("qué te gustaría decir") y `fecha`. Cualquier columna extra también aparece
   en el tooltip. El `valor` se normaliza con el mín/máx del dataset o con un
   rango fijo configurable.
4. **4 · Personas** — formulario completo con los siete campos y la zona
   elegible (*Al azar* los completa, *Generar N* agrega varias personas
   sorteadas), buscador por nombre —al elegir un resultado la vista salta al
   render, marca su mancha y muestra su ficha— y el enlace para abrir la
   pantalla de registro.
5. **5 · Colocación** — *aleatorio puro* u *Poisson disk*, con semilla global y
   botón de re-sembrar.
6. **6 · Acuarela** — radio, capas, opacidad, deformación, humedad,
   dispersión, borde, sangrado, grano del papel y la capa de líneas. No hay
   selector de paleta: la tinta es una sola (ver *El carmín es la tinta*).
7. **7 · Filtros** — por zona, por rango de valor y por prefijo de ID.
8. **8 · Advertencias** — agrupadas por tipo (zona inexistente, checksum
   inválido, zona del ID que no coincide, valor no numérico, id generado).
9. **9 · Exportar** — PNG 1x/2x/4x (re-renderizado real, no escalado) y CSV con
   las coordenadas finales (`id, zona, valor, x, y`).

En el studio, `window.__heatmap` expone el estado y las funciones principales
para inspeccionar o automatizar desde la consola.

## El mapeo: de persona a mancha

`src/data/mapping.ts` es el **único lugar** donde se decide la zona y el valor
de alguien. Está aparte del esquema (`@data/person`) y de la persistencia
(`@data/repo/localRepo`) porque es justo lo que va a cambiar cuando estén
delimitados los datos y las zonas definitivas, y el resto del sistema no debería
enterarse. La regla vigente (versión 1) es: la zona es un pétalo cualquiera
sorteado desde el ID, y el valor sale del estado de ánimo.

Tres reglas sostienen que ese cambio no genere conflictos:

- **El ID no dice nada del mapeo.** Lleva el ámbito fijo `REG`, no la zona.
  Remapear a alguien no le cambia la identidad, y de la identidad dependen la
  posición de la mancha, el de-dup al importar copias y el jitter del color.
- **Se persiste la persona, no el resultado.** `zona` y `valor` son cache de la
  regla que los produjo, y se guardan junto a su `MAPPING_VERSION`. El dato de
  origen son las columnas de la persona, y de ahí se recalcula todo.
- **Al cargar, lo viejo se remapea solo** (`remapAll`). Subir `MAPPING_VERSION`
  es todo lo que hace falta para que lo ya registrado se reacomode, sin
  migraciones a mano ni registros con la regla mezclada. También se remapea el
  registro cuya zona ya no existe —porque el dibujo se re-delimitó—: sin eso se
  quedaría sin dónde pintarse y la persona desaparecería del mural. Lo que
  cambia se vuelve a guardar en el acto.

El contexto que recibe el mapeo (`MappingContext`) lleva las zonas como lista,
no como iterador: se recorre varias veces por tanda y un `Map.values()` se agota
en la primera. Cada zona viaja con su espacio útil (`Zone.valid`), porque el
sorteo es **proporcional al espacio**: la plantilla no es un mandala de pétalos
parejos —el cuerpo de la serpiente es cien veces más grande que una pluma— y un
sorteo uniforme apelmazaría las plumas dejando el cuerpo vacío.

## El ánimo es el color

`estado_animo` toma uno de nueve valores (`radiante`, `contento`, `esperanzado`,
`tranquilo`, `pensativo`, `nostalgico`, `cansado`, `inquieto`, `triste`) y cada
uno tiene un `valor` base en `[0,1]` con un jitter determinista derivado del ID
(`src/data/person.ts`). Por eso el mapa de calor se lee como un mapa de ánimos,
y dos personas igual de contentas no pintan exactamente del mismo color. Cada
ánimo trae además sus frases sugeridas, que son las que ofrece el paso 3 del
alta. Si el CSV trae su propia columna `valor`, se respeta tal cual.

## El carmín es la tinta

Una sola familia de color en todo el mural, para que se lea como una sola tinta
aguada y no como un gráfico de colores. Lo que cambia con el valor no es el tono
sino la profundidad: del rosa ceniza más lavado al carmín oscuro, cuatro paradas
en `CARMIN` (`src/core/render/palette.ts`) interpoladas en OKLab, que es lo que
evita que el recorrido pase por un gris sucio intermedio.

Medido sobre las nueve muestras del selector de ánimo: rojo dominante en las
nueve y saturación en degradado parejo, de 59 % en *radiante* a 33 % en *triste*.

No hay selector de paleta, ni paletas alternativas, ni paleta propia: si alguna
vez hace falta otra tinta se cambian esas cuatro paradas y nada más.

## Convención de IDs

`AMBITO-CATEGORIA-YYYYMMDD-RNNN-CC`, p. ej. `REG-PERSONA-20261016-R296-M2`.
Las personas registradas usan el ámbito `REG` (la constante `ID_SCOPE`), la
categoría `PERSONA` y un `RNNN` mayor al último en uso, así nunca pisan un ID
existente.

**El ámbito es opaco y a propósito no lleva la zona**: la zona la decide el
mapeo y puede cambiar, mientras el ID tiene que ser estable. Los IDs históricos
sí la traían ahí (`ZONA06-PERSONA-…`) y siguen siendo válidos: el ámbito entra al
checksum tal como viene escrito, y la advertencia de "zona del ID que no
coincide" solo se evalúa cuando el ámbito es realmente un código de zona
(`scopeIsZone`).

`CC` es un checksum de 2 caracteres base36 derivado (FNV-1a) de las partes
anteriores. `src/core/ids/idCodec.ts` expone `parseId` y `generateId`; si el CSV
no trae `id`, se genera uno y se reporta en advertencias.

## Cómo está hecho

- **Detección de zonas** — binarización por luminancia (respetando alfa) →
  dilatación opcional para cerrar huecos → transformada de distancia euclidiana
  exacta (Felzenszwalb–Huttenlocher) → etiquetado de componentes conexos por
  flood fill de scanline sobre el fondo. Se descarta la región exterior (la que
  toca el borde) y las menores al área mínima.
- **Dibujo sin cerrar** (`close`, *cerrar trazo* en el studio) — un boceto que
  no encierra ninguna región no tiene huecos que delimitar: todo su fondo es
  "el exterior" y se descarta entero. Con `close: r` se pinta sobre el **relleno
  del trazo**: un cierre morfológico de radio `r` (dilatar y volver a erosionar
  con el mismo disco, los dos pasos sacados de la transformada de distancia que
  ya era exacta) y de ahí lo que el cierre se tragó. Donde el trazo es una banda
  de dos líneas —el cuerpo, una pluma— su interior mide menos que el disco y se
  rellena; el aire entre dos vueltas de la espiral es más ancho y queda afuera.
  Sale justo la superficie que habría encerrado el dibujo terminado, sin pedirle
  que cierre. Con `close: 24`, el boceto actual da 121 piezas y 407 000 px
  pintables, agrupadas en una sola zona. En el dibujo definitivo vuelve a 0.
- **Tamaño de la mancha** — 1,9 % del lado mayor del dibujo, *salvo* que el
  hueco donde tiene que caer sea más angosto: entonces manda el hueco y la
  mancha mide su ancho (`typicalDepth`, la mediana de la distancia al borde
  entre todos los píxeles pintables). En los pétalos anchos del boceto cerrado
  no ata nada (hueco 44 px → radio 38); en la cinta de 14 px del boceto actual
  sí (hueco 7 px → radio 15), y es lo que evita que cada mancha salga recortada
  en una raya y el trazo entero se empaste de un solo rojo.
- **Semillas estables** — de cada región se guarda su píxel más interior (mayor
  distancia a la tinta). Por eso el `.zones.json` pesa menos de 1 KB y sobrevive
  a cambios de umbral o de resolución del dibujo.
- **Margen interno** — los centros de las manchas solo se colocan en píxeles con
  `distancia a la tinta >= margen`, así ninguna queda pegada a la línea.
- **Posición estable por registro** — la semilla del PRNG (mulberry32) de cada
  punto sale del hash de su `id`, no de su orden en el CSV: agregar registros no
  mueve los existentes, y la misma semilla global vuelve a dar la misma imagen.
- **Recorte por zona** — cada zona se pinta en su propia capa, se recorta con
  `destination-in` contra su máscara (dilatada por el *sangrado*) y se compone
  sobre el papel en `multiply`.
- **Manchas** — polígono base de 8-12 vértices con el radio **y el ángulo**
  irregulares (el reparto regular del círculo se nota debajo de la
  deformación), subdividido 3-5 niveles insertando puntos medios desplazados
  con ruido gaussiano perpendicular; luego N capas translúcidas de unas pocas
  variantes del polígono, más strokes de borde para el pigmento acumulado en
  la orilla.
- **Dispersión** — cada capa se corre, se gira, se escala y pesa un poco
  distinto de la anterior (`scatter`). Sin eso, N siluetas calcadas en el mismo
  sitio dan una mancha compacta de borde nítido; corridas, dan pigmento aguado.
  Es lo que permite bajar la opacidad por capa a ~0.022 sin que la mancha
  desaparezca: el color lo hace la suma, no una capa opaca.
- **Color** — rampa de 256 pasos interpolada en OKLab, no en RGB.

No hay tests automatizados ni CI: lo anterior está verificado a mano en el
navegador. `npm run check` cubre los tipos de los 46 archivos.

Del mapeo se comprobó, en el navegador:

| Criterio | Resultado |
|---|---|
| Alta real: el ID no lleva la zona | `REG-PERSONA-20261111-R296-40`, checksum válido |
| Los IDs históricos con zona siguen válidos | `ZONA06-…-M2` parsea y su checksum da bien |
| La zona no depende del orden de las zonas | misma zona con la lista al derecho y al revés |
| Reparto entre las 22 zonas (295 IDs) | densidad pareja: el cuerpo se llena y las plumas no se apelmazan |
| Misma versión del mapeo → no se toca nada | 0 remapeos, cada quien en su zona |
| Versión anterior → se remapea, el ID no cambia | 1 remapeo, mismo ID |
| Zona borrada del dibujo → rescatada | cae en una zona vigente y se persiste |
| El alta sobrevive a recargar y nada se mueve | `toDataURL()` idéntico antes y después |
| Lo guardado por el formato 1 | migra solo, conserva su zona |
| Studio: el selector de zona manda | 10 al azar repartidas por el mapeo, 1 forzada a `zona_09` |
| El reparto sigue al espacio de cada zona | 84,2 % real contra 85,2 % de espacio en `zona_01` |

Y de la tinta y el pincel:

| Criterio | Resultado |
|---|---|
| Todo el mural en una sola familia de color | rojo dominante en las nueve muestras |
| Los ánimos siguen distinguiéndose | saturación de 59 % a 33 %, en degradado |
| 1295 manchas con el pincel disperso | 567 ms de render (criterio: menos de 3 s) |

## Estructura

Tres capas con dependencias en un solo sentido: `core` no conoce a nadie,
`io`/`data` conocen a `core`, y las pantallas conocen a todos.

```
astro.config.mjs     sitio estático, sin adapter
src/
  pages/             index.astro — la unica ruta del sitio
  layouts/Base.astro la cáscara HTML compartida (solo <head> y <slot>)

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
    plantilla.ts     LA ILUSTRACIÓN · las rutas del dibujo, sus zonas y el CSV

  data/              el dominio de la encuesta
    person.ts        campos, ánimos, frases y generador aleatorio
    mapping.ts       LA REGLA · zona y valor de alguien, versionada
    repo/localRepo   las altas de este dispositivo (localStorage + version)

  ui/                widgets vanilla, DOM armado a mano con utilidades
    controls · tooltip · blob                  ← las dos pantallas
    registroForm (alta en 3 pasos) · personPanel (form completo + buscador)
    zonePanel · filters                        ← solo el studio

  mural/             la pantalla pública (main.ts + mural.css)
  studio/            el laboratorio · page.astro se inyecta solo en dev
  styles/app.css     hoja raíz de Tailwind: tokens y clases de componente

public/Mural/        LA PLANTILLA
                     bocetoactualizado.svg · su .zones.json (close 24, 1 zona)
                     boceto.svg · boceto.zones.json (cerrado, 22 zonas)

public/samples/      EL BANCO DE PRUEBAS
                     datos_ejemplo.csv (simulado)
```

Los imports entre capas van por alias (`@core/*`, `@io/*`, `@data/*`,
`@ui/*`); dentro de `core/` son relativos. Así, mover el núcleo a su propio
paquete más adelante es cambiar el mapeo en `tsconfig.json` y nada más.

Si el mural pasara a un framework de componentes, lo que migra es `src/mural/`
**y los cinco módulos de `ui/` que usa** (`registroForm`, `personPanel`,
`tooltip`, `controls`, `blob`): son constructores de DOM con las clases de
Tailwind dentro de strings de TypeScript. `core/`, `io/` y `data/` no se tocan.

## Lo que falta

- **`index` todavía no lee Supabase.** Lee el CSV simulado de
  `public/samples/` y escribe las altas en `localStorage`, cada dispositivo por
  su cuenta; el respaldo a CSV es hoy la única forma de juntarlos. Falta el
  cliente, la tabla con el esquema de `src/data/person.ts` y cambiar
  `src/data/repo/localRepo.ts` por un repositorio remoto —el resto del mural ya
  habla solo con ese módulo—.
- **El boceto no está cerrado y las zonas no tienen nombre propio.** Mientras
  el dibujo siga sin cerrar, todo cae en una sola `zona_01` repartida por los
  121 trozos del relleno del trazo: el mapeo tiene una sola casilla donde
  mandar a la gente. Cuando llegue el dibujo con sus regiones delimitadas hay
  que volver `close` a 0, nombrar las zonas en el studio y exportar su
  `.zones.json`; ahí `dondeQuedo()` puede decir algo mejor que "en la
  serpiente" y el mapeo puede repartir por tramos.
- **No hay archivo de preset.** Los parámetros de render están duplicados como
  literal en `src/studio/main.ts` y `src/mural/main.ts` (hoy idénticos), y el
  `.zones.json` solo lleva umbral, dilatación, área mínima y margen. Afinar la
  acuarela en el studio todavía no llega al mural sin editar código.
- **La ficha solo se abre con mouse.** El hover escucha `mousemove`; en teléfono
  —el dispositivo para el que está diseñada la pantalla— la única forma de ver a
  alguien es el buscador.
- **El mapeo todavía no mira los datos.** La versión 1 reparte en cualquier
  pétalo, por igual entre grandes y chicos, sin leer ningún campo de la persona.
  Cuando los datos estén delimitados, el cuerpo que cambia es `zonaFor` y basta
  subir `MAPPING_VERSION`.
- **Deploy sin definir**: `astro.config.mjs` no fija `site` ni `base`. El código
  respeta `import.meta.env.BASE_URL`, pero para publicar bajo subruta hay que
  configurarlo.

## Convocatoria y Colaboradores

- **Images of Mexico** ([imagesofmexico.com](https://www.imagesofmexico.com/)): Plataforma cultural e iniciativa de artes visuales binacional enfocada en compartir historias y realidades de México a través de carteles, convocatorias y exposiciones itinerantes. El proyecto fue realizado para su convocatoria temática sobre la dieta de la milpa y sistemas alimentarios.
- **Syle Studio** ([syle.studio](https://syle.studio/)): Estudio creativo multidisciplinario mexicano especializado en diseño gráfico, branding, fotografía y dirección de arte (*“Nunca dejes de creer”*), a cargo del acompañamiento creativo y dirección visual del proyecto en conjunto con el autor Daniel Capistran.
