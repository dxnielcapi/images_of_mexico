/**
 * Validación de ubicaciones de México para los registros del mural.
 *
 * El mural habla de la alimentación y la soberanía alimentaria en México:
 * solo se permiten registros con ubicación dentro de la República Mexicana.
 *
 * Este módulo no toca el DOM ni el navegador, así que puede reutilizarse sin
 * cambios cuando las altas pasen por un servidor o una base de datos.
 */

/** Mensaje único cuando alguien intenta registrar una ubicación fuera de México. */
export const MENSAJE_SOLO_MEXICO = 'Solo se permiten ubicaciones de México.';

/** Valor centinela del selector para detectar explícitamente ubicaciones externas. */
export const OPCION_EXTERNO = '__EXTERNO__';

/** Las 32 entidades federativas de México en orden alfabético. */
export const ESTADOS_MEXICO = [
  'Aguascalientes',
  'Baja California',
  'Baja California Sur',
  'Campeche',
  'Chiapas',
  'Chihuahua',
  'Ciudad de México',
  'Coahuila',
  'Colima',
  'Durango',
  'Estado de México',
  'Guanajuato',
  'Guerrero',
  'Hidalgo',
  'Jalisco',
  'Michoacán',
  'Morelos',
  'Nayarit',
  'Nuevo León',
  'Oaxaca',
  'Puebla',
  'Querétaro',
  'Quintana Roo',
  'San Luis Potosí',
  'Sinaloa',
  'Sonora',
  'Tabasco',
  'Tamaulipas',
  'Tlaxcala',
  'Veracruz',
  'Yucatán',
  'Zacatecas',
] as const;

export type EstadoMexico = (typeof ESTADOS_MEXICO)[number];

