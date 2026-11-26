/**
 * El banco de registros simulados: `public/samples/datos_ejemplo.csv`.
 *
 * Los datos de verdad todavia no existen, y el mural necesita gente para
 * tener algo que dibujar: con veinte personas la serpiente se insinua y con
 * unos cientos esta entera (ver *El trazo* en el README). Este script arma
 * esa poblacion ficticia con el esquema real.
 *
 *     node tools/registros.mjs            # deja el banco en 1200 registros
 *     node tools/registros.mjs 840        # o en los que se le pidan
 *
 * Tres decisiones lo gobiernan:
 *
 * - **No reescribe lo que ya esta.** Lee el CSV, lo deja byte por byte como
 *   estaba y solo agrega al final hasta llegar al total pedido. Tiene que ser
 *   asi porque la posicion de una mancha sale del hash de su id y su pedazo de
 *   dibujo, de su lugar en la lista: regenerar el banco entero repintaria el
 *   mural de cero. Agregando, el mural de ayer es el de hoy con unas
 *   pinceladas mas, igual que cuando se registra alguien de verdad.
 * - **El esquema no se copia, se importa.** Las respuestas posibles, la escala
 *   y el calculo del valor salen de `@data/person`, `@data/afinidad` y
 *   `@data/mapping` cargados de verdad —con el loader SSR de Vite, que es
 *   quien resuelve los alias `@`—, asi que un cambio en las preguntas no
 *   puede dejar este script generando respuestas que la app ya no sabe leer.
 * - **Es deterministico.** Con el mismo total sale el mismo banco, porque la
 *   semilla de cada registro es su propio numero. Pedir 1200 despues de haber
 *   pedido 840 agrega los 360 que faltan y no toca los anteriores.
 *
 * Lo que si vive aqui es el **vocabulario**: nombres, oficios, lugares y las
 * frases de mas. No es esquema —la app no necesita conocerlo— y es lo unico
 * que hay que ampliar si el banco empieza a repetirse.
 *
 * Los lugares de los registros nuevos son mexicanos, que es de lo que hablan
 * las cinco preguntas. Los 295 primeros son de antes y traen localidades
 * argentinas: quedan como estan por la regla de arriba.
 */
import { createServer } from 'vite';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CSV = path.join(RAIZ, 'public/samples/datos_ejemplo.csv');

/** Cuanta gente deja el banco si no se pide otra cosa. */
const TOTAL_POR_DEFECTO = 1200;

/**
 * La ventana en la que llegaron los registros. Arranca donde arrancan los
 * 295 de antes y llega hasta hoy: el banco se lee como un alta que no paro.
 * La fecha no se correlaciona con el numero de registro, igual que en los
 * primeros 295.
 */
const DESDE = '2026-09-16';
const HASTA = '2026-11-23';

// ---------------------------------------------------------------- vocabulario

const NOMBRES = [
  // Los que ya estaban en el banco, para que no se note la juntura.
  'Agustin', 'Amalia', 'Ana', 'Antonia', 'Bautista', 'Benicio', 'Camila',
  'Catalina', 'Celeste', 'Delfina', 'Dolores', 'Elias', 'Emilio', 'Facundo',
  'Gaspar', 'Horacio', 'Ignacio', 'Isidora', 'Joaquin', 'Juana', 'Lautaro',
  'Lucia', 'Martina', 'Mateo', 'Mercedes', 'Mirta', 'Nicolas', 'Olivia',
  'Pilar', 'Ramiro', 'Renata', 'Rocio', 'Ruben', 'Simon', 'Sofia', 'Teo',
  'Tomas', 'Valentina',
  // Y los que faltaban para no repetir treinta y ocho nombres mil veces.
  'Abigail', 'Adriana', 'Alondra', 'Anselmo', 'Aurelio', 'Candelaria',
  'Carmen', 'Cuauhtemoc', 'Elena', 'Eloisa', 'Esperanza', 'Eusebio',
  'Fernanda', 'Florencio', 'Gabriela', 'Gerardo', 'Guadalupe', 'Hilario',
  'Imelda', 'Ines', 'Isaura', 'Itzel', 'Jacinta', 'Javier', 'Jeronimo',
  'Josefina', 'Leonor', 'Lorenza', 'Macario', 'Magdalena', 'Marcelina',
  'Mariano', 'Natividad', 'Nicolasa', 'Noemi', 'Pascual', 'Patricio',
  'Petra', 'Porfirio', 'Rafaela', 'Refugio', 'Remedios', 'Rosalia',
  'Salvador', 'Santiago', 'Saul', 'Soledad', 'Tadeo', 'Teresa', 'Tomasa',
  'Ulises', 'Vicenta', 'Xochitl', 'Yolanda', 'Zenaida',
];

