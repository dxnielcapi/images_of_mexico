/**
 * Pantalla de registro: la ilustracion a pantalla completa y cuatro iconos
 * al pie: ver como se pinto, acercarse, buscar y registrar. Los tres ultimos
 * abren su recuadro hacia arriba; mientras tanto solo se ve el mural. El
 * primero no abre nada: lleva al timelapse (ver `./timelapse`).
 *
 * Carga el mural de ejemplo (dibujo + zonas + CSV), le suma las personas que
 * se registraron en este dispositivo y vuelve a pintar con cada alta. No hay
 * controles de parametros: las medidas salen del dibujo (`@core/render/medidas`)
 * y los pesos del mapeo, de `@data/afinidad`.
 *
 * Lo que se ve es una red de afinidades (`@core/render/red`): un nodo por
 * persona, una arista entre quienes contestaron parecido, y el recorrido de
 * la espiral como eje. La figura no esta dibujada en ningun lado — sale de
 * donde cae la gente.
 *
 * Todo queda en la maquina: el CSV de ejemplo es de solo lectura y las altas
 * se guardan en localStorage (ver `@data/repo/localRepo`), con copia a archivo para
 * no depender de que el navegador conserve sus datos.
 */
import type { LoadedDrawing } from '@io/readers/drawing';
import { recordsToCsv } from '@io/writers/csv';
import { downloadText } from '@io/writers/download';
import { clearLocal, mergeById, parseBackup, saveLocal, storageAvailable } from '@data/repo/localRepo';
import { insertRemote, subscribeRemote, supabaseConfigured } from '@data/repo/supabaseRepo';
import { placeRecords } from '@core/scene';
import { renderScene } from '@core/render/compose';
import { CARMIN, ColorRamp } from '@core/render/palette';
import { PAPER_COLOR } from '@core/render/paper';
import type { Boceto } from '@core/render/boceto';
import { ocupacionDe, tramosDe, type Recorte, type Tramos } from '@core/render/silueta';
import { dibujarFigura, rasterizarFigura, type Figura } from '@core/render/figura';
import { ordenPorEspiral, type Trama } from '@core/render/recorrido';
import {
  dibujarRed, enReposo, evadir, vivoX, vivoY, type Nodo, type Red,
} from '@core/render/red';
import type { ShapeField } from '@core/render/field';
import { SpatialGrid } from '@core/sampling/grid';
import {
  PERSON_FIELD_KEYS, PersonIds, searchByName, todayIso, type Person,
} from '@data/person';
import { mapPerson, remapAll, zonasDisponibles, type MappingContext } from '@data/mapping';
import { esUbicacionMexico } from '@data/mexico';
import {
  esDuplicadoReciente, registrarEnvio, validarPersona, verificarRateLimit,
} from '@data/seguridad';
import { cargarMural, opcionesMural, redDeRegistros } from './cartel';
import { personSearch, type PersonSearch } from '@ui/personPanel';
import { registroForm, type RegistroAddResult, type RegistroForm } from '@ui/registroForm';
import { Tooltip } from '@ui/tooltip';
import { createHeroReveal, type HeroReveal } from './heroReveal';
import { crearTrazado } from './trazado';
import { initRevelados, pintarFondoDatos } from './pagina';
import { initCitas } from './citas';
import { el, button, fileButton, row } from '@ui/controls';
import type { DataRecord, PlacedPoint, RenderOptions, ZoneMap } from '@core/types';

/**
 * Como se ve este mural. Las decisiones —sin lamina del SVG debajo, sin papel
 * y con las medidas que salen del dibujo— viven en `./cartel`, que es de donde
 * las toma tambien el timelapse: las dos pantallas pintan el mismo mural.
 */
const RENDER: RenderOptions = opcionesMural();

const ramp = new ColorRamp(CARMIN);
const ids = new PersonIds();

/** Lo que el mapeo necesita saber del mural: las zonas que hay ahora. */
const mapping = (): MappingContext => ({ zonas: zonasDisponibles(zones) });
const fmtValue = (v: number) => v.toFixed(3).replace(/\.?0+$/, '');

let drawing: LoadedDrawing | null = null;
let zones: ZoneMap = new Map();
/** El campo del dibujo: guia el trazo, no lo recorta. */
let field: ShapeField | null = null;
/** La espiral del dibujo: el eje sobre el que se ancla todo lo demas. */
/** Las lineas del dibujo: lo que la red va entintando. */
let boceto: Boceto | null = null;
/** El dibujo medido y ordenado: de aqui sale el recorrido de cada tanda. */
let trama: Trama | null = null;
/** El cartel partido en tramos, cada uno con la tinta que le dieron los datos. */
let tramos: Tramos | null = null;
/** El tlacuilo: la figura que no traza nadie, ubicada en el dibujo. */
let tlacuilo: Figura | null = null;
/** Esa figura rasterizada a la escala con la que se esta mirando. */
const laminaTlacuilo = document.createElement('canvas');
/** La red de afinidades: lo que se ve. */
let red: Red | null = null;
/** El nodo de cada registro, por id: para resaltar al que se busca. */
let nodoPorId = new Map<string, Nodo>();
/** Donde esta el cursor en coordenadas de trabajo, o null si no esta encima. */
let cursor: { x: number; y: number } | null = null;
let base: DataRecord[] = [];      // los del CSV de ejemplo
let propios: DataRecord[] = [];   // los registrados en este navegador
let placed: PlacedPoint[] = [];
let grid: SpatialGrid<PlacedPoint> | null = null;
let highlight: PlacedPoint | null = null;
let flashTimer = 0;
let search: PersonSearch | null = null;
let alta: RegistroForm | null = null;
let ultimoNombre = '';
let mine: HTMLElement | null = null;   // "N guardados en este dispositivo"
let backupNote: HTMLElement | null = null;
let pulseUntil = 0;   // hasta cuando late la marca de la mancha senalada

// ---------------------------------------------------------------- el aparato

/**
 * Con que se esta mirando el mural.
 *
 * No es lo mismo un raton que un dedo —uno senala un pixel y el otro tapa
 * veinte— ni una pantalla de escritorio que una de telefono, donde el
 * recuadro que se abre ocupa casi todo. Las dos cosas se preguntan al
 * navegador y no se adivinan por el ancho: hay pantallas chicas con raton y
 * tabletas grandes sin el.
 */
const tactil = window.matchMedia?.('(pointer: coarse)')?.matches ?? false;

/** El ancho al que el kiosco pasa a telefono: el mismo `telefono:` del CSS. */
const TELEFONO = 560;

function angosto(): boolean {
  return window.innerWidth < TELEFONO;
}

// ---------------------------------------------------------------- layout

const view = el('canvas', { class: 'max-w-full max-h-full' });

// El aviso flotante se apoya sobre la fila de iconos, nunca debajo.
const flash = el('div', {
  class: 'hidden absolute left-1/2 -translate-x-1/2 bottom-[calc(var(--bar)+14px)] '
    + 'max-w-[80%] telefono:max-w-[calc(100%-var(--edge)*2)] px-4 py-[9px] rounded-full '
    + 'bg-[rgb(32_28_22_/_0.92)] text-[#f6f1e6] text-base text-center shadow-[0_8px_24px_rgb(0_0_0_/_0.22)]',
});

const mural = el('section', {
  class: 'lienzo absolute inset-0 flex items-center justify-center overflow-hidden '
    + 'p-6 pb-[calc(24px+var(--bar))] '
    + 'bg-[radial-gradient(circle_at_50%_35%,#fcf9f2_0%,#f1ece0_100%)]',
}, [view, flash]);

const panels = el('div', { class: 'flex flex-auto min-h-0' });
const searchPanel = el('div', { class: 'panel hidden' });
const addPanel = el('div', { class: 'panel hidden' });
const tools = el('div', {
  class: 'flex flex-none justify-end gap-2 telefono:justify-center telefono:gap-3.5',
});
panels.append(searchPanel, addPanel);

// Los recuadros se abren hacia arriba; los iconos van al pie, al alcance del pulgar.
const page = el('div', { class: 'kiosk' }, [
  mural,
  // Columna anclada abajo: los recuadros crecen hacia arriba y la fila de
  // iconos queda fija al borde inferior, sobre el area segura del telefono.
  el('div', {
    class: 'absolute z-5 right-[var(--edge)] bottom-[calc(var(--edge)+var(--safe))] '
      + 'flex flex-col items-end gap-2.5 max-h-[calc(100%-var(--edge)*2-var(--safe))] '
      + 'telefono:left-[var(--edge)] telefono:items-stretch',
  }, [panels, tools]),
]);
const mount = document.getElementById('mural-mount') ?? document.body;
mount.append(page);

const heroCanvas = document.getElementById('hero-canvas') as HTMLCanvasElement | null;
let heroReveal: HeroReveal | null = null;   // trazado animado del Hero
/**
 * De donde copia el Hero lo que muestra.
 *
 * Termina siendo `scene` —el mural pintado—, pero empieza siendo el dibujo
 * recien bajado: el Hero arranca en cuanto hay ilustracion, sin esperar a
 * que la red de registros este armada ni a que el mural se renderice (ver
 * `alTenerDibujo` en `./cartel`). Es la misma figura con la misma geometria;
 * lo que cambia es que todavia no tiene el color que le pone la gente.
 */
let heroFuente: CanvasImageSource | null = null;
/** Si el Hero esta en pantalla: su bucle solo corre mientras lo este. */
let heroALaVista = true;
/** Lado mayor del lienzo de fondo del Hero. */
const HERO_MAX_SIDE = 900;
const tooltip = new Tooltip(document.body);
const ctx = view.getContext('2d')!;
const scene = document.createElement('canvas');
/**
 * El cartel bajo la red: no una lamina sino un lapiz que lo va trazando, y
 * un lienzo propio donde va quedando lo que lleva dibujado (ver `./trazado`).
 * El fotograma del mural lo estampa de una sola pasada.
 */
const trazado = crearTrazado(RENDER.silueta);

/**
 * El mural se rasteriza al tamano en que se ve, no al del archivo.
 *
 * La plantilla mide ~1970x2000 y en pantalla entra en unos 500 px: rasterizar
 * a tamano de archivo significaba pintar catorce veces mas pixeles de los que
 * se miran y despues dejar que el navegador los encogiera, que es justo lo
 * que se comia los filamentos —un trazo de 5 px reducido a 1,2 se promedia
 * con el papel y desaparece—. Rasterizando a la medida de la caja, el trazo
 * se dibuja a su grosor final y se lee.
 *
 * `escala` lleva de coordenadas de trabajo (las del dibujo, en las que viven
 * los puntos y el campo) a las del lienzo. `upx` es cuanto mide un pixel de
 * pantalla en el lienzo, para que los adornos de interfaz —la marca, el
 * pulso, la marca— no engorden ni adelgacen con la resolucion.
 */