/** Normaliza texto para comparar sin acentos, mayúsculas ni puntuación extra. */
function normalizarClave(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[.,;:/\-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Alias, abreviaturas y nombres oficiales largos -> nombre canónico del estado. */
const ALIAS_ESTADOS: Record<string, EstadoMexico> = {
  ags: 'Aguascalientes',
  bc: 'Baja California',
  bcn: 'Baja California',
  'baja california norte': 'Baja California',
  bcs: 'Baja California Sur',
  camp: 'Campeche',
  chis: 'Chiapas',
  chih: 'Chihuahua',
  cdmx: 'Ciudad de México',
  df: 'Ciudad de México',
  'd f': 'Ciudad de México',
  'distrito federal': 'Ciudad de México',
  'ciudad de mexico': 'Ciudad de México',
  'cd de mexico': 'Ciudad de México',
  coah: 'Coahuila',
  'coahuila de zaragoza': 'Coahuila',
  col: 'Colima',
  dgo: 'Durango',
  edomex: 'Estado de México',
  'edo mex': 'Estado de México',
  'edo de mexico': 'Estado de México',
  'estado de mexico': 'Estado de México',
  mex: 'Estado de México',
  gto: 'Guanajuato',
  gro: 'Guerrero',
  hgo: 'Hidalgo',
  jal: 'Jalisco',
  mich: 'Michoacán',
  'michoacan de ocampo': 'Michoacán',
  mor: 'Morelos',
  nay: 'Nayarit',
  nl: 'Nuevo León',
  'n l': 'Nuevo León',
  oax: 'Oaxaca',
  pue: 'Puebla',
  qro: 'Querétaro',
  'queretaro de arteaga': 'Querétaro',
  qroo: 'Quintana Roo',
  'q roo': 'Quintana Roo',
  slp: 'San Luis Potosí',
  's l p': 'San Luis Potosí',
  sin: 'Sinaloa',
  son: 'Sonora',
  tab: 'Tabasco',
  tamps: 'Tamaulipas',
  tlax: 'Tlaxcala',
  ver: 'Veracruz',
  'veracruz de ignacio de la llave': 'Veracruz',
  yuc: 'Yucatán',
  zac: 'Zacatecas',
};

const ESTADOS_POR_CLAVE = new Map<string, EstadoMexico>([
  ...ESTADOS_MEXICO.map((estado) => [normalizarClave(estado), estado] as const),
  ...Object.entries(ALIAS_ESTADOS).map(([alias, estado]) => [normalizarClave(alias), estado] as const),
]);

/**
 * Ciudades, alcaldías y localidades mexicanas frecuentes (para aceptar
 * respaldos o CSVs previos que guardaron localidad en lugar de estado).
 */
const LOCALIDADES_MEXICO = new Set<string>([
  'acapulco', 'acapulco de juarez', 'aguascalientes', 'alvaro obregon', 'amealco',
  'apodaca', 'atizapan', 'atizapan de zaragoza', 'atlixco', 'azcapotzalco',
  'benito juarez', 'boca del rio', 'cabo san lucas', 'campeche', 'cancun',
  'cardenas', 'celaya', 'chalco', 'chetumal', 'chihuahua', 'chilpancingo',
  'chimalhuacan', 'cholula', 'ciudad del carmen', 'ciudad juarez', 'ciudad madero',
  'ciudad obregon', 'ciudad valles', 'ciudad victoria', 'coatepec', 'coatzacoalcos',
  'colima', 'comitan', 'cordoba', 'coyoacan', 'cozumel', 'cuajimalpa', 'cuauhtemoc',
  'cuautitlan', 'cuautitlan izcalli', 'cuautla', 'cuernavaca', 'culiacan',
  'delicias', 'durango', 'ecatepec', 'ensenada', 'etzatlan', 'fresnillo',
  'gomez palacio', 'guadalajara', 'guadalupe', 'guanajuato', 'guasave', 'guaymas',
  'gustavo a madero', 'hermosillo', 'huajuapan', 'huatulco', 'huixquilucan',
  'iguala', 'irapuato', 'ixtapaluca', 'iztacalco', 'iztapalapa', 'jiutepec',
  'juchitan', 'la paz', 'lagos de moreno', 'lazaro cardenas', 'leon', 'los cabos',
  'los mochis', 'magdalena contreras', 'manzanillo', 'matamoros', 'mazatlan',
  'merida', 'metepec', 'mexicali', 'miguel hidalgo', 'milpa alta', 'minatitlan',
  'monclova', 'monterrey', 'morelia', 'naucalpan', 'navojoa', 'nezahualcoyotl',
  'nicolas romero', 'nogales', 'nuevo laredo', 'oaxaca', 'oaxaca de juarez',
  'orizaba', 'pachuca', 'palenque', 'paracho', 'patzcuaro', 'piedras negras',
  'playa del carmen', 'poza rica', 'progreso', 'puebla', 'puerto escondido',
  'puerto vallarta', 'queretaro', 'reynosa', 'salina cruz', 'saltillo',
  'san cristobal de las casas', 'san juan del rio', 'san luis potosi',
  'san miguel de allende', 'san nicolas de los garza', 'san pedro garza garcia',
  'santa catarina', 'santiago de queretaro', 'silao', 'tampico', 'tapachula',
  'taxco', 'tecate', 'tehuacan', 'teotitlan del valle', 'tepatitlan', 'tepic',
  'tepozotlan', 'tepoztlan', 'tequisquiapan', 'texcoco', 'teziutlan', 'tijuana',
  'tlahuac', 'tlalnepantla', 'tlalpan', 'tlapa', 'tlaquepaque', 'tlaxcala',
  'tlaxiaco', 'toluca', 'tonala', 'torreon', 'tula', 'tulancingo', 'tulum',
  'tuxpan', 'tuxtepec', 'tuxtla gutierrez', 'uruapan', 'valladolid',
  'valle de bravo', 'venustiano carranza', 'veracruz', 'villahermosa', 'xalapa',
  'xochimilco', 'zacatecas', 'zamora', 'zapopan', 'zihuatanejo', 'zitacuaro',
]);

/**
 * Devuelve el nombre canónico del estado de México si `valor` corresponde a
 * una entidad federativa mexicana (o a un formato "Ciudad, Estado" donde el
 * estado pertenece a México). Si no coincide, devuelve `null`.
 */
export function normalizarEstadoMexico(valor: string): EstadoMexico | null {
  const limpio = valor.trim();
  if (!limpio || limpio === OPCION_EXTERNO) return null;

  const claveCompleta = normalizarClave(limpio);
  const directo = ESTADOS_POR_CLAVE.get(claveCompleta);
  if (directo) return directo;

  // Acepta formatos como "Guadalajara, Jalisco" o "Oaxaca, Oax., México".
  const partes = limpio
    .split(',')
    .map((p) => normalizarClave(p))
    .filter((p) => p && p !== 'mexico' && p !== 'mx');

  for (let i = partes.length - 1; i >= 0; i--) {
    const estado = ESTADOS_POR_CLAVE.get(partes[i]);
    if (estado) return estado;
  }

  return null;
}

/**
 * True si `valor` corresponde a un estado o localidad reconocida de México.
 * Se usa al importar respaldos para filtrar ubicaciones externas sin romper
 * registros previos que guardaron el nombre de su municipio o ciudad.
 */
export function esUbicacionMexico(valor: string): boolean {
  const limpio = valor.trim();
  if (!limpio || limpio === OPCION_EXTERNO) return false;
  if (normalizarEstadoMexico(limpio) !== null) return true;

  const clave = normalizarClave(limpio);
  if (LOCALIDADES_MEXICO.has(clave)) return true;

  const partes = limpio.split(',').map((p) => normalizarClave(p)).filter(Boolean);
  if (partes.length > 0 && LOCALIDADES_MEXICO.has(partes[0])) {
    // Si trae país explícito al final, debe ser México (no p. ej. "León, España").
    const ultimo = partes[partes.length - 1];
    if (partes.length === 1 || ultimo === 'mexico' || ultimo === 'mx' || ESTADOS_POR_CLAVE.has(ultimo)) {
      return true;
    }
  }

  return false;
}
