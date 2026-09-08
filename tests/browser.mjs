import assert from "node:assert/strict";
import { test, before, after } from "node:test";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
let chromium;
try {
  ({ chromium } = require("playwright"));
} catch {
  const runtime = process.env.RHR_NODE_MODULES;
  if (!runtime)
    throw Error(
      "Install development dependencies, or set RHR_NODE_MODULES to a runtime containing Playwright.",
    );
  ({ chromium } = require(`${runtime}/playwright`));
}
const base = process.env.RHR_TEST_URL ?? "http://127.0.0.1:5175";
let browser;
before(async () => {
  browser = await chromium.launch({
    headless: true,
    executablePath: process.env.RHR_CHROMIUM,
  });
});
after(async () => {
  await browser?.close();
});
async function scene(path) {
  const page = await browser.newPage({
    viewport: { width: 1280, height: 720 },
    reducedMotion: "reduce",
  });
  await page.goto(base + path);
  await page.locator("#board").waitFor();
  return page;
}

test("Space activates the focused Help close button", async () => {
  const page = await scene("/?fixture=preview");
  try {
    await page.keyboard.press("Escape");
    await page
      .getByRole("button", { name: "How to play", exact: true })
      .click();
    const close = page.getByRole("button", { name: "Close help", exact: true });
    await close.focus();
    await page.keyboard.press("Space");
    assert.equal(
      await page.locator("#modal").isVisible(),
      false,
      "Space must activate the focused button",
    );
  } finally {
    await page.close();
  }
});

test("right-click erases a visible express arc outside the logical grid", async () => {
  const page = await scene("/?fixture=busy&density=1");
  try {
    await page.locator('[data-tool="express"]').click();
    const a = await grid(page, 4, 1),
      b = await grid(page, 12, 1);
    await page.mouse.click(a.x, a.y);
    await page.mouse.click(b.x, b.y);
    assert.equal(await page.locator("#count-express").innerText(), "1");
    const scale = (await snap(page)).scale,
      arc = -Math.min(scale * 1.3, Math.hypot(a.x - b.x, a.y - b.y) * 0.14);
    await page.mouse.click((a.x + b.x) / 2, (a.y + b.y) / 2 + arc, {
      button: "right",
    });
    assert.equal(
      await page.locator("#count-express").innerText(),
      "2",
      "The visible arc must be erased at its midpoint",
    );
  } finally {
    await page.close();
  }
});
const snap = (page) => page.evaluate(() => window.__RHR__.snapshot());
const grid = async (page, x, y) =>
  (await snap(page)).grid.find((p) => p.x === x && p.y === y).point;
async function drag(page, a, b, steps = 30) {
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps });
  await page.mouse.up();
}

