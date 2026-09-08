import assert from "node:assert/strict";
import { createWorld, constructionPath } from "../src/world";
import { type World, type Node, edgeKey, xy, TUNE } from "../src/model";
import { buildCable, chooseSupply } from "../src/graph";
import { step, inspect } from "../src/simulation";
import { route } from "../src/routing";
function connect(w: World) {
  for (const h of w.roofs.values())
    if (h.kind === "home") {
      const dests = [...w.roofs.values()].filter(
        (d) => d.kind === "destination" && d.color === h.color,
      );
      for (const d of dests) {
        if (route(w, h.node, d.node)) continue;
        const path = constructionPath(w, h.node, d.node);
        if (path) assert.ok(buildCable(w, path).ok);
      }
    }
}
const results = [];
for (const seed of [824671, 98, 71234]) {
  const w = createWorld(seed);
  let choices = 0;
  let builds = 0;
  let roofCount = 0;
  for (let i = 0; i < 60 * 600 && !w.gameOver; i++) {
    if (w.roofs.size !== roofCount) {
      connect(w);
      roofCount = w.roofs.size;
      builds++;
    }
    if (w.weekly) {
      chooseSupply(w, w.weekly.includes("cable") ? "cable" : w.weekly[0]);
      choices++;
      connect(w);
    }
    step(w);
    if (i % 60 === 0) assert.deepEqual(inspect(w), []);
  }
  results.push({
    mode: "automatic construction with real supplies",
    seed,
    seconds: w.time,
    score: w.score,
    choices,
    homes: w.cabins.size / 2,
    destinations: [...w.roofs.values()].filter((r) => r.kind === "destination")
      .length,
    gameOver: w.gameOver,
  });
  assert.ok(choices >= 2, `Seed ${seed} should survive two weekly choices`);
}
// Unattended starter eventually fails from growing, unserved development.
const unattended = createWorld();
const h = [...unattended.roofs.values()].find((r) => r.kind === "home")!,
  d = [...unattended.roofs.values()].find((r) => r.kind === "destination")!;
buildCable(unattended, constructionPath(unattended, h.node, d.node)!);
for (let i = 0; i < 60 * 600 && !unattended.gameOver; i++) {
  if (unattended.weekly) chooseSupply(unattended, unattended.weekly[0]);
  step(unattended);
}
assert.ok(unattended.gameOver);
results.push({
  mode: "unattended starter",
  seconds: unattended.time,
  score: unattended.score,
});
// Long deterministic generator soak reaches entity caps, checks protected approaches,
// and exercises large destinations. Generous supplies isolate generation from player skill.
for (const seed of [824671, 42, 9901]) {
  const w = createWorld(seed);
  w.demand = false;
  w.inventory.cable = 4000;
  w.inventory.span = 100;
  let lastRoofs = 0;
  for (let i = 0; i < 60 * 2200; i++) {
    if (w.weekly) chooseSupply(w, w.weekly[0]);
    step(w);
    if (w.roofs.size !== lastRoofs) {
      lastRoofs = w.roofs.size;
      for (const r of w.roofs.values()) {
        assert.ok(!w.water.has(r.node) && !w.parks.has(r.node));
        assert.ok(!w.roofAt.has(r.access));
        assert.ok(!w.parks.has(r.access));
      }
      assert.deepEqual(inspect(w), []);
    }
  }
  assert.equal(w.cabins.size, 72);
  assert.equal(
    [...w.roofs.values()].filter((r) => r.kind === "destination").length,
    12,
  );
  assert.ok(
    [...w.roofs.values()]
      .filter((r) => r.kind === "destination")
      .every((r) => r.large),
  );
  results.push({
    mode: "generator soak",
    seed,
    seconds: w.time,
    homes: w.cabins.size / 2,
    destinations: 12,
    large: 12,
  });
}
console.log(JSON.stringify(results, null, 2));
