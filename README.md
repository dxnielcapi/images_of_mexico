# Mural de acuarela

Visualización de datos en el navegador: un dibujo de líneas, sus zonas cerradas
detectadas automáticamente, y cada registro —una persona— trazado como una
marca de acuarela que **nace** donde la pone el dibujo y crece libre a partir
de ahí. Al superponerse en `multiply`, las marcas se oscurecen como pigmento
real y aparece el mapa de calor.

El dibujo no recorta nada y nunca se muestra entero: lo va trazando un lápiz
que no para, rápido y apenas marcado, y la línea se apaga detrás de él (ver
*El cartel debajo*). La figura la dibujan los datos sobre esas líneas, y cada
línea marca más o menos según la gente que tenga encima: si se ve la
serpiente es porque hay gente suficiente para haberla trazado.

**El producto es `index`** (`/`): el mural a pantalla completa, con sus datos
reales en Supabase y cuatro iconos al pie para ver cómo se pintó, acercarse al
cartel, sumarse o buscar a alguien.

**La ilustración es `public/Mural/Final.svg`**, el cartel terminado: un códice
en espiral que relata el **tlacuilo** sentado en el centro. La serpiente
emplumada da las vueltas —la cabeza arriba a la izquierda, el cuerpo cerrándose
hacia adentro— y entre vuelta y vuelta hay nopales, mazorcas y ornamentos. Es
la plantilla sobre la que se trabaja todo, y la nombra un solo módulo
(`src/io/plantilla.ts`) del que tiran el mural y el Hero, así que reemplazarla
es cambiar esas rutas y rehornear los cuatro archivos que la acompañan (ver
*Cambiar la ilustración*). Se carga como SVG y el motor la rasteriza al vuelo
a un lienzo de 1970×2000.

El cartel está partido en dos, y esa división es el centro del mural: **el
tlacuilo se dibuja tal cual** —es la mano que relata, tiene que estar desde la
primera visita— y **todo lo demás lo trazan los datos** (ver *El tlacuilo no lo
pinta nadie*).

El dibujo **no cierra ninguna región**, así que no hay huecos que delimitar: su
`.zones.json` trae `close: 24` y las zonas salen del **relleno del propio
trazo** (ver *Dibujo sin cerrar*, más abajo). Los bocetos anteriores siguen
versionados en `bocetos-anteriores/`, con sus propios horneados y sin depender
de nada de esto; están fuera de `public/` porque ahí cada build los publicaba.
Para volver a uno: copiarlo a `public/Mural/` y apuntar `plantilla.ts`.

Los parámetros del render no se tocan por sesión: el pincel y el trazo están
afinados y sus valores son parte del diseño (ver *Las medidas salen del
dibujo*). Donde hacía falta afinarlos había un laboratorio con nueve bloques de
sliders; se borró cuando la figura dejó de salir de las zonas del dibujo y pasó
a armarla la red, porque ya no quedaba nada que mover.

Los datos que hay hoy son **simulaciones**: `datos_ejemplo.csv` son 1800
registros ficticios con el esquema real, ocupando el lugar de lo que vendrá de
Supabase. Los arma `tools/registros.mjs`, que importa el esquema de verdad y
solo agrega al final (ver *El banco simulado*).

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
escaneo de Tailwind incluye `@source "../**/*.ts"` además de `pages/`,
`layouts/` y `components/`. Las clases se escriben siempre completas: un `bg-${x}` armado a mano
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

**Cuidado con `hidden`:** `app.css` la define fuera de toda capa y con
`!important`, porque el kiosco la conmuta con `classList` sobre cajas que ya
traen su propio `display`. Eso le gana también a las variantes, así que el par
`hidden md:flex` no funciona —la caja no aparece en ningún ancho— y hay que
escribirlo al revés: `flex max-md:hidden`. Es lo que tenía escondida la fila de
secciones de la barra.

## Arrancar

```bash
npm install
npm run dev      # http://localhost:4321  (/ el mural, /historia el relato)
npm run build    # astro build -> dist/
npm run preview  # sirve dist/
npm run check    # astro check (typecheck de .astro y .ts)
```

### Cambiar la ilustración

El dibujo no se procesa en el build: sus cuatro archivos están versionados al
lado del SVG y se rehornean a mano, en este orden, cuando cambia la
ilustración. Hace falta Python con `numpy`, `scipy`, `scikit-image` y
`Pillow`.

```bash
cd tools
python3 figuras.py ../public/Mural/Final.svg                     # el tlacuilo, aparte
python3 espina.py  ../public/Mural/Final.svg --sin ../public/Mural/Final.tlacuilo.svg
python3 trazos.py  ../public/Mural/Final.svg --sin ../public/Mural/Final.tlacuilo.svg
python3 zonas.py   ../public/Mural/Final.svg                     # semillas y umbrales
```

`figuras.py` va primero porque los otros dos le descuentan esa figura al
dibujo. Después hay que apuntar `src/io/plantilla.ts` al SVG nuevo —es el
único lugar del código que nombra los archivos— y, si el dibujo trae otras
capas, revisar `CAPA` en `figuras.py` y `CAPAS_ESPIRAL` en `espina.py`, que son
los dos nombres que el horneado toma del export.

## Las tres rutas

El sitio son tres páginas y nada más:

| Ruta | Qué hay | Script |
| --- | --- | --- |
| `/` | El Hero, el mural interactivo, la escala de los ánimos, la puerta a la historia, el concepto, cómo participar y las referencias | `src/mural/main.ts` (el motor entero) |
| `/historia` | «La historia de nuestros símbolos»: la visualización de datos, la violencia alimentaria estructurada, el mito de Quetzalcóatl, la dieta de la milpa y el tlacuilo | `src/mural/historia.ts` (ni una línea del motor) |
| `/timelapse` | La película del mural: la red vacía llenándose del primer registro al último | `src/mural/timelapse.ts` (el mismo cartel, sin kiosco) |

Las tres secciones de `/historia` estaban en la portada, una tras otra. Se
mudaron para que `/` abra con el mural y no con media docena de pantallas de
lectura; la portada entra por la sección **La historia de nuestros símbolos**,
que es el índice de las tres y lleva a la página.

`/` y `/historia` comparten la cáscara (`layouts/Base.astro`), la barra y el
pie (`components/Nav.astro` y `components/Footer.astro`) y las dos cosas de
comportamiento que no son del mural: el revelado del texto con el scroll y el
fondo de red de las secciones de la visualización, los dos en
`src/mural/pagina.ts`. `/timelapse` comparte solo la cáscara: es un
reproductor, así que no lleva barra ni pie —la pantalla es el lienzo y los
mandos— y su única salida escrita es el enlace de vuelta al mural. Una sección que cambie de ruta se mueve en el `.astro` y
se le cambia la `ruta` en las listas de la barra y el pie: el `href` —ancla
suelta o ruta completa— lo resuelve `components/rutas.ts`.

## El mural (`/`)

