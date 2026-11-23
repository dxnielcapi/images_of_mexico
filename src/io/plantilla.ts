/**
 * La plantilla del mural: la ilustracion sobre la que se trabaja todo.
 *
 * Un solo lugar nombra los archivos del mural. Cambiar la ilustracion es
 * cambiar estas rutas y rehacer los archivos que van a su lado; ningun otro
 * modulo sabe donde viven.
 *
 * Hoy la plantilla es `public/Mural/bocetoactualizado.svg`, la serpiente
 * emplumada en espiral. Se carga como SVG y el motor lo rasteriza al vuelo
 * (ver `@io/readers/drawing`), asi que se puede reemplazar por una version mas
 * trabajada del mismo trazo sin tocar codigo: mientras el trazo pase por
 * donde pasaba, las semillas de su `.zones.json` lo vuelven a encontrar.
 *
 * Este boceto todavia no cierra ninguna region: su `.zones.json` trae
 * `close`, y las zonas salen del relleno del propio trazo (ver `strokeFill`).
 * El dibujo definitivo vendra con las zonas delimitadas y ahi `close` vuelve a
 * 0. El boceto anterior sigue en la carpeta con su propio `.zones.json`, que
 * no depende de nada de esto: apuntar las rutas de vuelta a `boceto.svg` lo
 * devuelve al aire tal como estaba.
 */
const BASE = import.meta.env.BASE_URL;

/** El dibujo de lineas: la ilustracion principal. */
export const PLANTILLA_DIBUJO = `${BASE}Mural/bocetoactualizado.svg`;

/**
 * Las zonas delimitadas sobre ese dibujo, y los parametros con los que se
 * binariza. Ya no decide donde se pinta nadie —de eso se encarga la red—,
 * pero de aqui sale el campo que le pone borde a la figura. Es un archivo a
 * mano desde que se borro el studio (ver `@io/zonesConfig`).
 */
export const PLANTILLA_ZONAS = `${BASE}Mural/bocetoactualizado.zones.json`;

/**
 * El recorrido de la espiral: la columna sobre la que se arma la
 * visualizacion (ver `@core/render/espina`). Se hornea con `tools/espina.py`
 * a partir del mismo SVG y se versiona al lado; si cambia la ilustracion, hay
 * que volver a correrlo.
 */
export const PLANTILLA_ESPINA = `${BASE}Mural/bocetoactualizado.espina.json`;

/**
 * Las lineas del dibujo, una por una: lo que las pinceladas de la gente van
 * a trazar (ver `@core/render/boceto`). El mural no muestra el boceto —la
 * figura aparece porque la pintan los registros—, asi que esto no es un
 * adorno: sin el archivo no hay figura que dibujar y el mural cae al reparto
 * por zonas de antes. Se hornea con `tools/trazos.py` desde el mismo SVG y se
 * versiona al lado; si cambia la ilustracion, hay que volver a correrlo.
 */
export const PLANTILLA_TRAZOS = `${BASE}Mural/bocetoactualizado.trazos.json`;

/** El banco de registros simulados, de solo lectura. */
export const DATOS_EJEMPLO = `${BASE}samples/datos_ejemplo.csv`;
