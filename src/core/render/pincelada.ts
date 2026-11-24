/**
 * Las medidas de la pincelada: de que tamano es el pedazo de figura que le
 * toca a un registro.
 *
 * Aqui quedaron solo los numeros. El trazo de la pincelada —una cinta que
 * corre sobre una linea del dibujo, errandole a proposito para que no fuera
 * un calco— se dibujaba cuando la figura la pintaba una marca por persona;
 * desde que la arma la red (`@core/render/red`) nadie lo pinta y se borro.
 *
 * El que sigue vivo es `tramo`, y no es un parametro de pintura: es el largo
 * con el que `mural/cartel` corta las lineas del boceto en pedazos
 * (`bocetoDesde`), o sea cuanto dibujo le toca a cada quien. De ahi sale el
 * recorrido sobre el que se tiende la red, asi que mover este numero mueve la
 * densidad de toda la figura.
 */
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
