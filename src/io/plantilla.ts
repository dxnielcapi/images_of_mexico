/**
 * La plantilla del mural: la ilustracion sobre la que se trabaja todo.
 *
 * Un solo lugar nombra los archivos del mural para que la pagina publica, la
 * pantalla de registro y el studio carguen siempre el mismo dibujo. Cambiar la
 * ilustracion es cambiar estas rutas (y exportar su `.zones.json` desde el
 * studio); ningun otro modulo sabe donde viven.
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

/** Las zonas delimitadas sobre ese dibujo (exportadas desde el studio). */
export const PLANTILLA_ZONAS = `${BASE}Mural/bocetoactualizado.zones.json`;

/** El banco de registros simulados, de solo lectura. */
export const DATOS_EJEMPLO = `${BASE}samples/datos_ejemplo.csv`;
