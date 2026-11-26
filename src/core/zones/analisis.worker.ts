/**
 * El analisis del dibujo, corriendo fuera del hilo de la pagina.
 *
 * Recibe la tinta ya binarizada y devuelve lo mismo que `analizarTinta`: es
 * exactamente el mismo codigo sobre los mismos bytes, asi que el campo que
 * sale de aqui es identico al que salia cuando esto corria en la pagina. Lo
 * unico que cambia es donde.
 *
 * Las mascaras van y vienen *transferidas*, no copiadas: la de entrada son
 * cuatro megas y las de salida veintiocho, y copiarlas costaria casi lo que se
 * viene a ahorrar. Transferir deja el buffer vacio del lado que lo manda, que
 * es justo lo que se quiere —cada mascara tiene un solo dueno a la vez—, pero
 * obliga a quien llama a no volver a mirar lo que mando (ver
 * `./analisisAparte`).
 *
 * Quien lo abre y lo cierra es `./analisisAparte`. Aqui no hay estado: una
 * peticion, una respuesta, y el hilo se termina.
 */
import { analizarTinta, type Analysis, type DetectParams } from '../scene';

/** Lo que hay que mandarle para que mida el dibujo. */
export interface PeticionAnalisis {
  /** La tinta binarizada, sin dilatar todavia. */
  ink: Uint8Array;
  width: number;
  height: number;
  p: DetectParams;
}

/**
 * El `self` de un hilo, con lo poco que se usa de el.
 *
 * Se declara aqui en vez de pedir la libreria `webworker`: el proyecto se
 * compila con la del DOM, y las dos juntas chocan en media docena de nombres
 * globales. Esto es lo unico que hace falta y no obliga a nadie a elegir.
 */
interface AmbitoHilo {
  onmessage: ((e: MessageEvent<PeticionAnalisis>) => void) | null;
  postMessage(mensaje: unknown, transferir: Transferable[]): void;
}

const hilo = self as unknown as AmbitoHilo;

hilo.onmessage = (e) => {
  const { ink, width, height, p } = e.data;
  const a: Analysis = analizarTinta(ink, width, height, p);
  hilo.postMessage(a, [a.ink.buffer, a.dist.buffer, a.labeling.labels.buffer]);
};
