/**
 * El mural cargado: el cartel, sus horneados y la gente que lo pinta.
 *
 * Esto vivia dentro de `main.ts` cuando el mural se miraba en un solo lado.
 * Ahora hay dos pantallas que necesitan exactamente el mismo mural —el kiosco
 * de `/`, donde se registra y se busca, y el timelapse de `/timelapse`, donde
 * se ve como se fue pintando— y lo que las dos tienen que hacer antes de
 * dibujar un solo pixel es esto: bajar la ilustracion, medirla, leer los
 * cuatro archivos que se hornean a su lado y juntar los registros.
 *
 * Esta aqui y no en `core` porque no es motor: es el arranque del mural, con
 * sus rutas (`@io/plantilla`), su `localStorage` y sus respaldos para cuando
 * falta un archivo. El motor no sabe de donde sale nada de esto.
 *
 * Lo que *no* hace es guardar: si lo registrado en el dispositivo venia de una
 * version anterior del mapeo, aqui se devuelve al dia y se avisa cuantos
 * cambiaron (`remapeados`), pero volver a escribirlo es decision de quien
 * llama. El kiosco lo hace; el timelapse, que es de solo mirar, no.
 *
 * La gente del mural sale de dos sitios y solo uno es real: `propios` son las
 * personas que se registraron en este dispositivo y `base` es el banco
 * simulado de `tools/registros.mjs`, que existe porque sin gente no hay figura
 * que dibujar. Cual de los dos entra lo decide `PUBLIC_DATOS_SIMULADOS` en el
 * momento del build, no la rama: asi el mismo codigo sirve para la pantalla de
 * pruebas —donde el banco llena el cartel— y para la de produccion, donde el
 * mural tiene que ser lo que de verdad dejo la gente y nada mas.
 *
 * Va apagado por defecto a proposito. Si algun dia falta la variable, el peor
 * caso es un mural vacio donde se esperaba el banco: raro, y se ve de
 * inmediato. Al revez —mil ochocientas personas inventadas haciendose pasar
 * por reales en la pantalla publica— no se nota y es mentira.
 */
import { loadDrawingUrl, loadImage, type LoadedDrawing } from '@io/readers/drawing';
import { parseCsvText } from '@io/readers/csv';
import { parseConfig } from '@io/zonesConfig';
import {
  DATOS_EJEMPLO, PLANTILLA_DIBUJO, PLANTILLA_ESPINA, PLANTILLA_TLACUILO, PLANTILLA_TRAZOS,
  PLANTILLA_ZONAS,
} from '@io/plantilla';
import { loadLocal } from '@data/repo/localRepo';
import { analyzeDrawing, clamp01, typicalDepth, zonesFromConfig } from '@core/scene';
import { medidasParaDibujo } from '@core/render/medidas';
import { espinaDesde, parseEspinaJson, type Espina } from '@core/render/espina';
import { bocetoDesde, parseBocetoJson, type Boceto } from '@core/render/boceto';
import { figuraDesde, type Figura } from '@core/render/figura';
import { recorridoDe, tramaDe, type Trama } from '@core/render/recorrido';
import { redDe, type Red } from '@core/render/red';
import type { ShapeField } from '@core/render/field';
import { remapAll, zonasDisponibles, type MappingContext } from '@data/mapping';
import { FIRMAS, PUESTO_DE_FIRMA, afinidad, firmaDe, rasgosDe, type Rasgos } from '@data/afinidad';
import { personFromExtra } from '@data/person';
import type { DataRecord, RenderOptions, ZoneMap } from '@core/types';

/**
 * Si el mural se llena con el banco simulado. Se resuelve en el build: Vite
 * reemplaza `import.meta.env` por el valor literal, asi que en produccion el
 * `fetch` del CSV no queda ni escrito.
 */
const SIMULADOS = import.meta.env.PUBLIC_DATOS_SIMULADOS === 'true';

/**
 * Como se ve el mural, antes de conocer el dibujo.
 *
 * Las medidas son provisionales —se recalculan en `cargarCartel` con el lado
 * y el hueco de la ilustracion— y el resto son las decisiones de siempre: sin
 * lamina del SVG debajo (el cartel existe en pantalla solo porque alguien lo
 * esta trazando) y sin papel, para que la figura vaya a sangre sobre el fondo
 * de la pagina.
 *
 * Es una funcion y no una constante porque quien la pide la va a modificar:
 * cada pantalla tiene su propio juego de medidas y no se las pisan.
 */
export function opcionesMural(): RenderOptions {
  return {
    width: 0, height: 0,
    ...medidasParaDibujo(2000, 0),
    grain: 0.5,
    globalSeed: 1234, showLines: false, lineAlpha: 0.085,
    paper: false,
  };
}