test("slow diagonal gestures keep every segment diagonal in all four directions", async () => {
  for (const [from, to] of [
    [
      [10, 8],
      [13, 11],
    ],
    [
      [13, 11],
      [10, 8],
    ],
    [
      [15, 13],
      [18, 10],
    ],
    [
      [18, 10],
      [15, 13],
    ],
  ]) {
    const page = await scene("/");
    try {
      await page.getByRole("button", { name: "Pause", exact: true }).click();
      const a = await grid(page, ...from),
        b = await grid(page, ...to);
      await drag(page, a, b, 90);
      const state = await snap(page);
      assert.equal(state.edges.length, 3);
      for (const e of state.edges) {
        const a = state.grid[e.a],
          b = state.grid[e.b];
        assert.equal(Math.abs(a.x - b.x), 1);
        assert.equal(Math.abs(a.y - b.y), 1);
      }
      assert.deepEqual(state.errors, []);
    } finally {
      await page.close();
    }
  }
});
test("cancellation preserves inventory and a fast erase sweep removes crossed cables", async () => {
  const page = await scene("/");
  try {
    await page.getByRole("button", { name: "Pause", exact: true }).click();
    const a = await grid(page, 10, 8),
      b = await grid(page, 13, 11);
    await page.mouse.move(a.x, a.y);
    await page.mouse.down();
    await page.mouse.move(b.x, b.y, { steps: 20 });
    await page.keyboard.press("Escape");
    await page.mouse.up();
    assert.equal((await snap(page)).edges.length, 0);
    assert.equal((await snap(page)).inventory.cable, 24);
    await drag(page, a, b);
    await page.locator('[data-tool="erase"]').click();
    await drag(page, a, b, 1);
    assert.equal((await snap(page)).edges.length, 0);
    assert.equal((await snap(page)).inventory.cable, 24);
  } finally {
    await page.close();
  }
});
test("help traps focus, restores it, and preserves the prior paused state", async () => {
  const page = await scene("/");
  try {
    await page.getByRole("button", { name: "Pause", exact: true }).click();
    await page
      .getByRole("button", { name: "How to play", exact: true })
      .click();
    assert.equal(await page.locator("#modal").getAttribute("role"), "dialog");
    assert.equal(await page.locator("#board").getAttribute("inert"), "");
    await page.locator("#close-help").focus();
    await page.keyboard.press("Shift+Tab");
    assert.equal(
      await page.evaluate(() => document.activeElement.id),
      "close-help-play",
    );
    await page.keyboard.press("Tab");
    assert.equal(
      await page.evaluate(() => document.activeElement.id),
      "close-help",
    );
    await page.keyboard.press("Escape");
    assert.equal(await page.evaluate(() => document.activeElement.id), "help");
    assert.equal((await snap(page)).paused, true);
    await page.locator("#motion").click();
    assert.equal(
      await page.locator("#motion").getAttribute("aria-pressed"),
      "false",
    );
    await page.locator("#speed").click();
    assert.match(
      await page.locator("#speed").getAttribute("aria-label"),
      /Speed 2×/,
    );
  } finally {
    await page.close();
  }
});
test("weekly choices can be inspected and selected by keyboard exactly once", async () => {
  const page = await scene("/?fixture=weekly");
  try {
    const initial = (await snap(page)).inventory;
    await page.locator("#inspect-week").click();
    assert.equal(await page.locator("#modal").isVisible(), false);
    assert.equal(await page.locator("#return-panel").isVisible(), true);
    await page.locator("#return-panel").click();
    const choice = page.locator('[data-supply="express"]');
    await choice.focus();
    await page.keyboard.press("Space");
    assert.equal(await page.locator("#modal").isVisible(), false);
    const next = await snap(page);
    assert.equal(next.inventory.cable, initial.cable + 18);
    assert.equal(next.inventory.express, initial.express + 1);
    assert.equal(next.weekly, null);
    assert.equal(await page.evaluate(() => document.activeElement.id), "board");
  } finally {
    await page.close();
  }
});
test("failure inspection preserves the final city and restart creates a fresh opening", async () => {
  const page = await scene("/?fixture=failure");
  try {
    assert.match(
      await page.locator("#modal").innerText(),
      /Circle station had/,
    );
    const initial = await snap(page);
    await page.locator("#inspect-failure").click();
    assert.equal(await page.locator("#health").isVisible(), true);
    assert.equal((await snap(page)).gameOver, true);
    const roof = (await snap(page)).roofs.find(
      (r) => r.id === initial.roofs.find((r) => r.overload === 30).id,
    );
    await page.mouse.click(roof.point.x, roof.point.y, { button: "right" });
    assert.equal((await snap(page)).edges.length, initial.edges.length);
    await page.locator("#return-panel").click();
    await page.locator("#retry").click();
    const next = await snap(page);
    assert.equal(next.gameOver, false);
    assert.equal(next.time, 0);
    assert.equal(next.roofs.length, 2);
    assert.equal(next.edges.length, 0);
    assert.equal(next.seed, initial.seed);
  } finally {
    await page.close();
  }
});
test("an offscreen alert focuses the missing roof and narrow view keeps supply timing", async () => {
  const page = await scene("/?fixture=overload");
  try {
    await page.setViewportSize({ width: 760, height: 800 });
    await page.locator("#board").focus();
    for (let i = 0; i < 12; i++) await page.keyboard.press("ArrowRight");
    const alert = page.locator('.edge-alert[data-warning="true"]').first();
    await alert.waitFor();
    const id = Number(await alert.getAttribute("data-roof"));
    await alert.click();
    const state = await snap(page),
      roof = state.roofs.find((r) => r.id === id);
    assert.equal(state.selected, roof.node);
    assert.ok(Math.abs(roof.point.x - 380) < 2);
    assert.equal(await page.locator("#supply-time").isVisible(), true);
    assert.equal(await page.locator("#health").isVisible(), true);
  } finally {
    await page.close();
  }
});
test("city menu allows restart during a run without refreshing", async () => {
  const page = await scene("/");
  try {
    const state = await snap(page),
      a = state.roofs[0].point,
      b = state.roofs[1].point;
    await drag(page, a, b);
    await page.waitForFunction(() => window.__RHR__.snapshot().time > 0.5);
    await page.getByRole("button", { name: "City menu", exact: true }).click();
    await page.locator("#retry").click();
    const next = await snap(page);
    assert.equal(next.time, 0);
    assert.equal(next.edges.length, 0);
    assert.equal(next.tutorial, true);
  } finally {
    await page.close();
  }
});

test("blocked gardens reject a complete gesture without charging and retain useful preview", async () => {
  const page = await scene("/");
  try {
    await page.locator("#pause").click();
    const a = await grid(page, 13, 12),
      b = await grid(page, 15, 12);
    await page.mouse.move(a.x, a.y);
    await page.mouse.down();
    await page.mouse.move(b.x, b.y, { steps: 15 });
    assert.equal(await page.locator("#preview").isVisible(), true);
    assert.match(await page.locator("#preview").innerText(), /garden|park/i);
    await page.mouse.up();
    const state = await snap(page);
    assert.equal(state.edges.length, 0);
    assert.equal(state.inventory.cable, 24);
  } finally {
    await page.close();
  }
});
test("occupied retirement shows its pending refund and keeps the round trip valid", async () => {
  const page = await scene("/?fixture=retirement");
  try {
    await page.locator("#refunds").waitFor({ state: "visible" });
    const initial = await snap(page);
    assert.ok(initial.refunds.cable + initial.refunds.express > 0);
    assert.deepEqual(initial.errors, []);
    await page.locator("#pause").click();
    await page.waitForFunction(
      () => {
        const s = window.__RHR__.snapshot();
        return s.refunds.cable + s.refunds.express === 0;
      },
      { timeout: 20000 },
    );
    assert.deepEqual((await snap(page)).errors, []);
  } finally {
    await page.close();
  }
});
