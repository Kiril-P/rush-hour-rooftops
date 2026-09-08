import test from "node:test";
import assert from "node:assert/strict";
import { createWorld, constructionPath, revealedBounds } from "../src/world";
import { emptyWorld } from "../src/fixtures";
import { node, addRoof, addRequest, TUNE } from "../src/model";
import { buildCable, samplePath, chooseSupply } from "../src/graph";
import { step, inspect, requestInterval } from "../src/simulation";

test("a hesitant player keeps a small guided opening until a real connection works", () => {
  const w = createWorld();
  assert.equal(
    (w.bounds.maxX - w.bounds.minX + 1) * (w.bounds.maxY - w.bounds.minY + 1),
    63,
  );
  for (let i = 0; i < 2400; i++) step(w);
  assert.equal(w.time, 0);
  assert.equal(w.tutorial, true);
  assert.equal(w.requests.size, 0);
  buildCable(w, [node(11, 12), node(12, 12)]);
  for (let i = 0; i < 1200; i++) step(w);
  assert.equal(w.time, 0);
  assert.equal(w.tutorial, true);
  buildCable(w, samplePath(node(11, 12), node(16, 9)));
  step(w);
  assert.ok(w.time > 0);
  assert.equal(w.tutorial, true);
  for (let i = 0; i < 300; i++) step(w);
  assert.ok(w.score > 0);
  assert.equal(w.tutorial, false);
  assert.deepEqual(inspect(w), []);
});

test("new stations have setup grace and open shortly after a connection", () => {
  const w = emptyWorld();
  w.demand = true;
  const h = addRoof(w, node(5, 10), 0, "home"),
    d = addRoof(w, node(10, 10), 0, "destination");
  for (let i = 0; i < 60 * 45; i++) step(w);
  assert.equal(d.openedAt, null);
  assert.equal(w.requests.size, 0);
  buildCable(w, samplePath(h.node, d.node));
  for (let i = 0; i < 30; i++) step(w);
  assert.ok(d.openedAt !== null);
  assert.equal(w.requests.size, 0);
  for (let i = 0; i < 60 * 12; i++) step(w);
  assert.ok(w.score > 0);
  const unreachable = addRoof(w, node(20, 10), 1, "destination");
  for (let i = 0; i < 60 * (TUNE.stationGrace + TUNE.stationWarmup + 1); i++)
    step(w);
  assert.ok(unreachable.openedAt !== null);
  assert.ok(
    [...w.requests.values()].some((r) => r.destination === unreachable.id),
  );
});

test("rushes create real request pressure and the city expands progressively", () => {
  const w = emptyWorld();
  w.time = 59;
  const normal = requestInterval(w);
  w.time = 61;
  assert.ok(requestInterval(w) < normal * 0.6);
  for (const [before, after] of [
    [0, 45],
    [45, 105],
    [105, 210],
    [210, 315],
    [315, 420],
    [420, 525],
  ]) {
    const a = revealedBounds(before),
      b = revealedBounds(after);
    assert.ok(
      b.minX <= a.minX &&
        b.maxX >= a.maxX &&
        b.maxY >= a.maxY &&
        b.minY <= a.minY,
    );
    assert.ok(b.maxX - b.minX > a.maxX - a.minX);
  }
  assert.deepEqual(revealedBounds(525), {
    minX: 0,
    maxX: 31,
    minY: 0,
    maxY: 21,
  });
});

test("normal city has no invisible span tax and rewards meaningful tools only", () => {
  const w = createWorld();
  assert.equal(w.water.size, 0);
  assert.equal(w.inventory.span, 0);
  w.demand = false;
  w.nextHome = Infinity;
  w.nextDestination = Infinity;
  for (let i = 0; i < 6300; i++) step(w);
  assert.deepEqual(w.weekly, ["express", "cable"]);
  const before = w.inventory.cable;
  chooseSupply(w, "cable");
  assert.equal(w.inventory.cable, before + TUNE.bulkCables);
  buildCable(w, [node(12, 10), node(13, 10), node(14, 10)]);
  buildCable(w, [node(13, 10), node(13, 9)]);
  for (let i = 0; i < 6300; i++) step(w);
  assert.deepEqual(w.weekly, ["express", "roundabout"]);
});

test("fast construction search respects barriers, crossings and exact supplies", () => {
  for (const seed of [12, 42, 98, 824671]) {
    const w = emptyWorld(seed);
    w.inventory.cable = 12;
    for (let y = 3; y < 17; y++) if (y !== 10) w.parks.add(node(10, y));
    buildCable(w, [node(7, 7), node(8, 8)]);
    const path = constructionPath(w, node(5, 8), node(15, 12));
    assert.ok(path);
    const result = buildCable(w, path);
    assert.ok(result.ok);
    assert.ok(w.inventory.cable >= 0);
    assert.equal(constructionPath(w, node(0, 0), node(31, 21)), null);
  }
});
