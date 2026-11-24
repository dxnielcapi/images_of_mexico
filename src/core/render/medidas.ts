/**
 * Las medidas de una marca para un dibujo dado.
 *
 * El lienzo mide lo que mida el archivo de la plantilla —la ilustracion se
 * rasteriza al vuelo desde el SVG, hoy a unos 2000 px de lado— y despues se
 * muestra a una fraccion de eso. Con medidas fijas en pixeles, la misma marca
 * se ve enorme en un dibujo chico y como una mota en uno grande. Atadas a la
 * proporcion, el mural se ve igual aunque manana la ilustracion se exporte a
 * otro tamano.
 *
 * Vive en `core` y no en el mural porque no es una decision de pantalla sino
 * del dibujo: cualquiera que lo rasterice tiene que llegar a las mismas
 * medidas. Desde que no hay sliders en ningun lado, este archivo es la unica
 * fuente de los tamanos.
 */
import { DEFAULT_WATERCOLOR, type WatercolorParams } from './watercolor';
import { DEFAULT_TRAZO, type TrazoParams } from './trazo';
import { DEFAULT_RAMA, type RamaParams } from './rama';
import { DEFAULT_PINCELADA, type PinceladaParams } from './pincelada';
import { DEFAULT_TRONCO, type TroncoParams } from './tronco';
import { DEFAULT_TESTIMONIOS, type TestimonioParams } from './testimonios';
import { DEFAULT_RED, type RedParams } from './red';
import { DEFAULT_SILUETA, type SiluetaParams } from './silueta';

/** Radio de la mancha como fraccion del lado mayor del dibujo. */
const RADIO_MANCHA = 0.019;

/**
 * ...salvo que el hueco donde tiene que caer sea mas angosto que eso: entonces
 * manda el hueco, y la mancha mide mas o menos su ancho (`typicalDepth` da la
 * mitad). Es lo que deja que el mismo mural sirva para un dibujo de petalos
 * anchos y para un boceto que todavia es una cinta de 14 px: con el radio de
 * siempre, cada mancha saldria recortada en una raya y el dibujo entero se
 * empastaria de un solo rojo.
 */
const ANCHO_HUECO = 2.2;

/**
 * El trazo, a diferencia de la mancha, no se mide contra el ancho del cuerpo:
 * la mancha tiene que caber adentro y el filamento esta hecho para salirse.
 * Solo se mide contra el dibujo entero.
 */
const LARGO_TRAZO = 0.08;
const GROSOR_TRAZO = 0.0026;
const PUNTA_TRAZO = 0.003;

/**
 * La rama y el tronco se miden contra el dibujo entero, no contra el hueco:
 * no tienen que caber en ningun lado. El largo de la rama esta medido contra
 * la separacion entre dos vueltas de la espiral —una rama fuerte casi toca la
 * vuelta de al lado, y ahi es donde el mural se cierra como figura—, y el
 * ancho del tronco contra el de la banda del cuerpo.
 */
const LARGO_RAMA = 0.125;
const ANCHO_RAMA = 0.0105;
const ANCHO_TRONCO = 0.009;
const ANCHO_TRONCO_DATO = 0.008;

/**
 * La pincelada tampoco se mide contra el hueco: corre sobre una linea del
 * dibujo y su grosor sale de esa linea (ver `@core/render/pincelada`). Lo que
 * se mide contra el dibujo entero es cuanto abarca —el `TRAMO`, que es lo que
 * decide con cuanta gente queda la figura completa— y el pulso con el que le
 * erra, que es lo que hace que se vea pintada y no calcada.
 */
const TRAMO_PINCELADA = 0.075;
const PULSO_PINCELADA = 0.0025;
const ANCHO_PINCELADA = 0.0023;
const ANCHO_PINCELADA_MAX = 0.0062;

