/**
 * El `.zones.json` del dibujo: solo lectura.
 *
 * Lo escribia el studio, que era donde se delimitaban las regiones a mano.
 * Desde que el mural es una red de afinidades el acomodo no sale de las
 * zonas, y el studio se borro: el archivo quedo como lo que ya era, una
 * configuracion versionada junto a la ilustracion. De el se siguen leyendo
 * los parametros con los que se binariza el dibujo —de ahi sale el campo que
 * le pone borde a la red— y las semillas de las regiones.
 *
 * Si manana cambia la ilustracion hay que rehacer ese archivo, y ya no hay
 * editor: lo escribe `tools/zonas.py`, que mide las semillas sobre el dibujo
 * nuevo con las mismas cuentas que hace aqui el navegador.
 */
import type { ZonesConfig } from '@core/types';

export function parseConfig(text: string): ZonesConfig {
  const cfg = JSON.parse(text) as ZonesConfig;
  if (!cfg || !Array.isArray(cfg.zones)) throw new Error('JSON de zonas invalido');
  return cfg;
}
