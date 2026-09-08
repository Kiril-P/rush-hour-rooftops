import {
  type World,
  type Node,
  type Edge,
  type Special,
  type Supply,
  TUNE,
  edgeKey,
  xy,
  distance,
  within,
  degree,
  edgesAt,
} from "./model";
export interface Plan {
  ok: boolean;
  reason: string;
  cost: number;
  spans: number;
  segments: [Node, Node][];
  waterRuns: Node[][];
  validThrough: number;
}
export function samplePath(a: Node, b: Node): Node[] {
  const p = xy(a),
    q = xy(b),
    out = [a];
  let x = p.x,
    y = p.y;
  const dx = Math.abs(q.x - x),
    sx = x < q.x ? 1 : -1,
    dy = -Math.abs(q.y - y),
    sy = y < q.y ? 1 : -1;
  let err = dx + dy;
  while (x !== q.x || y !== q.y) {
    const e = 2 * err;
    if (e >= dy) {
      err += dy;
      x += sx;
    }
    if (e <= dx) {
      err += dx;
      y += sy;
    }
    out.push(y * 32 + x);
  }
  return out;
}
function crosses(a: Node, b: Node, c: Node, d: Node) {
  if (a === c || a === d || b === c || b === d) return false;
  const p = xy(a),
    q = xy(b),
    r = xy(c),
    s = xy(d);
  const cross = (
    a: { x: number; y: number },
    b: { x: number; y: number },
    c: { x: number; y: number },
  ) => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
  return (
    cross(p, q, r) * cross(p, q, s) < 0 && cross(r, s, p) * cross(r, s, q) < 0
  );
}
export function planCable(w: World, path: Node[]): Plan {
  const plan: Plan = {
    ok: true,
    reason: "Ready to build",
    cost: new Set(
      path
        .slice(1)
        .map((n, i) => edgeKey(path[i], n))
        .filter((k, i) => path[i] !== path[i + 1] && !w.edges.has(k)),
    ).size,
    spans: 0,
    segments: [],
    waterRuns: [],
    validThrough: 0,
  };
  const fail = (reason: string, validThrough = plan.validThrough) => ({
    ...plan,
    ok: false,
    reason,
    validThrough,
  });
  if (path.length < 2)
    return fail("Drag between two terminals or grid points.");
  if (w.water.has(path[0]) || w.water.has(path.at(-1)!))
    return fail("A sky span must start and finish outside the cloud rift.");
  const seen = new Set<string>();
  const all = [...w.edges.values()].filter((e) => e.kind === "cable");
  for (let i = 0; i < path.length; i++) {
    const n = path[i];
    if (!within(w, n)) return fail("The city will expand here next week.");
    if (w.parks.has(n))
      return fail("Keep the park clear. Draw around its trees.");
    if (i > 0 && i < path.length - 1 && w.roofAt.has(n))
      return fail("Rooftops are terminals. Draw around other buildings.");
    if (!i) continue;
    const a = path[i - 1],
      b = n;
    if (a === b) continue;
    if (distance(a, b) > 1.42)
      return fail("Cable pieces connect neighboring points.");
    const key = edgeKey(a, b);
    if (seen.has(key)) continue;
    seen.add(key);
    plan.segments.push([a, b]);
    if (!w.edges.has(key)) {
      if (
        all.some((e) => crosses(a, b, e.a, e.b)) ||
        plan.segments.slice(0, -1).some(([c, d]) => crosses(a, b, c, d))
      )
        return fail(
          "Crossing cables need a shared junction. Try an express cable.",
        );
    }
    plan.validThrough = i;
  }
  const crossingKeys = new Set<string>();
  for (let i = 1; i < path.length - 1; i++)
    if (w.water.has(path[i])) {
      const start = i - 1;
      while (i < path.length && w.water.has(path[i])) i++;
      const run = path.slice(start, i + 1);
      if (run.length < 3 || w.water.has(run.at(-1)!))
        return fail("Finish the crossing beyond the cloud rift.");
      const p = xy(run[0]),
        q = xy(run[1]),
        dx = q.x - p.x,
        dy = q.y - p.y;
      for (let j = 1; j < run.length; j++) {
        const a = xy(run[j - 1]),
          b = xy(run[j]);
        if (b.x - a.x !== dx || b.y - a.y !== dy)
          return fail("Sky spans must cross in one straight line.", start);
      }
      const allowed = new Set(run.slice(1).map((n, j) => edgeKey(run[j], n)));
      for (const n of run.slice(1, -1)) {
        if (
          edgesAt(w, n).some((e) => !allowed.has(e.id)) ||
          plan.segments.some(
            ([a, b]) => (a === n || b === n) && !allowed.has(edgeKey(a, b)),
          )
        )
          return fail("Sky spans cannot branch inside the cloud rift.", start);
      }
      const existing = run
        .slice(1)
        .map((n, j) => w.edges.get(edgeKey(run[j], n)));
      if (existing.some(Boolean) && !existing.every(Boolean))
        return fail("Use the existing complete sky span.", start);
      const crossingKey = [...allowed].sort().join("|");
      if (!existing.every(Boolean) && !crossingKeys.has(crossingKey)) {
        plan.spans++;
        plan.waterRuns.push(run);
        crossingKeys.add(crossingKey);
      }
    }
  if (!plan.segments.length) return fail("Drag to another point.");
  if (plan.cost > w.inventory.cable)
    return fail(
      `Need ${plan.cost} cable pieces; ${w.inventory.cable} available.`,
    );
  if (plan.spans > w.inventory.span)
    return fail(
      `Need ${plan.spans} sky span${plan.spans === 1 ? "" : "s"}. More arrive with weekly supplies.`,
    );
  plan.reason = `${plan.cost} cable piece${plan.cost === 1 ? "" : "s"}${plan.spans ? ` + ${plan.spans} sky span` : ""}`;
  return plan;
}
export function buildCable(w: World, path: Node[]): Plan {
  const p = planCable(w, path);
  if (!p.ok) return p;
  const groups = new Map<string, number>();
  for (const run of p.waterRuns) {
    const id = w.nextBridge++,
      edges = new Set<string>();
    for (let j = 1; j < run.length; j++) {
      const k = edgeKey(run[j - 1], run[j]);
      groups.set(k, id);
      edges.add(k);
    }
    w.bridges.set(id, { id, edges });
  }
  for (const [a, b] of p.segments) {
    const k = edgeKey(a, b),
      old = w.edges.get(k);
    if (old) {
      old.retiring = false;
      if (old.group !== null)
        for (const id of w.bridges.get(old.group)!.edges) {
          const e = w.edges.get(id);
          if (e) e.retiring = false;
        }
      continue;
    }
    w.edges.set(k, {
      id: k,
      a,
      b,
      length: distance(a, b),
      kind: "cable",
      number: 0,
      group: groups.get(k) ?? null,
      retiring: false,
      refs: new Set(),
      born: w.time,
    });
  }
  w.inventory.cable -= p.cost;
  w.inventory.span -= p.spans;
  w.version++;
  w.events.push({ type: "build" });
  return p;
}
export function legalExpress(w: World, a: Node, b: Node): string | null {
  if (a === b) return "Choose a different endpoint.";
  if (!within(w, a) || !within(w, b))
    return "Place both ends inside the revealed city.";
  if (w.water.has(a) || w.water.has(b) || w.parks.has(a) || w.parks.has(b))
    return "Express stations need a clear tower point outside the rift.";
  if (!w.edges.has(edgeKey(a, b, true)) && w.inventory.express < 1)
    return "An express cable arrives in weekly supplies.";
  return null;
}
export function buildExpress(w: World, a: Node, b: Node) {
  const error = legalExpress(w, a, b);
  if (error) return error;
  const id = edgeKey(a, b, true),
    old = w.edges.get(id);
  if (old) {
    old.retiring = false;
    w.version++;
    return null;
  }
  w.edges.set(id, {
    id,
    a,
    b,
    length: distance(a, b),
    kind: "express",
    number: w.nextExpress++,
    group: null,
    retiring: false,
    refs: new Set(),
    born: w.time,
  });
  w.inventory.express--;
  w.version++;
  w.events.push({ type: "build" });
  return null;
}
export function placeUpgrade(w: World, n: Node, kind: "signal" | "roundabout") {
  if (w.water.has(n) || w.roofAt.has(n) || degree(w, n, true) < 3)
    return "Choose a tower junction with at least three active approaches.";
  const old = w.controllers.get(n);
  if (old?.kind === kind) return null;
  if (w.inventory[kind] < 1)
    return `No ${kind} tokens. Collect weekly supplies.`;
  if (old && old.kind !== "normal") w.inventory[old.kind]++;
  w.inventory[kind]--;
  w.controllers.set(n, {
    kind,
    next: old?.next ?? 0,
    admitted: old?.admitted ?? 0,
  });
  w.version++;
  w.events.push({ type: "build" });
  return null;
}
export function retire(w: World, id: string) {
  const e = w.edges.get(id);
  if (!e || e.retiring) return;
  const ids = e.group === null ? [id] : [...w.bridges.get(e.group)!.edges];
  for (const k of ids) {
    const item = w.edges.get(k);
    if (item) item.retiring = true;
  }
  w.version++;
  reclaim(w);
}
export function reclaim(w: World) {
  const occupied = new Set([...w.cabins.values()].map((c) => c.edge));
  const deleted: Edge[] = [];
  for (const e of w.edges.values())
    if (e.retiring && !e.refs.size && !occupied.has(e.id)) {
      if (e.group !== null) {
        const group = w.bridges.get(e.group)!;
        if (
          [...group.edges].some((id) => {
            const x = w.edges.get(id);
            return x && (!x.retiring || x.refs.size || occupied.has(id));
          })
        )
          continue;
      }
      deleted.push(e);
    }
  const bridgeIds = new Set<number>();
  for (const e of deleted) {
    w.edges.delete(e.id);
    w.inventory[e.kind]++;
    if (e.group !== null) bridgeIds.add(e.group);
  }
  for (const id of bridgeIds) {
    if ([...w.bridges.get(id)!.edges].every((k) => !w.edges.has(k))) {
      w.inventory.span++;
      w.bridges.delete(id);
    }
  }
  if (deleted.length) {
    w.version++;
    for (const [n, c] of w.controllers)
      if (!degree(w, n)) {
        if (c.kind !== "normal") w.inventory[c.kind]++;
        w.controllers.delete(n);
      }
  }
}
export function pendingRefunds(w: World) {
  const inv = { cable: 0, span: 0, express: 0, signal: 0, roundabout: 0 };
  const bridges = new Set<number>();
  for (const e of w.edges.values())
    if (e.retiring) {
      inv[e.kind]++;
      if (e.group !== null) bridges.add(e.group);
    }
  inv.span = bridges.size;
  for (const [n, c] of w.controllers)
    if (c.kind !== "normal") {
      const attached = edgesAt(w, n);
      if (attached.length && attached.every((e) => e.retiring)) inv[c.kind]++;
    }
  return inv;
}
export function removeUpgrade(w: World, n: Node) {
  const c = w.controllers.get(n);
  if (c && c.kind !== "normal") {
    w.inventory[c.kind]++;
    c.kind = "normal";
    w.version++;
    return true;
  }
  return false;
}
export function chooseSupply(w: World, kind: Supply) {
  if (!w.weekly?.includes(kind)) return false;
  w.inventory.cable += kind === "cable" ? TUNE.bulkCables : TUNE.supplyCables;
  if (kind !== "cable") w.inventory[kind]++;
  w.weekly = null;
  w.claimedWeeks++;
  w.events.push({ type: "build" });
  return true;
}