let escala = 1;
let upx = 1;

/** Tope de densidad: mas alla de 2x no se nota y cuesta el doble. */
const DPR_MAX = 2;

/**
 * Techo de pixeles del lienzo.
 *
 * El lienzo llena la caja entera y no solo el rectangulo del cartel, asi que
 * en una pantalla ancha pide casi el doble de pixeles que antes, y cada
 * fotograma los recorre tres veces: borrarlos, estamparles el trazado encima
 * y desvanecer la cola del lapiz. Con el techo puesto, una pantalla muy
 * grande baja un poco de densidad en vez de perder fotogramas.
 */
const PIXELES_MAX = 3.6e6;

/**
 * Deja el lienzo a la medida de la caja y devuelve la escala base.
 *
 * El lienzo llena la caja entera, no el recuadro del cartel. Cuando era del
 * tamano del cartel, acercarse era acercarse dentro de un recuadro chico: en
 * una pantalla ancha quedaba media pantalla de papel a cada lado y el
 * encuadre encerrado en la franja del medio, sin nada que recorrer a lo
 * ancho. Llenando la caja, el cartel se recorre por toda la pantalla. Con el
 * cartel entero a la vista se ve igual que antes —lo que sobra del lienzo es
 * transparente y debajo esta el degradado de la caja—, y la diferencia
 * aparece en cuanto se acerca.
 */
function ajustarLienzo(): number {
  if (!drawing) return escala;
  const caja = mural.getBoundingClientRect();
  const css = getComputedStyle(mural);
  const ancho = caja.width - parseFloat(css.paddingLeft) - parseFloat(css.paddingRight);
  const alto = caja.height - parseFloat(css.paddingTop) - parseFloat(css.paddingBottom);
  if (!(ancho > 0) || !(alto > 0)) return escala;

  view.style.width = `${ancho}px`;
  view.style.height = `${alto}px`;

  // Cuanto encoge el cartel para entrar en la caja, en pixeles de pantalla.
  const encaje = Math.min(ancho / RENDER.width, alto / RENDER.height);
  const dpr = Math.min(
    DPR_MAX,
    window.devicePixelRatio || 1,
    // Nunca por encima del original: pintar mas fino que el archivo no agrega
    // informacion, solo trabajo.
    1 / encaje,
    Math.sqrt(PIXELES_MAX / (ancho * alto))
  );
  const anchoPx = Math.max(1, Math.round(ancho * dpr));
  const altoPx = Math.max(1, Math.round(alto * dpr));
  upx = anchoPx / ancho;
  // Solo si cambio de verdad: asignarle el tamano a un lienzo lo borra, y
  // esto tambien se llama para medir (ver `seguirTamano`).
  if (view.width !== anchoPx || view.height !== altoPx) {
    view.width = anchoPx;
    view.height = altoPx;
  }
  // El cartel entero encajado en el lienzo: de ahi para arriba manda la lupa.
  return Math.min(anchoPx / RENDER.width, altoPx / RENDER.height);
}

// ---------------------------------------------------------------- la lupa

/**
 * La vista: cuanto se esta acercando el mural y a que parte.
 *
 * El cartel entero en una pantalla mide unos quinientos pixeles, y a ese
 * tamano un nodo son tres pixeles: se ve el remolino pero no se entiende que
 * cada punto es alguien, ni se lee el nopal que la red acaba de entintar. La
 * lupa no cambia el mural, cambia la distancia a la que uno se para: `zoom`
 * es cuantas veces se agranda y `cx`/`cy` es el punto del dibujo que queda en
 * el medio de la pantalla, en coordenadas de trabajo.
 *
 * Nada de esto toca a la red ni a los datos. El acercamiento es una
 * transformacion del lienzo y punto: los nodos siguen donde los dejo lo que
 * la gente contesto, y lo que crece es el trazo con el que se los dibuja.
 */
const vista = { zoom: 1, cx: 0, cy: 0 };

/** Hasta donde se puede acercar. Mas que esto es mirar la trama del pincel. */
const ZOOM_MAX = 8;
/** Cuanto acerca cada toque del boton. */
const ZOOM_PASO = 1.4;

/** De coordenadas de trabajo a pixeles del lienzo, con la lupa puesta. */
function escalaViva(): number {
  return escala * vista.zoom;
}

/** Donde cae el origen del dibujo en el lienzo, con la lupa puesta. */
function origenX(): number {
  return view.width / 2 - vista.cx * escalaViva();
}

function origenY(): number {
  return view.height / 2 - vista.cy * escalaViva();
}

/** El trozo de dibujo que entra en el lienzo, en coordenadas de trabajo. */
function recorteVista(): Recorte {
  const k = escalaViva();
  const anchoMedio = view.width / 2 / k;
  const altoMedio = view.height / 2 / k;
  return {
    x0: vista.cx - anchoMedio, y0: vista.cy - altoMedio,
    x1: vista.cx + anchoMedio, y1: vista.cy + altoMedio,
  };
}

/**
 * Holgura del recorrido: cuanto se deja pasar de la orilla del cartel, en
 * fracciones de pantalla.
 *
 * Sin ella el encuadre se detiene clavado en el borde y un nodo de la orilla
 * se queda pegado al canto de la pantalla, que es justo donde lo tapan los
 * mandos. Con algo de holgura la orilla se puede traer hacia el medio para
 * mirarla, y el tope sigue estando ahi: el cartel nunca se va de la vista.
 */
const HOLGURA = 0.34;

/**
 * Deja el encuadre donde se pueda mirar: sin perder el dibujo de vista, y
 * centrado cuando el mural entra entero.
 */
function acomodarVista(): void {
  const k = escalaViva();
  vista.cx = acomodarEje(vista.cx, view.width / 2 / k, RENDER.width);
  vista.cy = acomodarEje(vista.cy, view.height / 2 / k, RENDER.height);
}

/**
 * Un eje del encuadre: centrado si el cartel entra entero por ese lado, y si
 * no, dentro del cartel mas la holgura.
 */
function acomodarEje(centro: number, medio: number, largo: number): number {
  if (medio * 2 >= largo) return largo / 2;
  const holgura = medio * HOLGURA;
  return Math.min(largo - medio + holgura, Math.max(medio - holgura, centro));
}

/**
 * Acerca o aleja dejando quieto un punto del dibujo: el que esta debajo del
 * cursor, o el del medio si nadie senalo ninguno. Es lo que hace que la lupa
 * se sienta como una lupa y no como un salto.
 */
function acercar(zoom: number, ancla?: { x: number; y: number }): void {
  const antes = vista.zoom;
  const nuevo = Math.min(ZOOM_MAX, Math.max(1, zoom));
  if (Math.abs(nuevo - antes) < 1e-4) return;
  vista.zoom = nuevo;
  if (ancla) {
    vista.cx = ancla.x + (vista.cx - ancla.x) * (antes / nuevo);
    vista.cy = ancla.y + (vista.cy - ancla.y) * (antes / nuevo);
  }
  reencuadrar();
}

/** Mueve el encuadre, en pixeles de lienzo. */
function correrVista(dx: number, dy: number): void {
  const k = escalaViva();
  vista.cx -= dx / k;
  vista.cy -= dy / k;
  reencuadrar();
}

/** Vuelve a ver el cartel entero. */
function encuadreEntero(): void {
  vista.zoom = 1;
  reencuadrar();
}

/**
 * Repinta lo que depende del encuadre y nada mas.
 *
 * Se pide por fotograma y no por evento: una rueda de raton o un arrastre
 * sueltan decenas de eventos seguidos, y rehacer la cola del lapiz cuesta
 * unas cuantas trazadas. Lo que sigue al dedo es el fotograma, no el evento.
 */
let reencuadre = 0;
function reencuadrar(): void {
  if (reencuadre) return;
  reencuadre = requestAnimationFrame(() => {
    reencuadre = 0;
    acomodarVista();
    rasterizarTlacuilo();
    encuadrarTrazado();
    paint();
    mostrarZoom();
  });
}

const ICONS = {
  buscar: '<circle cx="11" cy="11" r="6.2"/><line x1="15.6" y1="15.6" x2="21" y2="21"/>',
  registrar: '<circle cx="10" cy="8" r="3.6"/><path d="M3.5 20.5c0-3.6 2.9-6.5 6.5-6.5"/><line x1="17" y1="13.5" x2="17" y2="21.5"/><line x1="13" y1="17.5" x2="21" y2="17.5"/>',
  // Las cuatro esquinas de un encuadre: acercarse al cartel. No es una lupa
  // dibujada porque la lupa ya es el icono de buscar, y dos lentes seguidas
  // en la misma fila no se distinguen.
  lupa: '<path d="M9.5 3.5H3.5V9.5"/><path d="M14.5 3.5h6v6"/><path d="M9.5 20.5h-6v-6"/><path d="M14.5 20.5h6v-6"/>',
  // El triangulo de reproducir: lleva al timelapse, que es una pelicula del
  // mural y se anuncia como tal.
  pintado: '<circle cx="12" cy="12" r="8.6"/><path d="M10.1 8.3l5.6 3.7-5.6 3.7z"/>',
};

function iconButton(icon: keyof typeof ICONS, label: string, onClick: () => void): HTMLButtonElement {
  const b = el('button', { class: 'tool', title: label, type: 'button' });
  b.setAttribute('aria-label', label);
  b.setAttribute('aria-expanded', 'false');
  b.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true">${ICONS[icon]}</svg>`;
  b.addEventListener('click', onClick);
  return b;
}

/**
 * Un icono que no abre un recuadro sino que lleva a otra pagina.
 *
 * Es un enlace y no un boton con `location.href`: asi se puede abrir en otra
 * pestana, el navegador lo anuncia como enlace y el destino se ve antes de
 * tocarlo.
 */
function iconLink(icon: keyof typeof ICONS, label: string, href: string): HTMLAnchorElement {
  const a = el('a', { class: 'tool', href, title: label });
  a.setAttribute('aria-label', label);
  a.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true">${ICONS[icon]}</svg>`;
  return a;
}