La pantalla que se publica: para dejar en un puesto o pasar de mano en mano. No
tiene controles y sus parámetros de render quedan
fijos en el código: semilla global `1234`, grano `0.5`, colocación aleatoria y
la capa de líneas **apagada** (`showLines: false`): la lámina del SVG no se
pega nunca debajo del mural. El cartel aparece de otra manera —un lápiz lo va
trazando, rápido y apenas marcado, y la línea se apaga detrás de él (ver *El
cartel debajo: un lápiz que no para*)—. Y **sin papel**: la escena se compone transparente (`paper: false`, con la capa
de líneas también sin fondo) para que la ilustración quede a sangre sobre la
página, sin el recuadro que dibujaba el lienzo opaco. El papel sigue puesto
debajo del fondo del Hero, donde el velo de cristal necesita algo que
desenfocar.

Hoy arranca sola con la plantilla (`Mural/Final.svg`, su `.zones.json` y el
`.tlacuilo.svg` de la figura central) y los 1800 registros simulados de
`datos_ejemplo.csv`. Ese CSV es el sustituto temporal de la tabla de Supabase;
todo lo que sigue en esta sección es la pantalla de verdad. El `zona` que trae
el CSV es caché de un dibujo anterior: al cargarlo se remapea con la regla
vigente, así el banco de pruebas cae siempre sobre la ilustración que hay
puesta.

Arriba no hay nada: la ilustración ocupa todo. Al pie, anclados abajo a la
derecha —y a lo ancho en teléfono, al alcance del pulgar, respetando el área
segura— hay cuatro iconos: **reproducir** (la película del mural, ver *El
timelapse*), **encuadre** (la lupa, ver *La lupa: mirar de cerca*), **lupa de
buscar** y **persona+**. Los tres últimos abren su recuadro **hacia arriba**:
se abre uno por vez, el mismo icono lo cierra y `Esc` también. El primero no
abre nada —es un enlace, y lleva a `/timelapse`.

### Sumarse: tres preguntas

El alta no es un formulario largo sino tres pasos, cada uno en una pantalla de
teléfono sin scrollear, con sus puntos de progreso arriba:

1. **¿Cómo te llamas?** — nombre (lo único obligatorio), edad, a qué te dedicas
   y de dónde eres. `Enter` avanza igual que el botón *Seguir*.
2. **¿Cómo estás hoy?** — los nueve ánimos en una cuadrícula de 3×3, pero no
   como lista: cada uno es **una mancha pintada con el pincel del mural**, con
   su color de verdad. Se ve de antemano qué va a quedar en el mural. Van sin
   mechón: lo que se elige ahí es el color, y nueve mechones de 58 px uno al
   lado del otro son ruido que no ayuda a decidir.
3. **¿Qué te gustaría decir?** — opcional. Debajo aparecen las frases sugeridas
   del ánimo elegido; un toque las copia al campo.

