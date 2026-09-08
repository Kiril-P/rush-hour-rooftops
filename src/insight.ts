import {
  type World,
  type Roof,
  type Node,
  pending,
  TUNE,
  degree,
} from "./model";
import { route } from "./routing";

export const shapes = ["Circle", "Triangle", "Square"];
export interface NetworkInsight {
  title: string;
  status: string;
  detail: string;
  tone: "calm" | "new" | "warning";
  pending: number;
  incoming: number;
  idle: number;
  returning: number;
  connected: number;
  edges: Set<string>;
  matches: Set<Node>;
  bottleneck: Node | null;
}
export function waitingAt(w: World, n: Node) {
  return [...w.cabins.values()].filter((c) => {
    const e = c.edge ? w.edges.get(c.edge) : null;
    return (
      e &&
      c.to === n &&
      c.progress >= e.length - 1e-6 &&
      (c.state === "outbound" || c.state === "returning")
    );
  });
}
export function roofInsight(w: World, r: Roof): NetworkInsight {
  const home = r.kind === "home",
    partners = [...w.roofs.values()].filter(
      (p) => p.color === r.color && p.kind !== r.kind,
    );
  const edges = new Set<string>(),
    matches = new Set<Node>([r.node]);
  let connected = 0;
  for (const p of partners) {
    matches.add(p.node);
    const path = route(w, r.node, p.node);
    if (path) {
      connected++;
      for (const id of path.edges) edges.add(id);
    }
  }
  const cabins = [...w.cabins.values()].filter((c) =>
    home ? c.home === r.id : c.destination === r.id,
  );
  const incoming = cabins.filter((c) => c.state === "outbound").length;
  const returning = cabins.filter((c) => c.state === "returning").length;
  const idle = home
    ? cabins.filter((c) => c.state === "idle").length
    : [...w.cabins.values()].filter(
        (c) =>
          c.color === r.color &&
          c.state === "idle" &&
          partners.some((p) => p.id === c.home && route(w, p.node, r.node)),
      ).length;
  const waiting = pending(w, r.id);
  let bottleneck: Node | null = null,
    largest = 0;
  for (const c of cabins)
    if (c.edge) {
      const e = w.edges.get(c.edge);
      if (
        e &&
        c.progress >= e.length - 1e-6 &&
        degree(w, c.to) > 2 &&
        !w.roofAt.has(c.to)
      ) {
        const count = waitingAt(w, c.to).length;
        if (count > largest) {
          bottleneck = c.to;
          largest = count;
        }
      }
    }
  let status = home
    ? `${idle} of 2 cabins at home`
    : `${waiting} waiting · ${incoming} on the way`;
  let detail = home
    ? `${connected} matching station${connected === 1 ? "" : "s"} connected. Cabins return here after each delivery.`
    : `${connected} connected home${connected === 1 ? "" : "s"}. ${returning} cabin${returning === 1 ? " is" : "s are"} returning.`;
  let tone: NetworkInsight["tone"] = r.overload > 0 ? "warning" : "calm";
  if (!connected) {
    status = "Needs a connection";
    detail = `Connect this ${shapes[r.color].toLowerCase()} ${home ? "home to a matching station" : "station to a matching home"}. Highlighted roofs share its shape.`;
    tone = "new";
  }
  if (!home && r.openedAt === null) {
    status = `Opening in ${Math.max(0, Math.ceil(TUNE.stationGrace - (w.time - r.born)))}s`;
    detail =
      "Build a route before opening. Connecting early starts service after a short warmup.";
    tone = "new";
  } else if (
    !home &&
    r.openedAt !== null &&
    w.time - r.openedAt < TUNE.stationWarmup &&
    !waiting &&
    r.pulse < 0
  ) {
    status = "Connected · opening shortly";
    detail = "The route is ready. The first commuters will arrive shortly.";
  }
  if (bottleneck !== null) {
    status = `Junction queue · ${largest} cabins`;
    detail =
      "Separate busy routes, add an Interchange, or use Express to bypass this junction.";
    tone = largest >= 3 ? "warning" : tone;
  } else if (!home && connected && waiting > incoming && !idle) {
    status = "All available cabins are away";
    detail =
      "Connect another matching home or shorten the round trip with Express.";
  }
  if (r.overload > 0) {
    tone = "warning";
    detail = `${Math.max(0, Math.ceil(TUNE.grace - r.overload))}s to clear the queue. ${detail}`;
  }
  return {
    title: `${shapes[r.color]} ${home ? "home" : "station"}`,
    status,
    detail,
    tone,
    pending: waiting,
    incoming,
    idle,
    returning,
    connected,
    edges,
    matches,
    bottleneck,
  };
}

export function junctionInsight(w: World, n: Node): NetworkInsight {
  const count = waitingAt(w, n).length,
    kind = w.controllers.get(n)?.kind ?? "normal";
  const upgraded = kind === "roundabout";
  return {
    title: upgraded ? "Interchange" : "Cable junction",
    status: `${count} waiting · ${degree(w, n, true)} approaches`,
    detail: upgraded
      ? "The interchange admits cabins more than twice as quickly. Separate routes can reduce conflicts further."
      : "Every turn shares one switching platform. Add an Interchange or an Express bypass if queues build.",
    tone: count >= 3 ? "warning" : "calm",
    pending: count,
    incoming: 0,
    idle: 0,
    returning: 0,
    connected: degree(w, n, true),
    edges: new Set(
      [...w.edges.values()]
        .filter((e) => e.a === n || e.b === n)
        .map((e) => e.id),
    ),
    matches: new Set([n]),
    bottleneck: null,
  };
}
