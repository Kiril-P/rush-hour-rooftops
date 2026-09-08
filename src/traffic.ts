import {
  type World,
  type Cabin,
  type Node,
  type Edge,
  TUNE,
  degree,
  xy,
} from "./model";
import { route } from "./routing";
import { reclaim } from "./graph";
export function releaseAssignment(w: World, c: Cabin) {
  if (c.request !== null) {
    const r = w.requests.get(c.request);
    if (r?.cabin === c.id) r.cabin = null;
    c.request = null;
  }
}
function fault(w: World, c: Cabin, message: string) {
  if (c.fault === message) return;
  c.fault = message;
  w.diagnostics.push(`Cabin ${c.id}: ${message}`);
  releaseAssignment(w, c);
}
export function dispatch(w: World) {
  for (const request of [...w.requests.values()]
    .filter((r) => r.cabin === null)
    .sort((a, b) => a.born - b.born || a.id - b.id)) {
    const dest = w.roofs.get(request.destination);
    if (!dest) continue;
    let chosen: Cabin | null = null,
      best = Infinity,
      bestRoute: ReturnType<typeof route> = null,
      bestBack: ReturnType<typeof route> = null;
    for (const c of w.cabins.values()) {
      if (c.state !== "idle" || c.color !== dest.color) continue;
      const home = w.roofs.get(c.home)!;
      const out = route(w, home.node, dest.node);
      if (!out) continue;
      const back = route(w, dest.node, home.node);
      if (!back) continue;
      if (
        out.cost < best - 1e-9 ||
        (Math.abs(out.cost - best) < 1e-9 && c.id < (chosen?.id ?? Infinity))
      ) {
        chosen = c;
        best = out.cost;
        bestRoute = out;
        bestBack = back;
      }
    }
    if (chosen && bestRoute && bestBack) {
      const c = chosen;
      c.state = "outbound";
      c.request = request.id;
      c.destination = dest.id;
      request.cabin = c.id;
      c.route = [...bestRoute.nodes];
      c.routeEdges = [...bestRoute.edges];
      c.back = [...bestBack.nodes];
      c.backEdges = [...bestBack.edges];
      c.index = 0;
      c.waitingSince = w.time;
      c.incoming = null;
      c.refs = new Set([...bestRoute.edges, ...bestBack.edges]);
      for (const id of c.refs) w.edges.get(id)!.refs.add(c.id);
    }
  }
}
export function signalPhase(from: Node, to: Node) {
  const a = xy(from),
    b = xy(to);
  return Math.abs(a.x - b.x) >= Math.abs(a.y - b.y) ? 0 : 1;
}
function arrive(w: World, c: Cabin) {
  if (c.state === "outbound") {
    c.state = "queued";
    c.arrived = w.time;
    c.waitingSince = w.time;
    c.edge = null;
  } else if (c.state === "returning") {
    c.state = "idle";
    c.edge = null;
    c.destination = null;
    c.request = null;
    c.route = [];
    c.routeEdges = [];
    c.back = [];
    c.backEdges = [];
    c.incoming = null;
    for (const id of c.refs) w.edges.get(id)?.refs.delete(c.id);
    c.refs.clear();
  }
}
function nextEdge(w: World, c: Cabin): Edge | undefined {
  return w.edges.get(c.routeEdges[c.index]);
}
export function downstreamSpace(w: World, e: Edge, from: Node, except: number) {
  for (const c of w.cabins.values())
    if (
      c.id !== except &&
      c.edge === e.id &&
      c.from === from &&
      c.progress < TUNE.spacing - 1e-8
    )
      return false;
  return true;
}
export function traffic(w: World, dt: number) {
  // One service slot per destination, using the original pending reservations.
  for (const c of w.cabins.values())
    if (c.state === "servicing") {
      c.serviceLeft -= dt;
      if (c.serviceLeft <= 1e-9) {
        const request =
          c.request === null ? undefined : w.requests.get(c.request);
        if (request?.cabin === c.id) {
          w.requests.delete(request.id);
          w.score++;
          w.roofs.get(request.destination)!.pulse = w.time;
          w.events.push({ type: "delivery" });
        } else fault(w, c, "Service reservation is missing.");
        c.request = null;
        c.state = "returning";
        c.route = [...c.back];
        c.routeEdges = [...c.backEdges];
        c.index = 0;
        c.waitingSince = w.time;
        c.incoming = null;
      }
    }
  for (const d of w.roofs.values())
    if (
      d.kind === "destination" &&
      ![...w.cabins.values()].some(
        (c) => c.destination === d.id && c.state === "servicing",
      )
    ) {
      const queue = [...w.cabins.values()]
        .filter((c) => c.destination === d.id && c.state === "queued")
        .sort((a, b) => a.arrived - b.arrived || a.id - b.id);
      if (queue.length) {
        queue[0].state = "servicing";
        queue[0].serviceLeft = TUNE.service;
      }
    }
  const lanes = new Map<string, Cabin[]>();
  for (const c of w.cabins.values()) {
    c.previous = c.progress;
    if (c.edge) {
      const k = `${c.edge}/${c.from}`;
      if (!lanes.has(k)) lanes.set(k, []);
      lanes.get(k)!.push(c);
    }
  }
  for (const list of lanes.values()) {
    list.sort((a, b) => b.progress - a.progress || a.id - b.id);
    let ahead = Infinity;
    for (const c of list) {
      const e = w.edges.get(c.edge!);
      if (!e) {
        fault(w, c, "An occupied edge disappeared.");
        continue;
      }
      const limit = Math.min(e.length, ahead - TUNE.spacing),
        speed = e.kind === "express" ? TUNE.expressSpeed : TUNE.speed;
      c.progress = Math.max(
        c.progress,
        Math.min(limit, c.progress + speed * dt),
      );
      ahead = c.progress;
      if (c.progress >= e.length - 1e-8 && c.waitingSince === Infinity)
        c.waitingSince = w.time;
    }
  }
  const waits = new Map<Node, Cabin[]>();
  for (const c of w.cabins.values())
    if (c.state === "outbound" || c.state === "returning") {
      if (c.edge) {
        const e = w.edges.get(c.edge);
        if (!e || c.progress < e.length - 1e-8) continue;
        c.node = c.to;
        // Keep the incoming lane occupied until the next lane is admitted.
        if (c.index === c.routeEdges.length - 1) {
          c.index++;
          c.incoming = c.from;
          arrive(w, c);
          continue;
        }
      }
      const n = c.node;
      if (!waits.has(n)) waits.set(n, []);
      waits.get(n)!.push(c);
    }
  for (const [n, waiting] of waits) {
    const isJunction = degree(w, n) > 2 && !w.roofAt.has(n);
    if (!w.controllers.has(n))
      w.controllers.set(n, { kind: "normal", next: 0, admitted: 0 });
    const ctrl = w.controllers.get(n)!;
    if (isJunction && w.time + 1e-9 < ctrl.next) continue;
    waiting.sort((a, b) => a.waitingSince - b.waitingSince || a.id - b.id);
    for (const c of waiting) {
      const nextIndex = c.edge ? c.index + 1 : c.index;
      let e = w.edges.get(c.routeEdges[nextIndex]);
      if (!e) {
        const target =
          c.state === "returning"
            ? w.roofs.get(c.home)?.node
            : w.roofs.get(c.destination!)?.node;
        const replanned =
          target === undefined ? null : route(w, n, target, c.refs);
        if (!replanned) {
          fault(w, c, "No safe route; state preserved for inspection.");
          continue;
        }
        if (!replanned.edges.length) {
          arrive(w, c);
          continue;
        }
        c.route = replanned.nodes;
        c.routeEdges = replanned.edges;
        c.index = 0;
        c.edge = null;
        e = nextEdge(w, c);
        for (const id of replanned.edges) {
          c.refs.add(id);
          w.edges.get(id)!.refs.add(c.id);
        }
      }
      if (!e) continue;
      const approach = c.edge ? c.from : c.incoming;
      if (
        isJunction &&
        ctrl.kind === "signal" &&
        approach !== null &&
        signalPhase(approach, n) !== Math.floor(w.time / TUNE.phase) % 2
      )
        continue;
      if (!downstreamSpace(w, e, n, c.id)) continue;
      if (c.edge) c.index++;
      c.incoming = c.from;
      c.edge = e.id;
      c.from = n;
      c.to = e.a === n ? e.b : e.a;
      c.progress = 0;
      c.previous = 0;
      c.waitingSince = Infinity;
      if (isJunction) {
        ctrl.next =
          w.time +
          (ctrl.kind === "signal"
            ? TUNE.signal
            : ctrl.kind === "roundabout"
              ? TUNE.roundabout
              : TUNE.junction);
        ctrl.admitted++;
        break;
      }
    }
  }
  reclaim(w);
}