const APELLIDOS = [
  // Los del banco de antes.
  'Aguirre', 'Alvarez', 'Arce', 'Barrios', 'Benitez', 'Bustos', 'Cabrera',
  'Cardozo', 'Carrizo', 'Escobar', 'Ferreyra', 'Gimenez', 'Ibarra', 'Luna',
  'Maidana', 'Mansilla', 'Moyano', 'Nunes', 'Ocampo', 'Peralta', 'Pereyra',
  'Quiroga', 'Rolon', 'Solis', 'Sosa', 'Vera', 'Villalba', 'Zabala',
  // Los que suman.
  'Avila', 'Bautista', 'Buendia', 'Caamal', 'Camacho', 'Ceballos', 'Chavez',
  'Cruz', 'Delgadillo', 'Dzul', 'Esquivel', 'Galvan', 'Guzman', 'Hernandez',
  'Hidalgo', 'Huerta', 'Jimenez', 'Juarez', 'Lara', 'Lopez', 'Mendoza',
  'Mijangos', 'Molina', 'Nava', 'Olmedo', 'Osorio', 'Pacheco', 'Pech',
  'Ramirez', 'Resendiz', 'Reyes', 'Rivera', 'Salgado', 'Sandoval',
  'Tecpanecatl', 'Tepole', 'Tzoc', 'Valdes', 'Vazquez', 'Xicotencatl',
  'Zapata', 'Zarate',
];

const OCUPACIONES = [
  // Los oficios del banco de antes.
  'agricultor/a', 'agronomo/a', 'almacenero/a', 'apicultor/a', 'arriero/a',
  'bibliotecario/a', 'camionero/a', 'carpintero/a', 'cocinero/a',
  'constructor/a', 'contador/a', 'docente rural', 'enfermero/a',
  'estudiante', 'fotografo/a', 'guia de campo', 'herrero/a', 'jubilado/a',
  'mecanico/a', 'modista', 'panadero/a', 'pescador/a', 'radialista',
  'tambero/a', 'tecnico/a en riego', 'tractorista', 'veterinario/a',
  'viverista',
  // Los que trabajan la comida de la que hablan las preguntas.
  'albanil', 'artesano/a', 'cafetalero/a', 'comerciante de mercado',
  'costurero/a', 'ejidatario/a', 'jornalero/a', 'lechero/a', 'maestro/a',
  'maicero/a', 'mezcalero/a', 'milpero/a', 'molinero/a', 'nixtamalero/a',
  'nopalero/a', 'partera', 'promotor/a de salud', 'recolector/a',
  'tortillero/a', 'vendedor/a ambulante',
];

/**
 * Los lugares de origen de los registros nuevos: localidades de Mexico, del
 * mismo tamano que las del banco de antes —pueblos y cabeceras, no solo
 * capitales—, porque es ahi donde se siembra lo que las preguntas nombran.
 */
const LUGARES = [
  'Amealco', 'Bacalar', 'Chilapa', 'Coatepec', 'Comitan', 'Cuetzalan',
  'Etzatlan', 'Huauchinango', 'Ixmiquilpan', 'Juchitan', 'Mascota',
  'Maxcanu', 'Milpa Alta', 'Papantla', 'Paracho', 'Patzcuaro',
  'San Cristobal', 'Tenosique', 'Teotitlan del Valle', 'Tepoztlan',
  'Tequisquiapan', 'Tlacolula', 'Tlapa', 'Tlaxiaco', 'Valladolid',
  'Xochimilco', 'Zacatlan', 'Zinacantan',
];

/**
 * Frases de mas, una tanda por punto de la escala.
 *
 * `SENTIRES` trae cuatro por punto y esas se usan tambien —se importan—,
 * pero treinta y seis frases no alcanzan para mil doscientas personas: los
 * testimonios van escritos dentro del trazo (ver `@core/render/testimonios`)
 * y el mural se leeria en eco. Desde que el alta dejo de sugerir frases
 * —ahora el ultimo paso es una caja en blanco—, ni estas ni las de `SENTIRES`
 * se le muestran a nadie: las dos tandas juntas son el habla del banco
 * simulado y nada mas.
 *
 * Las claves son los nombres de la escala tal como los define `SENTIRES`: si
 * una deja de coincidir, el script avisa y se detiene.
 */
