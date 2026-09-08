import { type Node, node } from "./model";
import { samplePath } from "./graph";

export interface GridPoint {
  x: number;
  y: number;
}

/** A cable gesture is independent of the event rate and the camera. */
export class CableStroke {
  path: Node[];
  private points: GridPoint[];

  constructor(start: GridPoint) {
    this.points = [start];
    this.path = [node(Math.round(start.x), Math.round(start.y))];
  }

  update(point: GridPoint): Node[] {
    const last = this.points.at(-1)!;
    // Keep the continuous stroke until its shape is known. Rounding each event
    // first turns a diagonal into alternating horizontal and vertical steps.
    if (Math.hypot(point.x - last.x, point.y - last.y) > 0.04)
      this.points.push(point);
    const vertices = simplify([...this.points, point], 0.28);
    this.path = [node(Math.round(vertices[0].x), Math.round(vertices[0].y))];
    for (const vertex of vertices.slice(1)) {
      const n = node(Math.round(vertex.x), Math.round(vertex.y));
      for (const item of samplePath(this.path.at(-1)!, n).slice(1)) {
        if (this.path.length > 1 && item === this.path.at(-2)) this.path.pop();
        else if (item !== this.path.at(-1)) this.path.push(item);
      }
    }
    return this.path;
  }
}

/** Iterative polyline simplification keeps deliberate corners and avoids stack growth. */
function simplify(points: GridPoint[], tolerance: number): GridPoint[] {
  const keep = new Set([0, points.length - 1]),
    pending: [[number, number]] = [[0, points.length - 1]];
  while (pending.length) {
    const [first, last] = pending.pop()!,
      a = points[first],
      b = points[last];
    const dx = b.x - a.x,
      dy = b.y - a.y,
      length = dx * dx + dy * dy;
    let furthest = -1,
      max = tolerance * tolerance;
    for (let i = first + 1; i < last; i++) {
      const p = points[i],
        t = length
          ? Math.max(
              0,
              Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / length),
            )
          : 0;
      const distance = (p.x - a.x - dx * t) ** 2 + (p.y - a.y - dy * t) ** 2;
      if (distance > max) {
        max = distance;
        furthest = i;
      }
    }
    if (furthest >= 0) {
      keep.add(furthest);
      pending.push([first, furthest], [furthest, last]);
    }
  }
  return [...keep].sort((a, b) => a - b).map((i) => points[i]);
}
