# Mural de acuarela

Visualización de datos en el navegador: un dibujo de líneas, sus zonas cerradas
detectadas automáticamente, y cada registro —una persona— trazado como una
marca de acuarela que **nace** donde la pone el dibujo y crece libre a partir
de ahí. Al superponerse en `multiply`, las marcas se oscurecen como pigmento
real y aparece el mapa de calor.

El boceto no se muestra ni recorta nada: es el guion. La figura la dibujan los
datos, una pincelada por persona sobre las líneas de la ilustración, y si se ve
la serpiente es porque hay gente suficiente para haberla trazado (ver *El
trazo*).

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
fijos en el código: semilla global `1234`, grano `0.5`, colocación aleatoria y
la capa de líneas **apagada** (`showLines: false`) —el boceto no se ve, porque
quien dibuja el mural son los trazos de los datos; con la ilustración debajo,
aunque fuera tenue, el mural volvía a ser un dibujo coloreado—. Y **sin papel**: la
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
6. **6 · Lámina** — grano del papel y la capa de líneas, que cambian según
   para qué se exporte. Ya no hay sliders de la marca: el pincel y el trazo
   están afinados y sus valores son parte del diseño, no algo que se toque por
   sesión (ver *Las medidas salen del dibujo*). Tampoco hay selector de paleta:
   la tinta es una sola (ver *El carmín es la tinta*).
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

## El trazo: la forma la hacen los datos

El mapeo dice **dónde nace** cada persona. El trazo dice **cómo se dibuja**, y
es lo que convierte el mural en una visualización en vez de un dibujo
coloreado.

La figura la trazan los datos. Las **líneas negras del boceto** se hornean como
recorridos, se cortan en pedazos del largo de una pincelada y a cada persona le
toca uno: su trazo corre **sobre** esa línea. Con veinte personas la serpiente
se insinúa; con las 295 del banco de ejemplo está entera; de ahí en más las
pinceladas se encabalgan y la línea se carga de pigmento. La ilustración no se
dibuja nunca: lo que se ve es lo que la gente pintó.

Y no aparece hecho: **se pinta a la vista**, pincelada por pincelada, en ese
mismo orden disperso (ver *El mural se pinta solo*). Encima, los **brotes**
—lo único que se mueve una vez seco— nacen de las pinceladas, se abren en dos
y se apagan.

Si faltara el `.trazos.json` del dibujo, el mural cae al modelo anterior, que
sigue entero en el código: la espiral pintada como **tronco** y una **rama**
por persona saliendo de ella (ver *El tronco, las ramas y los brotes*).

### Las líneas: el dibujo se hornea como recorrido

El export de Concepts no sirve tal cual: cada `<path>` es la **silueta** de una
pincelada —el contorno de ida y vuelta, relleno de negro— y una línea del
dibujo suele ser varios paths encimados. El eje hay que sacarlo de la tinta, y
es una esqueletización sobre cuatro millones de píxeles, así que se hornea
fuera del navegador: `tools/trazos.py` lo deja versionado al lado del dibujo
como `<dibujo>.trazos.json` (hoy **335 líneas, 39 467 px de recorrido, 132 KB**).

El script rasteriza el SVG a la resolución de trabajo del mural, esqueletiza la
**tinta** —no el cuerpo relleno que usa `espina.py`: aquí se quiere el eje de
cada línea dibujada, que es lo que hay debajo del pincel—, parte el esqueleto
en ramas y las vuelve a encadenar en los cruces siguiendo la dirección, de modo
que una línea que otra toca no quede partida en cuatro cabos. Después poda los
pelos de la esqueletización, suaviza la escalera de un píxel, remuestrea cada
6 px y mide el semiancho de la línea con la transformada de distancia.

