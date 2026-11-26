/**
 * La afinidad: cuanto se parecen dos personas por lo que contestaron, y con
 * cuanta fuerza carga cada una su relacion con la comida de su cultura.
 *
 * Es la mitad del mapeo que no habla de dibujo. De aqui salen las dos cosas
 * que el mural necesita de los datos:
 *
 * - `afinidad(a, b)` -> que tan parecidas son dos respuestas. Es lo que
 *   decide si hay arista entre dos nodos de la red.
 * - `intensidad(r)` -> que tan cargado va el color de alguien.
 *
 * Y una tercera que es de acomodo: `firmaDe`, el perfil categorico de una
 * persona. Las cuatro preguntas de opcion dan 3 x 2 x 2 x 4 = 48 perfiles
 * posibles, y ese numero es el que reparte a la gente a lo largo del cuerpo
 * de la serpiente (ver `@core/render/red`): quien contesto igual, cae cerca.
 *
 * Los pesos de abajo son una lectura, no una medicion. Estan juntos y
 * nombrados a proposito para que cambiar la lectura sea cambiar numeros en un
 * solo bloque, sin tocar el render ni el esquema.
 */
import { PREGUNTAS, sentirByName, type Person } from './person';

/** Las respuestas de alguien, en numeros que se pueden comparar. */
export interface Rasgos {
  /** La escala de alimentacion en [0,1]: 0 "nada bien", 1 "muy bien". */
  escala: number;
  /**
   * Que tiene a la mano, por indice de opcion: 0 mexicano, 1 superprocesado,
   * 2 extranjero. -1 si no contesto.
   *
   * Se guarda el indice y no un numero en [0,1] porque de el salen las dos
   * lecturas que el mural necesita, y no son la misma: `CERCANIA_ACCESO` lo
   * convierte en cuanto pigmento carga, y `firmaDe` lo usa como categoria
   * para agrupar. Con un solo numero, dos categorias distintas con la misma
   * carga serian el mismo grupo.
   */
  acceso: number;
  /** 1 cree que merece una alimentacion digna. */
  digna: number;
  /** 1 le parece que las oportunidades alimenticias son justas. */
  justas: number;
  /**
   * A que le atribuye la perdida, por indice de opcion: 0 politica,
   * 1 economia, 2 industria, 3 social. -1 si no contesto.
   */
  culpa: number;
}

/**
 * Cuanto acerca a lo propio cada opcion de acceso, en el orden de la pregunta.
 *
 * Tener la milpa a la mano es lo mas cerca que se puede estar de comer de su
 * cultura, y el superprocesado lo mas lejos: no es comida de ningun lugar. El
 * extranjero —la harina, el azucar— queda en medio y no en el fondo porque
 * sigue siendo cocina, solo que de otra parte. Es una lectura del proyecto, y
 * se le da vuelta cambiando estos tres numeros.
 */
const CERCANIA_ACCESO = [1, 0, 0.3];

/** Lo que vale un campo que nadie contesto: ni de un lado ni del otro. */
const SIN_RESPUESTA = 0.5;

const OPCIONES = new Map<string, string[]>(
  PREGUNTAS.map((q) => [q.key as string, q.opciones.map((o) => o.valor)]));

/** Indice de la opcion elegida, o -1 si no hay respuesta que reconocer. */
function indiceOpcion(key: string, valor: string): number {
  const ops = OPCIONES.get(key);
  if (!ops) return -1;
  return ops.indexOf(valor.trim().toLowerCase());
}

/** Una respuesta de dos opciones como 0/1, o `SIN_RESPUESTA` si falta. */
function binaria(key: string, valor: string, cualEsUno = 0): number {
  const i = indiceOpcion(key, valor);
  if (i < 0) return SIN_RESPUESTA;
  return i === cualEsUno ? 1 : 0;
}

/**
 * Las respuestas de una persona, listas para comparar.
 *
 * Lo registrado antes de que existieran estas preguntas cae en el medio de
 * cada eje: no se parece especialmente a nadie, y tampoco desaparece.
 */
