/**
 * Aligera los SVG del mural sin tocar el dibujo.
 *
 *     node tools/aligerar.mjs                       # los dos del mural
 *     node tools/aligerar.mjs public/Mural/Otro.svg # o los que se le pasen
 *
 * El export de Concepts viene con dieciseis decimales por coordenada: el
 * `Final.svg` son 4,2 MB de los cuales casi tres son ceros al final de los
 * numeros. Eso lo paga entero el telefono —bajarlo, y despues parsearlo y
 * decodificarlo antes de poder rasterizarlo— y el Hero no puede empezar a
 * trazarse hasta que ese archivo esta. Recortando a dos decimales quedan
 * 1,2 MB sin que cambie un solo pixel.
 *
 * Dos decimales y no uno: el viewBox esta en puntos y el dibujo se rasteriza
 * a 2000 px, o sea 0,75 px por punto. Un centesimo de punto es tres milesimas
 * de pixel —invisible, y comprobado: de los 482.000 pixeles con tinta de la
 * plantilla, el recorte mueve 4.400 bordes y ninguno mas de un cuarto de
 * tono—. Con un decimal pesaria 0,7 MB, pero ya es un diezmilesimo de pixel
 * de margen y no hace falta apurarlo tanto.
 *
 * **Los `id` se quedan.** Es lo unico que se le cambia a `preset-default`, y
 * no es un detalle: los horneados de Python buscan las capas del export por
 * su `id` (`CAPA` en `figuras.py`, `CAPAS_ESPIRAL` en `espina.py`). Sin ellos
 * el archivo pesa 80 KB menos y deja de poder rehornearse.
 *
 * Es idempotente: pasarlo dos veces no cambia nada. Y va antes de los
 * horneados, para que todo salga del mismo archivo (ver *Cambiar la
 * ilustracion* en el README).
 */
import { optimize } from 'svgo';
import { readFileSync, writeFileSync, statSync } from 'node:fs';

/** Los SVG del mural. Quien los nombra para la app es `src/io/plantilla.ts`. */
const POR_DEFECTO = ['public/Mural/Final.svg', 'public/Mural/Final.tlacuilo.svg'];

/** Decimales que se guardan de cada coordenada. */
const DECIMALES = 2;

const archivos = process.argv.slice(2);
const mb = (n) => `${(n / 1048576).toFixed(2)} MB`;

for (const ruta of archivos.length ? archivos : POR_DEFECTO) {
  const antes = statSync(ruta).size;
  const { data } = optimize(readFileSync(ruta, 'utf8'), {
    multipass: true,
    floatPrecision: DECIMALES,
    plugins: [{ name: 'preset-default', params: { overrides: { cleanupIds: false } } }],
  });
  writeFileSync(ruta, data);
  const despues = statSync(ruta).size;
  const menos = antes > 0 ? Math.round((1 - despues / antes) * 100) : 0;
  console.log(`${ruta}: ${mb(antes)} -> ${mb(despues)} (${menos} % menos)`);
}
