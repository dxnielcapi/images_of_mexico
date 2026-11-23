/**
 * El unico punto del nucleo que crea un lienzo.
 *
 * Todo lo demas en `core/` es TypeScript puro: no nombra `document`, `window`
 * ni `localStorage`. Eso permite dos cosas:
 *
 *   - importar `@core/ids/idCodec` o `@core/scene` desde un entorno sin DOM
 *     (una Edge Function de Deno, un test de Node) sin arrastrar el navegador;
 *   - afinar como se piden los contextos 2D (p. ej. `willReadFrequently`)
 *     sin recorrer el resto del codigo.
 *
 * El acceso a `document` es diferido: ocurre al pintar, no al importar.
 */

/** Un lienzo del tamano pedido. */
export function createSurface(width: number, height: number): HTMLCanvasElement {
  if (typeof document === 'undefined') {
    throw new Error('core/platform/surface: no hay DOM disponible para rasterizar.');
  }
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

/**
 * Un lienzo con su contexto 2D ya pedido. `readback: true` avisa al navegador
 * que se va a leer con `getImageData`, que es el caso de las mascaras.
 */
export function createSurfaceCtx(
  width: number,
  height: number,
  opts: { readback?: boolean } = {}
): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  const canvas = createSurface(width, height);
  const ctx = canvas.getContext('2d', { willReadFrequently: opts.readback === true });
  if (!ctx) throw new Error('core/platform/surface: el lienzo no devolvio contexto 2D');
  return { canvas, ctx };
}
