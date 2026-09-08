import test from "node:test";
import assert from "node:assert/strict";
import {
  addRoof,
  addRequest,
  node,
  edgeKey,
  TUNE,
  type World,
  type Color,
} from "../src/model";
import { emptyWorld, fixture } from "../src/fixtures";
import {
  buildCable,
  buildExpress,
  planCable,
  retire,
  reclaim,
  placeUpgrade,
  chooseSupply,
  pendingRefunds,
  samplePath,
} from "../src/graph";
import { step, inspect, Clock } from "../src/simulation";
import {
  dispatch,
  traffic,
  signalPhase,
  releaseAssignment,
} from "../src/traffic";
import { route } from "../src/routing";
import { createWorld, constructionPath, spawn } from "../src/world";
function run(w: World, seconds: number) {
  for (let i = 0; i < Math.round(seconds / TUNE.dt); i++) step(w);
}
function pair(color: Color = 0) {
  const w = emptyWorld();
  const h = addRoof(w, node(5, 10), 0, "home"),
    d = addRoof(w, node(10, 10), color, "destination");
  assert.ok(buildCable(w, samplePath(h.node, d.node)).ok);
  return { w, h, d };
}
function check(w: World) {
  assert.deepEqual(inspect(w), []);
}
test("one gesture cannot branch on water, and a retraced crossing refunds its only span", () => {
  const w = emptyWorld();
  for (let y = 0; y < 22; y++) w.water.add(node(7, y));
  const before = { ...w.inventory };
  const branch = [
    [6, 5],
    [7, 5],
    [8, 5],
    [8, 6],
    [7, 5],
    [6, 4],
  ].map(([x, y]) => node(x, y));
  assert.equal(buildCable(w, branch).ok, false);
  assert.deepEqual(w.inventory, before);
  assert.equal(w.edges.size, 0);
  const loop = [
    [6, 5],
    [7, 5],
    [8, 5],
    [8, 6],
    [8, 7],
    [9, 7],
    [9, 6],
    [9, 5],
    [8, 5],
    [7, 5],
    [6, 5],
  ].map(([x, y]) => node(x, y));
  const plan = buildCable(w, loop);
  assert.ok(plan.ok);
  assert.equal(plan.spans, 1);
  assert.equal(w.bridges.size, 1);
  for (const id of [...w.edges.keys()]) retire(w, id);
  assert.deepEqual(w.inventory, before);
  assert.equal(w.bridges.size, 0);
  check(w);
});
test("matching home reserves, serves exactly once, and returns both owned cabins", () => {
  const { w, h, d } = pair();
  addRequest(w, d.id);
  dispatch(w);
  assert.equal(
    [...w.cabins.values()].filter((c) => c.state === "outbound").length,
    1,
  );
  assert.equal(w.requests.size, 1);
  assert.equal(w.score, 0);
  run(w, 10);
  assert.equal(w.requests.size, 0);
  assert.equal(w.score, 1);
  assert.ok(
    [...w.cabins.values()].every(
      (c) => c.state === "idle" && c.node === h.node,
    ),
  );
  run(w, 5);
  assert.equal(w.score, 1);
  check(w);
});
test("mismatched and disconnected homes cannot dispatch", () => {
  const { w, d } = pair(1);
  addRequest(w, d.id);
  run(w, 4);
  assert.equal(w.score, 0);
  assert.equal([...w.requests.values()][0].cabin, null);
  const x = pair();
  for (const id of [...x.w.edges.keys()]) retire(x.w, id);
  addRequest(x.w, x.d.id);
  dispatch(x.w);
  assert.equal([...x.w.requests.values()][0].cabin, null);
  check(x.w);
});
test("oldest requests, cabin ID tie breaks, unique reservations, pending includes service", () => {
  const { w, d } = pair();
  const requests = Array.from({ length: 3 }, () => addRequest(w, d.id));
  dispatch(w);
  assert.equal(requests[0].cabin, 2);
  assert.equal(requests[1].cabin, 3);
  assert.equal(requests[2].cabin, null);
  assert.equal(w.requests.size, 3);
  run(w, 2.4);
  assert.equal(w.requests.size, 3);
  assert.ok([...w.cabins.values()].some((c) => c.state === "servicing"));
  check(w);
  run(w, 15);
  assert.equal(w.score, 3);
  check(w);
});
test("duplicate, invalid, and unaffordable gestures are atomic", () => {
  const { w } = pair();
  const initial = w.inventory.cable,
    size = w.edges.size;
  assert.ok(buildCable(w, [node(5, 10), node(6, 10)]).ok);
  assert.equal(w.inventory.cable, initial);
  assert.equal(w.edges.size, size);
  w.parks.add(node(7, 11));
  const before = w.inventory.cable;
  assert.equal(
    buildCable(w, [node(6, 10), node(6, 11), node(7, 11)]).ok,
    false,
  );
  assert.equal(w.inventory.cable, before);
  assert.equal(w.edges.size, size);
  w.inventory.cable = 0;
  assert.equal(buildCable(w, [node(1, 1), node(2, 1)]).ok, false);
  assert.equal(w.edges.size, size);
});
test("diagonal crossing requires a shared node; express crosses freely", () => {
  const w = emptyWorld();
  buildCable(w, [node(2, 2), node(3, 3)]);
  assert.equal(buildCable(w, [node(2, 3), node(3, 2)]).ok, false);
  const count = w.edges.size;
  assert.equal(buildExpress(w, node(2, 3), node(3, 2)), null);
  assert.equal(w.edges.size, count + 1);
  assert.equal(route(w, node(2, 2), node(3, 2)), null);
});
test("fast pointer samples stay contiguous and roofs never become shortcuts", () => {
  const w = emptyWorld();
  const path = samplePath(node(1, 1), node(16, 9));
  assert.equal(path[0], node(1, 1));
  assert.equal(path.at(-1), node(16, 9));
  for (let i = 1; i < path.length; i++)
    assert.ok(Math.abs((path[i] % 32) - (path[i - 1] % 32)) <= 1);
  const h = addRoof(w, node(3, 3), 0, "home");
  buildCable(w, [node(2, 3), h.node]);
  buildCable(w, [h.node, node(4, 3)]);
  assert.equal(route(w, node(2, 3), node(4, 3)), null);
  assert.equal(planCable(w, [node(2, 3), h.node, node(4, 3)]).ok, false);
});
test("canal validates full straight crossings and charges one token", () => {
  const w = emptyWorld();
  for (let y = 0; y < 22; y++) w.water.add(node(7, y));
  const inv = { ...w.inventory };
  assert.equal(buildCable(w, [node(6, 5), node(7, 5)]).ok, false);
  assert.equal(buildCable(w, [node(6, 5), node(7, 5), node(8, 6)]).ok, false);
  assert.deepEqual(w.inventory, inv);
  assert.ok(buildCable(w, [node(6, 5), node(7, 5), node(8, 5)]).ok);
  assert.equal(w.inventory.cable, inv.cable - 2);
  assert.equal(w.inventory.span, inv.span - 1);
  assert.equal(buildCable(w, [node(7, 4), node(7, 5), node(7, 6)]).ok, false);
  const id = edgeKey(node(6, 5), node(7, 5));
  retire(w, id);
  assert.deepEqual(w.inventory, inv);
  reclaim(w);
  assert.deepEqual(w.inventory, inv);
});
test("occupied ordinary, return, and canal edges retain trips and refund once", () => {
  const w = emptyWorld();
  w.water.add(node(7, 10));
  const h = addRoof(w, node(5, 10), 0, "home"),
    d = addRoof(w, node(10, 10), 0, "destination");
  const inv = { ...w.inventory };
  buildCable(w, samplePath(h.node, d.node));
  addRequest(w, d.id);
  run(w, 0.5);
  const e = edgeKey(node(6, 10), node(7, 10));
  retire(w, e);
  assert.ok(w.edges.get(e)?.retiring);
  assert.equal(pendingRefunds(w).span, 1);
  assert.equal(route(w, h.node, d.node), null);
  assert.equal(w.inventory.span, inv.span - 1);
  run(w, 9);
  assert.equal(w.score, 1);
  assert.ok([...w.cabins.values()].every((c) => c.state === "idle"));
  assert.equal(w.edges.has(e), false);
  assert.equal(w.inventory.span, inv.span);
  assert.equal(w.inventory.cable, inv.cable - 3);
  const snapshot = { ...w.inventory };
  reclaim(w);
  assert.deepEqual(w.inventory, snapshot);
  check(w);
});
test("occupied express retires safely and redraw cancels without charging", () => {
  const w = emptyWorld();
  const h = addRoof(w, node(3, 3), 0, "home"),
    d = addRoof(w, node(20, 15), 0, "destination");
  buildExpress(w, h.node, d.node);
  addRequest(w, d.id);
  run(w, 0.5);
  const id = edgeKey(h.node, d.node, true);
  const count = w.inventory.express;
  retire(w, id);
  assert.ok(w.edges.get(id)!.retiring);
  assert.equal(buildExpress(w, h.node, d.node), null);
  assert.equal(w.edges.get(id)!.retiring, false);
  assert.equal(w.inventory.express, count);
  retire(w, id);
  run(w, 12);
  assert.equal(w.score, 1);
  assert.equal(w.inventory.express, count + 1);
  check(w);
});
test("redrawing a retiring canal cancels whole group cleanly", () => {
  const w = emptyWorld();
  w.water.add(node(7, 10));
  const h = addRoof(w, node(5, 10), 0, "home"),
    d = addRoof(w, node(10, 10), 0, "destination");
  buildCable(w, samplePath(h.node, d.node));
  addRequest(w, d.id);
  run(w, 0.5);
  retire(w, edgeKey(node(6, 10), node(7, 10)));
  const before = { ...w.inventory };
  assert.ok(buildCable(w, [node(6, 10), node(7, 10), node(8, 10)]).ok);
  assert.deepEqual(w.inventory, before);
  assert.ok([...w.edges.values()].every((e) => !e.retiring));
  run(w, 10);
  assert.deepEqual(w.inventory, before);
  check(w);
});
test("opposing and following cabins preserve lane spacing throughout a shared corridor", () => {
  const { w, d } = pair();
  const h2 = addRoof(w, node(11, 11), 0, "home"),
    d2 = addRoof(w, node(4, 11), 0, "destination");
  buildCable(w, [h2.node, node(10, 11), node(9, 10)]);
  buildCable(w, [node(6, 10), node(5, 11), d2.node]);
  for (let i = 0; i < 6; i++) {
    addRequest(w, d.id);
    addRequest(w, d2.id);
  }
  let opposing = false;
  for (let i = 0; i < 1200 && !w.gameOver; i++) {
    step(w);
    check(w);
    const c = [...w.cabins.values()];
    if (
      c.some(
        (a) => a.edge && c.some((b) => b.edge === a.edge && b.from !== a.from),
      )
    )
      opposing = true;
  }
  assert.ok(opposing);
  assert.ok(w.score > 4);
});
function junction(kind: "normal" | "signal" | "roundabout") {
  const w = emptyWorld();
  const n = node(10, 10),
    d = addRoof(w, node(10, 18), 0, "destination");
  d.large = true;
  buildCable(w, samplePath(n, d.node));
  buildCable(w, [node(9, 10), n, node(11, 10)]);
  if (kind !== "normal") placeUpgrade(w, n, kind);
  for (let i = 0; i < 18; i++) {
    const h = addRoof(w, node(1 + i, 1), 0, "home");
    for (const c of w.cabins.values())
      if (c.home === h.id) {
        const r = addRequest(w, d.id);
        r.cabin = c.id;
        c.request = r.id;
        c.destination = d.id;
        c.state = "outbound";
        c.node = n;
        c.incoming = i % 2 ? node(9, 10) : node(10, 9);
        c.route = samplePath(n, d.node);
        c.routeEdges = c.route.slice(1).map((v, j) => edgeKey(c.route[j], v));
        c.back = [...c.route].reverse();
        c.backEdges = [...c.routeEdges].reverse();
        c.refs = new Set(c.routeEdges);
        for (const id of c.refs) w.edges.get(id)!.refs.add(c.id);
      }
  }
  return { w, n };
}
test("roundabout materially increases measured controlled throughput", () => {
  const a = junction("normal"),
    b = junction("roundabout");
  run(a.w, 3);
  run(b.w, 3);
  const normal = a.w.controllers.get(a.n)!.admitted,
    round = b.w.controllers.get(b.n)!.admitted;
  assert.ok(round > normal * 1.8, `${normal} vs ${round}`);
  check(a.w);
  check(b.w);
});
test("signal defines diagonal phases and admits both phases fairly", () => {
  assert.equal(signalPhase(node(9, 9), node(10, 10)), 0);
  assert.equal(signalPhase(node(10, 9), node(10, 10)), 1);
  const { w, n } = junction("signal");
  const redIDs = [...w.cabins.values()]
    .filter((c) => c.incoming === node(10, 9))
    .map((c) => c.id);
  run(w, 2.9);
  const first = w.controllers.get(n)!.admitted;
  assert.ok(first > 0);
  assert.ok(redIDs.every((id) => !w.cabins.get(id)!.edge));
  run(w, 3.1);
  assert.ok(w.controllers.get(n)!.admitted > first);
  assert.ok(redIDs.some((id) => w.cabins.get(id)!.edge));
  check(w);
});
test("upgrades reject invalid placements and refund displaced token", () => {
  const { w, n } = junction("normal");
  const before = { ...w.inventory };
  assert.ok(placeUpgrade(w, node(5, 5), "signal"));
  assert.deepEqual(w.inventory, before);
  assert.equal(placeUpgrade(w, n, "signal"), null);
  assert.equal(placeUpgrade(w, n, "roundabout"), null);
  assert.equal(w.inventory.signal, before.signal);
  assert.equal(w.inventory.roundabout, before.roundabout - 1);
  assert.equal(w.controllers.get(n)!.kind, "roundabout");
});
test("overload drains at double rate on recovery; sustained overload ends once", () => {
  const { w, d } = pair();
  for (let i = 0; i < 6; i++) addRequest(w, d.id);
  w.paused = false;
  run(w, 1);
  assert.ok(d.overload > 0.9);
  w.requests.clear();
  for (const c of w.cabins.values()) {
    c.request = null;
    c.state = "idle";
    c.edge = null;
    for (const id of c.refs) w.edges.get(id)?.refs.delete(c.id);
    c.refs.clear();
  }
  run(w, 0.6);
  assert.equal(d.overload, 0);
  const x = emptyWorld();
  const bad = addRoof(x, node(5, 5), 0, "destination");
  for (let i = 0; i < 6; i++) addRequest(x, bad.id);
  run(x, 30);
  assert.equal(x.gameOver, true);
  assert.equal(x.time, TUNE.grace);
  const tick = x.tick,
    score = x.score;
  run(x, 10);
  assert.equal(x.tick, tick);
  assert.equal(x.score, score);
  assert.equal(x.events.filter((e) => e.type === "gameover").length, 1);
});
test("stale reservation releases once without dropping pending demand", () => {
  const { w, d } = pair();
  const r = addRequest(w, d.id);
  dispatch(w);
  const c = w.cabins.get(r.cabin!)!;
  releaseAssignment(w, c);
  releaseAssignment(w, c);
  assert.equal(r.cabin, null);
  assert.equal(w.requests.size, 1);
});
test("pause and hidden-tab backlog preserve exact state; paused construction works", () => {
  const { w } = pair();
  const clock = new Clock();
  w.paused = true;
  clock.advance(w, 0);
  clock.advance(w, 20000);
  assert.equal(w.tick, 0);
  assert.ok(buildCable(w, [node(1, 1), node(2, 1)]).ok);
  w.paused = false;
  clock.advance(w, 20000);
  clock.advance(w, 20050);
  const tick = w.tick;
  clock.visibility(true);
  clock.advance(w, 90000);
  assert.equal(w.tick, tick);
  clock.visibility(false);
  clock.advance(w, 100000);
  assert.equal(w.tick, tick);
  clock.advance(w, 100050);
  assert.equal(w.tick, tick + 3);
});
test("1× and 2× yield identical state at identical tick counts", () => {
  const a = pair(),
    b = pair();
  for (let i = 0; i < 4; i++) {
    addRequest(a.w, a.d.id);
    addRequest(b.w, b.d.id);
  }
  a.w.speed = 1;
  b.w.speed = 2;
  const ca = new Clock(),
    cb = new Clock();
  for (let i = 0; i <= 600; i++) ca.advance(a.w, (i * 1000) / 60);
  for (let i = 0; i <= 300; i++) cb.advance(b.w, (i * 1000) / 60);
  assert.equal(a.w.tick, b.w.tick);
  assert.equal(a.w.score, b.w.score);
  assert.equal(a.w.rng.state, b.w.rng.state);
  assert.deepEqual([...a.w.cabins.values()], [...b.w.cabins.values()]);
});
test("weekly supply is single-use, preserves chosen speed and guarantees week-two express", () => {
  const w = createWorld();
  w.demand = false;
  w.nextHome = Infinity;
  w.nextDestination = Infinity;
  w.speed = 2;
  run(w, 110);
  assert.equal(w.time, 105);
  assert.equal(w.weekly?.length, 2);
  const inv = w.inventory.cable,
    supply = w.weekly![0];
  assert.ok(chooseSupply(w, supply));
  assert.equal(chooseSupply(w, supply), false);
  assert.equal(w.inventory.cable, inv + TUNE.supplyCables);
  assert.equal(w.speed, 2);
  run(w, 110);
  assert.ok(w.weekly?.includes("express"));
  assert.equal(w.time, 210);
});
test("same-seed restart resets entities, reservations, timers and graph", () => {
  const { w } = pair();
  run(w, 2);
  const a = createWorld(456),
    b = createWorld(456);
  assert.deepEqual(a, b);
  assert.equal(a.tick, 0);
  assert.equal(a.requests.size, 0);
  assert.equal(a.edges.size, 0);
  assert.equal(a.cabins.size, 2);
});
test("seeded development is repeatable and supplies a feasible approach without overwriting", () => {
  const a = createWorld(98),
    b = createWorld(98);
  for (const w of [a, b]) {
    w.inventory.cable = 400;
    w.inventory.span = 20;
    for (let i = 0; i < 12; i++) {
      spawn(w, i % 3 === 0 ? "destination" : "home");
    }
    check(w);
    for (const r of w.roofs.values()) {
      assert.ok(!w.water.has(r.node));
      assert.ok(!w.parks.has(r.node));
      assert.ok(!w.roofAt.has(r.access));
      assert.ok(!w.parks.has(r.access));
    }
  }
  assert.deepEqual([...a.roofs.values()], [...b.roofs.values()]);
});
test("inspection fixtures load with valid reservations, geometry, and cabin counts", () => {
  for (const name of [
    "busy",
    "overload",
    "retirement",
    "junction",
    "performance",
  ]) {
    const w = fixture(name);
    check(w);
    assert.ok(w.paused);
    assert.ok(w.cabins.size <= 72);
  }
});
test("safe retirement preserves a special controller until every dependent trip returns", () => {
  const w = fixture("junction");
  w.paused = false;
  const n = node(15, 11);
  assert.equal(placeUpgrade(w, n, "roundabout"), null);
  const inventory = { ...w.inventory },
    edges = w.edges.size;
  for (const id of [...w.edges.keys()]) retire(w, id);
  assert.ok(w.controllers.has(n));
  assert.equal(pendingRefunds(w).roundabout, 1);
  assert.ok([...w.edges.values()].some((e) => e.refs.size));
  run(w, 25);
  assert.ok([...w.cabins.values()].every((c) => c.state === "idle"));
  assert.equal(w.edges.size, 0);
  assert.equal(w.controllers.size, 0);
  assert.equal(w.inventory.cable, inventory.cable + edges);
  assert.equal(w.inventory.roundabout, inventory.roundabout + 1);
  check(w);
});
test("dispatch picks shortest travel time, including the express speed advantage", () => {
  const w = emptyWorld();
  const near = addRoof(w, node(4, 4), 0, "home"),
    far = addRoof(w, node(19, 4), 0, "home"),
    d = addRoof(w, node(8, 4), 0, "destination");
  buildCable(w, [
    near.node,
    node(4, 5),
    node(5, 5),
    node(6, 5),
    node(7, 5),
    node(8, 5),
    d.node,
  ]);
  buildExpress(w, far.node, d.node);
  addRequest(w, d.id);
  dispatch(w);
  const c = [...w.cabins.values()].find((c) => c.state === "outbound")!;
  assert.equal(c.home, far.id);
  check(w);
});
test("FIFO congestion eventually admits every eligible waiting cabin", () => {
  for (const kind of ["normal", "signal", "roundabout"] as const) {
    const { w, n } = junction(kind);
    const ids = [...w.cabins.keys()];
    run(w, 36 * TUNE.junction + 3);
    assert.ok(
      ids.every(
        (id) =>
          w.cabins.get(id)!.state !== "outbound" ||
          w.cabins.get(id)!.node !== n ||
          w.cabins.get(id)!.edge !== null,
      ),
      kind,
    );
    assert.ok(w.controllers.get(n)!.admitted >= 36, kind);
    check(w);
  }
});
test("controlled throughput report", (t) => {
  const normal = junction("normal"),
    round = junction("roundabout");
  run(normal.w, 3);
  run(round.w, 3);
  t.diagnostic(
    `3-second saturated controller: normal ${normal.w.controllers.get(normal.n)!.admitted}, roundabout ${round.w.controllers.get(round.n)!.admitted} admissions.`,
  );
  assert.ok(
    round.w.controllers.get(round.n)!.admitted >
      normal.w.controllers.get(normal.n)!.admitted,
  );
});

test("invalid gestures still preview their complete unique piece cost", () => {
  const w = emptyWorld();
  w.parks.add(node(4, 5));
  const p = planCable(w, samplePath(node(1, 5), node(6, 5)));
  assert.equal(p.ok, false);
  assert.equal(p.cost, 5);
  assert.equal(p.validThrough, 2);
  assert.equal(w.edges.size, 0);
});
