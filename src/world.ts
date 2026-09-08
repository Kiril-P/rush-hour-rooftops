import {
  type World,
  type Bounds,
  TUNE,
  type Node,
  type Color,
  Random,
  node,
  xy,
  neighbors,
  distance,
  within,
  addRoof,
  edgeKey,
} from "./model";
import { pendingRefunds } from "./graph";
import { constructionPath } from "./construction-search";
export { constructionPath } from "./construction-search";

export function revealedBounds(time: number): Bounds {
  const stages = [
    [0, 10, 18, 8, 14],
    [45, 9, 19, 7, 15],
    [105, 8, 21, 5, 16],
    [210, 6, 24, 3, 18],
    [315, 4, 27, 2, 19],
    [420, 2, 29, 1, 20],
    [525, 0, 31, 0, 21],
  ];
  const stage = stages.filter((s) => time >= s[0]).at(-1)!;
  return { minX: stage[1], maxX: stage[2], minY: stage[3], maxY: stage[4] };
}
export function createWorld(seed = 824671): World {
  const w: World = {
    seed,
    rng: new Random(seed),
    tick: 0,
    time: 0,
    score: 0,
    roofs: new Map(),
    roofAt: new Map(),
    cabins: new Map(),
    requests: new Map(),
    edges: new Map(),
    bridges: new Map(),
    controllers: new Map(),
    inventory: {
      cable: TUNE.startCables,
      span: 0,
      express: 0,
      signal: 0,
      roundabout: 0,
    },
    water: new Set(),
    parks: new Set(),
    bounds: revealedBounds(0),
    version: 0,
    nextId: 1,
    nextBridge: 1,
    nextExpress: 1,
    paused: false,
    speed: 1,
    tutorial: true,
    gameOver: false,
    failedRoof: null,
    weekly: null,
    claimedWeeks: 0,
    nextHome: 22,
    nextDestination: 55,
    dispatchAt: 0,
    firstRequest: false,
    events: [],
    diagnostics: [],
    growth: true,
    demand: true,
  };
  for (const [x, y] of [
    [14, 12],
    [10, 6],
    [11, 6],
    [10, 7],
    [21, 13],
    [22, 13],
    [22, 14],
    [14, 15],
    [6, 11],
    [5, 11],
    [26, 8],
    [26, 9],
    [13, 3],
    [14, 3],
    [9, 19],
    [10, 19],
    [25, 18],
  ])
    w.parks.add(node(x, y));
  addRoof(w, node(11, 12), 0, "home", node(12, 12));
  addRoof(w, node(16, 9), 0, "destination", node(15, 9)).openedAt = 0;
  return w;
}
function free(w: World, n: Node) {
  return (
    within(w, n) &&
    !w.water.has(n) &&
    !w.parks.has(n) &&
    ![...w.edges.values()].some((e) => e.a === n || e.b === n) &&
    ![...w.roofs.values()].some(
      (r) => r.access === n || distance(r.node, n) < 2.25,
    ) &&
    neighbors(n).some(
      (v) =>
        within(w, v) && !w.parks.has(v) && !w.water.has(v) && !w.roofAt.has(v),
    )
  );
}
export function spawn(w: World, kind: "home" | "destination") {
  const homes = [...w.roofs.values()].filter((r) => r.kind === "home"),
    dests = [...w.roofs.values()].filter((r) => r.kind === "destination");
  if (kind === "home" && homes.length >= 36) return false;
  if (kind === "destination" && dests.length >= 12) {
    const small = dests.find((r) => !r.large);
    if (small) {
      small.large = true;
      small.born = w.time;
      w.events.push({
        type: "spawn",
        text: "A rooftop station is growing. More commuters are on their way.",
      });
      return true;
    }
    return false;
  }
  const color: Color =
    kind === "home" ? w.rng.pick(dests).color : ((dests.length % 3) as Color);
  const partners =
    kind === "home"
      ? dests.filter((r) => r.color === color)
      : homes.filter((r) => r.color === color);
  const refund = pendingRefunds(w);
  const testWorld = {
    ...w,
    edges: new Map([...w.edges].filter(([, edge]) => !edge.retiring)),
    inventory: {
      ...w.inventory,
      cable: w.inventory.cable + refund.cable,
      span: w.inventory.span + refund.span,
    },
  };
  for (let attempt = 0; attempt < 64; attempt++) {
    const x =
        w.bounds.minX +
        1 +
        Math.floor(w.rng.next() * (w.bounds.maxX - w.bounds.minX - 1)),
      y =
        w.bounds.minY +
        1 +
        Math.floor(w.rng.next() * (w.bounds.maxY - w.bounds.minY - 1)),
      n = node(x, y);
    if (!free(w, n)) continue;
    if (partners.length) {
      const nearest = [...partners].sort(
        (a, b) => distance(a.node, n) - distance(b.node, n),
      );
      for (const partner of nearest) {
        if (distance(partner.node, n) > 11) continue;
        const path = constructionPath(testWorld, n, partner.node);
        if (path) {
          addRoof(w, n, color, kind, path[1]);
          w.events.push({
            type: "spawn",
            text:
              kind === "home"
                ? "A new home. Two more cabins ready to go."
                : "A new rooftop station needs a connection.",
          });
          return true;
        }
      }
    } else if (kind === "destination" && homes.length < 36) {
      for (let k = 0; k < 24; k++) {
        const hx = x + Math.floor(w.rng.next() * 9) - 4,
          hy = y + Math.floor(w.rng.next() * 7) - 3;
        if (hx < 0 || hx >= 32 || hy < 0 || hy >= 22) continue;
        const h = node(hx, hy);
        if (!free(w, h) || distance(n, h) < 3 || distance(n, h) > 7) continue;
        const path = constructionPath(testWorld, h, n);
        if (!path) continue;
        addRoof(w, h, color, "home", path[1]);
        addRoof(w, n, color, "destination", path.at(-2));
        w.events.push({
          type: "spawn",
          text: `${color === 1 ? "Triangle" : "Square"} rooftops have arrived. Match their shapes.`,
        });
        return true;
      }
    }
  }
  return false;
}