/**
 * La red tampoco se mide contra el hueco: los nodos caen sobre la banda del
 * cuerpo y es la banda la que los contiene. Lo que se mide contra el dibujo
 * entero es el tamano del nodo, el alcance de una arista —que es lo que
 * decide si la red se lee como un tejido o como una maraña— y el radio con
 * el que se siente el cursor, que tiene que ser varias veces el nodo o la
 * esquivada no se nota.
 *
 * El nodo y la arista se achicaron al pasar al cartel terminado. No es
 * gusto: con la lupa, el mural dejo de mirarse solo entero. De lejos un nodo
 * grande ayudaba a que el remolino se viera; de cerca, con nodos de treinta
 * y seis pixeles cada treinta y siete de recorrido, lo que se ve es una
 * mancha continua y no la gente que la forma. Mas chico, el mural de lejos
 * pierde poco —son muchos— y de cerca se entiende: cada punto es alguien.
 * Lo mismo la arista: acortada, une a quien se parece *y* esta al lado, en
 * vez de cruzar el dibujo de parte a parte.
 */
/**
 * La silueta se mide igual: lo que hay que escalar es a que distancia un nodo
 * entinta la linea que tiene debajo —tiene que ser del orden del nodo, o la
 * tinta se adelantaria a la gente— y el grosor con el que se ve una linea del
 * dibujo cuando el mural se mira entero.
 */
const CERCA_SILUETA = 0.013;
const GROSOR_SILUETA = 0.00055;

const RADIO_NODO_MIN = 0.0027;
const RADIO_NODO_MAX = 0.0062;
const LARGO_ARISTA = 0.058;
const ANCHO_ARISTA = 0.0012;
const ALCANCE_CURSOR = 0.075;
const EMPUJE_CURSOR = 0.013;

export interface Medidas {
  watercolor: WatercolorParams;
  silueta: SiluetaParams;
  trazo: TrazoParams;
  rama: RamaParams;
  pincelada: PinceladaParams;
  tronco: TroncoParams;
  testimonios: TestimonioParams;
  red: RedParams;
}

/**
 * `lado` es el lado mayor del dibujo; `hueco`, la mediana de la distancia al
 * borde entre los pixeles pintables (`typicalDepth`).
 */
export function medidasParaDibujo(lado: number, hueco: number): Medidas {
  const porDibujo = lado * RADIO_MANCHA;
  const porHueco = hueco > 0 ? hueco * ANCHO_HUECO : porDibujo;
  return {
    watercolor: {
      ...DEFAULT_WATERCOLOR,
      radius: Math.max(4, Math.round(Math.min(porDibujo, porHueco))),
    },
    trazo: {
      ...DEFAULT_TRAZO,
      largo: Math.round(lado * LARGO_TRAZO),
      grosor: Math.max(1, lado * GROSOR_TRAZO),
      punta: Math.max(1, lado * PUNTA_TRAZO),
    },
    rama: {
      ...DEFAULT_RAMA,
      largo: Math.round(lado * LARGO_RAMA),
      ancho: Math.max(2, lado * ANCHO_RAMA),
    },
    pincelada: {
      ...DEFAULT_PINCELADA,
      tramo: Math.max(24, Math.round(lado * TRAMO_PINCELADA)),
      pulso: Math.max(1, lado * PULSO_PINCELADA),
      anchoMin: Math.max(1.5, lado * ANCHO_PINCELADA),
      anchoMax: Math.max(3, lado * ANCHO_PINCELADA_MAX),
    },
    tronco: {
      ...DEFAULT_TRONCO,
      anchoMin: Math.max(2, lado * ANCHO_TRONCO),
      anchoDato: Math.max(2, lado * ANCHO_TRONCO_DATO),
    },
    silueta: {
      ...DEFAULT_SILUETA,
      cerca: Math.max(6, lado * CERCA_SILUETA),
      grosorMin: Math.max(0.6, lado * GROSOR_SILUETA),
    },
    // El texto se mide en pixeles del lienzo (lo que se ve), no del dibujo:
    // quien lo ajusta es el mural, que sabe a que tamano se esta mirando.
    testimonios: { ...DEFAULT_TESTIMONIOS },
    red: {
      ...DEFAULT_RED,
      radioMin: Math.max(1.5, lado * RADIO_NODO_MIN),
      radioMax: Math.max(3, lado * RADIO_NODO_MAX),
      largoMax: Math.max(24, lado * LARGO_ARISTA),
      aristaAncho: Math.max(0.6, lado * ANCHO_ARISTA),
      evasion: Math.max(20, lado * ALCANCE_CURSOR),
      empuje: Math.max(4, lado * EMPUJE_CURSOR),
    },
  };
}