const btnBuscar = iconButton('buscar', 'Buscar persona', () => toggle('buscar'));
const btnRegistrar = iconButton('registrar', 'Registrar persona', () => toggle('registrar'));
const btnLupa = iconButton('lupa', 'Acercar el cartel', () => toggle('lupa'));
// El timelapse vive en su propia pagina: el mural de aqui esta vivo —se
// registra, se busca, se acerca— y el de alla es una pelicula que se mira de
// principio a fin. Meter las dos cosas en el mismo lienzo seria pelearle los
// mandos a quien se esta registrando.
const btnPintado = iconLink(
  'pintado',
  'Ver cómo se fue pintando el mural',
  `${import.meta.env.BASE_URL}timelapse`
);
tools.append(btnPintado, btnLupa, btnBuscar, btnRegistrar);

// ---------------------------------------------------------------- recuadros

/**
 * El recuadro de la lupa: dos botones, el nivel al que se esta mirando y la
 * vuelta al cartel entero.
 *
 * Es una barra y no un panel con formulario porque mientras se usa hay que
 * seguir viendo el mural: lo que esta pasando esta detras de ella.
 */
const nivelLupa = el('span', { class: 'lupa-nivel', text: '1,0×' });
const lupaPanel = el('div', { class: 'lupa hidden' }, [
  el('div', { class: 'lupa-mandos' }, [
    botonLupa('−', 'Alejar', () => acercar(vista.zoom / ZOOM_PASO, { x: vista.cx, y: vista.cy })),
    nivelLupa,
    botonLupa('+', 'Acercar', () => acercar(vista.zoom * ZOOM_PASO, { x: vista.cx, y: vista.cy })),
    el('button', { class: 'lupa-entero', type: 'button', text: 'Ver todo' }),
  ]),
  el('p', {
    class: 'lupa-pista',
    text: 'Arrastra el cartel para recorrerlo, o muévelo con las flechas. '
      + 'La rueda, dos dedos o un doble clic acercan.',
  }),
]);
lupaPanel.querySelector('.lupa-entero')?.addEventListener('click', encuadreEntero);
panels.append(lupaPanel);

function botonLupa(signo: string, label: string, onClick: () => void): HTMLButtonElement {
  const b = el('button', { class: 'lupa-boton', type: 'button', text: signo });
  b.setAttribute('aria-label', label);
  b.title = label;
  b.addEventListener('click', onClick);
  return b;
}

/** Deja el nivel escrito y apaga el boton que ya no puede ir mas lejos. */
function mostrarZoom(): void {
  nivelLupa.textContent = `${vista.zoom.toFixed(1).replace('.', ',')}×`;
  for (const b of lupaPanel.querySelectorAll('.lupa-boton')) {
    const alejar = b.textContent === '−';
    b.toggleAttribute('disabled', alejar ? vista.zoom <= 1.001 : vista.zoom >= ZOOM_MAX - 0.001);
  }
}

type PanelId = 'buscar' | 'registrar' | 'lupa' | null;
let open: PanelId = null;

function toggle(which: Exclude<PanelId, null>): void {
  setOpen(open === which ? null : which);
}

/**
 * El buscador encogido: sin encabezado y con la lista en tres renglones.
 *
 * Es como queda despues de elegir a alguien en el telefono, y es la unica
 * forma de que quepan las dos cosas que hacen falta a la vez: la mancha que
 * se acaba de encontrar y la lista para seguir mirando. En pantalla ancha no
 * hace falta —el recuadro no tapa el mural— asi que no encoge.
 */
function compactarBusqueda(si: boolean): void {
  searchPanel.classList.toggle('compacta', si && angosto());
}

function setOpen(which: PanelId): void {
  open = which;
  // Abrir o cerrar un recuadro empieza una busqueda nueva: el buscador
  // vuelve a su tamano.
  compactarBusqueda(false);
  searchPanel.classList.toggle('hidden', which !== 'buscar');
  addPanel.classList.toggle('hidden', which !== 'registrar');
  lupaPanel.classList.toggle('hidden', which !== 'lupa');
  for (const [b, id] of [[btnBuscar, 'buscar'], [btnRegistrar, 'registrar'], [btnLupa, 'lupa']] as const) {
    b.classList.toggle('active', which === id);
    b.setAttribute('aria-expanded', String(which === id));
  }
  // Con la lupa abierta el lienzo se arrastra: el navegador no tiene que
  // llevarse el gesto para desplazar la pagina.
  view.classList.toggle('lupa-viva', which === 'lupa');
  view.style.touchAction = which === 'lupa' ? 'none' : '';

  if (which === 'lupa') {
    mostrarZoom();
    // El primer toque ya acerca: abrir la lupa y que no pase nada seria
    // pedirle a la gente que adivine que ahora la rueda hace otra cosa.
    if (vista.zoom <= 1.001) acercar(ZOOM_PASO * ZOOM_PASO, { x: vista.cx, y: vista.cy });
    return;
  }

  // Al cerrar la lupa se vuelve al cartel entero: si no, el mural se quedaria
  // recortado sin ningun mando a la vista para devolverlo.
  if (vista.zoom > 1.001) encuadreEntero();

  if (which === null) {
    // Al cerrar se limpia lo que haya quedado marcado por la busqueda.
    tooltip.hide();
    if (!flashTimer) { highlight = null; paint(); }
    return;
  }
  const panel = which === 'buscar' ? searchPanel : addPanel;
  panel.querySelector('input')?.focus({ preventScroll: true });
}

/**
 * El teclado de la lupa: acercar, alejar, volver al cartel entero y recorrerlo
 * con las flechas.
 *
 * Las flechas son la unica forma de recorrer el cartel sin raton ni pantalla
 * tactil, y de paso la mas precisa: un paso es un sexto de pantalla —con
 * Mayus, media— asi que se avanza por el dibujo sin perder de vista donde se
 * estaba. Van con `preventDefault` porque si no la pagina se desplaza debajo.
 */
const PASOS = new Map<string, readonly [number, number]>([
  ['ArrowLeft', [1, 0]],
  ['ArrowRight', [-1, 0]],
  ['ArrowUp', [0, 1]],
  ['ArrowDown', [0, -1]],
]);

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && open) setOpen(null);
  if (open !== 'lupa') return;
  const target = e.target as Element | null;
  if (target?.closest('input, textarea, select, [contenteditable="true"]')) return;
  const centro = { x: vista.cx, y: vista.cy };
  const paso = PASOS.get(e.key);
  if (paso) {
    e.preventDefault();
    const largo = e.shiftKey ? 0.5 : 0.17;
    correrVista(paso[0] * view.width * largo, paso[1] * view.height * largo);
  }
  else if (e.key === '+' || e.key === '=') acercar(vista.zoom * ZOOM_PASO, centro);
  else if (e.key === '-' || e.key === '_') acercar(vista.zoom / ZOOM_PASO, centro);
  else if (e.key === '0') encuadreEntero();
});

// ---------------------------------------------------------------- la red

function records(): DataRecord[] {
  return mergeById(base, propios).records;
}

function valueRange(): { min: number; max: number } {
  let min = Infinity, max = -Infinity;
  for (const r of records()) {
    if (r.valor < min) min = r.valor;
    if (r.valor > max) max = r.valor;
  }
  return isFinite(min) ? { min, max } : { min: 0, max: 1 };
}

/**
 * Arma la red con toda la gente que hay ahora.
 *
 * Quien decide donde cae cada quien es `redDeRegistros` (ver `./cartel`), que
 * es la misma puerta por la que pasa el timelapse: las dos pantallas tienen
 * que dar el mismo dibujo con la misma gente.
 *
 * Sin espina no hay recorrido sobre el que repartir, asi que se cae al
 * reparto por zonas de antes: el mural abre igual aunque falte el archivo.
 */
function placeAll(): void {
  const gente = records();
  const armada = redDeRegistros(gente, trama, field, RENDER);

  if (armada) {
    red = armada.red;
    nodoPorId = new Map(red.nodos.map((n) => [n.punto.record.id, n]));
    placed = red.nodos.map((n) => n.punto);
  } else {
    red = null;
    nodoPorId = new Map();
    const { min, max } = valueRange();
    placed = placeRecords(gente, zones, {
      mode: 'random', minDistFactor: 1, globalSeed: RENDER.globalSeed,
      width: RENDER.width, min, max,
    }).placed;
  }

  grid = new SpatialGrid(Math.max(8, radioToque()), RENDER.width, RENDER.height);
  for (const p of placed) grid.insert(p);

  // Cuanta gente quedo sobre cada linea del dibujo: es lo que decide que
  // parte del cartel sale entintada y que parte apenas se adivina al pasar
  // el lapiz. Se mide contra donde descansan los nodos, no contra donde los
  // corrio el cursor: la tinta del dibujo no tiene por que temblar cuando
  // pasa el raton.
  if (boceto) {
    const ocupacion = ocupacionDe(
      boceto,
      red ? red.nodos.map((n) => ({ x: n.bx, y: n.by })) : placed,
      RENDER.silueta, RENDER.width, RENDER.height
    );
    // En el orden de la espiral: asi el lapiz da la vuelta al cartel en vez
    // de saltar de una punta a la otra (ver `ordenPorEspiral`).
    tramos = tramosDe(boceto, ocupacion, RENDER.silueta, trama ? ordenPorEspiral(trama) : undefined);
    trazado.datos(tramos);
  }

  refreshCounts();
}

/**
 * Cuanto hay que acercarse a alguien para señalarlo, en px de trabajo.
 *
 * Con la red, el area sensible se mide contra el nodo mas grande y no
 * contra el de cada uno: si fuera por nodo, a los mas lavados —que son los
 * mas chicos— habria que acertarles al pixel.
 */
function radioToque(): number {
  if (red) return Math.max(10, RENDER.red.radioMax * 1.6);
  return Math.max(6, RENDER.watercolor.radius * 1.1);
}

/** "1 registro" / "3 registros", para que los avisos no queden raros. */
function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

function refreshCounts(): void {
  for (const node of document.querySelectorAll('.count')) {
    node.textContent = `${placed.length} personas en el mural`;
  }
  for (const node of document.querySelectorAll('[data-stat="personas"]')) {
    node.textContent = String(placed.length);
  }
  for (const node of document.querySelectorAll('[data-stat="zonas"]')) {
    node.textContent = String(zones.size || 12);
  }
  if (mine) {
    mine.textContent = `${plural(propios.length, 'registro guardado', 'registros guardados')} en este dispositivo`;
  }
}

