import test from "node:test";
import assert from "node:assert/strict";
import { emptyWorld } from "../src/fixtures";
import {
  addRoof,
  addRequest,
  node,
  TUNE,
  pending,
  xy,
  type World,
} from "../src/model";
import {
  buildCable,
  samplePath,
  buildExpress,
  placeUpgrade,
} from "../src/graph";
import { step, inspect } from "../src/simulation";
import { roofInsight } from "../src/insight";

// Six serviced destinations and twelve cabins share one junction. All roofs have
// real routes: failure here is caused by traffic, never by an absent connection.
function commuterCross() {
  const w = emptyWorld(83),
    center = node(15, 11);
  const pairs = [
    [
      [10, 5],
      [20, 17],
    ],
    [
      [12, 5],
      [18, 17],
    ],
    [
      [14, 5],
      [16, 17],
    ],
    [
      [16, 5],
      [14, 17],
    ],
    [
      [18, 5],
      [12, 17],
    ],
    [
      [20, 5],
      [10, 17],
    ],
  ] as const;
  for (const [h, d] of pairs) {
    const home = addRoof(w, node(h[0], h[1]), 0, "home"),
      dest = addRoof(w, node(d[0], d[1]), 0, "destination");
    assert.ok(buildCable(w, samplePath(home.node, center)).ok);
    assert.ok(buildCable(w, samplePath(center, dest.node)).ok);
  }
  return w;
}
function run(mode: "normal" | "interchange" | "express") {
  const w = commuterCross(),
    center = node(15, 11);
  if (mode === "interchange")
    assert.equal(placeUpgrade(w, center, "roundabout"), null);
  if (mode === "express") {
    const homes = [...w.roofs.values()].filter((r) => r.kind === "home"),
      dests = [...w.roofs.values()].filter((r) => r.kind === "destination");
    for (let i = 0; i < homes.length; i++)
      assert.equal(buildExpress(w, homes[i].node, dests[i].node), null);
  }
  let maxQueue = 0,
    peakPending = 0;
  for (let i = 0; i < 180 * 60 && !w.gameOver; i++) {
    if (i % 360 === 0)
      for (const d of w.roofs.values())
        if (d.kind === "destination") addRequest(w, d.id);
    step(w);
    if (i % 60 === 0) {
      assert.deepEqual(inspect(w), []);
      maxQueue = Math.max(
        maxQueue,
        [...w.cabins.values()].filter(
          (c) =>
            c.edge &&
            c.to === center &&
            c.progress >= w.edges.get(c.edge)!.length - 1e-6,
        ).length,
      );
      peakPending = Math.max(peakPending, w.requests.size);
    }
  }
  return {
    mode,
    score: w.score,
    time: w.time,
    gameOver: w.gameOver,
    maxQueue,
    peakPending,
    allConnected: [...w.roofs.values()]
      .filter((r) => r.kind === "destination")
      .every((r) => roofInsight(w, r).connected > 0),
  };
}
test("a connected congested network benefits from an Interchange and Express bypasses", (t) => {
  const normal = run("normal"),
    hub = run("interchange"),
    express = run("express");
  t.diagnostic(JSON.stringify({ normal, hub, express }));
  assert.ok(normal.allConnected && hub.allConnected && express.allConnected);
  assert.ok(
    normal.maxQueue >= 3,
    "a connected network develops visible junction pressure",
  );
  assert.ok(
    hub.score > normal.score * 1.1,
    "an interchange helps real deliveries",
  );
  assert.ok(
    express.score > normal.score * 1.2,
    "shorter isolated routes materially improve flow",
  );
  assert.ok(express.peakPending < normal.peakPending);
});
