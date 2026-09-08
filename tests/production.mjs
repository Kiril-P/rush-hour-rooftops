import assert from "node:assert/strict";
import { chromium } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";
await mkdir("audit", { recursive: true });
const base = process.env.RHR_PRODUCTION_URL ?? "http://127.0.0.1:4173";
const browser = await chromium.launch({
  executablePath: process.env.RHR_CHROMIUM,
});
const page = await browser.newPage({
  viewport: { width: 1280, height: 720 },
  reducedMotion: "reduce",
});
const errors = [],
  external = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("request", (r) => {
  if (!r.url().startsWith(base)) external.push(r.url());
});
try {
  await page.goto(base + "/?fixture=failure");
  await page.locator("#board").waitFor();
  assert.equal(await page.evaluate(() => typeof window.__RHR__), "undefined");
  assert.equal(await page.locator("#modal").isVisible(), false);
  assert.equal(await page.locator("#count-cable").innerText(), "24");
  await page.screenshot({
    path: "screenshots/revision/production-opening.png",
  });
  await page.mouse.move(460, 340);
  await page.mouse.down();
  await page.mouse.move(740, 173, { steps: 45 });
  await page.mouse.up();
  await page.waitForFunction(
    () => Number(document.querySelector("#score").textContent) > 0,
  );
  await page.locator("#pause").click();
  assert.equal(await page.locator("#count-cable").innerText(), "19");
  await page.screenshot({
    path: "screenshots/revision/production-first-delivery.png",
  });
  await page.locator("#menu").click();
  await page.locator("#retry").click();
  assert.equal(await page.locator("#score").innerText(), "0");
  assert.equal(await page.locator("#count-cable").innerText(), "24");
  assert.deepEqual(errors, []);
  assert.deepEqual(external, []);
  const report = {
    passed: true,
    firstDelivery: true,
    restart: true,
    fixturesIgnored: true,
    debugSnapshotAbsent: true,
    errors,
    externalRequests: external,
  };
  await writeFile(
    "audit/revision-production.json",
    JSON.stringify(report, null, 2),
  );
  console.log(report);
} finally {
  await browser.close();
}