En el navegador, `src/core/render/boceto.ts` lo carga, lo escala al dibujo que
esté puesto y arma el **reparto de obra**: corta las líneas en ~418 pedazos de
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
del cuerpo** de la serpiente. Sacarlo es esqueletizar dos millones de píxeles,
así que no se hace en el navegador: `tools/espina.py` lo hornea una vez y lo
deja versionado al lado del dibujo como `<dibujo>.espina.json` (hoy 1064
puntos, 10 631 px de recorrido). El script rasteriza el SVG a la misma
resolución de trabajo que usa el mural, reconstruye lo pintable igual que
`analyzeDrawing` (cierre morfológico de radio 24, ver `strokeFill`),
esqueletiza tinta + relleno y se queda con el camino más largo que arranca en
la punta más interior —lo que descarta las plumas y la cabeza, que son ramas
cortas—. Si cambia la ilustración, hay que volver a correrlo.

En el navegador, `src/core/render/espina.ts` solo lo carga, lo escala al dibujo
que esté cargado y lo deja consultar por longitud de arco: "a tantos píxeles de
la cabeza, dónde estoy, hacia dónde voy y cuánto mide el cuerpo". `s` es
siempre la posición normalizada en `[0,1]`: 0 la cabeza, 1 el centro.

Si el `.espina.json` falta o no se puede leer, el mural abre igual: sin espiral
se vuelve al reparto de manchas y mechones dentro de las zonas, que es lo que
sigue viendo el studio con un dibujo cualquiera.

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
**campo**. Sigue vivo —es lo que pinta el studio con un dibujo cualquiera
cargado, y lo que ve el mural si falta el `.espina.json`— y es la otra manera
de que la silueta la haga el trazo y no un contorno.

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

El lienzo mide lo que mida el archivo de la plantilla (hoy 1918×2000). Un
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

Ese cálculo vive en `src/core/render/medidas.ts` y lo piden los dos: el mural
al cargar la plantilla y el studio al renderizar. Desde que la marca no tiene
sliders, es la única forma de que el banco de pruebas muestre lo que se va a
publicar. El studio las recalcula al renderizar y no al detectar zonas, porque
las zonas llegan después de la detección y sin zonas el hueco da 0.

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
| Studio: el selector de zona manda | 10 al azar repartidas por el mapeo, 1 forzada a `zona_09` |
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
| El studio mide igual que el mural | radio 15, largo 160, grosor 5,2, punta 6 en los dos |
| El pulso no cuesta | 0 *long tasks* en 4 s; el estampado no llega a medirse |
| Se apaga fuera de vista | el lienzo queda congelado al salir y vuelve al entrar |
| El alta tras la limpieza | 296 personas, sin errores en consola |

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
    render/          watercolor · trazo · field · medidas · paper · palette
                     boceto · pincelada  ← la figura la trazan los datos
                     espina · tronco · rama · testimonios
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
    registroForm (alta en 3 pasos) · personPanel (form completo + buscador)
    zonePanel · filters                        ← solo el studio

  mural/             la pantalla pública (main.ts + mural.css)
                     pintado.ts: el mural se pinta pincelada a pincelada
                     brotes.ts: lo que se mueve · heroReveal.ts: el trazado del Hero
  studio/            el laboratorio · page.astro se inyecta solo en dev
  styles/app.css     hoja raíz de Tailwind: tokens y clases de componente

public/Mural/        LA PLANTILLA
                     bocetoactualizado.svg · su .zones.json (close 24, 1 zona)
                     bocetoactualizado.trazos.json  ← las líneas que pinta la gente
                     bocetoactualizado.espina.json  ← el recorrido de la espiral
                     boceto.svg · boceto.zones.json (cerrado, 22 zonas)

public/dieta/        EL FONDO DE «LA DIETA DE LA MILPA»
                     maiz.jpg · frijol.jpg · calabza.jpg (se relevan solas)

public/Conceptos/    LA MESA DE REFERENCIAS DE «EL CONCEPTO»
                     una carpeta por grupo de la galería; los títulos y pies
                     viven en CONCEPTO_GRUPOS, arriba de src/pages/index.astro
                     Dieta_Milpa/ · Inspiracion_antepasados/
                     Visualizacion_mito/  ← provisional, marcadores de sitio

public/samples/      EL BANCO DE PRUEBAS
                     datos_ejemplo.csv (simulado) — la base de datos de hoy

tools/trazos.py      fuera del build · hornea las líneas del dibujo
tools/espina.py      fuera del build · hornea el recorrido de la espiral
                     los dos desde el SVG (numpy, scipy, scikit-image, Pillow)
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
