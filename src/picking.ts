import { type World, type Node } from "./model";

interface ScreenPoint {
  x: number;
  y: number;
}
interface Projection {
  scale: number;
  point(n: Node): ScreenPoint;
}
export type EraseTarget =
  { kind: "upgrade"; node: Node } | { kind: "edge"; id: string };

/** Select visible platform centers before incident cables, then test the full cable curve. */
export function eraseTarget(
  w: World,
  projection: Projection,
  x: number,
  y: number,
): EraseTarget | null {
  for (const [n, controller] of w.controllers)
    if (controller.kind !== "normal") {
      const p = projection.point(n);
      if (Math.hypot(x - p.x, y - p.y) <= Math.max(7, projection.scale * 0.17))
        return { kind: "upgrade", node: n };
    }
  let best: EraseTarget | null = null,
    distance = 12;
  for (const e of w.edges.values()) {
    const a = projection.point(e.a),
      b = projection.point(e.b),
      dx = b.x - a.x,
      dy = b.y - a.y,
      length = Math.hypot(dx, dy);
    const arc =
      e.kind === "express"
        ? -Math.min(projection.scale * 1.3, length * 0.14)
        : projection.scale * 0.032;
    const samples = Math.max(8, Math.ceil((length + Math.abs(arc) * 2) / 8));
    for (let i = 0; i <= samples; i++) {
      const t = i / samples,
        d = Math.hypot(
          x - a.x - dx * t,
          y - a.y - dy * t - 4 * arc * t * (1 - t),
        );
      if (d < distance) {
        distance = d;
        best = { kind: "edge", id: e.id };
      }
    }
  }
  return best;
}
