/**
 * El recorrido: por donde se tiende la red, y cuanto dibujo abarca.
 *
 * La red necesita una sola cosa de la ilustracion: una linea continua que
 * recorrer de punta a punta, para repartir a la gente a lo largo. Al
 * principio esa linea era la espina —el eje de la banda del cuerpo— y por eso
 * el mural dibujaba la espiral y nada mas: la cabeza y las plumas no estaban
 * en el recorrido, asi que no habia donde ponerlas por mucha gente que
 * llegara.
 *
 * Aqui el recorrido deja de ser fijo y pasa a depender de cuanta gente hay.
 *
 * La idea es sostener la densidad. Una figura se lee cuando hay un nodo cada
 * tantos pixeles de linea; si se reparten trescientas personas sobre el
 * dibujo entero, queda una nube de puntos sueltos y no se lee nada, y si se
 * reparten mil sobre la espiral sola, queda un cordon apelmazado. Entonces el
 * recorrido se arma al reves: se mide cuanto dibujo aguanta la poblacion que
 * hay (`GENTE_FIGURA_COMPLETA`) y se toma solo eso.
 *
 * El cuerpo entra siempre —es la figura— y lo demas se anexa de mayor a
 * menor, que es el orden en que `tools/trazos.py` deja las lineas. Asi el
 * mural crece como crece un dibujo: primero la espiral, despues las plumas
 * grandes, al final el detalle fino —los nopales, las mazorcas, los
 * ornamentos—. Con trescientas personas se ve la serpiente; con mil y pico, el
 * codice entero.
 *
 * Lo que no entro en el recorrido no desaparece: la linea sigue ahi y el
 * lapiz la dibuja igual al pasar, solo que sin tinta (ver
 * `@core/render/silueta` y `mural/trazado`). El cartel entero se traza
 * siempre; lo que la gente decide es que parte de el marca.
 *
 * Las piezas van ordenadas por donde caen sobre la espiral, no por largo:
 * el recorrido es un solo barrido de la cabeza al centro que se desvia a cada
 * pluma al pasarle al lado. Eso es lo que mantiene cortas las aristas entre
 * gente parecida, que es lo que dibuja.
 */
import { enLargo, type Espina } from './espina';
import { puntoEn, type Boceto, type Traza } from './boceto';

/** Un punto del recorrido: donde esta, hacia donde va y cuanto mide ahi. */
export interface PuntoRecorrido {
  x: number;
  y: number;
  /** Direccion de avance, en radianes. */
  ang: number;
  /** Semiancho disponible a los costados. */
  w: number;
}

export interface Recorrido {
  /** Largo total, en px de trabajo. */
  largo: number;
  /** Cuantas lineas del dibujo entraron, sin contar el cuerpo. */
  lineas: number;
  /** Cuantas hay en total: con `lineas`, dice cuanto falta para la figura. */
  lineasTotales: number;
  /** El punto a `s` del recorrido, con `s` en [0,1]. */
  en(s: number): PuntoRecorrido;
}

/**
 * Con cuanta gente queda la ilustracion completa.
 *
 * Es la perilla del crecimiento, y esta dicha en personas y no en pixeles a
 * proposito. En pixeles —"tantos de linea por persona"— el numero decia algo
 * sobre la densidad pero nada sobre cuando se cierra la figura, y encima
 * dependia del tamano al que se rasterice el SVG: la misma constante daba un
 * umbral distinto si manana el dibujo se exporta mas grande. Dicho asi, el
 * presupuesto es una fraccion del dibujo y el umbral es el que se lee aqui,
 * venga la ilustracion del tamano que venga.
 *
 * Subirlo hace que la figura tarde mas en completarse y que cada linea vaya
 * mas cargada mientras tanto; bajarlo la completa antes y mas rala.
 */
export const GENTE_FIGURA_COMPLETA = 1800;

/** Una pieza del recorrido: un trozo de espina o una linea del dibujo. */
interface Pieza {
  largo: number;
  /** Donde cae sobre la espiral, en [0,1]: con esto se ordenan. */
  ancla: number;
  en(dist: number): PuntoRecorrido;
}

/**
 * El dibujo listo para recorrer: sus piezas medidas y ancladas a la espiral.
 *
 * Se arma una sola vez al cargar. Lo que cambia con cada alta es cuantas de
 * esas piezas entran, y eso es `recorridoDe`, que solo corta una lista ya
 * ordenada.
 */
export interface Trama {
  /** El cuerpo, troceado: entra entero y siempre. */
  cuerpo: Pieza[];
  /** Las lineas del dibujo, de mayor a menor: se anexan hasta donde alcance. */
  detalle: Pieza[];
  /** Largo de todo el dibujo, con cuerpo y detalle. */
  largoTotal: number;
  /**
   * Donde cae cada linea del boceto sobre la espiral, en [0,1] y por su
   * indice en el boceto. Es la misma medida con la que se ordena el
   * recorrido, y sirve ademas para recorrer el cartel como lo recorreria la
   * mano: dando la vuelta (ver `ordenPorEspiral`).
   */
  anclas: Float32Array;
}

/** Cada cuanto se corta la espina para poder intercalarle las lineas. */
const TROZO_CUERPO = 240;

/**
 * Ancla de un punto sobre la espiral: en que `s` le queda mas cerca.
 *
 * Es una barrida lineal sobre los puntos de la espina. Son mil y pico por
 * linea y unas trescientas lineas, una sola vez al cargar el dibujo; un
 * indice espacial aqui seria mas codigo que trabajo ahorrado.
 */
