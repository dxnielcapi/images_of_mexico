/**
 * La pincelada de una persona: un registro dibujando su pedazo de la figura.
 *
 * El mural dejo de tener un boceto debajo. Lo que se ve es lo que la gente
 * pinto: cada registro es una pincelada que corre *sobre* una linea del
 * dibujo (ver `@core/render/boceto`), y la serpiente emplumada aparece
 * porque hay suficientes personas como para haberla trazado entera. Con
 * veinte se adivina, con doscientas esta completa, y de ahi en mas las
 * pinceladas se encavalgan y la linea se carga de pigmento.
 *
 * No es un calco. El reparto dice por donde va —el tramo de linea que le
 * toca— y el valor del registro dice cuanto abarca y cuanto cuerpo tiene,
 * pero el trazo mismo le erra a la linea: se despega, la cruza, se pasa de
 * largo. Es a proposito y es lo que hace la diferencia entre un dibujo
 * vectorial y un mural pintado entre muchos. El error es del tamano del
 * pulso de una mano (`pulso`), no del de un borron: de lejos la figura cierra.
 *
 * Lo que devuelve es una `Rama` como la de `@core/render/rama`, asi que se
 * pinta, se señala con el raton y le brotan hebras exactamente igual: lo que
 * cambia es de donde sale la geometria, no como se pinta.
 */
import type { DataRecord, PlacedPoint } from '../types';
import { gaussian, mulberry32, seedFor, type Rng } from '../sampling/prng';
import { puntoEn, type Boceto, type Tramo, type Traza } from './boceto';
import type { Rama, RepartoParams } from './rama';

export interface PinceladaParams {
  /** Largo del pedazo de linea que le toca a cada persona, en px de trabajo. */
  tramo: number;
  /** Cuanto se pasa de su pedazo la pincelada mas cargada, en fracciones de tramo. */
  sobrepaso: number;
  /** Cuanto le puede errar a la linea, en px de trabajo. */
  pulso: number;
  /** Cuanto mas gruesa que la linea negra va la pincelada. */
  cuerpo: number;
  /** Semiancho minimo, en px de trabajo: una linea fina igual se tiene que ver. */
  anchoMin: number;
  /**
   * Semiancho maximo, en px de trabajo. El dibujo tiene manchas llenas —el
   * hocico, el ojo— donde la "linea" mide cuarenta pixeles de ancho: sin
   * techo, la persona a la que le toca ese pedazo pinta un borron del tamano
   * de la cabeza. Con techo, la mancha la pintan varias pinceladas anchas,
   * que es como se rellena a mano.
   */
  anchoMax: number;
}

/**
 * Afinados contra la plantilla a su tamano nativo (~2000 px de lado); las
 * medidas en pixeles las recalcula `medidasParaDibujo` para el dibujo que se
 * cargue.
 */
export const DEFAULT_PINCELADA: PinceladaParams = {
  tramo: 150,
  sobrepaso: 0.6,
  pulso: 5,
  cuerpo: 1.3,
  anchoMin: 4.5,
  anchoMax: 12.5,
};

/** Separacion entre puntos del eje, en px de trabajo. */
const PASO_EJE = 8;
/** Fraccion de la pincelada en la que entra y sale el pincel. */
const PUNTA = 0.16;
/**
 * Lo mas que se estira una pincelada cuando hay menos gente que pedazos de
 * dibujo. Sin tope, veinte personas pintarian la figura entera de veinte
 * trazos larguisimos y el mural no tendria nada que contar sobre cuanta
 * gente paso; con este, con poca gente la figura se insinua y se va cerrando
 * a medida que llegan.
 */
const ALCANCE_MAX = 2.5;

/**
 * Reparte a la gente sobre las lineas del dibujo.
 *
 * El pedazo que le toca a cada uno sale de su lugar en la lista y del orden
 * disperso del boceto: el primero que llego pinta la linea mas larga, el
 * segundo se va al otro extremo de la figura, y asi. Es un reparto de obra,
 * no un sorteo: con el azar, media docena de pedazos se llevaban tres
 * pinceladas y la mitad del dibujo quedaba sin tocar.
 *
 * Como es por posicion en la lista y la lista solo crece por el final,
 * registrarse no mueve lo que ya estaba pintado: el mural de ayer es el de
 * hoy con unas pinceladas mas.
 *
 * El trazo en si lo decide la semilla de la persona, como siempre: dos
 * personas en el mismo pedazo de linea no pintan la misma pincelada.
 */
