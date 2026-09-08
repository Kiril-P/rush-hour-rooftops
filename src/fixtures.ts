import {
  type World,
  type Color,
  node,
  addRoof,
  addRequest,
  TUNE,
  pending,
  distance,
} from "./model";
import { createWorld, constructionPath } from "./world";
import { buildCable, buildExpress, retire, chooseSupply } from "./graph";
import { step } from "./simulation";
export function emptyWorld(seed = 123): World {
  const w = createWorld(seed);
  w.roofs.clear();
  w.roofAt.clear();
  w.cabins.clear();
  w.edges.clear();
  w.controllers.clear();
  w.parks.clear();
  w.water.clear();
  w.requests.clear();
  w.bounds = { minX: 0, maxX: 31, minY: 0, maxY: 21 };
  w.nextId = 1;
  w.growth = false;
  w.demand = false;
  w.tutorial = false;
  w.firstRequest = true;
  w.inventory = { cable: 500, span: 20, express: 50, signal: 5, roundabout: 5 };
  w.version++;
  return w;
}
export function fixture(name: string): World {
  if (name === "first-week") {
    const w = createWorld();
    let count = -1;
    for (let i = 0; i < 60 * 106; i++) {
      if (w.roofs.size !== count) {
        count = w.roofs.size;
        for (const home of w.roofs.values())
          if (home.kind === "home") {
            const dest = [...w.roofs.values()].find(
              (r) => r.kind === "destination" && r.color === home.color,
            );
            if (dest) {
              const path = constructionPath(w, home.node, dest.node);
              if (path) buildCable(w, path);
            }
          }
      }
      if (w.weekly) chooseSupply(w, "express");
      step(w);
    }
    w.paused = true;
    w.events = [];
    return w;
  }
  if (name === "preview" || name === "blocked-preview") {
    const w = createWorld();
    w.paused = true;
    return w;
  }
  if (name === "performance") {
    const w = emptyWorld();
    const destinations = [];
    for (let i = 0; i < 12; i++)
      destinations.push(
        addRoof(
          w,
          node(3 + (i % 6) * 5, 3 + Math.floor(i / 6) * 12),
          (i % 3) as Color,
          "destination",
        ),
      );
    for (let i = 0; i < 36; i++) {
      const h = addRoof(
          w,
          node(2 + (i % 12) * 2, 7 + Math.floor(i / 12) * 3),
          (i % 3) as Color,
          "home",
        ),
        d = destinations[i % 12];
      buildExpress(w, h.node, d.node);
      for (let j = 0; j < 2; j++) addRequest(w, d.id);
    }
    for (let i = 0; i < 90; i++) step(w);
    w.paused = true;
    w.events = [];
    return w;
  }
  if (name === "junction") {
    const w = emptyWorld();
    const dest = addRoof(w, node(20, 11), 0, "destination");
    dest.large = true;
    const paths = [
      [node(12, 5), node(15, 5), node(15, 11)],
      [node(8, 11), node(15, 11)],
      [node(12, 17), node(15, 17), node(15, 11)],
    ];
    for (const vertices of paths) {
      const h = addRoof(w, vertices[0], 0, "home");
      const path = constructionPath(w, h.node, node(15, 11));
      if (path) buildCable(w, path);
    }
    buildCable(w, [
      node(15, 11),
      node(16, 11),
      node(17, 11),
      node(18, 11),
      node(19, 11),
      dest.node,
    ]);
    for (let i = 0; i < 10; i++) addRequest(w, dest.id);
    for (let i = 0; i < 200; i++) step(w);
    w.paused = true;
    w.events = [];
    return w;
  }
  const w = createWorld(824671);
  w.roofs.clear();
  w.roofAt.clear();
  w.cabins.clear();
  w.nextId = 1;
  w.version++;
  w.growth = false;
  w.demand = true;
  w.tutorial = false;
  w.firstRequest = true;
  w.bounds = { minX: 4, maxX: 27, minY: 1, maxY: 20 };
  w.inventory = { cable: 500, span: 20, express: 8, signal: 4, roundabout: 4 };
  const data: [number, number, Color, "home" | "destination"][] = [
    [10, 10, 0, "home"],
    [8, 12, 0, "home"],
    [13, 15, 0, "home"],
    [16, 8, 0, "destination"],
    [12, 5, 1, "home"],
    [15, 3, 1, "home"],
    [21, 5, 1, "home"],
    [23, 9, 1, "destination"],
    [22, 15, 2, "home"],
    [25, 17, 2, "home"],
    [15, 18, 2, "home"],
    [24, 12, 2, "destination"],
    [6, 5, 0, "home"],
    [7, 8, 0, "destination"],
    [26, 4, 1, "home"],
  ];
  for (const [x, y, color, kind] of data) addRoof(w, node(x, y), color, kind);
  const dests = [...w.roofs.values()].filter((r) => r.kind === "destination");
  for (const h of w.roofs.values())
    if (h.kind === "home") {
      const candidates = dests
        .filter((d) => d.color === h.color)
        .sort((a, b) => distance(h.node, a.node) - distance(h.node, b.node));
      for (const d of candidates) {
        const path = constructionPath(w, h.node, d.node);
        if (path) {
          buildCable(w, path);
          break;
        }
      }
    }
  buildExpress(w, node(9, 10), node(15, 8));
  for (const d of dests) for (let i = 0; i < 3; i++) addRequest(w, d.id);
  for (let i = 0; i < 700; i++) step(w);
  for (const d of dests) for (let i = 0; i < 4; i++) addRequest(w, d.id);
  for (let i = 0; i < 120; i++) step(w);
  w.inventory = { cable: 64, span: 2, express: 2, signal: 2, roundabout: 2 };
  w.claimedWeeks = 0;
  if (name === "overload") {
    const d = dests[3];
    while (pending(w, d.id) < 7) addRequest(w, d.id);
    d.overload = 16;
    w.demand = false;
  }
  if (name === "retirement") {
    const e = [...w.edges.values()].find((e) => e.refs.size);
    if (e) retire(w, e.id);
  }
  if (name === "failure") {
    w.gameOver = true;
    w.failedRoof = dests[3].id;
    dests[3].overload = TUNE.grace;
    while (pending(w, dests[3].id) < 8) addRequest(w, dests[3].id);
  }
  if (name === "weekly") w.weekly = ["express", "roundabout"];
  w.paused = true;
  w.events = [];
  return w;
}