function anclaDe(espina: Espina, x: number, y: number): number {
  let mejor = 0;
  let mejorD = Infinity;
  for (let i = 0; i < espina.xs.length; i++) {
    const d = (espina.xs[i] - x) ** 2 + (espina.ys[i] - y) ** 2;
    if (d < mejorD) { mejorD = d; mejor = i; }
  }
  return espina.largo > 0 ? espina.acum[mejor] / espina.largo : 0;
}

/** Una linea del dibujo como pieza del recorrido. */
function piezaDeTraza(t: Traza, ancla: number): Pieza {
  return { largo: t.largo, ancla, en: (dist) => puntoEn(t, dist) };
}

/** Arma la trama: el dibujo medido y ordenado, listo para recortar. */
export function tramaDe(boceto: Boceto, espina: Espina): Trama {
  // El cuerpo, en trozos: cortarlo es lo que deja intercalar cada pluma en el
  // punto del barrido donde realmente esta, en vez de pegarlas todas al final.
  const cuerpo: Pieza[] = [];
  const trozos = Math.max(1, Math.round(espina.largo / TROZO_CUERPO));
  const paso = espina.largo / trozos;
  for (let i = 0; i < trozos; i++) {
    const inicio = i * paso;
    cuerpo.push({
      largo: paso,
      ancla: espina.largo > 0 ? (inicio + paso / 2) / espina.largo : 0,
      en: (dist) => enLargo(espina, inicio + dist),
    });
  }

  // Donde cae cada linea sobre la espiral. Se mide una vez y la usan los dos
  // que la necesitan: el recorrido, para intercalar las plumas por donde
  // estan, y el lapiz del cartel, para recorrerlo dando la vuelta.
  const anclas = new Float32Array(boceto.trazas.length);
  boceto.trazas.forEach((t, i) => {
    const medio = puntoEn(t, t.largo / 2);
    anclas[i] = anclaDe(espina, medio.x, medio.y);
  });

  // El detalle, de mayor a menor: es el orden en que le van saliendo las
  // plumas al dibujo. El horneado ya las deja asi, pero no cuesta asegurarlo.
  const detalle = boceto.trazas
    .map((t, i) => ({ t, i }))
    .sort((a, b) => b.t.largo - a.t.largo || a.i - b.i)
    .map(({ t, i }) => piezaDeTraza(t, anclas[i]));

  const largoCuerpo = cuerpo.reduce((s, p) => s + p.largo, 0);
  return {
    cuerpo,
    detalle,
    anclas,
    largoTotal: largoCuerpo + detalle.reduce((s, p) => s + p.largo, 0),
  };
}

/**
 * Las lineas del cartel en el orden en que las recorre la espiral: de la
 * cola de la serpiente al centro, desviandose a cada nopal y a cada mazorca
 * al pasarle al lado.
 *
 * Es el orden en que las dibuja el lapiz del mural (ver `mural/trazado`). El
 * del horneado —de la linea mas larga a la mas corta— sirve para repartir el
 * presupuesto, pero visto dibujar seria un parpadeo de pedazos sueltos por
 * todo el cartel: la mano no salta, da la vuelta.
 */
export function ordenPorEspiral(trama: Trama): Int32Array {
  const orden = new Int32Array(trama.anclas.length);
  for (let i = 0; i < orden.length; i++) orden[i] = i;
  return orden.sort((a, b) => trama.anclas[a] - trama.anclas[b] || a - b);
}

/**
 * El recorrido que le toca a esta cantidad de gente.
 *
 * El cuerpo entra siempre; el detalle, hasta donde alcance el presupuesto.
 * Con el dibujo entero adentro el presupuesto deja de importar y lo que sigue
 * creciendo es la densidad: a partir de ahi, mas gente es mas pigmento sobre
 * la misma figura.
 */
export function recorridoDe(
  trama: Trama,
  gente: number,
  genteCompleta = GENTE_FIGURA_COMPLETA
): Recorrido {
  const fraccion = Math.max(0, gente) / Math.max(1, genteCompleta);
  const presupuesto = fraccion * trama.largoTotal;
  const largoCuerpo = trama.cuerpo.reduce((s, p) => s + p.largo, 0);

  const piezas = [...trama.cuerpo];
  let largo = largoCuerpo;
  let lineas = 0;
  for (const pieza of trama.detalle) {
    if (largo >= presupuesto) break;
    piezas.push(pieza);
    largo += pieza.largo;
    lineas++;
  }

  // Un solo barrido de la cabeza al centro, desviandose a cada pieza al
  // pasarle al lado.
  piezas.sort((a, b) => a.ancla - b.ancla);

  const acum = new Float64Array(piezas.length + 1);
  for (let i = 0; i < piezas.length; i++) acum[i + 1] = acum[i] + piezas[i].largo;
  const total = acum[piezas.length] || 1;

  return {
    largo: total,
    lineas,
    lineasTotales: trama.detalle.length,
    en(s: number): PuntoRecorrido {
      const d = Math.min(1, Math.max(0, s)) * total;
      // Busqueda binaria de la pieza que contiene ese arco.
      let lo = 0;
      let hi = piezas.length - 1;
      while (lo < hi) {
        const mid = (lo + hi + 1) >> 1;
        if (acum[mid] <= d) lo = mid;
        else hi = mid - 1;
      }
      return piezas[lo].en(d - acum[lo]);
    },
  };
}