/**
 * Re-renderiza la escena cacheada: la red en reposo, sin el cursor encima.
 *
 * Es lo que mira el fondo del Hero, que no tiene puntero. Lo que se ve en el
 * mural lo dibuja `paint` fotograma a fotograma con los nodos donde esten:
 * esta copia es la base quieta, y las dos salen del mismo pincel.
 */
function render(): void {
  escala = ajustarLienzo();
  acomodarVista();
  rasterizarTlacuilo();
  encuadrarTrazado();
  const corridos = red?.nodos.map((n) => [n.dx, n.dy] as const);
  if (red) enReposo(red);
  renderScene(
    scene,
    {
      // Sin lamina: `renderScene` la sabe componer y el mural no se la da
      // (ver `showLines` en RENDER). Rasterizar dos mil pixeles de lado para
      // no dibujarlos nunca serian quince megas de lienzo de adorno.
      points: placed, ramp, options: RENDER, lines: null, field, red,
      tramos, figura: tlacuilo,
      laminaFigura: tlacuilo ? laminaTlacuilo : null,
    },
    escala
  );
  if (red && corridos) {
    red.nodos.forEach((n, i) => { n.dx = corridos[i][0]; n.dy = corridos[i][1]; });
  }
  paint();
  // De aqui en mas el Hero copia el mural pintado y no el dibujo pelado.
  heroFuente = scene;
  paintHero();
  pintarFondoDatos(ramp);
}

/**
 * Rasteriza al tlacuilo a la medida en que se lo esta mirando.
 *
 * Es la unica parte del cartel que se dibuja tal cual, asi que es la unica
 * que se nota si se agranda un bitmap en vez de volver a trazarla: con la
 * lupa cerca, el pintor tiene que seguir siendo una linea y no un escalon.
 * Por eso vive en su propio SVG y por eso se vuelve a rasterizar en cada
 * cambio de escala (ver `@core/render/figura`).
 */
function rasterizarTlacuilo(): void {
  if (tlacuilo) rasterizarFigura(tlacuilo, escalaViva(), laminaTlacuilo);
}

/**
 * Le dice al lapiz donde esta mirando: el tamano del lienzo y el encuadre de
 * la lupa. Lo que llevaba dibujado estaba en pixeles de pantalla, asi que al
 * cambiar cualquiera de los dos se rehace (ver `./trazado`).
 */
function encuadrarTrazado(): void {
  if (!drawing) return;
  trazado.encuadre({
    ancho: view.width,
    alto: view.height,
    escala: escalaViva(),
    ox: origenX(),
    oy: origenY(),
    recorte: recorteVista(),
  });
}

/** Copia el mapeo renderizado al lienzo de fondo del Hero (bajo el efecto cristal). */
function paintHero(): void {
  if (!heroCanvas || !heroFuente) return;
  // Va desenfocado bajo el velo de cristal: no hace falta la resolucion de
  // trabajo entera, y asi el trazado animado repinta barato cada fotograma.
  const k = Math.min(1, HERO_MAX_SIDE / Math.max(RENDER.width, RENDER.height));
  const w = Math.max(1, Math.round(RENDER.width * k));
  const h = Math.max(1, Math.round(RENDER.height * k));
  if (heroCanvas.width !== w || heroCanvas.height !== h) {
    heroCanvas.width = w;
    heroCanvas.height = h;
  }
  const hctx = heroCanvas.getContext('2d');
  if (!hctx) return;
  // Con el trazado en curso el Hero muestra solo lo que lleva dibujado.
  if (heroReveal) {
    heroReveal.paint(hctx, heroFuente);
  } else {
    hctx.clearRect(0, 0, w, h);
    hctx.drawImage(heroFuente, 0, 0, w, h);
  }
  // La escena del mural va sin papel —ahi la ilustracion es a sangre, sin
  // recuadro—, pero el fondo del Hero si lo quiere: desenfocado bajo el velo
  // de cristal, sin esa lamina crema no se adivinaria nada. Va debajo de lo
  // ya pintado, que es tambien donde el trazado animado espera su papel.
  hctx.globalCompositeOperation = 'destination-over';
  hctx.fillStyle = PAPER_COLOR;
  hctx.fillRect(0, 0, w, h);
  hctx.globalCompositeOperation = 'source-over';
  heroCanvas.classList.remove('opacity-0');
}

/**
 * Dibuja el fotograma: la red donde este ahora, y encima la marca del nodo
 * senalado con su onda.
 *
 * La red se repinta entera cada vez en vez de estamparse de una copia
 * cacheada, porque con el cursor encima no hay dos fotogramas iguales: los
 * nodos se apartan y las aristas los siguen. Son trescientos `drawImage` y
 * unas setecientas lineas, que es lo que el lienzo hace sin despeinarse; lo
 * caro del mural nunca fueron las marcas sino la acuarela de cada una, y eso
 * ya viene horneado en el pincel de la red.
 *
 * Quien mueve la red es `evadir`, antes de llamar aqui: esto solo dibuja lo
 * que encuentra, asi que sirve igual para un fotograma del bucle que para un
 * repintado suelto (un alta, un resaltado).
 */