const MAS_FRASES = {
  'muy bien': [
    'Mi madre me enseñó a hacer el nixtamal',
    'Tenemos maíz propio y eso no se compra',
    'Como lo que da el solar',
    'En la fiesta del pueblo se come como se debe',
    'Nunca me faltó un plato caliente',
    'Siembro, cosecho y de ahí sale la cena',
  ],
  'bien': [
    'Compro en el mercado, no en la tienda grande',
    'Hay frijol, hay tortilla, hay para el día',
    'Me arreglo con poco y me arreglo bien',
    'Mi comadre me manda verdura de su huerta',
    'Lo que hago en casa sabe mejor',
  ],
  'casi bien': [
    'Me gustaría volver a comer como antes',
    'El maíz que venden ya no es el mismo',
    'Alcanza, pero hay que pensarlo',
    'Entre semana se come de prisa',
    'Casi siempre hay, casi nunca sobra',
  ],
  'más o menos': [
    'Unos días se come y otros se aguanta',
    'Lo fresco se acabó el martes',
    'Comemos lo que está a mano',
    'No es hambre, pero tampoco es comer',
    'Mi sueldo decide el menú',
  ],
  'ni bien ni mal': [
    'Como lo mismo desde hace años',
    'No me pongo a pensar en eso',
    'Lo que hay es lo que hay',
    'Me siento, como y sigo',
    'Ni me sobra ni me falta',
  ],
  'algo mal': [
    'Lo de la tiendita es más barato que el mercado',
    'Me llena pero no me sostiene',
    'Ya casi nadie cocina en mi cuadra',
    'La tortilla subió otra vez',
    'Como de pie y sin hambre',
  ],
  'mal': [
    'El refresco sale más barato que el agua',
    'Hace semanas que no pruebo fruta',
    'Nos repartimos lo poco que llega',
    'Mi nieta come de la tienda, no de la milpa',
    'Trabajo en el campo y compro lo procesado',
  ],
  'muy mal': [
    'Cocino para otros y en mi casa no hay',
    'Mando lo que gano y me quedo con lo que sobra',
    'Nos sostiene el frijol y nada más',
    'Dejamos de contar las comidas del día',
    'Lo que hay se lo doy a los niños',
  ],
  'nada bien': [
    'Perdimos la tierra y con ella la comida',
    'Aquí ya nadie siembra para comer',
    'Lo que llega es lo que nadie quiso',
    'Me acuesto con hambre y me levanto igual',
    'Esto no es vida y nadie lo mira',
  ],
};

// ------------------------------------------------- lo que hay en el banco

/**
 * Como estan repartidas las respuestas. No son medidas de nada: son la
 * lectura del proyecto, y moverlas de aqui mueve la figura.
 *
 * Las dos preguntas que cambiaron estrenan reparto, porque la de antes no se
 * puede traducir: `prefiere` ya no pregunta por el gusto sino por el acceso,
 * y ahi la respuesta se da vuelta —lo que esta mas a la mano es el
 * superprocesado, que es justamente de lo que habla el mural—, y la perdida
 * reparte entre cuatro causas donde habia tres. El desinteres del pueblo
 * sigue siendo la menos elegida, igual que antes.
 */
const PESOS = {
  /** De 'muy bien' a 'nada bien', en el orden de `SENTIRES`. */
  escala: [31, 28, 40, 36, 24, 32, 32, 37, 35],
  prefiere: { superprocesado: 44, mexicana: 34, extranjero: 22 },
  merece_digna: { 'sí': 94, 'no': 6 },
  oportunidades_justas: { 'no': 82, 'sí': 18 },
  perdida_soberania: {
    politica: 34,
    economia: 28,
    industria: 26,
    social: 12,
  },
  /**
   * La zona es la etiqueta heredada de una version anterior del dibujo: la
   * app la recalcula al cargar (ver `remapAll` en `@data/mapping`) y la
   * plantilla de hoy tiene una sola. Se escribe igual porque el lector
   * descarta las filas sin zona, y con los mismos pesos de antes para que el
   * archivo se lea homogeneo.
   */
  zona: {
    zona_01: 19, zona_02: 20, zona_03: 15, zona_04: 17, zona_05: 18,
    zona_06: 21, zona_07: 33, zona_08: 35, zona_09: 24, zona_10: 34,
    zona_11: 49, zona_12: 10,
  },
};

const EDAD_MIN = 16;
const EDAD_MAX = 85;

// ---------------------------------------------------------------- utiles

/** Una fecha YYYY-MM-DD como dia absoluto, en UTC para que no corra con la zona. */
function aDia(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return Date.UTC(y, m - 1, d) / 86400000;
}

