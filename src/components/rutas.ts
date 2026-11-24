/**
 * Las dos rutas del sitio y como se enlaza una seccion desde cualquiera de
 * las dos.
 *
 * Lo comparten la barra de arriba (`Nav.astro`) y el pie (`Footer.astro`):
 * las dos listan las mismas secciones —el pie con mas detalle— y las dos
 * tienen que resolver el mismo problema, que es que una seccion puede vivir
 * en la pagina que se esta pintando o en la otra. Mover una seccion de ruta
 * es cambiar su `ruta` en la lista de cada componente y nada mas.
 */
export type Ruta = 'inicio' | 'historia';

/** Una entrada de los indices: donde vive la seccion y como se llama. */
export interface Seccion {
  ruta: Ruta;
  ancla: string;
  texto: string;
}

/**
 * La seccion con la que abre cada ruta. Su ancla no hace falta en el `href`
 * —la ruta ya lleva ahi—, asi que los enlaces entre paginas salen limpios:
 * `/historia` y no `/historia#historia`.
 */
const PORTADA: Record<Ruta, string> = {
  inicio: 'inicio',
  historia: 'historia',
};

/**
 * El `href` de una seccion vista desde `pagina`: ancla suelta si vive aqui,
 * ruta completa si vive en la otra.
 */
export function enlaceDesde(pagina: Ruta) {
  const base = import.meta.env.BASE_URL;
  return (ruta: Ruta, ancla: string): string => {
    if (ruta === pagina) return `#${ancla}`;
    const raiz = ruta === 'historia' ? `${base}historia` : base;
    return ancla === PORTADA[ruta] ? raiz : `${raiz}#${ancla}`;
  };
}

/** Si la entrada es la que nombra a la pagina abierta (para `aria-current`). */
export const esActual = (pagina: Ruta, s: Seccion): boolean =>
  s.ruta === pagina && s.ancla === PORTADA[pagina];