export function pinceladasDe(
  records: readonly DataRecord[],
  boceto: Boceto,
  p: PinceladaParams,
  reparto: RepartoParams
): Rama[] {
  const span = reparto.max - reparto.min || 1;
  const cuantos = boceto.tramos.length;
  if (cuantos === 0) return [];

  // Arco acumulado donde empieza cada traza: con el, la posicion de una
  // pincelada en el dibujo entero es un solo numero en [0,1] (`s`), que es lo
  // que ordena los testimonios.
  const arranque = new Float64Array(boceto.trazas.length);
  for (let i = 1; i < boceto.trazas.length; i++) {
    arranque[i] = arranque[i - 1] + boceto.trazas[i - 1].largo;
  }

  // Cuando hay menos gente que pedazos, a cada uno le toca mas dibujo: la
  // pincelada se estira desde el centro de su pedazo hasta donde llegue. Es
  // lo unico que depende de cuanta gente hay —de donde pinta cada uno no se
  // mueve nadie— y es lo que hace que la figura cierre con el banco de
  // ejemplo en vez de quedar en una linea de puntos.
  const cobertura = Math.min(ALCANCE_MAX, Math.max(1, cuantos / Math.max(1, records.length)));

  const ramas: Rama[] = [];
  for (let i = 0; i < records.length; i++) {
    const record = records[i];
    const rng = mulberry32((seedFor(record.id, reparto.globalSeed) ^ 0x2d9f1c07) >>> 0);
    const t = Math.max(0, Math.min(1, (record.valor - reparto.min) / span));
    const tramo = boceto.tramos[boceto.orden[i % cuantos]];
    const traza = boceto.trazas[tramo.traza];
    const punto: PlacedPoint = { record, x: 0, y: 0, t };
    const s = Math.min(1, (arranque[tramo.traza] + (tramo.desde + tramo.hasta) / 2) / boceto.largo);
    ramas.push(pinceladaDe(punto, traza, tramo, s, cobertura, p, rng));
  }

  return ramas;
}

/**
 * El trazo de una persona sobre su pedazo de linea.
 *
 * El valor estira la pincelada —la mas cargada se pasa de su pedazo y se
 * encavalga con las vecinas, que es lo que cierra la figura— y le da cuerpo,
 * pero el grosor lo manda sobre todo la linea del dibujo: sobre el lomo de la
 * serpiente la pincelada es ancha y en una pluma es un pelo, igual que en el
 * boceto.
 */
function pinceladaDe(
  punto: PlacedPoint,
  traza: Traza,
  tramo: Tramo,
  s: number,
  cobertura: number,
  p: PinceladaParams,
  rng: Rng
): Rama {
  const t = punto.t;
  // La pincelada crece desde el centro de su pedazo: el sobrepaso la hace
  // morder el pedazo de al lado, que es lo que empalma una linea con la
  // siguiente en vez de dejar la junta a la vista.
  const centro = (tramo.desde + tramo.hasta) / 2;
  const mitad = ((tramo.hasta - tramo.desde) * cobertura) / 2;
  const sobra = p.sobrepaso * p.tramo * (0.2 + t);
  const desde = Math.max(0, centro - mitad - sobra * rng());
  const hasta = Math.min(traza.largo, centro + mitad + sobra * rng());
  const largo = Math.max(1, hasta - desde);

  const pasos = Math.max(4, Math.min(72, Math.round(largo / PASO_EJE)));
  const eje = new Float32Array((pasos + 1) * 2);
  const anchos = new Float32Array(pasos + 1);

  // El pulso de la mano: una desviacion lenta de la linea (la mano que se va
  // de largo y vuelve) y un temblor mas corto encima. Cada pincelada tiene su
  // fase, asi que dos personas sobre la misma linea no se despegan igual.
  const sesgo = gaussian(rng) * 0.45;
  const fase = rng() * Math.PI * 2;
  const vueltas = 0.6 + rng() * 1.4;
  const faseFina = rng() * Math.PI * 2;
  const lado = sesgo >= 0 ? 1 : -1;
  // La presion del pincel, que va y viene a lo largo del trazo.
  const fasePresion = rng() * Math.PI * 2;
  const carga = 0.55 + t * 0.75;

  for (let i = 0; i <= pasos; i++) {
    const f = i / pasos;
    const q = puntoEn(traza, desde + largo * f);
    const desvio = p.pulso * (
      sesgo + 0.55 * Math.sin(fase + f * Math.PI * 2 * vueltas)
      + 0.2 * Math.sin(faseFina + f * Math.PI * 7)
    );
    eje[i * 2] = q.x - Math.sin(q.ang) * desvio;
    eje[i * 2 + 1] = q.y + Math.cos(q.ang) * desvio;

    // Entrada y salida del pincel: el trazo no empieza con todo el cuerpo ni
    // termina en seco. El casquete es redondo, no en punta de lanza.
    const borde = Math.min(f, 1 - f) / PUNTA;
    const punta = borde < 1 ? Math.sqrt(Math.max(0.08, borde)) : 1;
    const presion = 1 + 0.16 * Math.sin(fasePresion + f * Math.PI * 3);
    const grosor = Math.min(p.anchoMax, Math.max(p.anchoMin, q.w * p.cuerpo));
    anchos[i] = grosor * carga * presion * punta;
  }

  const medio = pasos >> 1;
  punto.x = eje[medio * 2];
  punto.y = eje[medio * 2 + 1];

  return { punto, s, eje, anchos, lado };
}