/** Cuantos dias mide la ventana de altas. */
const VENTANA = aDia(HASTA) - aDia(DESDE);

/** El dia `n` de la ventana, contado desde `DESDE`, como lo guarda el registro. */
function fechaEn(dia) {
  const t = new Date((aDia(DESDE) + dia) * 86400000);
  const p = (n) => String(n).padStart(2, '0');
  return `${t.getUTCFullYear()}-${p(t.getUTCMonth() + 1)}-${p(t.getUTCDate())}`;
}

/** Elige una clave segun su peso. */
function porPeso(rng, pesos) {
  const claves = Object.keys(pesos);
  const total = claves.reduce((s, k) => s + pesos[k], 0);
  let t = rng() * total;
  for (const k of claves) {
    t -= pesos[k];
    if (t < 0) return k;
  }
  return claves[claves.length - 1];
}

/** Elige un indice de una lista de pesos. */
function indicePorPeso(rng, pesos) {
  const total = pesos.reduce((s, w) => s + w, 0);
  let t = rng() * total;
  for (let i = 0; i < pesos.length; i++) {
    t -= pesos[i];
    if (t < 0) return i;
  }
  return pesos.length - 1;
}

const uno = (rng, lista) => lista[Math.floor(rng() * lista.length) % lista.length];
const entero = (rng, min, max) => min + Math.floor(rng() * (max - min + 1));

/** Una fila de CSV, con comillas solo donde hacen falta (como `@io/writers/csv`). */
function filaCsv(valores) {
  return valores
    .map((v) => (/[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v)))
    .join(',');
}

// ---------------------------------------------------------------- el script

/** Carga los modulos del proyecto como los carga la app, con sus alias. */
async function abrirEsquema() {
  const server = await createServer({
    root: RAIZ,
    configFile: false,
    logLevel: 'error',
    server: { middlewareMode: true },
    resolve: {
      alias: {
        '@core': path.join(RAIZ, 'src/core'),
        '@io': path.join(RAIZ, 'src/io'),
        '@data': path.join(RAIZ, 'src/data'),
        '@ui': path.join(RAIZ, 'src/ui'),
      },
    },
  });
  const [person, mapping, prng, idCodec] = await Promise.all([
    server.ssrLoadModule('/src/data/person.ts'),
    server.ssrLoadModule('/src/data/mapping.ts'),
    server.ssrLoadModule('/src/core/sampling/prng.ts'),
    server.ssrLoadModule('/src/core/ids/idCodec.ts'),
  ]);
  return { server, person, mapping, prng, idCodec };
}

const total = Number(process.argv[2] ?? TOTAL_POR_DEFECTO);
if (!Number.isInteger(total) || total < 1) {
  console.error(`Total invalido: "${process.argv[2]}". Se espera un entero positivo.`);
  process.exit(1);
}

