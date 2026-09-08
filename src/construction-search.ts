import {
  type World,
  type Node,
  edgeKey,
  neighbors,
  node,
  xy,
  within,
} from "./model";
import { planCable } from "./graph";

interface Label {
  at: Node;
  pieces: number;
  spans: number;
  cost: number;
  path: Node[];
  live: boolean;
}
class Frontier {
  private heap: Label[] = [];
  get size() {
    return this.heap.length;
  }
  private before(a: Label, b: Label) {
    return a.cost < b.cost || (a.cost === b.cost && a.at < b.at);
  }
  push(item: Label) {
    const a = this.heap;
    a.push(item);
    let i = a.length - 1;
    while (i) {
      const parent = (i - 1) >> 1;
      if (!this.before(item, a[parent])) break;
      a[i] = a[parent];
      i = parent;
    }
    a[i] = item;
  }
  pop() {
    const a = this.heap,
      first = a[0],
      last = a.pop()!;
    if (a.length) {
      let i = 0;
      while (i * 2 + 1 < a.length) {
        let child = i * 2 + 1;
        if (child + 1 < a.length && this.before(a[child + 1], a[child]))
          child++;
        if (!this.before(a[child], last)) break;
        a[i] = a[child];
        i = child;
      }
      a[i] = last;
    }
    return first;
  }
}
function opposite(a: Node, b: Node) {
  const p = xy(a),
    q = xy(b);
  return p.x !== q.x && p.y !== q.y
    ? edgeKey(node(p.x, q.y), node(q.x, p.y))
    : null;
}

/** Resource-aware search with local edge checks and one final atomic validation.
 * Unlike repeated whole-gesture validation, graph scans happen once per search.
 * Pareto labels retain alternatives that trade cable pieces for crossing tokens.
 */
export function constructionPath(
  w: World,
  start: Node,
  end: Node,
): Node[] | null {
  if (
    !within(w, start) ||
    !within(w, end) ||
    w.parks.has(start) ||
    w.parks.has(end)
  )
    return null;
  const blocked = new Set<string>();
  for (const e of w.edges.values())
    if (e.kind === "cable") {
      const key = opposite(e.a, e.b);
      if (key) blocked.add(key);
    }
  const initial: Label = {
    at: start,
    pieces: 0,
    spans: 0,
    cost: 0,
    path: [start],
    live: true,
  };
  const labels = new Map<Node, Label[]>([[start, [initial]]]),
    open = new Frontier();
  open.push(initial);
  let expansions = 0;
  while (open.size && expansions++ < 4096) {
    const current = open.pop();
    if (!current.live) continue;
    if (current.at === end) {
      if (planCable(w, current.path).ok) return current.path;
      continue;
    }
    for (const next of neighbors(current.at)) {
      if (!within(w, next) || w.parks.has(next)) continue;
      const run = [next];
      let spans = 0;
      if (w.water.has(next)) {
        const a = xy(current.at),
          b = xy(next),
          dx = b.x - a.x,
          dy = b.y - a.y;
        let p = b;
        while (w.water.has(node(p.x, p.y)) && run.length < 5) {
          p = { x: p.x + dx, y: p.y + dy };
          if (p.x < 0 || p.x > 31 || p.y < 0 || p.y > 21) break;
          run.push(node(p.x, p.y));
        }
        if (w.water.has(run.at(-1)!)) continue;
        const crossing = planCable(w, [current.at, ...run]);
        if (!crossing.ok) continue;
        spans = crossing.spans;
      }
      const at = run.at(-1)!;
      if (
        !within(w, at) ||
        w.parks.has(at) ||
        (at !== end && w.roofAt.has(at)) ||
        run.some((n) => current.path.includes(n))
      )
        continue;
      let pieces = current.pieces,
        cost = current.cost,
        valid = true;
      for (let i = 0; i < run.length; i++) {
        const a = i ? run[i - 1] : current.at,
          b = run[i],
          id = edgeKey(a, b),
          cross = opposite(a, b);
        if (
          blocked.has(id) ||
          (cross &&
            current.path
              .slice(1)
              .some((n, j) => edgeKey(current.path[j], n) === cross))
        ) {
          valid = false;
          break;
        }
        const exists = w.edges.has(id);
        pieces += exists ? 0 : 1;
        cost += exists ? 0.025 : 1;
      }
      const tokens = current.spans + spans;
      if (!valid || pieces > w.inventory.cable || tokens > w.inventory.span)
        continue;
      const previous = labels.get(at) ?? [];
      if (
        previous.some(
          (p) =>
            p.live && p.pieces <= pieces && p.spans <= tokens && p.cost <= cost,
        )
      )
        continue;
      for (const p of previous)
        if (p.pieces >= pieces && p.spans >= tokens && p.cost >= cost)
          p.live = false;
      const label: Label = {
        at,
        pieces,
        spans: tokens,
        cost,
        path: [...current.path, ...run],
        live: true,
      };
      labels.set(at, [...previous.filter((p) => p.live), label]);
      open.push(label);
    }
  }
  return null;
}
