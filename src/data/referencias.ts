/**
 * Las fuentes del proyecto: las investigaciones que sostienen lo que cuenta la
 * pagina y el credito de la pieza.
 *
 * Van aqui y no en el `.astro` por lo mismo que `SENTIRES` vive en
 * `@data/person`: son datos, los lee mas de un sitio —la seccion
 * `#referencias` los pinta y el JSON-LD de schema.org sale de los mismos
 * campos— y la cita tiene que ser identica en los dos lados.
 *
 * Las citas estan en APA 7.a edicion, en espanol, y se transcriben tal cual:
 * ningun autor, titulo, ano, numero ni DOI se toca desde aqui. El orden del
 * arreglo es el que sale en la pagina y es alfabetico por el apellido del
 * primer autor (Bara, Dehouve, Diaz Ortega, Ortiz Andrade, Secretaria de
 * Salud).
 */

/**
 * Un tramo de la cita. La cursiva no se puede dejar al CSS porque cae en
 * mitad de un parrafo —el titulo de la revista y su volumen van en cursiva, y
 * el titulo del articulo no—, asi que la cita se guarda partida en los tramos
 * que cambian de estilo y el componente los vuelve a juntar.
 */
export interface TramoCita {
  texto: string;
  /** Titulo de revista y volumen: lo unico que va en cursiva. */
  cursiva?: boolean;
}

/** Lo que el JSON-LD necesita de una referencia y la cita no tiene aparte. */
export interface EsquemaReferencia {
  /** Los articulos son `ScholarlyArticle`; el documento oficial, `WebPage`. */
  tipo: 'ScholarlyArticle' | 'WebPage';
  /** Titulo de la obra, sin el resto de la cita. */
  nombre: string;
  /** Autores en el orden de la cita, con el nombre como lo lleva la firma. */
  autores: string[];
  /** True si la autoria es institucional: sale como `Organization`. */
  institucional?: boolean;
  /** `datePublished`: el ano, o la fecha completa si la cita la trae. */
  fecha: string;
  /** `isPartOf`: la revista del articulo o el sitio del documento. */
  parteDe: string;
}

export interface Referencia {
  /** Clave corta: ancla de la tarjeta y enganche de los `data-*`. */
  id: string;
  /**
   * Como se nombra la fuente en los `aria-label` de sus botones. Lleva el
   * articulo cuando la autoria es institucional («la Secretaria de Salud»),
   * para que la frase armada se lea entera.
   */
  autorCorto: string;
  anio: string;
  /** La palabra con la que se nombra la obra en los `aria-label`. */
  obra: 'artículo' | 'documento';
  /** Donde cae el enlace principal, para decirlo en el `aria-label`. */
  sede: string;
  /** La cita completa, partida en tramos; cierra con `url`. */
  cita: TramoCita[];
  /**
   * El enlace principal, que es tambien el que cierra la cita: el DOI cuando
   * lo hay y la direccion del repositorio cuando no. Se muestra entero y se
   * abre de un clic.
   */
  url: string;
  /** La descripcion de una linea de la tarjeta. */
  descripcion: string;
  /** La etiqueta de tipo de acceso. */
  acceso: string;
  /** Lo que acompana al acceso: licencia, idioma, repositorio. */
  notas: string[];
  /** El PDF directo, si la fuente lo publica. */
  pdf?: string;
  /** La pagina del articulo cuando el enlace principal es el DOI. */
  pagina?: string;
  esquema: EsquemaReferencia;
}