function paint(): void {
  if (!drawing) return;
  const k = escalaViva();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, view.width, view.height);
  // El cartel viene en el lienzo del lapiz, con la lupa ya puesta: se estampa
  // tal cual —en multiply, que es como se compone todo el pigmento— y encima
  // va la red.
  if (red) {
    ctx.globalCompositeOperation = 'multiply';
    ctx.drawImage(trazado.lienzo, 0, 0);
    ctx.globalCompositeOperation = 'source-over';
  }

  // De aqui en mas se dibuja en coordenadas de trabajo, corridas por la lupa.
  ctx.setTransform(1, 0, 0, 1, origenX(), origenY());
  if (red) {
    ctx.globalCompositeOperation = 'multiply';
    dibujarRed(ctx, red, ramp, RENDER.red, k);
    ctx.globalCompositeOperation = 'source-over';
    // El tlacuilo encima de todo: la red no le pasa por arriba a quien dibuja.
    if (tlacuilo) dibujarFigura(ctx, tlacuilo, laminaTlacuilo, k);
  } else {
    // Sin red, la escena entera ya viene horneada con su cartel y su pintor.
    ctx.drawImage(scene, 0, 0, RENDER.width * k, RENDER.height * k);
  }
  if (!highlight) { ctx.setTransform(1, 0, 0, 1, 0, 0); return; }

  // Marca sobre el nodo recien agregado o encontrado: va donde el nodo este
  // ahora, no donde descansa, o al esquivar el cursor se le escaparia de
  // adentro. Las medidas van en pixeles de pantalla: es interfaz, no pigmento.
  const nodo = nodoPorId.get(highlight.record.id);
  const hx = (nodo ? vivoX(nodo) : highlight.x) * k;
  const hy = (nodo ? vivoY(nodo) : highlight.y) * k;
  const r = Math.max(14 * upx, radioToque() * 1.6 * k);
  for (const [color, w] of [['rgba(255, 253, 248, 0.95)', 3], ['rgba(28, 24, 18, 0.9)', 1.25]] as const) {
    ctx.strokeStyle = color;
    ctx.lineWidth = w * upx;
    ctx.beginPath();
    ctx.arc(hx, hy, r, 0, Math.PI * 2);
    ctx.stroke();
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      ctx.beginPath();
      ctx.moveTo(hx + dx * (r + 3 * upx), hy + dy * (r + 3 * upx));
      ctx.lineTo(hx + dx * (r + 9 * upx), hy + dy * (r + 9 * upx));
      ctx.stroke();
    }
  }

  // Onda que se abre y se apaga: en el dibujo lleno de marcas, es lo que
  // hace que la propia se encuentre de un vistazo al cerrar el recuadro.
  const queda = pulseUntil - performance.now();
  if (queda > 0) {
    const fase = (performance.now() % PULSE_MS) / PULSE_MS;
    const fin = Math.min(1, queda / 900);   // se desvanece al terminar
    // Mismo carmin que `--accent` en mural.css.
    ctx.strokeStyle = `rgba(158, 43, 43, ${(1 - fase) * 0.75 * fin})`;
    ctx.lineWidth = 2 * upx;
    ctx.beginPath();
    ctx.arc(hx, hy, r + fase * r * 2.4, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.setTransform(1, 0, 0, 1, 0, 0);
}

const PULSE_MS = 1500;

// ---------------------------------------------------------------- animacion

/**
 * Un solo bucle para todo lo que se mueve, y se apaga en cuanto no hace falta.
 *
 * Corre a 60 fps y solo mientras el mural esta a la vista, la pestana esta al
 * frente y el sistema no pide menos movimiento. Antes iba a 30 porque lo
 * unico que se movia era un pulso lento; la esquivada se sigue con el raton y
 * a 30 se nota a saltos, asi que esta vale los fotogramas. Se apaga sola: en
 * cuanto la red vuelve al reposo y no hay nada latiendo, no quedan
 * fotogramas pedidos.
 */
/**
 * En el escritorio son 60. En un telefono el fotograma cuesta mas que los
 * 16 ms que hay —son miles de trazadas de red por cuadro— asi que pedir 60
 * era quedarse sin tiempo para nada mas, y lo primero que se nota es el
 * scroll. A 30 el dibujo se ve igual de vivo y queda la mitad del hilo
 * libre.
 */
const FPS = tactil ? 30 : 60;
let animRaf = 0;
let ultimoFrame = 0;
let muralVisible = true;
/** Mientras la pagina se desplaza el lapiz se para (ver `pausarEnScroll`). */
let desplazando = false;

const menosMovimiento = window.matchMedia?.('(prefers-reduced-motion: reduce)');

// Con movimiento reducido no hay lapiz: el cartel se pinta entero y se queda
// quieto, que es lo mismo que dice la animacion sin nada que se mueva.
function sincronizarTrazado(): void {
  trazado.animar(!menosMovimiento?.matches);
  paint();
  animar();
}
menosMovimiento?.addEventListener?.('change', sincronizarTrazado);
trazado.animar(!menosMovimiento?.matches);

function quiereAnimar(): boolean {
  if (menosMovimiento?.matches) return false;
  if (document.hidden || !drawing) return false;
  if (!muralVisible || desplazando) return false;
  // El lapiz no para mientras el cartel este a la vista: es lo unico que
  // dibuja el codice, asi que si se detuviera no quedaria dibujo. Lo demas
  // —la red apartandose, el pulso de una marca— va y viene encima.
  if (tramos) return true;
  // Con el cursor encima la red se esta apartando; sin el, puede seguir
  // volviendo al reposo, y eso lo sabe `redViva`.
  if (cursor !== null || redViva) return true;
  return highlight !== null && performance.now() < pulseUntil;
}

/** Si queda algun nodo en camino: lo que mantiene el bucle vivo al soltar. */
let redViva = false;

function animar(): void {
  if (animRaf || !quiereAnimar()) return;
  ultimoFrame = performance.now();
  const tick = (ahora: number) => {
    animRaf = 0;
    if (!quiereAnimar()) return;
    const dt = Math.min(0.1, (ahora - ultimoFrame) / 1000);
    if (dt >= 1 / FPS) {
      ultimoFrame = ahora;
      trazado.avanzar(dt);
      if (red) redViva = evadir(red, cursor, RENDER.red, dt);
      paint();
    }
    animRaf = requestAnimationFrame(tick);
  };
  animRaf = requestAnimationFrame(tick);
}

function detenerAnimacion(): void {
  if (animRaf) cancelAnimationFrame(animRaf);
  animRaf = 0;
}

document.addEventListener('visibilitychange', () => {
  if (document.hidden) detenerAnimacion();
  else animar();
});

/**
 * En el telefono el dibujo se para mientras la pagina se desplaza.
 *
 * Un fotograma del mural son miles de trazadas y en un telefono eso es casi
 * todo el presupuesto del hilo principal: con el bucle corriendo, el scroll
 * se mueve a tirones. Se apaga en el primer evento y vuelve sola cuando el
 * gesto termina, con una espera corta: lo justo para que el scroll suelte el
 * hilo.
 *
 * En el escritorio no se para. La red respira todo el tiempo que esta a la
 * vista y detenerla justo mientras la pagina la trae a cuadro era cortar el
 * movimiento en el unico momento en que se la estaba mirando llegar; ahi el
 * fotograma sobra y el scroll lo mueve el sistema, no el hilo.
 */
function pausarEnScroll(): void {
  if (!tactil) return;
  let timer = 0;
  window.addEventListener('scroll', () => {
    desplazando = true;
    detenerAnimacion();
    // El Hero tambien: su trazado es mas barato que el mural, pero el primer
    // scroll de la pagina ocurre justo encima de el.
    heroReveal?.pause();
    clearTimeout(timer);
    timer = window.setTimeout(() => {
      desplazando = false;
      animar();
      if (heroALaVista) heroReveal?.play();
    }, 140);
  }, { passive: true });
}

/** Hace latir la marca unos segundos sobre la mancha resaltada. */
function startPulse(ms = 6000): void {
  pulseUntil = performance.now() + ms;
  animar();
  // Sin animacion (movimiento reducido) la marca igual queda dibujada.
  if (!animRaf) paint();
}

/** Ficha de la persona, anclada a su mancha en el lienzo. */
function showFicha(point: PlacedPoint): void {
  const en = enPantalla(point.x, point.y);
  // La hoja del telefono se queda dentro de lo que no tapa ningun recuadro:
  // debajo estan el buscador y la fila de iconos, y taparlos dejaria la ficha
  // abierta sin nada que tocar para salir.
  tooltip.show(point, en.x, en.y, fmtValue, zonaLibre());
}

function showFlash(text: string): void {
  flash.textContent = text;
  flash.classList.remove('hidden');
  window.clearTimeout(flashTimer);
  flashTimer = window.setTimeout(() => {
    flashTimer = 0;
    flash.classList.add('hidden');
    highlight = null;
    paint();
  }, 7000);
}

// ---------------------------------------------------------------- persistencia

/** Guarda `propios` y avisa si el navegador no dejo persistir. */
function persist(): boolean {
  const ok = saveLocal(propios);
  if (!ok) {
    // Modo privado o cuota llena: el mural sigue andando, pero lo registrado
    // se pierde al recargar. La copia a archivo es la salida.
    note('Este navegador no deja guardar: descarga una copia antes de cerrar.', 'bad');
  }
  return ok;
}

function note(text: string, kind: 'ok' | 'bad' | '' = ''): void {
  if (!backupNote) return;
  backupNote.className = `hint ${kind}`.trim();
  backupNote.textContent = text;
}

/** Reemplaza lo registrado en este dispositivo y repinta. */
function setPropios(next: DataRecord[]): void {
  propios = next;
  persist();
  ids.sync(records());
  highlight = null;
  placeAll();
  render();
}

function exportPropios(): void {
  if (propios.length === 0) {
    note('Todavía no has registrado a nadie en este dispositivo.', 'bad');
    return;
  }
  downloadText(
    `mural_registros_${todayIso()}.csv`,
    recordsToCsv(propios, PERSON_FIELD_KEYS),
    'text/csv'
  );
  note(`Copia bajada: ${plural(propios.length, 'registro', 'registros')} en CSV.`, 'ok');
}

const MAX_IMPORT_BYTES = 5 * 1024 * 1024;
const MAX_IMPORT_RECORDS = 5000;

async function importPropios(file: File): Promise<void> {
  if (file.size > MAX_IMPORT_BYTES) {
    note('El archivo es demasiado grande (máximo 5 MB).', 'bad');
    return;
  }
  let incoming: DataRecord[] = [];
  try {
    const batch = parseBackup(await file.text());
    // Si la copia se hizo con una regla anterior, se remapea al entrar.
    incoming = remapAll(batch.records.slice(0, MAX_IMPORT_RECORDS), batch.mapeo, mapping()).records;
  } catch {
    incoming = [];
  }
  if (incoming.length === 0) {
    note('No se encontraron registros en ese archivo.', 'bad');
    return;
  }
  const soloMexico = incoming.filter((r) => esUbicacionMexico(r.extra['lugar_origen'] ?? ''));
  const descartados = incoming.length - soloMexico.length;
  if (soloMexico.length === 0) {
    note('Solo se permiten ubicaciones de México: no se importó ningún registro.', 'bad');
    return;
  }
  const known = new Set(base.map((r) => r.id));
  const { records: merged, added } = mergeById(propios, soloMexico.filter((r) => !known.has(r.id)));
  setPropios(merged);
  const sufijoDescartados = descartados > 0
    ? ` (${descartados} fuera de México ${descartados === 1 ? 'omitido' : 'omitidos'}).`
    : '.';
  note(
    added === 0
      ? `Ya estaban todos: no se agregó ninguno${sufijoDescartados}`
      : `Se ${added === 1 ? 'sumó' : 'sumaron'} ${added} de ${plural(soloMexico.length, 'registro', 'registros')}${sufijoDescartados}`,
    added === 0 ? '' : 'ok'
  );
}

/** Borrado en dos toques, para no perder todo por un click al pasar. */
function clearButton(): HTMLButtonElement {
  const LABEL = 'Borrar mis registros';
  let armed = 0;
  const b = button(LABEL, () => {
    if (!armed) {
      armed = window.setTimeout(() => { armed = 0; b.textContent = LABEL; }, 5000);
      b.textContent = '¿Seguro? Toca de nuevo';
      return;
    }
    window.clearTimeout(armed);
    armed = 0;
    b.textContent = LABEL;
    const n = propios.length;
    clearLocal();
    setPropios([]);
    note(n ? `Se ${n === 1 ? 'borró' : 'borraron'} ${plural(n, 'registro', 'registros')} de este dispositivo.` : 'No había nada para borrar.');
  }, 'danger');
  return b;
}

/** Bloque "Mis registros": respaldo a archivo y borrado, todo local. */
function backupBox(): HTMLElement {
  mine = el('p', { class: 'mb-2 text-xs text-muted' });
  backupNote = el('p', { class: 'hint' });
  const box = el('div', { class: 'backup' }, [
    el('p', { class: 'hint', text: 'Lo que registres queda solo en este dispositivo. Descarga una copia para no perderla si se borran los datos del navegador.' }),
    mine,
    row(
      button('Descargar copia', exportPropios),
      fileButton('Importar copia', '.csv,.json,text/csv,application/json', (f) => { void importPropios(f); })
    ),
    row(clearButton()),
    backupNote,
  ]);
  if (!storageAvailable()) {
    note('Este navegador no deja guardar datos (¿modo privado?): lo que registres se pierde al recargar.', 'bad');
  }
  return box;
}

// ---------------------------------------------------------------- alta y busqueda

const MAX_ID_RETRIES = 5;

async function addPerson(p: Person): Promise<RegistroAddResult> {
  if (zones.size === 0) {
    return { ok: false, error: 'El mural todavía está cargando. Prueba de nuevo en un momento.' };
  }
  const rl = verificarRateLimit();
  if (!rl.permitido) {
    return { ok: false, error: rl.motivo };
  }
  const validacion = validarPersona(p);
  if (!validacion.ok) {
    return { ok: false, error: validacion.error };
  }
  const limpia = validacion.persona;
  if (esDuplicadoReciente(limpia)) {
    return { ok: false, error: 'Ya recibimos un registro idéntico hace unos minutos.' };
  }

  let rec: DataRecord | null = null;

  if (supabaseConfigured()) {
    // Si otro dispositivo genero el mismo ID secuencial al mismo tiempo,
    // Postgres devuelve conflicto (23505) y avanzamos al siguiente ID libre.
    for (let intento = 0; intento < MAX_ID_RETRIES; intento++) {
      const candidato = mapPerson(limpia, ids.next(limpia.fecha), mapping());
      if (!candidato.zona) {
        return { ok: false, error: 'No se pudo sumar tu mancha. Prueba de nuevo en un momento.' };
      }
      const res = await insertRemote(candidato);
      if (res.ok) {
        rec = candidato;
        break;
      }
      if (!res.conflict) {
        return { ok: false, error: res.error };
      }
    }
    if (!rec) {
      return { ok: false, error: 'Muchos registros a la vez. Intenta de nuevo en unos segundos.' };
    }
  } else {
    // Modo local sin Supabase: el ID va primero y no depende de la zona.
    const candidato = mapPerson(limpia, ids.next(limpia.fecha), mapping());
    if (!candidato.zona) {
      return { ok: false, error: 'No se pudo sumar tu mancha. Prueba de nuevo en un momento.' };
    }
    rec = candidato;
  }

  registrarEnvio(limpia);
  propios.push(rec);
  persist();
  ids.sync(records());
  placeAll();
  render();
  // Queda marcada detras del recuadro: al cerrarlo la mancha ya esta ahi.
  highlight = placed.find((pt) => pt.record.id === rec.id) ?? null;
  paint();
  search?.refresh();
  ultimoNombre = limpia.nombre;
  return { ok: true, id: rec.id, zona: rec.zona };
}

/** "Ver mi mancha": cierra el recuadro y deja el aviso sobre el mural. */
function verMancha(): void {
  if (ultimoNombre) showFlash(`Gracias, ${ultimoNombre}. Tu mancha ya está en el mural.`);
  setOpen(null);
  startPulse();
  alta?.reset();
}

function describeRecord(r: DataRecord): string {
  // `estado_animo` es como se llamaba el campo antes de que la pregunta fuera
  // por la alimentacion: lo guardado entonces sigue teniendo que decir algo.
  const sentir = r.extra['alimentacion'] ?? r.extra['estado_animo'];
  return [sentir, r.extra['lugar_origen'], r.extra['edad'] ? `edad ${r.extra['edad']}` : '']
    .filter(Boolean)
    .join(' · ');
}

/** Cuanto se acerca la lupa al llevar la vista a una mancha. */
const ZOOM_FOCO = 3.2;

/** El recuadro que esta abierto ahora mismo, si hay alguno. */
function panelAbierto(): HTMLElement | null {
  if (open === 'buscar') return searchPanel;
  if (open === 'registrar') return addPanel;
  if (open === 'lupa') return lupaPanel;
  return null;
}

/**
 * El trozo del lienzo que no tapa ningun recuadro.
 *
 * Es lo unico que hace falta saber para decidir donde dejar una mancha y
 * donde abrir su ficha: los recuadros se abren siempre contra un borde —a lo
 * ancho y desde abajo en el telefono, pegados a la derecha en una pantalla
 * ancha— asi que lo libre sigue siendo un rectangulo. Medirlo es mas honesto
 * que suponerlo: el recuadro mide distinto segun lo que tenga dentro.
 */
function zonaLibre(): { top: number; bottom: number; left: number; right: number } {
  const caja = view.getBoundingClientRect();
  const libre = { top: caja.top, bottom: caja.bottom, left: caja.left, right: caja.right };
  const panel = panelAbierto();
  if (!panel) return libre;
  const r = panel.getBoundingClientRect();
  if (r.width <= 0 || r.height <= 0) return libre;
  // Si cruza el lienzo de lado a lado, lo que tapa es la franja de abajo; si
  // no, es la columna de la derecha.
  if (r.left <= caja.left + 1 && r.right >= caja.right - 1) {
    libre.bottom = Math.max(libre.top, Math.min(libre.bottom, r.top));
  } else {
    libre.right = Math.max(libre.left, Math.min(libre.right, r.left));
  }
  return libre;
}

/**
 * Donde cae la mancha enfocada, en fracciones de lo que quedo libre.
 *
 * En el medio, salvo a lo alto en el telefono: alli la ficha es una hoja que
 * se ancla al borde de arriba de esa misma zona, asi que la mancha va en el
 * tramo de abajo y entre las dos queda el hueco en el que se la mira.
 */
function fraccionFoco(): { x: number; y: number } {
  return { x: 0.5, y: angosto() ? 0.74 : 0.5 };
}

/**
 * Lleva el encuadre a una mancha y la deja donde se la pueda mirar.
 *
 * El reencuadre normal espera el fotograma siguiente (ver `reencuadrar`),
 * pero aqui hace falta ya: la ficha se ancla a donde quedo la mancha en la
 * pantalla, y medirlo antes de mover el encuadre la pondria donde estaba.
 */
function enfocar(point: PlacedPoint): void {
  vista.zoom = Math.max(vista.zoom, Math.min(ZOOM_MAX, ZOOM_FOCO));
  // El centro del encuadre se corre lo que haga falta para que la mancha
  // caiga donde se la pueda mirar, y no debajo de lo que hay abierto sobre
  // ella. El punto de destino se elige dentro de la zona libre y despues se
  // pasa a fracciones del lienzo, que es en lo que piensa el encuadre.
  const k = escalaViva();
  const caja = view.getBoundingClientRect();
  const libre = zonaLibre();
  const f = fraccionFoco();
  const destinoX = libre.left + (libre.right - libre.left) * f.x;
  const destinoY = libre.top + (libre.bottom - libre.top) * f.y;
  const fx = caja.width > 0 ? (destinoX - caja.left) / caja.width : 0.5;
  const fy = caja.height > 0 ? (destinoY - caja.top) / caja.height : 0.5;
  vista.cx = point.x + (0.5 - fx) * (view.width / k);
  vista.cy = point.y + (0.5 - fy) * (view.height / k);
  if (reencuadre) cancelAnimationFrame(reencuadre);
  reencuadre = 0;
  acomodarVista();
  rasterizarTlacuilo();
  encuadrarTrazado();
  paint();
  mostrarZoom();
}

/**
 * Lo que pasa al elegir un resultado de la busqueda: la vista va a la mancha.
 *
 * Marcarla donde estaba no alcanzaba. En el cartel entero una mancha son tres
 * pixeles entre mil ochocientos y la marca que late es un circulo de catorce:
 * habia que saber de antemano donde mirar. Y en el telefono el recuadro de la
 * busqueda ocupa tres cuartos de la pantalla, asi que la mancha encontrada
 * caia justo detras de el; al cerrarlo para verla se borraba el resaltado.
 *
 * Ahora la lupa se acerca a ella. Y en el telefono el recuadro **no se
 * cierra**: encoge. Cerrarlo dejaba ver la mancha pero se llevaba la lista,
 * asi que probar con el siguiente nombre era volver a abrir el buscador cada
 * vez; encogido pierde el encabezado y deja la consulta, el campo y los
 * primeros resultados a un toque, que es como se recorre una lista de gente.
 * Lo que mande en el encuadre no es el alto del recuadro sino lo que deja
 * libre (ver `zonaLibre`), asi que encoger ya pone la mancha donde se la ve.
 */
function locateRecord(r: DataRecord): void {
  const point = placed.find((p) => p.record.id === r.id) ?? null;
  highlight = point;
  if (!point) {
    paint();
    tooltip.hide();
    return;
  }
  // Primero encoger y despues encuadrar: el sitio que queda se mide.
  compactarBusqueda(true);
  enfocar(point);
  startPulse(6000);
  showFicha(point);
}

// ---------------------------------------------------------------- el cursor

/**
 * El puntero en coordenadas de trabajo. Deshace la lupa: lo que se señala es
 * un punto del dibujo, no del vidrio por el que se lo esta mirando.
 */
function enLienzo(clientX: number, clientY: number): { x: number; y: number } {
  const rect = view.getBoundingClientRect();
  const k = escalaViva();
  const px = ((clientX - rect.left) / rect.width) * view.width;
  const py = ((clientY - rect.top) / rect.height) * view.height;
  return { x: (px - origenX()) / k, y: (py - origenY()) / k };
}

/** El camino de vuelta: un punto del dibujo en la pantalla. */
function enPantalla(x: number, y: number): { x: number; y: number } {
  const rect = view.getBoundingClientRect();
  const k = escalaViva();
  return {
    x: rect.left + ((x * k + origenX()) / view.width) * rect.width,
    y: rect.top + ((y * k + origenY()) / view.height) * rect.height,
  };
}

/**
 * El cursor hace dos cosas a la vez: señala a quien tiene debajo y aparta a
 * los nodos de alrededor.
 *
 * Lo que se señala se busca contra el reposo del nodo y no contra donde esta
 * corrido. Parece al reves —el nodo visible se movio— pero es lo unico que
 * deja señalar a alguien: si la busqueda siguiera al nodo apartado, acercarse
 * lo empujaria fuera del radio de toque y la ficha nunca llegaria a abrir. El
 * empuje es chico a proposito (`empuje` contra `radioToque`), asi que el nodo
 * se aparta sin salirse de donde uno le esta apuntando.
 */
view.addEventListener('mousemove', (e) => {
  if (arrastre) return;   // arrastrando se mueve el cartel, no se señala
  cursor = enLienzo(e.clientX, e.clientY);
  animar();
  if (!grid) return;
  const hit = grid.nearest(cursor.x, cursor.y, radioToque());
  if (hit) tooltip.show(hit, e.clientX, e.clientY, fmtValue);
  else tooltip.hide();
});

view.addEventListener('mouseleave', () => {
  cursor = null;
  animar();
  tooltip.hide();
});

/**
 * Lo que abarca un dedo sobre el dibujo, en coordenadas de trabajo.
 *
 * El raton senala un pixel y el dedo tapa una moneda: medir el area sensible
 * como la del raton era pedirle a quien toca que le acierte a una mancha de
 * tres pixeles. Se mide en pixeles de pantalla y se traduce, asi que con la
 * lupa cerca el area se encoge sobre el dibujo —el dedo sigue siendo el
 * mismo— y de lejos abarca lo que haya debajo.
 */
const DEDO_PX = 22;

function radioDedo(): number {
  return Math.max(radioToque(), (DEDO_PX * upx) / escalaViva());
}

/** Cuanto se puede correr y cuanto puede durar un toque para seguir siendo uno. */
const TOQUE_QUIETO = 12;
const TOQUE_LARGO = 600;

/**
 * El dedo: al apoyarlo la red se aparta de ese punto, y al levantarlo sin
 * haberlo corrido se abre la ficha de quien quedo debajo. Con la lupa abierta
 * hace otra cosa —mueve el cartel— y de eso se encargan los gestos de abajo.
 *
 * Lo que ya no hace es seguir al dedo mientras se mueve. Sobre el mural, que
 * ocupa la pantalla entera, mover el dedo es desplazar la pagina: repintar la
 * red en cada fotograma del gesto era hacer el trabajo mas caro que hay justo
 * cuando el hilo lo necesita para el scroll. En cuanto el toque se corre se
 * suelta el punto, y la red vuelve al reposo mientras la pagina pasa.
 */
let toque: { x: number; y: number; t: number } | null = null;

view.addEventListener('touchstart', (e) => {
  if (open === 'lupa') return;
  const t = e.touches[0];
  if (!t || e.touches.length > 1) { toque = null; return; }
  toque = { x: t.clientX, y: t.clientY, t: performance.now() };
  cursor = enLienzo(t.clientX, t.clientY);
  animar();
}, { passive: true });

view.addEventListener('touchmove', (e) => {
  if (open === 'lupa' || !toque) return;
  const t = e.touches[0];
  if (!t) return;
  if (Math.hypot(t.clientX - toque.x, t.clientY - toque.y) > TOQUE_QUIETO) {
    toque = null;
    cursor = null;
  }
}, { passive: true });

/**
 * Un toque quieto abre la ficha de quien quedo debajo.
 *
 * Es lo que el raton hacia con el `mousemove`, y lo que en un telefono no
 * habia: la red se apartaba del dedo pero nunca decia de quien era la mancha,
 * asi que la unica forma de leer a alguien era buscarlo por su nombre. Vale
 * con el cartel entero y con la lupa puesta, que es desde donde se mira de
 * cerca.
 *
 * Un toque que se corrio no cuenta —era un arrastre, de la pagina o del
 * cartel— y uno largo tampoco. Sobre el papel vacio cierra la ficha: sin
 * puntero no hay `mouseleave` que la cierre.
 */
function abrirFichaEnToque(e: TouchEvent): void {
  const t = toque;
  toque = null;
  if (!t || !grid) return;
  if (e.changedTouches.length !== 1 || e.touches.length > 0) return;
  if (performance.now() - t.t > TOQUE_LARGO) return;
  const punto = enLienzo(t.x, t.y);
  const hit = grid.nearest(punto.x, punto.y, radioDedo());
  if (hit) {
    highlight = hit;
    startPulse(5000);
    showFicha(hit);
  } else {
    highlight = null;
    tooltip.hide();
    paint();
  }
}

view.addEventListener('touchend', (e) => {
  cursor = null;
  animar();
  if (open === 'lupa') { toque = null; return; }   // alli lo cierra la pinza
  abrirFichaEnToque(e);
}, { passive: true });

view.addEventListener('touchcancel', () => {
  toque = null;
  cursor = null;
  animar();
}, { passive: true });

window.addEventListener('scroll', () => tooltip.hide(), { passive: true });

// ------------------------------------------------------- mover y acercar

/**
 * Los gestos de la lupa: arrastrar para recorrer el cartel, rueda o dos
 * dedos para acercarse.
 *
 * Solo escuchan con la lupa abierta, y es a proposito: el mural ocupa la
 * pantalla entera, asi que si la rueda acercara siempre no habria como
 * seguir bajando por la pagina, y el dedo no podria desplazarla. Abrir la
 * lupa es decir "ahora estoy mirando el cartel"; cerrarla devuelve el gesto
 * a la pagina.
 */
let arrastre: { x: number; y: number } | null = null;

/** De pixeles de pantalla a pixeles del lienzo. */
function porPixel(): number {
  const rect = view.getBoundingClientRect();
  return rect.width > 0 ? view.width / rect.width : 1;
}

view.addEventListener('pointerdown', (e) => {
  // El tacto tiene su propio camino, con la pinza; aqui van raton y lapiz.
  if (open !== 'lupa' || e.pointerType === 'touch' || e.button !== 0) return;
  e.preventDefault();
  arrastre = { x: e.clientX, y: e.clientY };
  // Con el lienzo llenando la pantalla, arrastrar hasta la orilla es lo
  // normal y no un descuido: capturando el puntero el recorrido no se corta
  // al salirse de la ventana ni al pasar por encima de un recuadro.
  view.setPointerCapture(e.pointerId);
  view.classList.add('arrastrando');
  tooltip.hide();
});

view.addEventListener('pointermove', (e) => {
  if (!arrastre) return;
  // En pixeles del lienzo: con la pantalla densa no son los de pantalla, y el
  // cartel tiene que seguir al puntero exactamente.
  const k = porPixel();
  correrVista((e.clientX - arrastre.x) * k, (e.clientY - arrastre.y) * k);
  arrastre = { x: e.clientX, y: e.clientY };
});

for (const fin of ['pointerup', 'pointercancel'] as const) {
  view.addEventListener(fin, (e) => {
    if (!arrastre) return;
    arrastre = null;
    if (view.hasPointerCapture(e.pointerId)) view.releasePointerCapture(e.pointerId);
    view.classList.remove('arrastrando');
  });
}

view.addEventListener('wheel', (e) => {
  if (open !== 'lupa') return;
  e.preventDefault();
  // Un deslizamiento lateral del trackpad recorre el cartel a lo ancho, que
  // es lo que el gesto significa en cualquier otra parte; de arriba abajo
  // acerca, porque es lo que hace una rueda de raton, que no tiene lados.
  if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
    correrVista(-e.deltaX * porPixel(), 0);
    return;
  }
  // Exponencial: cada muesca multiplica, asi acercarse y alejarse cuestan lo
  // mismo y el gesto no se acelera al estar ya cerca.
  acercar(vista.zoom * Math.exp(-e.deltaY * 0.0022), enLienzo(e.clientX, e.clientY));
}, { passive: false });

