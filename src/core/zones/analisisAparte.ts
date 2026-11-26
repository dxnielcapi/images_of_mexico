/**
 * La puerta al analisis en un hilo aparte.
 *
 * Medir el dibujo —binarizar, cerrar el trazo, la transformada de distancia y
 * el etiquetado— son tres transformadas sobre los 3,94 millones de pixeles del
 * cartel: medido en este escritorio, unos **500 ms** (677 el primer arranque)
 * de los 700 que tarda el mural en estar listo, y en un telefono varias veces
 * eso. Corria en el hilo de la pagina, asi que era el 70 % de la espera y
 * ademas la tomaba entera: el Hero ya empezaba a trazarse antes (ver
 * `alTenerDibujo` en `mural/cartel`), pero se quedaba clavado en su primer
 * fotograma hasta que el analisis terminaba, y la pagina con el —ni scroll, ni
 * barra, ni formulario—. El hueco mas grande entre dos fotogramas era de
 * 598 ms; ahora es de 113, y lo que queda ya no es medir sino pintar.
 *
 * No se puede abaratar sin cambiar el dibujo. La transformada ya es la exacta
 * en tiempo lineal (Felzenszwalb & Huttenlocher) y medida pasada por pasada
 * esta en su piso; bajar la resolucion del analisis si lo abarataria —cuatro
 * veces menos pixeles— pero el campo mide 4,2 px de profundidad mediana, o sea
 * que lo pintable son bandas de ocho pixeles de ancho: a la mitad de
 * resolucion el cierre morfologico ya no rellena las mismas, y eso cambia el
 * dibujo. Hornearlo con `tools/` tampoco: el campo se usa pixel a pixel contra
 * el mismo raster que el navegador acaba de hacer, y el rasterizador de Python
 * no cae en el mismo pixel (comprobado: 5 % de area pintable de diferencia, un
 * pixel de desajuste). Por eso `zonas.py` hornea semillas y no mascaras.
 *
 * Asi que el calculo se queda entero y exacto, y lo que se va es el bloqueo.
 * Lo unico que queda en el hilo de la pagina es la binarizacion —13 ms— porque
 * es la que necesita la `ImageData` de dieciseis megas que ya esta aqui; lo
 * que viaja es la mascara de tinta, que es la cuarta parte y va transferida,
 * sin copia.
 *
 * Si no hay hilos —un navegador viejo, una politica de contenido que los
 * prohibe, el archivo que no carga— se mide aqui mismo, como antes. El mural
 * abre igual, nada mas que la pagina se queda quieta ese rato: es el mismo
 * trato que tienen los cuatro archivos horneados, que si faltan el cartel sale
 * igual (ver `mural/cartel`).
 */
import { analyzeDrawing, type Analysis, type DetectParams } from '../scene';
import { binarize } from './binarize';
import type { PeticionAnalisis } from './analisis.worker';

/**
 * Mide el dibujo en un hilo aparte y devuelve el mismo analisis de siempre.
 *
 * `imageData` no se toca —solo se lee para binarizar—, asi que sigue siendo de
 * quien la presto y el respaldo de abajo puede volver a leerla si el hilo
 * falla a mitad de camino.
 */
export async function analizarAparte(
  imageData: ImageData,
  width: number,
  height: number,
  p: DetectParams
): Promise<Analysis> {
  const aqui = () => analyzeDrawing(imageData, width, height, p);
  if (typeof Worker === 'undefined') return aqui();

  let hilo: Worker;
  try {
    hilo = new Worker(new URL('./analisis.worker.ts', import.meta.url), { type: 'module' });
  } catch (err) {
    console.warn('No se pudo abrir el hilo del analisis; se mide en la pagina:', err);
    return aqui();
  }

  try {
    return await new Promise<Analysis>((listo, falla) => {
      hilo.onmessage = (e: MessageEvent<Analysis>) => listo(e.data);
      hilo.onerror = (e) => falla(new Error(e.message || 'el hilo del analisis fallo'));
      // La mascara se transfiere: a partir de aqui es del hilo y no de la
      // pagina. Por eso el respaldo vuelve a binarizar en vez de reusarla.
      const ink = binarize(imageData, p.threshold);
      const peticion: PeticionAnalisis = { ink, width, height, p };
      hilo.postMessage(peticion, [ink.buffer]);
    });
  } catch (err) {
    console.warn('El hilo del analisis fallo; se mide en la pagina:', err);
    return aqui();
  } finally {
    hilo.terminate();
  }
}
