/**
 * Los brotes: lo unico que se mueve en el mural.
 *
 * La escena es un bitmap que se re-renderiza solo cuando cambian los datos.
 * Animar el mural entero seria repintar trescientas ramas por fotograma; en
 * vez de eso, encima de la escena ya pintada crecen unas pocas hebras tenues
 * que salen de las ramas, se abren en dos como una raiz —o como esas
 * animaciones de redes neuronales donde un impulso se reparte por el arbol— y
 * se apagan. La diferencia con la red neuronal es la materia: aqui no hay
 * lineas de luz sino pigmento, asi que cada hebra se pinta con dos o tres
 * pasadas temblonas en multiply y sale con el borde sucio de un trazo al
 * oleo, no con el filo de un vector.
 *
 * No inventan datos: un brote nace sobre la rama de alguien, hereda su color
 * y su direccion, y lo que se ve crecer es el gesto de esa persona. Cuando se
 * apaga, nace otro sobre otra.
 *
 * Quien lo enciende y lo apaga es el mural: aqui no hay `requestAnimationFrame`
 * ni listeners. Ver `animar()` en `main.ts`.
 */
import { enRama, type Rama } from '@core/render/rama';
import type { ColorRamp } from '@core/render/palette';

/** Pixeles de trabajo por segundo que avanza la punta. */
const VELOCIDAD = 190;
/** Cada cuantos pixeles se clava un punto del recorrido. */
const PASO = 9;
/** Segundos que tarda en apagarse una vez que dejo de crecer. */
const APAGADO = 1.6;

interface Brote {
  /** Recorrido ya crecido, como pares planos `[x,y,...]`. */
  pts: number[];
  x: number;
  y: number;
  ang: number;
  /** Cuanto se enrosca por paso: cada brote para su lado. */
  giro: number;
  /** Largo total al que aspira, en px de trabajo. */
  meta: number;
  /** Largo recorrido. */
  avance: number;
  /** Segundos desde que termino de crecer; -1 mientras crece. */
  muriendo: number;
  /** Color del brote en la rampa, heredado de la rama. */
  t: number;
  /** Grosor base, en px de trabajo. */
  grosor: number;
  /** Cuantas veces mas puede abrirse en dos. */
  ramificar: number;
}

export class Brotes {
  private brotes: Brote[] = [];

  constructor(
    private ramas: () => readonly Rama[],
    private cuantos = 26
  ) {}

  /** Vuelve a sembrar: al cambiar el dibujo o los datos. */
  reiniciar(): void {
    this.brotes = [];
  }

  /** Un brote nuevo sobre la rama de alguien. */
  private nacer(): Brote | null {
    const ramas = this.ramas();
    if (ramas.length === 0) return null;
    const rama = ramas[(Math.random() * ramas.length) | 0];
    // Nace en la mitad de afuera de la rama, que es la parte suelta: de la
    // raiz saldria enterrado en el tronco.
    const f = 0.45 + Math.random() * 0.5;
    const en = enRama(rama, f);
    const abre = (Math.random() - 0.5) * 1.5;
    return {
      pts: [en.x, en.y],
      x: en.x, y: en.y,
      ang: en.ang + abre,
      giro: (Math.random() < 0.5 ? -1 : 1) * (0.02 + Math.random() * 0.07),
      meta: 40 + Math.random() * 150,
      avance: 0,
      muriendo: -1,
      t: rama.punto.t,
      grosor: Math.max(0.6, rama.anchos[0] * (0.18 + Math.random() * 0.26)),
      ramificar: Math.random() < 0.55 ? 1 : 0,
    };
  }

  /** La bifurcacion: una hebra hija que sale de donde va la madre. */
  private hijo(m: Brote): Brote {
    return {
      pts: [m.x, m.y],
      x: m.x, y: m.y,
      ang: m.ang + (Math.random() < 0.5 ? -1 : 1) * (0.4 + Math.random() * 0.6),
      giro: m.giro * (0.5 + Math.random()),
      meta: m.meta * (0.35 + Math.random() * 0.4),
      avance: 0,
      muriendo: -1,
      t: m.t,
      grosor: m.grosor * 0.7,
      ramificar: 0,
    };
  }

