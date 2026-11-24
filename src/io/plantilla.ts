/**
 * La plantilla del mural: la ilustracion sobre la que se trabaja todo.
 *
 * Un solo lugar nombra los archivos del mural. Cambiar la ilustracion es
 * cambiar estas rutas y rehacer los archivos que van a su lado; ningun otro
 * modulo sabe donde viven.
 *
 * Hoy la plantilla es `public/Mural/Final.svg`, el cartel terminado: un
 * codice en espiral que relata el tlacuilo del centro. La serpiente emplumada
 * da las vueltas, y entre vuelta y vuelta hay nopales, mazorcas y ornamentos.
 * El dibujo se carga como SVG y el motor lo rasteriza al vuelo (ver
 * `@io/readers/drawing`), asi que se puede reemplazar por otra version del
 * mismo trazo sin tocar codigo; lo que si hay que rehacer son los cuatro
 * archivos horneados que lo acompanan.
 *
 * La ilustracion esta partida en dos y esa division es el centro del mural:
 * el tlacuilo se dibuja tal cual —es la mano que relata, tiene que estar
 * desde la primera visita— y todo lo demas lo trazan los datos. Los
 * horneados de `tools/` le restan esa figura al dibujo para que la red no le
 * pase por encima.
 *
 * El boceto anterior sigue en la carpeta con sus propios archivos, que no
 * dependen de nada de esto: apuntar las rutas de vuelta a
 * `bocetoactualizado.svg` lo devuelve al aire tal como estaba (sin tlacuilo,
 * que esa figura es de este cartel).
 */
const BASE = import.meta.env.BASE_URL;

/** El dibujo de lineas: la ilustracion completa, tlacuilo incluido. */
export const PLANTILLA_DIBUJO = `${BASE}Mural/Final.svg`;

/**
 * El tlacuilo: la figura central, separada del resto con `tools/figuras.py`.
 *
 * Es lo unico del cartel que no pintan los datos. Va en su propio SVG —con el
 * viewBox ajustado a la figura— porque se dibuja aparte y encima de todo, y
 * porque es la parte que se mira de cerca con la lupa: rasterizada por su
 * cuenta, aguanta el acercamiento con el trazo limpio.
 */
export const PLANTILLA_TLACUILO = `${BASE}Mural/Final.tlacuilo.svg`;

/**
 * Las zonas delimitadas sobre ese dibujo, y los parametros con los que se
 * binariza. Ya no decide donde se pinta nadie —de eso se encarga la red—,
 * pero de aqui sale el campo que le pone borde a la figura. Lo escribe
 * `tools/zonas.py` (ver `@io/zonesConfig`).
 */
export const PLANTILLA_ZONAS = `${BASE}Mural/Final.zones.json`;

/**
 * El recorrido de la espiral: la columna sobre la que se arma la
 * visualizacion (ver `@core/render/espina`). Se hornea con `tools/espina.py`
 * a partir del mismo SVG y se versiona al lado; si cambia la ilustracion, hay
 * que volver a correrlo. Va de la cola de la serpiente al centro de la
 * espiral, que es justo donde esta sentado el tlacuilo: la red termina —o
 * empieza, segun se mire— en su mano.
 */
export const PLANTILLA_ESPINA = `${BASE}Mural/Final.espina.json`;

/**
 * Las lineas del dibujo, una por una: lo que la red va trazando (ver
 * `@core/render/boceto`) y lo que dibuja el lapiz del cartel (ver
 * `mural/trazado`). El SVG no se muestra nunca como lamina —el cartel existe
 * en pantalla solo porque alguien lo esta trazando—, asi que esto no es un
 * adorno: sin el archivo no hay figura ni dibujo, y el mural cae al reparto
 * por zonas de antes. Se hornea con `tools/trazos.py` desde el mismo SVG y se
 * versiona al lado; si cambia la ilustracion, hay que volver a correrlo.
 */
export const PLANTILLA_TRAZOS = `${BASE}Mural/Final.trazos.json`;

/** El banco de registros simulados, de solo lectura. */
export const DATOS_EJEMPLO = `${BASE}samples/datos_ejemplo.csv`;