/**
 * Doble clic: un salto de acercamiento al punto senalado, y con Alt o Mayus,
 * de vuelta. Es como se entra a un detalle en cualquier mapa, y ahorra buscar
 * los mandos para mirar de cerca el nopal que uno ya tiene bajo el cursor.
 */
view.addEventListener('dblclick', (e) => {
  if (open !== 'lupa') return;
  e.preventDefault();
  const salto = ZOOM_PASO * ZOOM_PASO;
  const atras = e.altKey || e.shiftKey;
  acercar(atras ? vista.zoom / salto : vista.zoom * salto, enLienzo(e.clientX, e.clientY));
});

/** Los dos dedos de la pinza: donde estan y cuanto se separan. */
let pinza: { x: number; y: number; d: number } | null = null;

function medirDedos(toques: TouchList): { x: number; y: number; d: number } | null {
  const a = toques[0];
  const b = toques[1];
  if (!a) return null;
  if (!b) return { x: a.clientX, y: a.clientY, d: 0 };
  return {
    x: (a.clientX + b.clientX) / 2,
    y: (a.clientY + b.clientY) / 2,
    d: Math.hypot(b.clientX - a.clientX, b.clientY - a.clientY),
  };
}

view.addEventListener('touchstart', (e) => {
  if (open !== 'lupa') return;
  e.preventDefault();
  pinza = medirDedos(e.touches);
  // Con la lupa puesta el dedo recorre el cartel, pero un toque quieto sigue
  // abriendo la ficha: es ahi, de cerca, donde una mancha se puede señalar.
  const t = e.touches.length === 1 ? e.touches[0] : null;
  toque = t ? { x: t.clientX, y: t.clientY, t: performance.now() } : null;
  tooltip.hide();
}, { passive: false });