  /**
   * Avanza `dt` segundos y dibuja. `escala` lleva de coordenadas de trabajo a
   * las del lienzo; `upx` es un pixel de pantalla en esas mismas coordenadas,
   * para que el trazo no engorde ni adelgace con la resolucion.
   */
  dibujar(ctx: CanvasRenderingContext2D, dt: number, escala: number, upx: number, ramp: ColorRamp): void {
    while (this.brotes.length < this.cuantos) {
      const b = this.nacer();
      if (!b) return;
      // Repartidos en el tiempo: si no, todos crecen y se apagan a la vez.
      b.avance = Math.random() * b.meta;
      const pasos = Math.floor(b.avance / PASO);
      for (let i = 0; i < pasos; i++) this.paso(b);
      this.brotes.push(b);
    }

    ctx.save();
    ctx.globalCompositeOperation = 'multiply';
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    const nuevos: Brote[] = [];
    for (let i = this.brotes.length - 1; i >= 0; i--) {
      const b = this.brotes[i];

      if (dt > 0) {
        if (b.muriendo < 0) {
          const antes = b.avance;
          b.avance += VELOCIDAD * dt;
          for (let d = Math.floor(antes / PASO) + 1; d <= Math.floor(b.avance / PASO); d++) {
            this.paso(b);
          }
          // Se abre en dos a media altura, como una raiz que se reparte.
          if (b.ramificar > 0 && b.avance > b.meta * 0.55) {
            b.ramificar--;
            nuevos.push(this.hijo(b));
          }
          if (b.avance >= b.meta) b.muriendo = 0;
        } else {
          b.muriendo += dt;
        }
      }

      this.trazar(ctx, b, escala, upx, ramp);

      if (b.muriendo > APAGADO) {
        // Las hijas hicieron pasar de largo el tope: al apagarse no se
        // reemplazan, y la cuenta vuelve sola a su sitio.
        const otro = this.brotes.length > this.cuantos ? null : this.nacer();
        if (otro) this.brotes[i] = otro;
        else this.brotes.splice(i, 1);
      }
    }
    // Las hijas entran despues de recorrer la lista, para no pisarla mientras
    // se la esta leyendo. El tope las deja pasar: se compensa solo cuando las
    // madres se apaguen.
    this.brotes.push(...nuevos);

    ctx.restore();
  }

  /** Un paso del recorrido: avanza, se enrosca y tiembla un poco. */
  private paso(b: Brote): void {
    b.ang += b.giro + (Math.random() - 0.5) * 0.22;
    b.x += Math.cos(b.ang) * PASO;
    b.y += Math.sin(b.ang) * PASO;
    b.pts.push(b.x, b.y);
  }

  /**
   * El pigmento: dos pasadas largas y tenues mas una corta y cargada en la
   * raiz, y el nudo de la punta. El alfa entra y sale con una curva suave,
   * asi ningun brote aparece ni desaparece de golpe.
   */
  private trazar(ctx: CanvasRenderingContext2D, b: Brote, escala: number, upx: number, ramp: ColorRamp): void {
    const n = b.pts.length / 2;
    if (n < 2) return;

    const entrando = Math.min(1, b.avance / Math.max(1, b.meta * 0.25));
    const apagando = b.muriendo < 0 ? 1 : Math.max(0, 1 - b.muriendo / APAGADO);
    const vivo = entrando * apagando * apagando;
    if (vivo <= 0.02) return;

    const { r, g, b: bl } = ramp.at(Math.min(1, b.t * 0.8 + 0.1));
    const grosor = Math.max(upx * 0.7, b.grosor * escala);

    // Dos pasadas con el temblor corrido: es lo que le da el borde de pincel.
    for (const [ancho, alfa, desvio] of [[1.7, 0.16, 0.5], [0.75, 0.26, 0.2]] as const) {
      ctx.strokeStyle = `rgba(${r | 0},${g | 0},${bl | 0},${vivo * alfa})`;
      ctx.lineWidth = grosor * ancho;
      ctx.beginPath();
      ctx.moveTo(b.pts[0] * escala, b.pts[1] * escala);
      for (let i = 1; i < n - 1; i++) {
        const x0 = b.pts[i * 2] * escala + (i % 2 ? desvio : -desvio) * grosor;
        const y0 = b.pts[i * 2 + 1] * escala - (i % 3 ? desvio : -desvio) * grosor;
        const x1 = b.pts[i * 2 + 2] * escala;
        const y1 = b.pts[i * 2 + 3] * escala;
        ctx.quadraticCurveTo(x0, y0, (x0 + x1) / 2, (y0 + y1) / 2);
      }
      ctx.lineTo(b.pts[(n - 1) * 2] * escala, b.pts[(n - 1) * 2 + 1] * escala);
      ctx.stroke();
    }

    // La punta: el pigmento que se junta donde el pincel todavia apoya.
    if (b.muriendo < 0) {
      ctx.fillStyle = `rgba(${r | 0},${g | 0},${bl | 0},${vivo * 0.38})`;
      ctx.beginPath();
      ctx.arc(b.pts[(n - 1) * 2] * escala, b.pts[(n - 1) * 2 + 1] * escala, grosor * 1.1, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}
