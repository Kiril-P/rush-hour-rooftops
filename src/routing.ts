import { type World, type Node, type Edge, TUNE, degree, other } from "./model";
export interface Route {
  nodes: Node[];
  edges: string[];
  cost: number;
}
const cache = new WeakMap<
  World,
  { version: number; routes: Map<string, Route | null>; adj: Map<Node, Edge[]> }
>();
function graph(w: World) {
  let c = cache.get(w);
  if (!c || c.version !== w.version) {
    const adj = new Map<Node, Edge[]>();
    for (const e of w.edges.values()) {
      for (const n of [e.a, e.b]) {
        if (!adj.has(n)) adj.set(n, []);
        adj.get(n)!.push(e);
      }
    }
    for (const list of adj.values())
      list.sort((a, b) => a.id.localeCompare(b.id));
    c = { version: w.version, routes: new Map(), adj };
    cache.set(w, c);
  }
  return c;
}
export function route(
  w: World,
  start: Node,
  end: Node,
  permitted?: Set<string>,
): Route | null {
  const g = graph(w),
    key = `${start}>${end}`;
  if (!permitted && g.routes.has(key)) return g.routes.get(key)!;
  const dist = new Map<Node, number>([[start, 0]]),
    prev = new Map<Node, { node: Node; edge: string }>(),
    open = new Set([start]);
  while (open.size) {
    let current = -1,
      best = Infinity;
    for (const n of open) {
      const d = dist.get(n)!;
      if (d < best - 1e-9 || (Math.abs(d - best) < 1e-9 && n < current)) {
        best = d;
        current = n;
      }
    }
    open.delete(current);
    if (current === end) break;
    if (current !== start && w.roofAt.has(current)) continue;
    for (const e of g.adj.get(current) ?? []) {
      if (e.retiring && !permitted?.has(e.id)) continue;
      const n = other(e, current);
      const controller = w.controllers.get(current)?.kind ?? "normal";
      const delay =
        degree(w, current) > 2 && !w.roofAt.has(current)
          ? controller === "normal"
            ? TUNE.junction
            : controller === "signal"
              ? TUNE.signal
              : TUNE.roundabout
          : 0;
      const d =
        best +
        e.length / (e.kind === "express" ? TUNE.expressSpeed : TUNE.speed) +
        delay;
      if (d < (dist.get(n) ?? Infinity) - 1e-9) {
        dist.set(n, d);
        prev.set(n, { node: current, edge: e.id });
        open.add(n);
      }
    }
  }
  let result: Route | null = null;
  if (dist.has(end)) {
    const nodes = [end],
      edges: string[] = [];
    let n = end;
    while (n !== start) {
      const p = prev.get(n)!;
      nodes.push(p.node);
      edges.push(p.edge);
      n = p.node;
    }
    result = {
      nodes: nodes.reverse(),
      edges: edges.reverse(),
      cost: dist.get(end)!,
    };
  }
  if (!permitted) g.routes.set(key, result);
  return result;
}