view.addEventListener('touchmove', (e) => {
  if (open !== 'lupa' || !pinza) return;
  e.preventDefault();
  const ahora = medirDedos(e.touches);
  if (!ahora) return;
  if (toque && Math.hypot(ahora.x - toque.x, ahora.y - toque.y) > TOQUE_QUIETO) toque = null;
  const k = porPixel();
  // Con dos dedos manda la separacion; con uno, el arrastre. El centro se
  // sigue en los dos casos, asi que la pinza tambien mueve el cartel.
  if (pinza.d > 0 && ahora.d > 0) {
    acercar(vista.zoom * (ahora.d / pinza.d), enLienzo(ahora.x, ahora.y));
  }
  correrVista((ahora.x - pinza.x) * k, (ahora.y - pinza.y) * k);
  pinza = ahora;
}, { passive: false });

for (const fin of ['touchend', 'touchcancel'] as const) {
  view.addEventListener(fin, (e) => {
    pinza = e.touches.length > 0 ? medirDedos(e.touches) : null;
    if (open !== 'lupa') return;
    if (fin === 'touchend') abrirFichaEnToque(e);
    else toque = null;
  }, { passive: true });
}

// ---------------------------------------------------------------- pagina publica

// De aqui abajo esta lo que es solo de `/`: el Hero y las secciones que
// acompanan al mural. Lo que las dos rutas comparten —el revelado del texto y
// el fondo de red— vive en `./pagina`, que es lo que enciende `/historia` sin
// cargar nada de este motor.

/**
 * Deja la ilustracion del Hero dibujandose sola en bucle. El ciclo solo corre
 * con el Hero a la vista: fuera de pantalla se queda quieto donde estaba y
 * sigue desde ahi al volver, para no gastar fotogramas en vano.
 */
function initHeroReveal(img: ImageData): void {
  if (!heroCanvas) return;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  heroReveal = createHeroReveal(img, paintHero);
  heroReveal.play();

  const hero = document.getElementById('inicio');
  if (!hero || !('IntersectionObserver' in window)) return;
  const observer = new IntersectionObserver((entries) => {
    for (const e of entries) {
      heroALaVista = e.isIntersecting;
      if (e.isIntersecting) heroReveal?.play();
      else heroReveal?.pause();
    }
  }, { threshold: 0 });
  observer.observe(hero);

  // Con la pestaña en segundo plano tampoco hace falta seguir pintando.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) heroReveal?.pause();
    else if (hero.getBoundingClientRect().bottom > 0) heroReveal?.play();
  });
}