export function rasgosDe(p: Person): Rasgos {
  const sentir = sentirByName(p.alimentacion);
  return {
    escala: sentir ? sentir.valor : SIN_RESPUESTA,
    acceso: indiceOpcion('prefiere', p.prefiere),
    digna: binaria('merece_digna', p.merece_digna, 0),
    justas: binaria('oportunidades_justas', p.oportunidades_justas, 0),
    culpa: indiceOpcion('perdida_soberania', p.perdida_soberania),
  };
}

/** Cuanto carga lo que alguien tiene a la mano, en [0,1]. */
function cercania(acceso: number): number {
  return acceso < 0 ? SIN_RESPUESTA : (CERCANIA_ACCESO[acceso] ?? SIN_RESPUESTA);
}

// ---------------------------------------------------------------- parecerse

/**
 * Cuanto pesa cada respuesta a la hora de decir que dos personas se parecen.
 *
 * Lo que mas separa a la gente en este mural es que alimentos tiene a la mano
 * y a que le atribuye que se haya perdido la alimentacion tipica: son las dos
 * respuestas que mas dicen de donde esta parado alguien. La escala pesa menos
 * porque es un animo del dia, no una posicion.
 */
const PESO_AFINIDAD = {
  escala: 0.18,
  acceso: 0.26,
  digna: 0.14,
  justas: 0.16,
  culpa: 0.26,
};

const TOTAL_AFINIDAD = Object.values(PESO_AFINIDAD).reduce((s, w) => s + w, 0);

/**
 * Que tan parecidas son dos personas, en [0,1]. 1 es "contestaron lo mismo".
 *
 * Los ejes de grado se comparan por distancia (dos "casi bien" se parecen mas
 * que un "muy bien" y un "nada bien"), y el acceso entra por ahi: quien tiene
 * cerca el superprocesado y quien tiene cerca la harina se parecen entre si
 * mas de lo que cualquiera de los dos se parece a quien tiene la milpa. La
 * atribucion de la perdida, en cambio, se compara por igualdad: entre "los
 * gobernantes" y "ya no alcanza" no hay un punto medio, son respuestas
 * distintas y no mas lejos o mas cerca.
 */
export function afinidad(a: Rasgos, b: Rasgos): number {
  const acuerdo =
    PESO_AFINIDAD.escala * (1 - Math.abs(a.escala - b.escala))
    + PESO_AFINIDAD.acceso * (1 - Math.abs(cercania(a.acceso) - cercania(b.acceso)))
    + PESO_AFINIDAD.digna * (1 - Math.abs(a.digna - b.digna))
    + PESO_AFINIDAD.justas * (1 - Math.abs(a.justas - b.justas))
    + PESO_AFINIDAD.culpa * (a.culpa >= 0 && a.culpa === b.culpa ? 1 : 0);
  return acuerdo / TOTAL_AFINIDAD;
}

// ------------------------------------------------------------- la intensidad

/**
 * De que esta hecho el color cargado.
 *
 * Un nodo oscuro es alguien que come de su cultura y la sostiene: tiene a la
 * mano los alimentos de la milpa, se reconoce con derecho a comer digno, no
 * acepta que el reparto sea justo, y no responsabiliza al pueblo de que la
 * alimentacion tipica se haya perdido. Un nodo lavado es lo contrario, punto
 * por punto. La escala de como se siente entra tambien, pero sin mandar: el
 * mural no pinta mas fuerte a quien come mejor, sino a quien esta mas
 * plantado en lo suyo.
 *
 * Es una lectura del proyecto, no un hecho de los datos. Para darle vuelta a
 * cualquiera de los cinco terminos alcanza con cambiarlo aqui.
 */
const PESO_INTENSIDAD = {
  /** Tiene cerca los alimentos tipicamente mexicanos. */
  acceso: 0.3,
  /** No le echa la culpa al pueblo de la perdida. */
  noCulpaAlPueblo: 0.18,
  /** Cree que merece una alimentacion digna. */
  digna: 0.18,
  /** Ve que las oportunidades no son justas. */
  injusticia: 0.12,
  /** Como se siente con lo que come. */
  escala: 0.22,
};

