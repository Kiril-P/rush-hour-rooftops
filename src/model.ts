export const TUNE = {
  dt: 1 / 60,
  day: 15,
  week: 105,
  dispatch: 0.25,
  speed: 2.5,
  expressSpeed: 5,
  spacing: 0.32,
  service: 0.8,
  junction: 0.7,
  signal: 0.2,
  roundabout: 0.22,
  phase: 3,
  request: 6.5,
  requestMin: 3.5,
  demandGrowth: 0.92,
  overload: 6,
  largeOverload: 10,
  grace: 30,
  stationGrace: 60,
  stationWarmup: 8,
  rushEvery: 60,
  rushDuration: 14,
  rushFactor: 0.48,
  startCables: 24,
  supplyCables: 18,
  bulkCables: 32,
  homeEvery: 22,
  destinationEvery: 55,
  homeCap: 36,
  destinationCap: 12,
} as const;
export type Color = 0 | 1 | 2;
export type Special = "span" | "express" | "signal" | "roundabout";
export type Supply = "cable" | "express" | "roundabout";
export type Tool = "cable" | "erase" | "inspect" | Special;
export type Inventory = Record<"cable" | Special, number>;
export type Node = number;
export const node = (x: number, y: number): Node => y * 32 + x;
export const xy = (n: Node) => ({ x: n % 32, y: Math.floor(n / 32) });
export const distance = (a: Node, b: Node) => {
  const p = xy(a),
    q = xy(b);
  return Math.hypot(p.x - q.x, p.y - q.y);
};
export const edgeKey = (a: Node, b: Node, express = false) =>
  `${express ? "e" : "c"}${Math.min(a, b)}:${Math.max(a, b)}`;
export const neighbors = (n: Node) => {
  const p = xy(n);
  const out: Node[] = [];
  for (let y = -1; y <= 1; y++)
    for (let x = -1; x <= 1; x++)
      if (
        (x || y) &&
        p.x + x >= 0 &&
        p.x + x < 32 &&
        p.y + y >= 0 &&
        p.y + y < 22
      )
        out.push(node(p.x + x, p.y + y));
  return out;
};
export class Random {
  constructor(public state: number) {
    this.state = state >>> 0 || 1;
  }
  next() {
    let t = (this.state += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  pick<T>(a: readonly T[]) {
    return a[Math.floor(this.next() * a.length)];
  }
  jitter(n: number, spread = 0.1) {
    return n * (1 + (this.next() * 2 - 1) * spread);
  }
}
export interface Roof {
  id: number;
  node: Node;
  color: Color;
  kind: "home" | "destination";
  born: number;
  large: boolean;
  nextRequest: number;
  openedAt: number | null;
  overload: number;
  pulse: number;
  access: Node;
}
export interface Request {
  id: number;
  destination: number;
  born: number;
  cabin: number | null;
}
export interface Edge {
  id: string;
  a: Node;
  b: Node;
  length: number;
  kind: "cable" | "express";
  number: number;
  group: number | null;
  retiring: boolean;
  refs: Set<number>;
  born: number;
}
export interface Bridge {
  id: number;
  edges: Set<string>;
}
export interface Controller {
  kind: "normal" | "signal" | "roundabout";
  next: number;
  admitted: number;
}
export interface Cabin {
  id: number;
  home: number;
  color: Color;
  state: "idle" | "outbound" | "queued" | "servicing" | "returning";
  request: number | null;
  destination: number | null;
  route: Node[];
  back: Node[];
  routeEdges: string[];
  backEdges: string[];
  index: number;
  node: Node;
  edge: string | null;
  from: Node;
  to: Node;
  progress: number;
  previous: number;
  waitingSince: number;
  incoming: Node | null;
  serviceLeft: number;
  refs: Set<string>;
  arrived: number;
  fault: string | null;
}
export interface Bounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}
export interface World {
  seed: number;
  rng: Random;
  tick: number;
  time: number;
  score: number;
  roofs: Map<number, Roof>;
  roofAt: Map<Node, Roof>;
  cabins: Map<number, Cabin>;
  requests: Map<number, Request>;
  edges: Map<string, Edge>;
  bridges: Map<number, Bridge>;
  controllers: Map<Node, Controller>;
  inventory: Inventory;
  water: Set<Node>;
  parks: Set<Node>;
  bounds: Bounds;
  version: number;
  nextId: number;
  nextBridge: number;
  nextExpress: number;
  paused: boolean;
  speed: 1 | 2;
  tutorial: boolean;
  gameOver: boolean;
  failedRoof: number | null;
  weekly: Supply[] | null;
  claimedWeeks: number;
  nextHome: number;
  nextDestination: number;
  dispatchAt: number;
  firstRequest: boolean;
  events: { type: string; text?: string }[];
  diagnostics: string[];
  growth: boolean;
  demand: boolean;
}
export const within = (w: World, n: Node) => {
  const p = xy(n),
    b = w.bounds;
  return p.x >= b.minX && p.x <= b.maxX && p.y >= b.minY && p.y <= b.maxY;
};
export function addRoof(
  w: World,
  n: Node,
  color: Color,
  kind: Roof["kind"],
  access?: Node,
) {
  const roof: Roof = {
    id: w.nextId++,
    node: n,
    color,
    kind,
    born: w.time,
    large: false,
    nextRequest: w.time + 12,
    openedAt: kind === "destination" ? null : w.time,
    overload: 0,
    pulse: -99,
    access:
      access ??
      neighbors(n).find(
        (v) => !w.water.has(v) && !w.parks.has(v) && !w.roofAt.has(v),
      )!,
  };
  w.roofs.set(roof.id, roof);
  w.roofAt.set(n, roof);
  w.version++;
  if (kind === "home")
    for (let i = 0; i < 2; i++) {
      const id = w.nextId++;
      w.cabins.set(id, {
        id,
        home: roof.id,
        color,
        state: "idle",
        request: null,
        destination: null,
        route: [],
        back: [],
        routeEdges: [],
        backEdges: [],
        index: 0,
        node: n,
        edge: null,
        from: n,
        to: n,
        progress: 0,
        previous: 0,
        waitingSince: w.time,
        incoming: null,
        serviceLeft: 0,
        refs: new Set(),
        arrived: 0,
        fault: null,
      });
    }
  return roof;
}
export function addRequest(w: World, destination: number) {
  const roof = w.roofs.get(destination);
  if (roof && roof.openedAt === null) roof.openedAt = w.time;
  const r: Request = { id: w.nextId++, destination, born: w.time, cabin: null };
  w.requests.set(r.id, r);
  return r;
}
export const pending = (w: World, id: number) =>
  [...w.requests.values()].filter((r) => r.destination === id).length;
export const degree = (w: World, n: Node, activeOnly = false) =>
  [...w.edges.values()].filter(
    (e) => (e.a === n || e.b === n) && (!activeOnly || !e.retiring),
  ).length;
export const edgesAt = (w: World, n: Node) =>
  [...w.edges.values()].filter((e) => e.a === n || e.b === n);
export const other = (e: Edge, n: Node) => (e.a === n ? e.b : e.a);