function initLanding(): void {
  initRevelados();

  // Los botones «Copiar cita» de las referencias.
  initCitas();

  // Las muestras de la escala no estan en esta pagina: se fueron con su
  // seccion a «Visualización de datos» y las pinta `./historia.ts` con
  // `pintarMuestrasEscala()` (en `./pagina.ts`), que es el mismo pincel.

  // Botones del Hero y las secciones que bajan al mural y abren un panel.
  for (const btn of document.querySelectorAll<HTMLElement>('[data-mural-action]')) {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      const action = btn.dataset.muralAction;
      const target = document.getElementById('mural') ?? page;
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      if (action === 'registrar') setOpen('registrar');
      else if (action === 'buscar') setOpen('buscar');
      else setOpen(null);
    });
  }

  // Animacion al salir del Hero haciendo scroll hacia el mural.
  const hero = document.getElementById('inicio');
  const heroContent = document.getElementById('hero-content');
  const heroBg = document.getElementById('hero-bg');
  const heroHint = document.getElementById('hero-hint');
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // La barra superior se funde con el Hero mientras este a la vista y recupera
  // su fondo solido al entrar en el resto de las secciones.
  const nav = document.getElementById('nav');
  if (nav && hero) {
    // El alto del Hero queda medido: leerlo en cada evento de scroll obliga
    // al navegador a recalcular la pagina en medio del gesto, y solo cambia
    // cuando cambia la ventana.
    let mitadHero = hero.offsetHeight * 0.5;
    const syncNav = () => {
      nav.classList.toggle('glass-nav--hero', window.scrollY < mitadHero);
    };
    window.addEventListener('scroll', syncNav, { passive: true });
    window.addEventListener('resize', () => {
      mitadHero = hero.offsetHeight * 0.5;
      syncNav();
    });
    syncNav();
  }

  // El Hero ocupa la pantalla entera: el primer gesto (rueda, deslizar, toque
  // o tecla) no desplaza de a poco sino que baja de un salto al mural. Solo
  // actua mientras la pagina esta arriba del todo; despues el scroll es normal.
  const muralSection = document.getElementById('mural');
  if (hero && muralSection) {
    let jumping = false;

    /** Arriba del todo, con el Hero llenando la pantalla. */
    const atHero = (): boolean => window.scrollY < 24;

    const goToMural = (e?: Event): void => {
      if (jumping || !atHero()) return;
      e?.preventDefault();
      jumping = true;
      muralSection.scrollIntoView({
        behavior: reduceMotion ? 'auto' : 'smooth',
        block: 'start',
      });
      // Candado mientras corre el desplazamiento suave, para que los gestos
      // que siguen no lo reinicien ni lo peleen.
      window.setTimeout(() => { jumping = false; }, reduceMotion ? 0 : 900);
    };

    // Rueda y trackpad: solo hacia abajo (hacia arriba ya no hay nada).
    window.addEventListener('wheel', (e) => {
      if (e.deltaY > 0) goToMural(e);
    }, { passive: false });

    // Dedo: cuenta como gesto en cuanto sube lo suficiente.
    let touchY: number | null = null;
    hero.addEventListener('touchstart', (e) => {
      touchY = e.touches[0]?.clientY ?? null;
    }, { passive: true });
    hero.addEventListener('touchmove', (e) => {
      const y = e.touches[0]?.clientY;
      if (touchY === null || y === undefined) return;
      if (touchY - y > 12) goToMural(e);
    }, { passive: false });

    // Toque o clic suelto sobre el Hero (no sobre un boton o enlace).
    hero.addEventListener('click', (e) => {
      if ((e.target as Element | null)?.closest('a, button, input, [data-mural-action]')) return;
      goToMural();
    });

    // Teclado: las teclas con las que se baja una pantalla.
    window.addEventListener('keydown', (e) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const target = e.target as Element | null;
      if (target?.closest('input, textarea, select, [contenteditable="true"]')) return;
      if (['ArrowDown', 'PageDown', ' ', 'Spacebar', 'End'].includes(e.key)) goToMural(e);
    });
  }

  if (hero && (heroContent || heroBg) && !reduceMotion) {
    // El CSS saca `filter` de la transicion en el mismo ancho (ver
    // `.hero-exit-target` en `mural.css`).
    const sinDesenfoque = angosto() || tactil;
    let ticking = false;
    const updateHeroExit = () => {
      ticking = false;
      const h = Math.max(1, hero.offsetHeight);
      const t = Math.min(1, Math.max(0, window.scrollY / (h * 0.85)));
      if (heroContent) {
        heroContent.style.opacity = String(Math.max(0, 1 - t * 1.15));
        heroContent.style.transform = `translate3d(0, ${-t * 44}px, 0) scale(${1 - t * 0.06})`;
        // En el telefono se va el desenfoque. La placa del Hero ya desenfoca
        // lo que tiene detras (`backdrop-filter`), asi que animar encima un
        // `filter: blur` es desenfocar media pantalla dos veces en cada
        // fotograma del scroll, y era lo que lo hacia ir a tirones. Lo que
        // queda —opacidad y desplazamiento— lo compone la GPU sola.
        if (!sinDesenfoque) heroContent.style.filter = `blur(${t * 6}px)`;
      }
      if (heroBg) {
        heroBg.style.opacity = String(Math.max(0.15, 1 - t * 0.7));
        heroBg.style.transform = `translate3d(0, ${t * 56}px, 0) scale(${1 + t * 0.08})`;
      }
      if (heroHint) {
        heroHint.style.opacity = String(Math.max(0, 1 - t * 4));
      }
    };
    window.addEventListener('scroll', () => {
      if (!ticking) {
        ticking = true;
        requestAnimationFrame(updateHeroExit);
      }
    }, { passive: true });
    updateHeroExit();
  }
}

initLanding();

// ---------------------------------------------------------------- arranque

/**
 * El titulo y la bajada de un recuadro, en su propia caja: asi el buscador
 * puede esconderlos de una sola vez al encogerse (ver `compactarBusqueda`).
 */
function panelHeader(title: string, lead: string): HTMLElement[] {
  return [
    el('div', { class: 'panel-cabecera' }, [
      el('h2', { text: title }),
      el('p', { class: 'mb-3 text-sm leading-[1.45] text-muted', text: lead }),
    ]),
  ];
}

/**
 * El aviso del lienzo mientras no hay mural: lo que se lee antes de que el
 * cartel llegue, y lo que queda escrito si no llega.
 *
 * Va fuera del flujo a proposito. El lienzo centra a sus hijos en fila, y
 * mientras no hay dibujo el `<canvas>` todavia mide lo que mide uno vacio
 * —300x150— y cuenta como hermano: en fila, el aviso salia corrido media
 * anchura de ese lienzo invisible. Posicionado, el flex lo centra solo, en
 * la misma caja en la que despues entra el cartel (igual que `tl-aviso`).
 */
const avisoLienzo = el('p', {
  class: 'absolute text-sm text-muted',
  text: 'Cargando el mural…',
});

async function start(): Promise<void> {
  tools.classList.add('hidden');
  mural.append(avisoLienzo);

  // El dibujo, sus horneados y los registros: todo eso lo trae `./cartel`,
  // que es tambien de donde los toma el timelapse (ver `./timelapse`).
  const cargado = await cargarMural(RENDER, {
    // El Hero se pone a trazar en cuanto hay ilustracion. Lo que falta
    // —el analisis del dibujo, el banco de registros, la consulta a
    // Supabase, la red y el render— sigue corriendo detras, y al terminar
    // `render` le cambia la fuente por el mural ya pintado.
    alTenerDibujo: (d) => {
      heroFuente = d.canvas;
      initHeroReveal(d.imageData);
    },
  });
  const d = cargado.cartel.drawing;
  drawing = d;
  zones = cargado.cartel.zones;
  field = cargado.cartel.field;
  boceto = cargado.cartel.boceto;
  trama = cargado.cartel.trama;
  tlacuilo = cargado.cartel.tlacuilo;
  base = cargado.base;
  propios = cargado.propios;
  // Lo guardado en este dispositivo puede venir de una version anterior del
  // mapeo: `cargarMural` lo devuelve al dia y aqui se vuelve a guardar, asi no
  // quedan dos reglas mezcladas en el mismo mural.
  if (cargado.remapeados > 0) saveLocal(propios);
  ids.sync(records());

  alta = registroForm({ ramp, add: addPerson, onDone: verMancha });
  addPanel.append(
    ...panelHeader('Súmate al mural', 'Seis pantallas cortas y tu mancha de acuarela queda en el mural.'),
    alta.root,
    // `count` no viste: es el gancho con el que `refreshCount` lo encuentra.
    el('p', { class: 'count mt-3 text-right text-xs text-muted' }),
    // El respaldo es tarea de quien atiende el kiosco, no de quien se registra.
    el('details', { class: 'mas' }, [el('summary', { text: 'Mis registros' }), backupBox()])
  );

  search = personSearch({
    search: (q) => searchByName(records(), q),
    locate: locateRecord,
    describe: describeRecord,
  });
  searchPanel.append(
    ...panelHeader('Buscar una persona', 'Escribe un nombre y elige un resultado para ver dónde quedó su mancha.'),
    search.root
  );
  // Escribir otra cosa es empezar de nuevo: la lista vuelve a su alto.
  searchPanel.querySelector('input')?.addEventListener('input', () => compactarBusqueda(false));

  avisoLienzo.remove();
  tools.classList.remove('hidden');
  placeAll();
  render();

  observarVisibilidad();
  pausarEnScroll();
  seguirTamano();
  animar();

  // Actualizaciones en vivo desde Supabase Realtime: cuando alguien se suma
  // desde otro dispositivo, su mancha entra al mural sin recargar.
  if (supabaseConfigured()) {
    const unsubscribe = subscribeRemote((item) => {
      if (records().some((r) => r.id === item.record.id)) return;
      const [rec] = remapAll([item.record], item.mapeo, mapping()).records;
      if (!rec || !esUbicacionMexico(rec.extra['lugar_origen'] ?? '')) return;
      base.push(rec);
      ids.sync(records());
      placeAll();
      render();
      search?.refresh();
    });
    window.addEventListener('pagehide', unsubscribe, { once: true });
  }
}

/** El pulso solo corre con el mural a la vista. */
function observarVisibilidad(): void {
  if (typeof IntersectionObserver === 'undefined') return;
  new IntersectionObserver((entradas) => {
    muralVisible = entradas.some((e) => e.isIntersecting);
    if (muralVisible) animar();
    else {
      // Fuera de la vista no hay cursor que esquivar: la red vuelve al reposo
      // de una vez, para que al volver no se la encuentre a medio camino.
      cursor = null;
      if (red) { enReposo(red); redViva = false; }
      detenerAnimacion();
    }
  }, { threshold: 0.05 }).observe(mural);
}

/**
 * Al cambiar el tamano de la caja hay que volver a rasterizar: la escena esta
 * pintada a la medida de la anterior. Se espera a que el gesto termine —un
 * arrastre de ventana son decenas de eventos y cada render son decimas— y se
 * re-renderiza solo si cambio algo de verdad.
 *
 * Cambio de escala no alcanza para saberlo. El lienzo llena la caja, asi que
 * puede cambiar de tamano sin cambiar de escala —una ventana mas ancha con la
 * misma altura deja el cartel encajando igual— y asignarle el tamano a un
 * lienzo lo borra: habria que repintarlo aunque el cartel se vea del mismo
 * tamano.
 */
function seguirTamano(): void {
  let timer = 0;
  const alCambiar = () => {
    clearTimeout(timer);
    timer = window.setTimeout(() => {
      const antes = escala;
      const ancho = view.width;
      const alto = view.height;
      const ahora = ajustarLienzo();
      if (Math.abs(ahora - antes) > 0.01 || view.width !== ancho || view.height !== alto) render();
    }, 180);
  };
  if (typeof ResizeObserver !== 'undefined') new ResizeObserver(alCambiar).observe(mural);
  else window.addEventListener('resize', alCambiar);
}

start().catch((err) => {
  // El mismo aviso, con lo que paso: si se queda el de «cargando» al lado,
  // ahora que los dos van posicionados se encimarian en el medio del lienzo.
  avisoLienzo.textContent = `No se pudo cargar el mural: ${err}`;
  mural.append(avisoLienzo);
});