/** El cartel medido: todo lo que sale del dibujo y de sus horneados. */
export interface Cartel {
  drawing: LoadedDrawing;
  zones: ZoneMap;
  /** El campo del dibujo: guia el trazo, no lo recorta. */
  field: ShapeField;
  /** La espiral: el eje sobre el que se ancla todo lo demas. */
  espina: Espina | null;
  /** Las lineas del dibujo: lo que la red va entintando. */
  boceto: Boceto | null;
  /** El dibujo medido y ordenado: de aqui sale el recorrido de cada tanda. */
  trama: Trama | null;
  /** El tlacuilo: la figura que no traza nadie, ubicada en el dibujo. */
  tlacuilo: Figura | null;
}

/** El mural entero listo para dibujarse: el cartel y su gente. */
export interface Mural {
  cartel: Cartel;
  /** Lo que el mapeo necesita saber del mural: las zonas que hay. */
  mapeo: MappingContext;
  /**
   * El banco simulado, de solo lectura. Vacio si `PUBLIC_DATOS_SIMULADOS` no
   * esta encendido, que es como corre la pantalla de produccion.
   */
  base: DataRecord[];
  /** Los registrados en este navegador. */
  propios: DataRecord[];
  /** Cuantos de los propios hubo que poner al dia (para volver a guardarlos). */
  remapeados: number;
}

/**
 * Baja el mural y lo deja listo: el dibujo, sus horneados y los registros.
 *
 * `render` se completa aqui —el lado del dibujo, su hueco y las medidas que
 * salen de los dos—, asi que quien llama se queda con las opciones ya a la
 * medida de la ilustracion que cargo.
 *
 * Todo en un solo `Promise.all`: son seis archivos y el dibujo es el que
 * tarda, asi que el CSV y los horneados viajan a su lado en vez de esperarlo.
 */
export async function cargarMural(render: RenderOptions): Promise<Mural> {
  const [d, cfgText, csvText, espinaText, trazosText, tlacuiloSvg, tlacuiloImg] = await Promise.all([
    loadDrawingUrl(PLANTILLA_DIBUJO),
    fetch(PLANTILLA_ZONAS).then((r) => r.text()),
    // El banco simulado solo si esta encendido (ver `SIMULADOS`). Apagado no
    // se pide: produccion no tiene por que bajar 300 KB de gente inventada.
    SIMULADOS ? fetch(DATOS_EJEMPLO).then((r) => r.text()) : Promise.resolve(''),
    // La espiral es el eje y las lineas son el detalle que se le va sumando
    // al recorrido. Si faltaran, el mural tiene que abrir igual: sin espiral
    // se cae al reparto por zonas de antes, y sin lineas la red se queda en
    // el cuerpo, que es lo que dibujaba hasta ahora.
    fetch(PLANTILLA_ESPINA).then((r) => (r.ok ? r.text() : '')).catch(() => ''),
    fetch(PLANTILLA_TRAZOS).then((r) => (r.ok ? r.text() : '')).catch(() => ''),
    // El tlacuilo: el texto para saber donde va —su viewBox contra el del
    // dibujo— y la imagen para rasterizarlo a cada escala. Si faltara, el
    // cartel sale sin pintor y todo lo demas sigue igual.
    fetch(PLANTILLA_TLACUILO).then((r) => (r.ok ? r.text() : '')).catch(() => ''),
    loadImage(PLANTILLA_TLACUILO).catch(() => null),
  ]);

  render.width = d.width;
  render.height = d.height;

  const cfg = parseConfig(cfgText);
  const analysis = analyzeDrawing(d.imageData, d.width, d.height, {
    threshold: cfg.threshold,
    dilate: cfg.dilate,
    // Mientras el boceto no cierre sus regiones, lo pintable es el relleno
    // del trazo (ver `strokeFill`); el dibujo terminado llegara con 0.
    close: cfg.close ?? 0,
    minArea: cfg.minArea ?? 180,
  });
  const zones = zonesFromConfig(cfg, analysis, cfg.margin ?? 3).zones;
  const field: ShapeField = { width: d.width, height: d.height, dist: analysis.dist };

  // Las medidas que dependen del dibujo. La red, la silueta y la pincelada se
  // quedan con las del arranque: las tres se miden contra el lado mayor, y la
  // plantilla llega rasterizada a ese mismo lado (ver `MAX_SIDE`).
  const medidas = medidasParaDibujo(
    Math.max(d.width, d.height),
    typicalDepth(zones, analysis.dist)
  );
  render.watercolor = medidas.watercolor;
  render.trazo = medidas.trazo;
  render.rama = medidas.rama;
  render.tronco = medidas.tronco;
  render.testimonios = medidas.testimonios;

  let espina: Espina | null = null;
  if (espinaText) {
    try {
      espina = espinaDesde(parseEspinaJson(espinaText), d.width, d.height);
    } catch (err) {
      console.warn('No se pudo leer la espina del dibujo:', err);
    }
  }

  // Medir el dibujo y anclar cada linea a la espiral es trabajo de una sola
  // vez; lo que se rehace en cada alta es solo cuanto de el entra.
  let boceto: Boceto | null = null;
  let trama: Trama | null = null;
  if (espina && trazosText) {
    try {
      boceto = bocetoDesde(parseBocetoJson(trazosText), d.width, d.height, render.pincelada.tramo);
      trama = tramaDe(boceto, espina);
    } catch (err) {
      console.warn('No se pudieron leer las lineas del dibujo:', err);
    }
  }

  let tlacuilo: Figura | null = null;
  if (tlacuiloImg && tlacuiloSvg && d.svgText) {
    tlacuilo = figuraDesde(tlacuiloImg, tlacuiloSvg, d.svgText, d.width, d.height);
    if (!tlacuilo) console.warn('No se pudo ubicar al tlacuilo: falta algun viewBox');
  }

  const mapeo: MappingContext = { zonas: zonasDisponibles(zones) };

  // El CSV simulado trae la zona que le toco en una version anterior del
  // dibujo: eso es cache, no dato. Se remapea con la regla vigente (mapeo 0 =
  // "de otra version", fuerza el recalculo) para que caiga donde corresponde
  // en la plantilla de hoy, igual que lo registrado en el dispositivo.
  const base = csvText
    ? remapAll(parseCsvText(csvText).records, 0, mapeo).records
    : [];

  // Lo guardado en este dispositivo puede venir de una version anterior del
  // mapeo: se recalcula con la regla vigente. Volver a guardarlo es de quien
  // llame, que es el unico que sabe si esta pantalla escribe.
  const guardado = loadLocal();
  const puestos = remapAll(guardado.records, guardado.mapeo, mapeo);

  return {
    cartel: { drawing: d, zones, field, espina, boceto, trama, tlacuilo },
    mapeo,
    base,
    propios: puestos.records,
    remapeados: puestos.remapped,
  };
}