const TOTAL_INTENSIDAD = Object.values(PESO_INTENSIDAD).reduce((s, w) => s + w, 0);

/** Indice de las "cuestiones sociales" —el desinteres del pueblo— en su pregunta. */
const CULPA_AL_PUEBLO = 3;

/** Con cuanta fuerza carga alguien lo suyo, en [0,1]. Es el color. */
export function intensidad(r: Rasgos): number {
  const noCulpaAlPueblo = r.culpa < 0 ? SIN_RESPUESTA : r.culpa === CULPA_AL_PUEBLO ? 0 : 1;
  const suma =
    PESO_INTENSIDAD.acceso * cercania(r.acceso)
    + PESO_INTENSIDAD.noCulpaAlPueblo * noCulpaAlPueblo
    + PESO_INTENSIDAD.digna * r.digna
    + PESO_INTENSIDAD.injusticia * (1 - r.justas)
    + PESO_INTENSIDAD.escala * r.escala;
  return Math.min(1, Math.max(0, suma / TOTAL_INTENSIDAD));
}

// ----------------------------------------------------------------- la firma

/** Cuantas opciones tiene cada pregunta categorica, en el orden de la firma. */
const ACCESOS = 3;
const CULPAS = 4;

/** Cuantos perfiles categoricos distintos hay: 3 x 2 x 2 x 4. */
export const FIRMAS = ACCESOS * 2 * 2 * CULPAS;

/**
 * El perfil categorico de alguien: un numero en [0, FIRMAS).
 *
 * Solo mira las cuatro preguntas de opcion, no la escala. Es lo que agrupa a
 * la gente en el dibujo: dos personas con la misma firma contestaron
 * exactamente lo mismo en las cuatro, y caen en el mismo tramo del cuerpo.
 * Lo que no esta contestado cae del lado del 0, que es el unico lugar donde
 * puede caer algo que no tiene respuesta.
 *
 * Los dos ejes categoricos entran por su indice de opcion y los dos de si/no
 * por su lado, de mas significativo a menos: acceso, digna, justas, culpa.
 * Cada digito tiene la base de su pregunta, asi que agregar una opcion es
 * subir `ACCESOS` o `CULPAS` y nada mas.
 */
export function firmaDe(r: Rasgos): number {
  const si = (v: number) => (v >= 0.5 ? 1 : 0);
  const acceso = r.acceso >= 0 ? r.acceso : 0;
  const culpa = r.culpa >= 0 ? r.culpa : 0;
  return ((acceso * 2 + si(r.digna)) * 2 + si(r.justas)) * CULPAS + culpa;
}

/** Las respuestas que definen una firma, para medir cuanto carga de por si. */
function rasgosDeFirma(firma: number): Rasgos {
  const culpa = firma % CULPAS;
  const resto = (firma - culpa) / CULPAS;
  return {
    // La escala no entra en la firma: para ordenarlas se la deja en el medio.
    escala: SIN_RESPUESTA,
    justas: resto % 2,
    digna: Math.floor(resto / 2) % 2,
    acceso: Math.floor(resto / 4) % ACCESOS,
    culpa,
  };
}

/**
 * Las 48 firmas de la mas cargada a la mas lavada.
 *
 * Este orden es el que recorre el cuerpo de la serpiente, de la cabeza al
 * centro de la espiral. Se calcula de las firmas y no de la gente: asi el
 * lugar de cada grupo en el dibujo no depende de quien se haya registrado, y
 * un alta nueva no mueve a nadie de sitio.
 */
export const FIRMAS_EN_ORDEN: number[] = Array.from({ length: FIRMAS }, (_, i) => i)
  .sort((a, b) => intensidad(rasgosDeFirma(b)) - intensidad(rasgosDeFirma(a)) || a - b);

/** Donde cae cada firma en ese recorrido: firma -> puesto en [0, 24). */
export const PUESTO_DE_FIRMA: number[] = (() => {
  const puesto = new Array<number>(FIRMAS);
  FIRMAS_EN_ORDEN.forEach((firma, i) => { puesto[firma] = i; });
  return puesto;
})();