Al sumar, la tarjeta final trae la marca entera en grande —núcleo y mechón,
sembrada con el ID, así es exactamente la que quedó—, el nombre, dónde quedó ("entre los pétalos" si la
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
  registradas en este dispositivo, con las mismas catorce columnas que
  `datos_ejemplo.csv` (`id, zona, valor, nombre, edad, ocupacion, lugar_origen,
  alimentacion, prefiere, merece_digna, oportunidades_justas,
  perdida_soberania, mensaje, fecha`). Sirve de respaldo, para pasar a otra máquina y
  para cargarlo después en un servicio gestionado.
- **Importar copia** — vuelve a cargar ese CSV (o el JSON interno). Se omiten
  los ids repetidos y los que ya están en el CSV de ejemplo, así reimportar no
  duplica a nadie.
- **Borrar mis registros** — vacía lo guardado en este dispositivo; pide un
  segundo toque dentro de cinco segundos para confirmar. No toca el CSV de
  ejemplo.

En modo privado, o si el navegador no deja escribir, el mural sigue andando y el
recuadro avisa que conviene bajar una copia antes de cerrar.

### El banco simulado

`datos_ejemplo.csv` lo arma `tools/registros.mjs`, fuera del build:

```bash
node tools/registros.mjs        # deja el banco en 1800 registros
node tools/registros.mjs 4000   # o en los que se le pidan
node tools/registros.mjs 300    # pedir menos recorta por el final
```

Tres cosas lo definen:

- **No reescribe lo que ya está.** Lee el CSV, lo deja byte por byte como
  estaba y solo agrega al final hasta llegar al total. Tiene que ser así
  porque la posición de una mancha sale del hash de su `id` y su pedazo de
  dibujo, de su lugar en la lista: regenerar el banco entero repintaría el
  mural de cero. Agregando, el mural de ayer es el de hoy con unas pinceladas
  más, igual que cuando se registra alguien de verdad. Pedir menos recorta por
  el final, que no es destructivo en el sentido que importa: volver a pedirlos
  los devuelve idénticos.
- **El esquema no se copia, se importa.** La escala, las cuatro preguntas y el
  cálculo del valor salen de `@data/person`, `@data/afinidad` y `@data/mapping`
  cargados de verdad —con el loader SSR de Vite, que es quien resuelve los
  alias `@`—, así que un cambio en las preguntas no puede dejar el script
  generando respuestas que la app ya no sabe leer: se detiene y lo dice.
- **Es determinista.** La semilla de cada registro es su propio número, así que
  con el mismo total sale el mismo banco, y pedir 1800 después de haber pedido
  840 agrega exactamente los 960 que faltaban sin tocar los anteriores.

Lo que sí vive en el script es el **vocabulario** —nombres, oficios, lugares y
las frases de más—, porque la app no necesita conocerlo. Las cuatro frases por
punto de la escala que trae `SENTIRES` son las que el alta sugiere como chips,
no las que alcanzan para mil doscientas personas, así que el banco habla
además con un repertorio propio.

### Cuánta gente hace falta

El banco está en 1800 y no es un número redondo cualquiera: es donde la figura
**cierra**. El recorrido sobre el que se tiende la red no es fijo —crece con la
población, para sostener la densidad— y la perilla es
`GENTE_FIGURA_COMPLETA = 1800` en `src/core/render/recorrido.ts`. La espiral
entra siempre; las 683 líneas del cartel —las plumas, los nopales, las
mazorcas, los ornamentos— se anexan de mayor a menor hasta donde alcance el
presupuesto, que es una fracción del dibujo proporcional a la gente que hay.

Medido sobre la plantilla de hoy:

| Gente | Líneas dentro | Figura | Largo del recorrido | px de línea por persona |
| ---: | ---: | ---: | ---: | ---: |
| 294 | 1 / 683 | 0 % | 12 324 px | 41,9 |
| 840 | 47 / 683 | 7 % | 30 982 px | 36,9 |
| 1200 | 131 / 683 | 19 % | 44 096 px | 36,7 |
| 1500 | 268 / 683 | 39 % | 55 123 px | 36,7 |
| **1800** | **683 / 683** | **100 %** | **66 132 px** | **36,7** |
| 4000 | 683 / 683 | 100 % | 66 132 px | 16,5 |
| 10 000 | 683 / 683 | 100 % | 66 132 px | 6,6 |

Tres cosas se leen ahí. Una: hasta 1800 la densidad se mantiene clavada en
~37 px de línea por persona —ese es el punto de la perilla— y lo que crece es
el dibujo: primero la serpiente sola, después las plumas grandes, al final los
nopales y las mazorcas. Dos: **pasado 1800 no entra ni una línea más**, porque
ya están las 683; lo único que sigue creciendo es el pigmento sobre la misma
figura. A 10 000 hay cinco veces y media más gente sobre el mismo recorrido y
el cuerpo se empasta hasta el negro.

Tres: el cartel terminado es un 32 % más largo que el boceto anterior (66 132
px contra 50 090), así que las mismas 1800 personas caen más espaciadas —37 px
por persona contra 28—. Por eso el nodo y la arista se achicaron al cambiar de
ilustración (ver *Las medidas salen del dibujo*): con el nodo de antes, lo que
se veía de cerca era una mancha continua en vez de la gente que la forma.

Para que la figura aguante más gente sin empastarse hay que **subir
`GENTE_FIGURA_COMPLETA`**, no agregar registros: eso reparte la misma población
sobre menos dibujo y la completa más tarde, más cargada. Agregar gente por
encima del umbral solo oscurece.

Los lugares de origen de los registros nuevos son mexicanos, que es de lo que
hablan las cinco preguntas. Los 295 primeros son anteriores y traen localidades
argentinas: quedan como están por la primera regla. Su columna `valor` también
es de antes —la calculaba la escala sola, no la intensidad de la versión 3 del
mapeo—, y no importa: el `valor` del CSV es caché y la app lo recalcula entero
al cargar (ver *El mapeo*).

## La historia (`/historia`)

El relato de dónde sale la figura, en cinco secciones de texto corrido y en el
orden del argumento:

1. **Visualización de datos** — la herramienta: qué se está midiendo y por qué.
   Cierra con el botón *Participa*, que aquí no abre nada sino que lleva al
   mural de `/`.
2. **Violencia alimentaria estructurada** — el daño que la sección de arriba
   deja nombrado. **Falta el texto.**
3. **El mito de Quetzalcóatl** — el centro: él al centro, la sangre y la
   ciencia, con las dos citas que están en el origen de la pieza.
4. **La dieta de la milpa** — lo que sostiene al mito, con las tres fotos de
   `public/dieta/` relevándose de fondo bajo el velo crema. El relevo es CSS
   puro (`mural.css`): no necesita script.
5. **Tlacuilo** — el oficio del que viene la forma de contar. **Falta el
   texto.**

Las dos que están pendientes tienen su `<section>` con el título puesto y un
distintivo *Texto pendiente* en lugar del cuerpo; el comentario de arriba de
cada una dice cómo entra el texto cuando llegue, y el distintivo se quita al
ponerlo.

El orden sale de `PARTES`, en el frontmatter de `historia.astro`: de ahí se
pinta el índice del encabezado. El cuerpo de cada sección está escrito a mano
en su `<section>` porque cada una tiene su forma —la de los datos lleva fondo
de red, la de la milpa lleva fotos—, así que **añadir una sección es tocar las
dos cosas**: la lista y su `<section>`. Si además tiene que salir en el mapa
del sitio, la lista de `components/Footer.astro`; y si tiene que salir en la
puerta de la portada, su fila en `#historia` de `index.astro`.

Arriba, el encabezado con el título y el índice; abajo, el cierre que devuelve
al mural. La entrada desde la portada es la sección **La historia de nuestros
símbolos**, y la barra y el pie llevan de vuelta a cada parte de `/`.

La página es texto y fotos, así que `src/mural/historia.ts` no carga nada del
motor de acuarela —ni el dibujo, ni las zonas, ni el CSV, ni el
`localStorage`—: solo enciende el revelado y el fondo de red de
`src/mural/pagina.ts`. El bundle que baja son unos 19 KB contra los 74 KB de la
portada.

El fondo de red es el mismo andamio de «La escala de la alimentación», que se
quedó en `/`: `pintarFondoDatos()` lleva la lista de las dos secciones y cada
ruta aporta el lienzo que tiene. Mientras estuvieron seguidas, la animación
cruzaba de la crema al carmín sin costura; por eso `fondoRed.ts` sigue
aceptando varias capas.

## El timelapse (`/timelapse`)

El mural de `/` aparece ya pintado: quien llega quiere ver la figura, no
esperarla. Pero la figura es el trabajo de dos mil personas a lo largo de dos
meses, y eso no se cuenta con un número al pie. El botón de reproducir —el
primero de los cuatro iconos al pie del mural— lleva a una página donde el
cartel arranca en blanco y se va llenando, del día del primer registro al del
último, de corrido y en unos veintiséis segundos.

Abajo, los mandos: reproducir y pausar, la ilustración, una barra que se
arrastra para ir a cualquier momento, cuántos registros van y la fecha que
marca el reloj. La barra espaciadora y las flechas hacen lo mismo que en
cualquier reproductor; `Inicio` y `Fin` van a los extremos y la `i` apaga la
ilustración.

**Con y sin ilustración.** El segundo botón apaga el códice. Es la única
perilla de la página y existe porque el dibujo es todo negro y la red es todo
carmín: con el códice debajo, un nodo que cayó sobre un nopal se confunde con
la línea del nopal, y las comunidades, los hilos largos y los huecos entre
grupos se leen a medias. Apagado queda el grafo solo sobre el papel —las dos
mitades negras a la vez, el cartel de abajo y el tlacuilo de encima, que son
el mismo dibujo. El botón va teñido de carmín mientras la ilustración esté
puesta. Mientras está apagada el cartel se sigue entintando en su lienzo, que
no se mira: volver a encenderla es inmediato.

Tres decisiones sostienen la película (están en `src/mural/timelapse.ts`):

- **El acomodo es el final y lo que avanza es cuánta gente se ve.** La red se
  arma una sola vez con todo el mundo —`redDeRegistros()`, el mismo que usa el
  kiosco— y los nodos se revelan en el orden en que se registraron; una arista
  entra con el último de sus dos extremos. Rearmar la red a cada paso sería más
  fiel al mural de aquel día —el recorrido crece con la población, así que al
  mural le van saliendo plumas (ver *Cuánta gente hace falta*)— pero cada
  recálculo corre a todos los nodos un poco, y mil recálculos seguidos no se
  ven como un dibujo pintándose: se ven como un dibujo temblando.
- **El reloj es el calendario, no el conteo.** La película va del día del
  primer registro al del último, y dentro de cada día sus registros se reparten
  parejos. Así un día de treinta pinta rápido y uno de tres pinta despacio —que
  es lo que de verdad pasó— sin que la película vaya a saltos de un día al
  siguiente. La fecha sale de la columna `fecha`; si faltara, de la que el id
  lleva escrita en el nombre.
- **La tinta del cartel se vuelve a repartir cada tantos registros.** Las
  líneas se entintan por donde hay gente encima (ver *El cartel debajo*), y
  medir eso son diez mil puntos: se hace unas sesenta veces en toda la película
  y no sesenta veces por segundo. El cartel va quieto en su propio lienzo y el
  fotograma solo lo estampa, con la red revelada encima y el tlacuilo al final.

Lo que se ve al terminar es exactamente el mural de `/` con la misma gente: el
pincel, la paleta y el acomodo son los mismos módulos. Lo que las dos páginas
comparten —bajar la ilustración, medirla, leer sus cuatro horneados y juntar
los registros— vive en `src/mural/cartel.ts`, que es la única puerta por la que
se carga el mural; de ahí sale también el `RENDER` con el que pintan las dos.
`cartel.ts` no escribe: si lo registrado en el dispositivo venía de una versión
anterior del mapeo lo devuelve al día y avisa cuántos cambiaron, pero volver a
guardarlo es del kiosco, que es el único que escribe.

Con `prefers-reduced-motion` la película no arranca sola: queda el mural
entero, que es lo que tendría que mostrar al terminar, y el botón sigue ahí
para quien quiera verla de todos modos.

## El mapeo: de persona a mancha

`src/data/mapping.ts` es el **único lugar** donde se decide la zona y el valor
de alguien. Está aparte del esquema (`@data/person`) y de la persistencia
(`@data/repo/localRepo`) porque es justo lo que va a cambiar cuando estén
delimitados los datos y las zonas definitivas, y el resto del sistema no debería
enterarse. La regla vigente (**versión 3**) es: el valor es la intensidad
cultural que sale de las cinco respuestas juntas (`intensidad(rasgosDe(…))`,
ver *La afinidad*), y la zona se sigue sorteando desde el ID en proporción al
espacio de cada región —pero ya no decide dónde se pinta nadie: eso lo deciden
las respuestas, a través de la red. La zona quedó como lo que siempre fue
debajo, una etiqueta del registro.

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

## El trazo: la forma la hacen los datos

El mapeo dice **dónde nace** cada persona. El trazo dice **cómo se dibuja**, y
es lo que convierte el mural en una visualización en vez de un dibujo
coloreado.

La figura la trazan los datos. Las **líneas negras del cartel** se hornean como
recorridos, se cortan en pedazos del largo de una pincelada y a cada persona le
toca uno: su trazo corre **sobre** esa línea. Con veinte personas la serpiente
se insinúa; de ahí en más las pinceladas se encabalgan y la línea se carga de
pigmento.

El cartel sí se ve, pero apagado: es el lápiz antes de la tinta, y lo que lo
entinta es la gente (ver *El cartel debajo*). Con una excepción, el tlacuilo,
que está entero desde la primera visita porque es quien está dibujando.

> Ojo: este es el modelo de **pinceladas**, y hoy no es el que pinta `/`. Desde
> que el mural es una red, `compose` elige `dibujarRed` y deja `pintarMural` de
> reserva (ver *Cuánta gente hace falta*). La sección sigue valiendo porque el
> código está entero y es a donde cae el mural si falta la red.

Y no aparece hecho: **se pinta a la vista**, pincelada por pincelada, en ese
mismo orden disperso (ver *El mural se pinta solo*). Encima, los **brotes**
—lo único que se mueve una vez seco— nacen de las pinceladas, se abren en dos
y se apagan.

Si faltara el `.trazos.json` del dibujo, el mural cae al modelo anterior, que
sigue entero en el código: la espiral pintada como **tronco** y una **rama**
por persona saliendo de ella (ver *El tronco, las ramas y los brotes*).

### El cartel debajo: un lápiz que no para

El mural tenía el dibujo apagado del todo: la figura la armaban los nodos y
nada más. Eso funcionaba con un boceto que era casi solo la espiral, y dejó de
funcionar con el cartel terminado: entre vuelta y vuelta hay **nopales,
mazorcas y ornamentos** que una nube de puntos no alcanza a sugerir —un nopal
son cuatro pencas de cincuenta píxeles—, así que el mural se leía como un
remolino rojo sin códice debajo.

El dibujo vuelve, entonces, pero **no como lámina**. Pegar el SVG debajo del
mural —aunque fuera tenue— lo devuelve a ser una ilustración coloreada por los
datos, y dejar la silueta quieta es casi lo mismo con menos tinta. Lo que hay
es un **lápiz que recorre el cartel entero una y otra vez**, rápido, dejando
el trazo apenas marcado; detrás de él la línea se apaga. En cualquier momento
se ve un pedazo del códice y no el códice: lo justo para saber que está ahí,
que alguien lo está dibujando y que la red cae sobre sus líneas.

El lápiz es `src/mural/trazado.ts` y la medida que pinta es
`src/core/render/silueta.ts`: el cartel partido en **diez mil tramos**, cada
uno con su grosor y con la opacidad que le dieron los datos.

- **En fantasma** (alfa 0,09) la línea que todavía no tocó nadie. Al pasar el
  lápiz apenas se insinúa.
- **Entintada** (alfa 0,45) la que tiene gente encima. Ahí el lápiz marca de
  verdad, y el nopal o la mazorca de ese tramo se leen como objetos y no como
  manchas.

Y es **por punto, no por línea entera**: una pluma puede estar entintada en el
arranque y seguir en fantasma en la punta, que es exactamente lo que está
pasando con los datos. La medida es cuántos nodos hay a menos de 26 px de ese
punto de la línea (`ocupacionDe`), suavizada a lo largo del trazo para que la
tinta no vaya a parches; se recalcula una vez por tanda, no por fotograma,
porque depende de dónde **descansan** los nodos y no de dónde los corrió el
ratón.

Cuatro cosas sostienen la animación:

- **Se acumula, no se repinta.** Cada fotograma apaga un poco todo lo que hay
  en el lienzo del lápiz y estampa los tramos nuevos: unas decenas de trazos
  por cuadro en vez de los diez mil del cartel. Con la red encima, el mural
  sigue a 60 fps.
- **La vuelta dura 4,2 s y el trazo vive 1,5 s**, así que a la vista hay
  siempre poco más de un tercio del dibujo. Son las dos perillas del efecto
  (`VUELTA` y `COLA`): acercarlas deja el cartel casi entero, separarlas lo
  deja en un destello.
- **El orden es el de la espiral**, no el del horneado (`ordenPorEspiral`). De
  la cola de la serpiente al centro, desviándose a cada nopal al pasarle al
  lado: la mano no salta, da la vuelta. Por largo de línea —que es como las
  deja `trazos.py`— el efecto era un parpadeo de pedazos sueltos por todo el
  cartel.
- **Al mover la lupa se rehace la cola.** Lo acumulado está en píxeles de
  pantalla y un encuadre nuevo lo invalida, así que se vuelve a pintar el
  último tramo de recorrido con el desvanecido de cada uno: el lápiz no se
  reinicia, se lo encuentra donde estaba.

Al agrupar la opacidad en seis niveles y el grosor de a 0,5 px, cada tanda de
tramos sale en un puñado de trazadas —y de paso la ilustración se lee como un
dibujo entintado a mano, con línea clara y línea oscura, en vez de como un
degradado donde cada tramo es un poco distinto del de al lado—.

Con `prefers-reduced-motion` no hay lápiz: el cartel se pinta entero y se
queda quieto, que es la misma información sin nada moviéndose. Es también lo
que ve el fondo del Hero, que tiene su propio revelado encima.

### El tlacuilo no lo pinta nadie

El cartel es un códice y quien lo está contando es el **pintor sentado en el
centro de la espiral**. Esa figura no puede aparecer de a poco como el resto:
es la mano que dibuja, tiene que estar desde la primera visita y con el trazo
del autor, no con una aproximación hecha de nodos.

Para sostener esa división el SVG se parte en dos, y se parte **por
geometría**: `tools/figuras.py` agrupa los paths de su capa por contacto —dos
trazos van juntos si sus puntos caen en celdas vecinas de 8 unidades— y se
queda con el grupo más grande, que es la figura entera y nada más (en la misma
capa están las mazorcas, que quedan fuera). Sale
`public/Mural/Final.tlacuilo.svg`, 135 paths con el viewBox ajustado a la
figura.

De ahí en más son dos reglas:

- **Los horneados le restan la figura.** `espina.py` y `trazos.py` aceptan
  `--sin figura.svg` y la descuentan de la tinta antes de medir, así que ni la
  espiral ni las líneas que la red va trazando le pasan por encima al pintor.
  La espiral, de hecho, **muere en su mano**: el centro de la espiral es él.
- **Se dibuja último y entero.** `src/core/render/figura.ts` lo ubica
  comparando su viewBox con el del dibujo grande —sin coordenadas anotadas a
  mano— y lo estampa encima de la red, sin pigmento ni transparencia. Como
  vive en su propio SVG, se rasteriza a la medida en que se lo está mirando:
  con la lupa cerca el pintor sigue siendo una línea y no un escalón.

### La lupa: mirar de cerca

El cartel entero en una pantalla mide unos quinientos píxeles, y a ese tamaño
un nodo son tres: se ve el remolino, pero no se entiende que cada punto es
alguien ni se lee el nopal que la red acaba de entintar. El primero de los tres
iconos abre la **lupa**, que no cambia el mural sino la distancia a la que uno
se para.

- **Rueda, pinza o los botones `−` / `+`** acercan hasta 8×, siempre dejando
  quieto el punto del dibujo que está debajo del cursor o de los dedos.
- **Arrastrar** recorre el cartel; el encuadre no se sale del dibujo y vuelve
  al centro en cuanto el mural entra entero.
- **`Ver todo`** —o cerrar la lupa, o la tecla `0`— devuelve el cartel
  completo.

Los gestos solo escuchan **con la lupa abierta**, y es a propósito: el mural
ocupa la pantalla entera, así que si la rueda acercara siempre no habría cómo
seguir bajando por la página, y en el teléfono el dedo no podría desplazarla.

Acercarse no es agrandar un bitmap. El cartel se vuelve a trazar a la nueva
escala (los vectores de la silueta y el SVG del tlacuilo, cada uno a su
resolución), y los nodos y las aristas se dibujan a su tamaño: lo que de lejos
era una mancha continua, de cerca es una sarta de puntos con sus hilos. El
lápiz sigue dando vueltas mientras tanto, en su propio lienzo y con la lupa
puesta, así que al acercarse se lo ve dibujar: un arrastre a 1,2× —el peor
caso, con casi todo el dibujo a la vista— corre a 60 fps.

### Las líneas: el dibujo se hornea como recorrido

El export de Concepts no sirve tal cual: cada `<path>` es la **silueta** de una
pincelada —el contorno de ida y vuelta, relleno de negro— y una línea del
dibujo suele ser varios paths encimados. El eje hay que sacarlo de la tinta, y
es una esqueletización sobre cuatro millones de píxeles, así que se hornea
fuera del navegador: `tools/trazos.py` lo deja versionado al lado del dibujo
como `<dibujo>.trazos.json` (hoy **683 líneas, 55 359 px de recorrido,
192 KB**, sin contar al tlacuilo, que se descuenta con `--sin`).

El script rasteriza el SVG a la resolución de trabajo del mural, esqueletiza la
**tinta** —no el cuerpo relleno que usa `espina.py`: aquí se quiere el eje de
cada línea dibujada, que es lo que hay debajo del pincel—, parte el esqueleto
en ramas y las vuelve a encadenar en los cruces siguiendo la dirección, de modo
que una línea que otra toca no quede partida en cuatro cabos. Después poda los
pelos de la esqueletización, suaviza la escalera de un píxel, remuestrea cada
6 px y mide el semiancho de la línea con la transformada de distancia.

En el navegador, `src/core/render/boceto.ts` lo carga, lo escala al dibujo que
esté puesto y arma el **reparto de obra**: corta las líneas en ~775 pedazos de
150 px y los ordena por **vecino más lejano**, de forma que cada pincelada
nueva cae en el hueco más grande que haya quedado. Por el orden del dibujo, los
primeros cien registros habrían pintado la espiral entera y ni una pluma; así,
la figura entera va apareciendo a la vez, de a poco más densa.

### La pincelada: una persona, un pedazo de la figura

`src/core/render/pincelada.ts` arma el trazo de cada registro
(`render/rama.ts` lo pinta: es la misma cinta al óleo, lo que cambia es de
dónde sale la geometría). Tres cosas lo deciden:

- **Dónde** — el pedazo que le tocó, por su lugar en la lista. Como la lista
  solo crece por el final, registrarse no mueve lo que ya está pintado.
- **Cuánto** — el valor estira la pincelada y le da cuerpo, pero el grosor lo
  manda la línea del dibujo: sobre el lomo es ancha y en una pluma es un pelo.
  El semiancho va con techo, o quien cae en una mancha llena —el hocico, el
  ojo— pinta un borrón del tamaño de la cabeza.
- **Con cuánto pulso** — no es un calco: el trazo se despega de la línea, la
  cruza y se pasa de largo, con el error de una mano (~5 px) y no el de un
  borrón. De lejos la figura cierra; de cerca está pintada.

Lo único que depende de cuánta gente hay es el **alcance**: cuando hay menos
personas que pedazos, cada pincelada se estira desde el centro del suyo hasta
2,5 veces su largo. Es lo que hace que la figura cierre con el banco de ejemplo
en vez de quedar en una línea de puntos, sin que nadie se mueva de su sitio.

### El mural se pinta solo

`src/mural/pintado.ts` es el pincel. En vez de aparecer de una vez, las
pinceladas entran de a una y cada una crece desde donde el pincel apoyó hasta
donde levantó; el dibujo entero tarda unos **9 segundos**. Es lo único que
cuenta de dónde salió la figura: que la pintaron entre todos.

Dos lienzos y ninguna copia de más:

- **Lo seco** vive en la escena cacheada. Cada pincelada que termina se estampa
  ahí **una sola vez**, con el mismo pincel del render completo
  (`pintarRamaDe`), así que el mural que queda es idéntico al que saldría sin
  animación.
- **Lo mojado** —las nueve que como mucho están creciendo— se repinta entero en
  cada fotograma sobre el lienzo que se ve, que de todos modos se borra y se
  vuelve a estampar para los brotes. Como se borra, el pigmento no se acumula
  por repintar. La pincelada a medio hacer es la misma cinta recortada
  (`recortarRama`), con la punta interpolada y afinada para que termine en
  pincel y no en canto de cuchillo.

Una pincelada larga tarda más que una corta (el pincel corre a ~900 px/s, entre
0,18 y 0,9 s), y de ahí sale cuántas hay mojadas a la vez. El costo se mide:
durante el pintado los fotogramas siguen cayendo a **16,7 ms** y 0 *long tasks*.

Lo pintado se recuerda **por id** y no por posición, así que recalcular las
ramas no lo borra: cuando alguien se registra entra **su** pincelada sola
—quien se registró la ve dibujarse— y el resto del mural no se repinta. Y
porque la página abre en el Hero (que mira esta misma escena y en blanco no
mostraría nada), el pintado arranca ahí y **se repite una vez** cuando alguien
baja al mural: si no, quien llega medio minuto después se encontraría el dibujo
ya hecho.

Con `prefers-reduced-motion` no hay pincel: el mural está entero desde el
primer fotograma.

### La espina: la columna de la espiral

La espina es la otra lectura del mismo dibujo: no las líneas dibujadas sino el
**eje de la banda del cuerpo**, una sola curva. Hoy la usan los testimonios
—que se escriben a lo largo de ella— y el mural sin `.trazos.json`, donde
vuelve a ser la columna de la que salen las ramas.

El recorrido no se inventa ni se dibuja a mano: es el **esqueleto de la banda
del cuerpo** de la serpiente. Sacarlo es esqueletizar cuatro millones de
píxeles, así que no se hace en el navegador: `tools/espina.py` lo hornea una
vez y lo deja versionado al lado del dibujo como `<dibujo>.espina.json` (hoy
1079 puntos, 10 785 px de recorrido). El script rasteriza el SVG a la misma
resolución de trabajo que usa el mural, reconstruye lo pintable igual que
`analyzeDrawing` (cierre morfológico de radio 24, ver `strokeFill`),
esqueletiza tinta + relleno y se queda con el camino más largo que arranca en
la punta más interior —lo que descarta las plumas y la cabeza, que son ramas
cortas—. Si cambia la ilustración, hay que volver a correrlo.

Dos recortes lo hacen posible en el cartel terminado. Mide **solo las capas de
la serpiente** (`CAPAS_ESPIRAL`): con los nopales y las mazorcas adentro, el
cierre morfológico pega una vuelta de la espiral con la siguiente y el "cuerpo
sólido" pasa a ser el disco entero —el eje que sale de ahí no es el de ninguna
serpiente—. Y **descuenta al tlacuilo** (`--sin`), para que el recorrido muera
al llegar a él en vez de atravesarlo.

En el navegador, `src/core/render/espina.ts` solo lo carga, lo escala al dibujo
que esté cargado y lo deja consultar por longitud de arco: "a tantos píxeles de
la cola, dónde estoy, hacia dónde voy y cuánto mide el cuerpo". `s` es siempre
la posición normalizada en `[0,1]`: 0 la cola, 1 el centro de la espiral, que
es donde está sentado el pintor.

Si el `.espina.json` falta o no se puede leer, el mural abre igual: sin espiral
se vuelve al reparto de manchas y mechones dentro de las zonas, que es el
camino anterior y sigue vivo justo para eso.

### El tronco, las ramas y los brotes

**El tronco** (`render/tronco.ts`) es el único trazo que no es de nadie y el
que más dice: se pinta por tramos y cada tramo toma el color y el cuerpo de
cuánta gente tiene alrededor. Donde se juntó mucha gente va oscuro y ancho;
donde todavía no pasó casi nadie queda un aguado pálido.

**La rama** (`render/rama.ts`) es una persona. Nace metida en el tronco —la
raíz no se ve— y sale de dos maneras: la mitad corre casi a lo largo de la
espiral, engrosando el cuerpo, y la otra mitad sale hacia el lado, abriendo la
figura. Las dos hacen falta: si todas salieran en perpendicular el mural sería
una estrella de púas. El valor estira la rama sobre todo a lo largo, así que el
mapa de calor se lee también en el tamaño y no solo en el color.

El pintado es al óleo, no a línea: la cinta se rellena siete veces con el
contorno temblado distinto en cada pasada y muy tenue, y el cuerpo lo hace la
suma; encima van unas cerdas que corren a lo largo —el peinado del pincel— y la
orilla que deja la acuarela al secarse. El perfil mantiene el ancho casi hasta
el final y recién ahí cierra en casquete redondo: es el perfil de un derrame de
pintura, no el de una hoja.

Dónde nace cada rama sale del **id** de la persona, como salía su posición
cuando el mural repartía manchas sueltas: la rama de alguien es siempre la
misma y nadie se mueve porque otro se registre. La rama se calcula una vez por
tanda de datos y la usan los tres que la necesitan: el pintado, el ratón (la
rama es el área sensible de esa persona) y la animación.

### Las letras se salieron del dibujo

Los testimonios se escribían dentro del cuerpo de la serpiente, letra por letra
sobre la espiral. Ya no: el mural es solo pigmento, y lo que cada persona
escribió se lee al señalar su pincelada. El módulo sigue entero
(`render/testimonios.ts`) y la escena lo sigue aceptando —volver a pasarle
`testimonios` a `renderScene` las devuelve tal cual estaban—, pero el mural no
le pasa ninguna frase.

### El campo, no el molde

Antes de la espiral, el dibujo entero entraba al mural de una sola forma: como
**campo**. Sigue vivo —es lo que ve el mural si falta el `.espina.json`— y es
la otra manera de que la silueta la haga el trazo y no un contorno.

Del boceto se conserva una sola cosa: la **profundidad** de cada píxel, o sea
cuánto dista del borde de lo pintable, que es justo lo que ya calculaba la
detección de zonas. De ahí salen las dos direcciones que necesita una marca
(`src/core/render/field.ts`):

- **hacia afuera** — contra el gradiente de la profundidad: hacia el borde más
  cercano y, si el filamento sigue, a cruzarlo. Es la que despeina la silueta.
- **a lo largo** — perpendicular a la anterior, paralela al cuerpo. Es la que
  hace que muchas hebras vecinas se peinen solas en el mismo sentido, sin que
  nadie las agrupe: el agrupamiento no se programa, emerge de compartir el
  campo. No hay relaciones inventadas entre personas; cada filamento es el de
  su registro y nada más.

Mientras el filamento está dentro del dibujo se endereza hacia el campo —por
eso el conjunto sigue siendo la forma del boceto aunque nadie la recorte—; al
salir, el campo deja de tirar y sigue con su inercia y su propio ruido. Eso es
lo que hace que el borde del mural sea del trazo y no del boceto.

### Las medidas salen del dibujo

El lienzo mide lo que mida el archivo de la plantilla (hoy 1970×2000). Un
filamento de 70 px ahí dentro llega a pantalla como una pelusa, y un grosor de
1 px no llega: largo (8 % del lado mayor), grosor y punta se calculan desde el
dibujo, igual que el radio de mancha. A diferencia de la mancha, el trazo **no**
se mide contra el ancho del cuerpo: la mancha tiene que caber adentro y el
filamento está hecho para salirse.

La rama y el tronco se miden igual, contra el dibujo entero: el largo de la
rama (12,5 % del lado mayor) está medido contra la separación entre dos vueltas
de la espiral —una rama fuerte casi toca la vuelta de al lado, y ahí es donde
el mural se cierra como figura— y el ancho del tronco contra el de la banda del
cuerpo. La única medida que **no** sale del dibujo es la de los testimonios:
esa se mide en píxeles de pantalla, y la pone el mural, que es quien sabe a qué
tamaño se está mirando.

El **nodo** y la **arista** de la red se miden igual (0,27 % y 0,62 % del lado
mayor de radio; 5,8 % de alcance), y se achicaron al pasar al cartel
terminado. No es gusto: con la lupa, el mural dejó de mirarse solo entero. De
lejos un nodo grande ayudaba a que el remolino se viera; de cerca, con nodos de
treinta y seis píxeles cada treinta y siete de recorrido, lo que se veía era
una mancha continua y no la gente que la forma. La arista, acortada, une a
quien se parece **y** está al lado, en vez de cruzar el dibujo de parte a
parte. De la silueta se mide lo mismo: a qué distancia un nodo entinta la
línea que tiene debajo (1,3 % del lado mayor, del orden del nodo, o la tinta
se adelantaría a la gente) y el grosor mínimo con el que una línea se sigue
viendo cuando el mural se mira entero. Lo que **no** sale del dibujo es el
ritmo del lápiz: cuánto tarda una vuelta y cuánto vive un trazo se miden en
segundos, y viven en `mural/trazado.ts` con el resto de lo que se mueve.

Ese cálculo vive en `src/core/render/medidas.ts` y lo pide `mural/cartel.ts` al
bajar la plantilla, así que las dos pantallas que lo comparten —`/` y
`/timelapse`— miden igual sin acordar nada. Se piden después de detectar las
zonas y no antes, porque el hueco típico sale de ellas y sin zonas da 0.

### El lienzo se rasteriza al tamaño en que se ve

La plantilla mide 1918×2000 y en pantalla entra en unos 600: rasterizar a
tamaño de archivo era pintar catorce veces más píxeles de los que se miran y
dejar que el navegador los encogiera después. Eso era justo lo que se comía los
filamentos —un trazo de 5 px reducido a 1,2 se promedia con el papel y
desaparece—. Ahora el mural mide su caja, la multiplica por el `devicePixelRatio`
(con tope en 2) y rasteriza ahí: el trazo se dibuja a su grosor final y se lee.
En una ventana de 1440 eso son 1208×1260 en vez de 1918×2000.

Las coordenadas de trabajo no cambian: los puntos, el campo y los golpes del
ratón siguen en las del dibujo, y `escala` solo aparece al pintar. Los adornos
de interfaz —la marca de la rama, su onda, los brotes— se miden en `upx`, un
píxel de pantalla, para que no engorden ni adelgacen con la resolución. Al
cambiar el tamaño de la ventana se vuelve a rasterizar, 180 ms después del
último evento y solo si la escala cambió de verdad.

Como el trazo escala con la resolución, el PNG 4x sigue siendo un re-render de
verdad: la tinta media es idéntica a 1x, 2x y 4x.

### Los brotes: lo único que se mueve

`src/mural/brotes.ts` hace crecer una veintena de hebras tenues que salen de
las ramas, se abren en dos como una raíz —o como esas animaciones de redes
neuronales donde un impulso se reparte por el árbol— y se apagan. La diferencia
con la red neuronal es la materia: aquí no hay líneas de luz sino pigmento, así
que cada hebra se pinta con dos pasadas temblonas en `multiply` y sale con el
borde sucio de un trazo al óleo, no con el filo de un vector.

La escena es un bitmap que solo se re-renderiza cuando cambian los datos, así
que cada fotograma vuelve a estamparlo y dibuja encima los brotes: no se
repinta ni una rama. El estampado es una copia acelerada por GPU y no llega a
medirse; con el mural a la vista los fotogramas siguen cayendo a 16,7 ms.

No inventan datos: un brote nace sobre la rama de alguien, hereda su color y su
dirección, y lo que se ve crecer es el gesto de esa persona. Al apagarse nace
otro sobre otra. Solo nacen sobre lo que ya está pintado, así que mientras el
mural se pinta van apareciendo con él.

Se apaga sola: corre a 30 fps (el pulso es lento; 60 no se notan y cuestan el
doble) y solo mientras el mural está a la vista (`IntersectionObserver`), la
pestaña está al frente (`visibilitychange`) y el sistema no pide
`prefers-reduced-motion`. La excepción es el pintado, que corre aunque el mural
no esté a la vista: el fondo del Hero mira esa misma escena. Con movimiento
reducido no hay bucle y el mural se ve igual, quieto y entero.

## Las respuestas son el color

`alimentacion` toma uno de los nueve pasos de `SENTIRES` (`muy bien`, `bien`,
`casi bien`, `más o menos`, `ni bien ni mal`, `algo mal`, `mal`, `muy mal`,
`nada bien`) y cada paso trae sus frases sugeridas, que son las que ofrece el
último paso del alta.

Pero el color no sale de la escala sola: sale de las **cinco** respuestas
juntas, vía `intensidad(rasgosDe(person))` en `@data/afinidad`. La escala pesa
lo suyo y las cuatro preguntas de opción corren el valor hacia arriba o hacia
abajo, así que dos personas que se sienten igual con su comida pueden pintar
distinto si no piensan igual sobre ella.

Ese cambio se llevó el jitter que había antes. Cuando el valor salía de la
escala sola hacía falta —nueve respuestas daban nueve colores exactos, y dos
personas igual de contentas se pintaban idénticas—; ahora la combinación de las
cinco da su propio abanico, y ensuciarlo a propósito solo taparía la diferencia
real entre dos respuestas vecinas.

Nueve pasos y no cinco porque la rampa los distingue: con cinco, el mural
pierde la mitad de sus tonos. Y conservan los nueve valores de la escala de
ánimos anterior, así que lo registrado antes del cambio no se movió de color.
Lo guardado con el nombre viejo (`estado_animo`) se sigue leyendo, vía
`ALIAS_HEREDADOS`. Si el CSV trae su propia columna `valor`, se respeta tal
cual.

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
- **Dibujo sin cerrar** (`close` en el `.zones.json`) — un boceto que
  no encierra ninguna región no tiene huecos que delimitar: todo su fondo es
  "el exterior" y se descarta entero. Con `close: r` se pinta sobre el **relleno
  del trazo**: un cierre morfológico de radio `r` (dilatar y volver a erosionar
  con el mismo disco, los dos pasos sacados de la transformada de distancia que
  ya era exacta) y de ahí lo que el cierre se tragó. Donde el trazo es una banda
  de dos líneas —el cuerpo, una pluma— su interior mide menos que el disco y se
  rellena; el aire entre dos vueltas de la espiral es más ancho y queda afuera.
  Sale justo la superficie que habría encerrado el dibujo terminado, sin pedirle
  que cierre. Con `close: 24`, `Final.svg` da 261 piezas agrupadas en una sola
  zona. Si el dibujo llega cerrando sus regiones, vuelve a 0.
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
- **Sin recorte** — todas las marcas van a un mismo lienzo en `multiply`. La
  zona decide dónde nace cada una (eso es el mapeo) y el campo hacia dónde
  crece, pero nada le impide cruzar el contorno. Antes cada zona se pintaba en
  su propia capa y se recortaba con `destination-in` contra su máscara; esa
  capa por zona, el *sangrado* que la dilataba y `zoneClipCanvas` ya no
  existen. De paso el render salió más barato: una sola capa en vez de una por
  zona.
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
navegador. `npm run check` cubre los tipos de los 51 archivos.

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
| El reparto sigue al espacio de cada zona | 84,2 % real contra 85,2 % de espacio en `zona_01` |

Y de la tinta y el pincel:

| Criterio | Resultado |
|---|---|
| Todo el mural en una sola familia de color | rojo dominante en las nueve muestras |
| Los ánimos siguen distinguiéndose | saturación de 59 % a 33 %, en degradado |
| 1295 manchas con el pincel disperso | 567 ms de render (criterio: menos de 3 s) |

Y del trazo:

| Criterio | Resultado |
|---|---|
| La silueta se lee sin la capa de líneas | el anillo de la serpiente aparece solo con las marcas |
| Las marcas cruzan el contorno | penachos y puntas fuera del boceto, sin recorte |
| 1295 mechones (9 filamentos cada uno) | 359 ms de render, menos que las 1295 manchas recortadas |
| El trazo escala con la exportación | tinta media idéntica a 1x, 2x y 4x (rojo 218) |
| PNG 4x | 7672×8000 en 1074 ms |
| El alta sigue entera | registro, marca en el mural, tarjeta con su mechón y búsqueda por nombre |

Y de la limpieza, el lienzo y el pulso:

| Criterio | Resultado |
|---|---|
| El lienzo rasteriza a lo que se ve | 1208×1260 para una caja de 604×630 a dpr 2 |
| El pulso no cuesta | 0 *long tasks* en 4 s; el estampado no llega a medirse |
| Se apaga fuera de vista | el lienzo queda congelado al salir y vuelve al entrar |
| El alta tras la limpieza | 296 personas, sin errores en consola |

## Estructura

Tres capas con dependencias en un solo sentido: `core` no conoce a nadie,
`io`/`data` conocen a `core`, y las pantallas conocen a todos.

```
astro.config.mjs     sitio estático, sin adapter
src/
  pages/             index.astro — la portada: el mural y lo que lo explica
                     historia.astro — `/historia`: de dónde sale la figura
  layouts/Base.astro la cáscara HTML compartida (<head>, <body> y el
                     arranque del revelado, que corre antes del primer pixel)
  components/        lo que las dos rutas comparten en el servidor
                     Nav.astro · Footer.astro · rutas.ts (el href de cada
                     sección, viva en la página que se pinta o en la otra)

  core/              EL MOTOR · cero DOM · cero framework · cero fetch
    types/           dataset · zone · placement · render · warning
    platform/        surface  ← el único punto del núcleo que crea un lienzo
    zones/           binarize · morphology · connectedComponents · zoneMask
    sampling/        prng · grid · randomInMask · poissonInMask
    render/          watercolor · trazo · field · medidas · paper · palette
                     boceto · pincelada  ← la figura la trazan los datos
                     red  ← los nodos, las aristas y la evasión del cursor
                     silueta  ← el cartel en tramos, con la tinta de los datos
                     figura  ← el tlacuilo: la que no pinta nadie
                     recorrido · espina · tronco · rama · testimonios
                     compose · legend
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
    registroForm (el alta, en 5 pasos) · personPanel (buscador por nombre)

  mural/             las tres pantallas públicas (main.ts + mural.css)
                     main.ts: la portada, con el motor entero
                     historia.ts: `/historia`, sin nada del motor
                     pagina.ts: lo que encienden las dos —el revelado del
                       texto con el scroll y el fondo de red
                     timelapse.ts: `/timelapse`, la película del mural
                     cartel.ts: bajar el mural —dibujo, horneados y
                       registros— sin montar interfaz: lo comparten
                       `main.ts` y `timelapse.ts`
                     trazado.ts: el lápiz que va dibujando el cartel
                     pintado.ts: el mural se pinta pincelada a pincelada
                     brotes.ts: lo que se mueve · heroReveal.ts: el trazado del Hero
                     citas.ts: el botón «Copiar cita» de las referencias
  styles/app.css     hoja raíz de Tailwind: tokens y clases de componente

public/Mural/        LA PLANTILLA
                     Final.svg  ← el cartel terminado
                     Final.tlacuilo.svg   ← la figura central, aparte
                     Final.zones.json     ← close 24, 1 zona, 261 semillas
                     Final.trazos.json    ← las líneas que entinta la gente
                     Final.espina.json    ← el recorrido de la espiral
                     bocetoactualizado.* · boceto.*  ← los bocetos anteriores,
                     cada uno con sus horneados: apuntar `plantilla.ts` de
                     vuelta a ellos los devuelve al aire tal como estaban

public/dieta/        EL FONDO DE «LA DIETA DE LA MILPA»
                     maiz.jpg · frijol.jpg · calabza.jpg (se relevan solas)

public/Conceptos/    LA MESA DE REFERENCIAS DE «EL CONCEPTO»
                     una carpeta por grupo de la galería; los títulos y pies
                     viven en CONCEPTO_GRUPOS, arriba de src/pages/index.astro
                     Dieta_Milpa/ · Inspiracion_antepasados/
                     Visualizacion_mito/  ← provisional, marcadores de sitio

public/samples/      EL BANCO DE PRUEBAS
                     datos_ejemplo.csv (simulado) — la base de datos de hoy

tools/figuras.py     fuera del build · separa al tlacuilo del cartel
tools/trazos.py      fuera del build · hornea las líneas del dibujo
tools/espina.py      fuera del build · hornea el recorrido de la espiral
tools/zonas.py       fuera del build · escribe el .zones.json del dibujo
                     los cuatro desde el SVG (numpy, scipy, scikit-image, Pillow)
tools/registros.mjs  fuera del build · agrega gente al banco simulado
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
  261 trozos del relleno del trazo: el mapeo tiene una sola casilla donde
  mandar a la gente. Cuando llegue el dibujo con sus regiones delimitadas hay
  que volver `close` a 0 y nombrar las zonas en el `.zones.json` que escribe
  `tools/zonas.py`; ahí `dondeQuedo()` puede decir algo mejor que "en la
  serpiente" y el mapeo puede repartir por tramos.
- **No hay archivo de preset.** Los parámetros de render son un literal en
  `src/mural/main.ts` y el `.zones.json` solo lleva umbral, dilatación, área
  mínima y margen, así que afinar la acuarela pasa por editar código. Dejó de
  doler cuando se borró el laboratorio —antes el mismo literal estaba en dos
  archivos que había que mantener idénticos a mano—, pero sigue sin haber dónde
  guardar una variante.
- **La ficha solo se abre con mouse.** El hover escucha `mousemove`; en teléfono
  —el dispositivo para el que está diseñada la pantalla— la única forma de ver a
  alguien es el buscador.
- **Deploy sin definir**: `astro.config.mjs` no fija `site` ni `base`. El código
  respeta `import.meta.env.BASE_URL`, pero para publicar bajo subruta hay que
  configurarlo.

## Referencias y Créditos

- **Autoría**: Daniel Capistran. Dirección visual y acompañamiento gráfico de
  **Syle Studio** ([syle.studio](https://syle.studio/)), estudio creativo
  multidisciplinario mexicano de diseño gráfico, branding, fotografía y
  dirección de arte (*“Nunca dejes de creer”*).
- **Images of Mexico** ([imagesofmexico.com](https://www.imagesofmexico.com/)):
  iniciativa cultural y de artes visuales que difunde historias y realidades de
  México mediante carteles, convocatorias y exposiciones itinerantes. Se cita
  únicamente como referencia del tema —la dieta de la milpa y los sistemas
  alimentarios—. Este proyecto es un trabajo independiente: no está afiliado a
  esa iniciativa, no forma parte de su convocatoria y no existe colaboración
  entre ella y Syle Studio.