/** La red armada y los rasgos con los que se armo. */
export interface RedArmada {
  red: Red;
  /** Los rasgos de cada registro, por id: el insumo del parecido. */
  rasgos: Map<string, Rasgos>;
}

/**
 * Arma la red con toda la gente que se le pase.
 *
 * El acomodo lo decide `@core/render/red` a partir de dos numeros por persona
 * que salen de sus respuestas: el grupo —su firma, o sea las cuatro preguntas
 * de opcion— y donde cae a lo ancho de la banda, que aqui es la escala de
 * como se siente con su alimentacion. Quien contesto igual queda junto, y las
 * aristas entre ellos son las que dibujan el cuerpo.
 *
 * Devuelve `null` sin trama: sin espiral no hay recorrido sobre el que
 * repartir, y quien llama se cae al reparto por zonas de antes.
 */
export function redDeRegistros(
  gente: readonly DataRecord[],
  trama: Trama | null,
  field: ShapeField | null,
  render: RenderOptions
): RedArmada | null {
  // Los rasgos se calculan una vez por tanda y no por par: el parecido se
  // consulta miles de veces al armar las aristas, y rehacerlos ahi adentro
  // seria recorrer el esquema entero en cada consulta.
  const rasgos = new Map(gente.map((r) => [r.id, rasgosDe(personFromExtra(r.extra))]));

  // El recorrido se rearma en cada tanda: de cuanta gente hay depende cuanto
  // dibujo entra (ver `@core/render/recorrido`). Es cortar una lista ya
  // ordenada, no volver a medir el dibujo.
  const recorrido = trama ? recorridoDe(trama, gente.length) : null;
  if (!recorrido) return null;

  let min = Infinity;
  let max = -Infinity;
  for (const r of gente) {
    if (r.valor < min) min = r.valor;
    if (r.valor > max) max = r.valor;
  }
  if (!isFinite(min)) { min = 0; max = 1; }
  const span = max - min || 1;

  const red = redDe(
    gente.map((record) => {
      const g = rasgos.get(record.id)!;
      return {
        record,
        grupo: PUESTO_DE_FIRMA[firmaDe(g)],
        orden: g.escala,
        t: clamp01((record.valor - min) / span),
      };
    }),
    recorrido, field, render.red,
    {
      globalSeed: render.globalSeed,
      grupos: FIRMAS,
      parecido: (a, b) => {
        const ra = rasgos.get(a.id);
        const rb = rasgos.get(b.id);
        return ra && rb ? afinidad(ra, rb) : 0;
      },
    }
  );

  return { red, rasgos };
}
