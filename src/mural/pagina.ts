/**
 * Lo que las paginas de lectura necesitan del mural sin ser el mural: el
 * revelado del texto con el scroll, el fondo de red de las secciones de la
 * visualizacion y las nueve muestras de la escala.
 *
 * Esto vivia dentro de `main.ts` cuando la pagina era una sola. Al partirse en
 * dos —el mural y lo que lo explica en `/`, el relato en `/historia`— lo de
 * aqui es lo que las dos pueden pedir sin arrastrar el motor de acuarela:
 * ninguna de las tres funciones monta el kiosco ni carga el dibujo, el CSV o
 * el `localStorage`. Cada una pinta si encuentra su markup y se calla si no,
 * asi que las dos rutas llaman lo que les toca y hoy las muestras solo estan
 * en `/historia` (ver `./historia.ts`).
 */
import type { ColorRamp } from '@core/render/palette';
import { medidasParaDibujo } from '@core/render/medidas';
import { SENTIRES } from '@data/person';
import { paintBlob } from '@ui/blob';
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

/**
 * Las muestras reales de acuarela de la escala: un canvas por paso de
 * `SENTIRES`, con el pincel y la rampa del mural. Lo que se ve en la tarjeta
 * es, literalmente, el pigmento que ese paso deja en el muro.
 *
 * La semilla es la de siempre (`animo|<nombre>`): es lo que hace que cada
 * paso tenga la misma silueta en la pagina y en el alta.
 */
export function pintarMuestrasEscala(ramp: ColorRamp): void {
  for (const node of document.querySelectorAll<HTMLCanvasElement>('canvas[data-sentir]')) {
    const name = node.dataset.sentir ?? '';
    const sentir = SENTIRES.find((s) => s.name === name);
    if (!sentir) continue;

    paintBlob(node, ramp, sentir.valor, { size: 58, seed: `animo|${sentir.name}` });

    // El medidor de la tarjeta se tine con el pigmento de su mancha, no con
    // un carmin de adorno: la barra y la muestra tienen que ser el mismo
    // color de la rampa para que el numero y la mancha digan lo mismo.
    const tarjeta = node.closest<HTMLElement>('.escala-tarjeta');
    if (tarjeta) {
      const { r, g, b } = ramp.at(sentir.valor);
      tarjeta.style.setProperty(
        '--tinta',
        `rgb(${Math.round(r)} ${Math.round(g)} ${Math.round(b)})`
      );
    }
  }
}