export const REFERENCIAS: Referencia[] = [
  {
    id: 'bara-2023',
    autorCorto: 'Bara et al.',
    anio: '2023',
    obra: 'artículo',
    sede: 'Debates en Sociología',
    cita: [
      {
        texto:
          'Bara, C. R., González-Santos, R., Colmenero Morales, S. L., Hernández-Sandoval, L. '
          + 'y Hernández-Puente, K. N. (2023). Sistemas locales de producción y redes '
          + 'alimentarias alternativas en Amealco de Bonfil, Querétaro, México: Resistencias e '
          + 'interconexiones para caminar hacia la soberanía alimentaria. ',
      },
      { texto: 'Debates en Sociología', cursiva: true },
      { texto: ', (57), 244–272. ' },
    ],
    url: 'https://doi.org/10.18800/debatesensociologia.202302.010',
    descripcion:
      'Analiza cómo los sistemas locales de producción y las redes alimentarias alternativas de '
      + 'comunidades indígenas de Amealco contribuyen a la soberanía alimentaria.',
    acceso: 'Acceso abierto',
    notas: [],
    esquema: {
      tipo: 'ScholarlyArticle',
      nombre:
        'Sistemas locales de producción y redes alimentarias alternativas en Amealco de Bonfil, '
        + 'Querétaro, México: Resistencias e interconexiones para caminar hacia la soberanía '
        + 'alimentaria',
      autores: [
        'C. R. Bara',
        'R. González-Santos',
        'S. L. Colmenero Morales',
        'L. Hernández-Sandoval',
        'K. N. Hernández-Puente',
      ],
      fecha: '2023',
      parteDe: 'Debates en Sociología',
    },
  },
  {
    id: 'dehouve-2025',
    autorCorto: 'Dehouve',
    anio: '2025',
    obra: 'artículo',
    sede: 'OpenEdition',
    cita: [
      {
        texto:
          'Dehouve, D. (2025). Las espirales y hélices complementarias en los manuscritos del '
          + 'México central antiguo. ',
      },
      { texto: 'Caravelle. Cahiers du monde hispanique et luso-brésilien', cursiva: true },
      { texto: ', (125), 85–108. ' },
    ],
    url: 'https://doi.org/10.4000/15dxk',
    descripcion:
      'Estudia las espirales, hélices y el xonecuilli en códices prehispánicos (Vaticano B, '
      + 'Fejérváry-Mayer y Laud) como expresión de movimiento y complementariedad, en homenaje a '
      + 'Alfredo López Austin.',
    acceso: 'Acceso abierto',
    notas: [],
    pagina: 'https://journals.openedition.org/caravelle/18386',
    esquema: {
      tipo: 'ScholarlyArticle',
      nombre:
        'Las espirales y hélices complementarias en los manuscritos del México central antiguo',
      autores: ['D. Dehouve'],
      fecha: '2025',
      parteDe: 'Caravelle. Cahiers du monde hispanique et luso-brésilien',
    },
  },
  {
    id: 'diaz-ortega-2026',
    autorCorto: 'Díaz Ortega et al.',
    anio: '2026',
    obra: 'artículo',
    sede: 'MDPI',
    cita: [
      {
        texto:
          'Díaz Ortega, S. O., Pérez-Flores, M. E., López-Cruz, J. Y., Morales García, I. y '
          + 'Jurado Celis, S. N. (2026). Milpa food system, nutritional contributions in adults '
          + 'and its sociocultural role in a rural community of Oaxaca, Mexico. ',
      },
      { texto: 'World, 7', cursiva: true },
      { texto: '(3), 47. ' },
    ],
    url: 'https://doi.org/10.3390/world7030047',
    descripcion:
      'Evalúa el aporte nutricional de la milpa y su papel como pilar de identidad comunitaria en '
      + 'San Felipe Tejalápam, Oaxaca (IPN-CIIDIR Oaxaca).',
    acceso: 'Acceso abierto',
    notas: ['Licencia CC BY 4.0', 'Artículo en inglés'],
    esquema: {
      tipo: 'ScholarlyArticle',
      nombre:
        'Milpa food system, nutritional contributions in adults and its sociocultural role in a '
        + 'rural community of Oaxaca, Mexico',
      autores: [
        'S. O. Díaz Ortega',
        'M. E. Pérez-Flores',
        'J. Y. López-Cruz',
        'I. Morales García',
        'S. N. Jurado Celis',
      ],
      fecha: '2026',
      parteDe: 'World',
    },
  },
  {
    id: 'ortiz-andrade-2006',
    autorCorto: 'Ortiz Andrade',
    anio: '2006',
    obra: 'artículo',
    sede: 'la Biblioteca Jurídica Virtual del IIJ-UNAM',
    cita: [
      {
        texto:
          'Ortiz Andrade, J. (2006). El mito de Quetzalcoatl como fundamento "ficticio" del '
          + 'derecho azteca. ',
      },
      {
        texto: 'Crítica Jurídica. Revista Latinoamericana de Política, Filosofía y Derecho',
        cursiva: true,
      },
      { texto: ', (25). ' },
    ],
    url:
      'https://revistas-colaboracion.juridicas.unam.mx/index.php/critica-juridica/article/view/3358',
    descripcion:
      'Examina el mito de Quetzalcóatl como base simbólica del orden jurídico mexica.',
    acceso: 'Acceso abierto',
    notas: ['Biblioteca Jurídica Virtual, IIJ-UNAM'],
    pdf:
      'https://revistas-colaboracion.juridicas.unam.mx/index.php/critica-juridica/article/'
      + 'viewFile/3358/3146',
    esquema: {
      tipo: 'ScholarlyArticle',
      nombre: 'El mito de Quetzalcoatl como fundamento "ficticio" del derecho azteca',
      autores: ['J. Ortiz Andrade'],
      fecha: '2006',
      parteDe: 'Crítica Jurídica. Revista Latinoamericana de Política, Filosofía y Derecho',
    },
  },
  {
    id: 'secretaria-salud-2025',
    autorCorto: 'la Secretaría de Salud',
    anio: '2025',
    obra: 'documento',
    sede: 'gob.mx',
    cita: [
      { texto: 'Secretaría de Salud. (2025, 8 de octubre). ' },
      { texto: 'La dieta de la milpa', cursiva: true },
      { texto: '. Gobierno de México. ' },
    ],
    url: 'https://www.gob.mx/salud/acciones-y-programas/la-dieta-de-la-milpa-298617',
    descripcion:
      'Modelo de alimentación saludable basado en la cultura y las características regionales de '
      + 'la alimentación mexicana, de la Dirección de Medicina Tradicional y Desarrollo '
      + 'Intercultural.',
    acceso: 'Documento oficial',
    notas: ['Gobierno de México'],
    esquema: {
      tipo: 'WebPage',
      nombre: 'La dieta de la milpa',
      autores: ['Secretaría de Salud'],
      institucional: true,
      fecha: '2025-10-08',
      parteDe: 'Gobierno de México',
    },
  },
];

/**
 * La cita en texto plano, que es lo que se lleva el boton «Copiar cita»: los
 * tramos juntos —sin la cursiva, que no sobrevive al portapapeles— y el
 * enlace al final, igual que en la pagina.
 */
export function citaPlana(ref: Referencia): string {
  return ref.cita.map((t) => t.texto).join('') + ref.url;
}

/** El credito de la pieza: va aparte de las referencias, no es una fuente. */
export const CREDITOS = {
  pieza: 'Hacha',
  ubicacion: 'Sala Mexica, Museo Nacional de Antropología (INAH), Ciudad de México',
  por: 'Daniel Capistran Morales',
  apoyo: 'María José Cruz Morazán',
  anio: '2026',
  linea:
    'Hacha. Sala Mexica, Museo Nacional de Antropología, INAH. Por Daniel Capistran Morales, '
    + 'con el apoyo de María José Cruz Morazán (2026).',
};