const { server, person, mapping, prng, idCodec } = await abrirEsquema();
try {
  const { SENTIRES, PREGUNTAS, PERSON_FIELD_KEYS, PERSON_CATEGORY, emptyPerson } = person;

  // El vocabulario de mas se indexa por los nombres de la escala. Si la escala
  // cambio, es mejor enterarse aqui que descubrirlo en un CSV mudo.
  const faltan = SENTIRES.map((s) => s.name).filter((n) => !MAS_FRASES[n]);
  if (faltan.length > 0) {
    throw new Error(
      `MAS_FRASES no cubre la escala vigente: falta ${faltan.join(', ')}. `
      + 'Agregalas en tools/registros.mjs (los nombres salen de SENTIRES).'
    );
  }
  if (PESOS.escala.length !== SENTIRES.length) {
    throw new Error(
      `PESOS.escala tiene ${PESOS.escala.length} pesos y la escala ${SENTIRES.length} puntos.`
    );
  }
  // Los pesos se escriben a mano y las opciones las define el esquema: si una
  // pregunta estrena opcion, el banco tiene que repartirla o no se entera.
  for (const q of PREGUNTAS) {
    const pesos = PESOS[q.key];
    const opciones = q.opciones.map((o) => o.valor);
    const sobran = Object.keys(pesos ?? {}).filter((k) => !opciones.includes(k));
    const sinPeso = opciones.filter((o) => !(pesos ?? {})[o]);
    if (sinPeso.length > 0 || sobran.length > 0) {
      throw new Error(
        `PESOS.${q.key} no coincide con las opciones de "${q.pregunta}".`
        + (sinPeso.length ? `\n  sin peso: ${sinPeso.join(', ')}` : '')
        + (sobran.length ? `\n  ya no existen: ${sobran.join(', ')}` : '')
      );
    }
  }

  // Lo que ya esta se conserva tal cual: el texto del archivo no se vuelve a
  // escribir, se le agregan lineas al final.
  const previo = readFileSync(CSV, 'utf8').replace(/\n+$/, '');
  const lineas = previo.split('\n');
  const cabecera = lineas[0];
  const columnas = cabecera.split(',');
  const esperadas = ['id', 'zona', 'valor', ...PERSON_FIELD_KEYS];
  if (columnas.join(',') !== esperadas.join(',')) {
    throw new Error(
      `La cabecera del CSV no es la del esquema.\n  archivo: ${columnas.join(',')}\n`
      + `  esquema: ${esperadas.join(',')}`
    );
  }

  // Cuantos hay y en que numero de registro quedaron los ids. El numero no se
  // cuenta por filas: el R es parte del id y tiene que seguir donde quedo.
  const hay = lineas.length - 1;
  let ultimoRegistro = 0;
  for (const linea of lineas.slice(1)) {
    const p = idCodec.parseId(linea.slice(0, linea.indexOf(',')));
    if (p.wellFormed && Number.isFinite(p.registro)) {
      ultimoRegistro = Math.max(ultimoRegistro, p.registro);
    }
  }

  if (hay === total) {
    console.log(`El banco ya tiene ${total} registros; no hay nada que hacer.`);
    process.exit(0);
  }

  // Pedir menos recorta por el final. No es destructivo en el sentido que
  // importa: como el banco solo crece por el final y la semilla de cada
  // registro es su numero, volver a pedir los que se sacaron los devuelve
  // identicos. Es la perilla para probar a cuanta gente cierra la figura.
  if (hay > total) {
    writeFileSync(CSV, `${[cabecera, ...lineas.slice(1, total + 1)].join('\n')}\n`, 'utf8');
    console.log(`${hay} - ${hay - total} = ${total} registros en public/samples/datos_ejemplo.csv`);
    console.log(`Para recuperarlos: node tools/registros.mjs ${hay}`);
    process.exit(0);
  }

  const nuevas = [];
  const vistos = new Set(lineas.slice(1).map((l) => l.slice(0, l.indexOf(','))));

  for (let n = hay + 1; n <= total; n++) {
    // La semilla es el numero del registro: pedir 1200 despues de 840 agrega
    // exactamente los 360 que faltaban, con las mismas respuestas.
    const rng = prng.mulberry32(prng.hashString(`banco|${n}`));

    const p = emptyPerson();
    p.nombre = `${uno(rng, NOMBRES)} ${uno(rng, APELLIDOS)}`;
    p.edad = String(entero(rng, EDAD_MIN, EDAD_MAX));
    p.ocupacion = uno(rng, OCUPACIONES);
    p.lugar_origen = uno(rng, LUGARES);

    const sentir = SENTIRES[indicePorPeso(rng, PESOS.escala)];
    p.alimentacion = sentir.name;
    for (const q of PREGUNTAS) p[q.key] = porPeso(rng, PESOS[q.key]);

    // Lo que dice tiene que ser coherente con como dijo que se siente: las
    // frases del punto de la escala y las de mas, juntas.
    p.mensaje = uno(rng, [...sentir.frases, ...MAS_FRASES[sentir.name]]);
    p.fecha = fechaEn(entero(rng, 0, VENTANA));

    // El id lleva el ambito opaco de hoy (`REG`), no la zona: la zona la
    // decide el mapeo y puede cambiar, el id tiene que ser estable.
    let registro = ultimoRegistro;
    let id;
    do {
      registro++;
      id = idCodec.generateId({
        categoria: PERSON_CATEGORY,
        fecha: p.fecha.replace(/-/g, ''),
        registro,
      });
    } while (vistos.has(id));
    ultimoRegistro = registro;
    vistos.add(id);

    // El valor lo calcula el mapeo vigente, no este script: es la intensidad
    // que sale de las cinco respuestas juntas (ver `@data/afinidad`).
    const valor = Math.round(mapping.valorFor(p, id) * 1000) / 1000;
    const zona = porPeso(rng, PESOS.zona);

    nuevas.push(filaCsv([id, zona, valor, ...PERSON_FIELD_KEYS.map((k) => p[k] ?? '')]));
  }

  writeFileSync(CSV, `${previo}\n${nuevas.join('\n')}\n`, 'utf8');
  console.log(`${hay} + ${nuevas.length} = ${total} registros en public/samples/datos_ejemplo.csv`);
} finally {
  await server.close();
}
