/** Indice espacial simple por celdas, para vecindad y hit-testing. */
export class SpatialGrid<T extends { x: number; y: number }> {
  private cells = new Map<number, T[]>();
  private cols: number;

  constructor(private cell: number, width: number, _height: number) {
    this.cols = Math.max(1, Math.ceil(width / cell) + 1);
  }

  private key(x: number, y: number): number {
    return ((y / this.cell) | 0) * this.cols + ((x / this.cell) | 0);
  }

  insert(item: T): void {
    const k = this.key(item.x, item.y);
    const bucket = this.cells.get(k);
    if (bucket) bucket.push(item);
    else this.cells.set(k, [item]);
  }

  /** Items en las celdas que cubren el radio dado alrededor de (x,y). */
  near(x: number, y: number, radius: number): T[] {
    const out: T[] = [];
    const r = Math.max(1, Math.ceil(radius / this.cell));
    const cx = (x / this.cell) | 0;
    const cy = (y / this.cell) | 0;
    for (let gy = cy - r; gy <= cy + r; gy++) {
      for (let gx = cx - r; gx <= cx + r; gx++) {
        const bucket = this.cells.get(gy * this.cols + gx);
        if (bucket) out.push(...bucket);
      }
    }
    return out;
  }

  /** Item mas cercano dentro del radio, o null. */
  nearest(x: number, y: number, radius: number): T | null {
    let best: T | null = null;
    let bestD = radius * radius;
    for (const it of this.near(x, y, radius)) {
      const dx = it.x - x, dy = it.y - y;
      const d = dx * dx + dy * dy;
      if (d <= bestD) { bestD = d; best = it; }
    }
    return best;
  }

  clear(): void { this.cells.clear(); }
}
