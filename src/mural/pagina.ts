/**
 * Lo que las dos rutas publicas tienen en comun: el revelado del texto con el
 * scroll y el fondo de red de las secciones de la visualizacion.
 *
 * Esto vivia dentro de `main.ts` cuando la pagina era una sola. Al partirse en
 * dos —el mural y lo que lo explica en `/`, el relato en `/historia`— lo de
 * aqui es justo lo que necesitan las dos, y ninguna de las dos funciones toca
 * nada del motor de acuarela: `/historia` las enciende (ver `./historia.ts`)
 * sin cargar el mural.
 */
import type { ColorRamp } from '@core/render/palette';
import { medidasParaDibujo } from '@core/render/medidas';
import { crearFondoRed, type CapaFondo } from './fondoRed';

/**
 * Deja que los bloques marcados con `data-revelar` aparezcan al llegar a la
 * pantalla: el CSS los tiene unos pixeles abajo y en transparente, y aqui
 * solo se les pone la clase `revelado` cuando entran. Es de una sola vez —el
 * bloque se deja de observar al revelarse—, asi que el texto ya leido no se
 * vuelve a desvanecer al subir.
 *
 * Los que entran en la misma tanda se escalonan: el retardo de cada uno es su
 * lugar en la tanda, de modo que un parrafo tras otro en vez de todos juntos.
 */
export function initRevelados(): void {
  const root = document.documentElement;
  const bloques = document.querySelectorAll<HTMLElement>('[data-revelar]');

  // El script si corrio: el respaldo en linea de la cascara ya no tiene que
  // destapar nada. El nombre no es `data-revelar` a proposito: ese es el que
  // marca los bloques, y en el <html> lo recogeria el mismo selector.
  root.dataset.revelarListo = 'on';

  if (typeof IntersectionObserver === 'undefined') {
    root.classList.remove('revelar-activo');
    return;
  }

  const observer = new IntersectionObserver((entradas) => {
    // En orden de pagina, para que el escalonado siga al de la lectura.
    const entrando = entradas
      .filter((e) => e.isIntersecting)
      .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);

    entrando.forEach((e, i) => {
      const bloque = e.target as HTMLElement;
      bloque.style.setProperty('--revelar-retardo', `${i * 90}ms`);
      bloque.classList.add('revelado');
      observer.unobserve(bloque);
    });
  }, {
    // Se destapa con el bloque ya bien dentro de la pantalla, no al asomar
    // el primer pixel; el margen de abajo recorta la zona por ese lado.
    threshold: 0.15,
    rootMargin: '0px 0px -12% 0px',
  });

  for (const bloque of bloques) observer.observe(bloque);

  // Los titulos van y vienen: aparecen al entrar y se desvanecen al salir.
  const titulos = new IntersectionObserver((entradas) => {
    for (const e of entradas) e.target.classList.toggle('visible', e.isIntersecting);
  }, { threshold: 0.6, rootMargin: '-6% 0px -10% 0px' });
  for (const t of document.querySelectorAll('[data-titulo]')) titulos.observe(t);
}

/**
 * El lado contra el que se miden los fragmentos del fondo. Es el de la
 * plantilla (~1970x2000) y el mismo con el que arranca el `RENDER` de
 * `main.ts`: la red del mural no se vuelve a medir al cargar el dibujo, asi
 * que el fondo y el mural dibujan con el mismo pincel.
 */
const LADO_PLANTILLA = 2000;

/**
 * El fondo animado de las secciones de la visualizacion: fragmentos de red
 * decorativos, con el pincel del mural.
 *
 * Las dos secciones que lo llevan ya no viven en la misma pagina —«Visualización
 * de datos» se fue a `/historia` y «La escala de la alimentación» se quedo en
 * `/`—, asi que cada ruta aporta el lienzo que tiene y el otro simplemente no
 * esta. La lista sigue siendo una sola porque una sola red cubre las dos: si
 * algun dia vuelven a quedar seguidas, la animacion cruza de la crema al
 * carmin sin costura, que es para lo que `./fondoRed` acepta varias capas.
 */
let fondoDatos = false;
const CAPAS_FONDO = [
  { seccion: 'datos', lienzo: 'datos-red' },
  { seccion: 'escala', lienzo: 'escala-red' },
];

export function pintarFondoDatos(ramp: ColorRamp): void {
  if (fondoDatos) return;
  const capas: CapaFondo[] = [];
  for (const c of CAPAS_FONDO) {
    const seccion = document.getElementById(c.seccion);
    const lienzo = document.getElementById(c.lienzo) as HTMLCanvasElement | null;
    if (seccion && lienzo) capas.push({ seccion, canvas: lienzo });
  }
  if (!capas.length) return;
  fondoDatos = true;
  crearFondoRed(capas, { ramp, params: medidasParaDibujo(LADO_PLANTILLA, 0).red });
}
