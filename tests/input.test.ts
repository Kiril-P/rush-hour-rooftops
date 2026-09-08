import test from "node:test";
import assert from "node:assert/strict";
import { CableStroke } from "../src/input";
import { node } from "../src/model";
import { samplePath } from "../src/graph";
import { Renderer } from "../src/render";
import { eraseTarget } from "../src/picking";
import { emptyWorld } from "../src/fixtures";
import { buildCable, buildExpress, placeUpgrade } from "../src/graph";
import { xy } from "../src/model";
import { elevationAt } from "../src/elevation";

test("a slow diagonal gesture with slightly offset cell crossings stays diagonal", () => {
  const stroke = new CableStroke({ x: 3.05, y: 3 });
  for (let i = 1; i <= 200; i++)
    stroke.update({ x: 3.05 + i / 40, y: 3 + i / 40 });
  assert.deepEqual(
    stroke.path,
    Array.from({ length: 6 }, (_, i) => node(3 + i, 3 + i)),
  );
});

test("all diagonal directions are stable at fast and slow pointer rates with hand jitter", () => {
  for (const sx of [-1, 1])
    for (const sy of [-1, 1])
      for (const samples of [1, 8, 80, 320]) {
        const stroke = new CableStroke({ x: 10.06, y: 10.02 });
        for (let i = 1; i <= samples; i++) {
          const t = i / samples,
            jitter = i === samples ? 0 : Math.sin(i * 1.7) * 0.07;
          stroke.update({
            x: 10.06 + sx * 5 * t + jitter,
            y: 10.02 + sy * 5 * t,
          });
        }
        assert.deepEqual(
          stroke.path,
          samplePath(node(10, 10), node(10 + sx * 5, 10 + sy * 5)),
        );
      }
});

test("intentional corners, a return over the same cable, and fast sparse moves remain controllable", () => {
  const stroke = new CableStroke({ x: 3, y: 3 });
  for (let i = 1; i <= 100; i++) stroke.update({ x: 3 + i / 20, y: 3 });
  for (let i = 1; i <= 100; i++) stroke.update({ x: 8, y: 3 + i / 20 });
  assert.deepEqual(stroke.path, [
    ...samplePath(node(3, 3), node(8, 3)),
    ...samplePath(node(8, 3), node(8, 8)).slice(1),
  ]);
  for (let i = 99; i >= 0; i--) stroke.update({ x: 8, y: 3 + i / 20 });
  assert.deepEqual(stroke.path, samplePath(node(3, 3), node(8, 3)));
});

test("projected terminal picking round-trips across map sizes and camera scales", () => {
  for (const scale of [23, 47, 65]) {
    const r = Object.assign(Object.create(Renderer.prototype), {
      scale,
      cx: 15.5,
      cy: 10.5,
      ox: 720,
      oy: 477,
    });
    for (let y = 0; y < 22; y++)
      for (let x = 0; x < 32; x++) {
        const p = r.point(node(x, y));
        assert.equal(r.pick(p.x, p.y), node(x, y));
      }
  }
});

test("zoom preserves the grid point under the cursor and keeps moved terminals pickable", () => {
  const r = Object.assign(Object.create(Renderer.prototype), {
    width: 1280,
    height: 720,
    scale: 47,
    cx: 15.5,
    cy: 10.5,
    ox: 640,
    oy: 381.6,
    zoom: 1,
    panX: 0,
    panY: 0,
  });
  const before = r.gridAt(410, 310);
  r.zoomAt(1.7, 410, 310);
  const after = r.gridAt(410, 310);
  assert.ok(
    Math.abs(before.x - after.x) < 1e-10 &&
      Math.abs(before.y - after.y) < 1e-10,
  );
  for (const n of [node(3, 3), node(16, 9), node(26, 18)]) {
    const p = r.point(n);
    assert.equal(r.pick(p.x, p.y), n);
  }
  r.zoomAt(10);
  assert.equal(r.zoom, 2.5);
  r.fitCity();
  assert.equal(r.zoom, 1);
  assert.equal(r.panX, 0);
  assert.equal(r.panY, 0);
});

test("elevated roofs remain pickable for multiple seeds, scales, and sub-cell positions", () => {
  for (const sceneSeed of [824671, 42, 98, 71234, 9901])
    for (const scale of [24, 48, 90]) {
      const r = Object.assign(Object.create(Renderer.prototype), {
        scale,
        cx: 15.5,
        cy: 10.5,
        ox: 640,
        oy: 381.6,
        sceneSeed,
      });
      for (let y = 0.17; y < 22; y += 1)
        for (let x = 0.31; x < 32; x += 1) {
          const p = r.project(x, y, 1.08 + elevationAt(x, y, sceneSeed)),
            q = r.gridAt(p.x, p.y);
          assert.ok(Math.abs(x - q.x) < 1e-7 && Math.abs(y - q.y) < 1e-7);
        }
    }
});

test("slow screen-space diagonals across sloping rooftop elevations retain their intended grid path", () => {
  for (const sceneSeed of [824671, 42, 98, 71234])
    for (const sx of [-1, 1])
      for (const sy of [-1, 1]) {
        const r = Object.assign(Object.create(Renderer.prototype), {
          scale: 50,
          cx: 15.5,
          cy: 10.5,
          ox: 640,
          oy: 381.6,
          sceneSeed,
        });
        const start = node(13, 10),
          end = node(13 + sx * 5, 10 + sy * 5),
          a = r.point(start),
          b = r.point(end),
          stroke = new CableStroke(r.gridAt(a.x, a.y));
        for (let i = 1; i <= 200; i++)
          stroke.update(
            r.gridAt(
              a.x + ((b.x - a.x) * i) / 200,
              a.y + ((b.y - a.y) * i) / 200,
            ),
          );
        assert.deepEqual(stroke.path, samplePath(start, end));
      }
});

test("erase selects a signal platform before its incident cables", () => {
  const w = emptyWorld(),
    n = node(10, 10);
  buildCable(w, [node(9, 10), n, node(11, 10)]);
  buildCable(w, [n, node(10, 11)]);
  placeUpgrade(w, n, "signal");
  const projection = {
    scale: 50,
    point: (n: number) => {
      const p = xy(n);
      return { x: p.x * 50, y: p.y * 50 };
    },
  };
  assert.deepEqual(eraseTarget(w, projection, 500, 500), {
    kind: "upgrade",
    node: n,
  });
  assert.equal(eraseTarget(w, projection, 525, 500)?.kind, "edge");
});

test("every part of a long express curve can be erased", () => {
  const w = emptyWorld();
  buildExpress(w, node(0, 2), node(30, 2));
  const projection = {
    scale: 50,
    point: (n: number) => {
      const p = xy(n);
      return { x: p.x * 50, y: p.y * 50 };
    },
  };
  for (let i = 0; i <= 300; i++) {
    const t = i / 300;
    assert.equal(
      eraseTarget(w, projection, 1500 * t, 100 - 4 * 65 * t * (1 - t))?.kind,
      "edge",
    );
  }
});
