import { chromium } from "playwright";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
await mkdir("audit", { recursive: true });
const browser = await chromium.launch({
  executablePath: process.env.RHR_CHROMIUM,
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
try {
  await page.goto("http://127.0.0.1:5175/");
  await page.locator("#menu").click();
  await page.locator("#volume-music").fill("38");
  await page.locator("#volume-music").dispatchEvent("input");
  assert.equal(await page.locator("#volume-music-value").textContent(), "38%");
  await page.locator("#menu-sound").click();
  assert.equal(
    await page.locator("#menu-sound").getAttribute("aria-pressed"),
    "false",
  );
  await page.locator("#menu-sound").click();
  await page.locator("#resume").click();
  await page.reload();
  await page.locator("#menu").click();
  assert.equal(await page.locator("#volume-music").inputValue(), "38");
  await page.screenshot({ path: "screenshots/audio-menu.png" });
  const report = await page.evaluate(async () => {
    const { Soundscape, BEAT } = await import("/src/audio-score.ts");
    const rate = 24000,
      duration = 32,
      c = new OfflineAudioContext(2, rate * duration, rate),
      scene = new Soundscape(c);
    scene.startAir();
    for (let i = 0; (i * BEAT) / 2 < duration - 3; i++)
      scene.schedule(i, 0.1 + (i * BEAT) / 2, false, i > 48, 8);
    const b = await c.startRendering();
    const channels = [b.getChannelData(0), b.getChannelData(1)];
    let peak = 0,
      sum = 0,
      difference = 0;
    for (let i = 0; i < b.length; i++) {
      for (const data of channels) {
        peak = Math.max(peak, Math.abs(data[i]));
        sum += data[i] ** 2;
      }
      difference += (channels[0][i] - channels[1][i]) ** 2;
    }
    const pcm = new Int16Array(b.length * 2);
    for (let i = 0; i < b.length; i++)
      for (let ch = 0; ch < 2; ch++)
        pcm[i * 2 + ch] = Math.round(
          Math.max(-1, Math.min(1, channels[ch][i])) * 32767,
        );
    const bytes = new Uint8Array(pcm.buffer);
    let binary = "";
    for (let i = 0; i < bytes.length; i += 8192)
      binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
    return {
      rate,
      duration,
      peak,
      rms: Math.sqrt(sum / (b.length * 2)),
      stereoDifference: Math.sqrt(difference / b.length),
      pcm: btoa(binary),
    };
  });
  const { pcm, ...metrics } = report;
  assert.ok(metrics.peak < 0.95 && metrics.peak > 0.01);
  assert.ok(metrics.rms > 0.002);
  assert.ok(metrics.stereoDifference > 0.0001);
  const data = Buffer.from(pcm, "base64"),
    wav = Buffer.alloc(44 + data.length);
  wav.write("RIFF");
  wav.writeUInt32LE(36 + data.length, 4);
  wav.write("WAVEfmt ", 8);
  wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20);
  wav.writeUInt16LE(2, 22);
  wav.writeUInt32LE(report.rate, 24);
  wav.writeUInt32LE(report.rate * 4, 28);
  wav.writeUInt16LE(4, 32);
  wav.writeUInt16LE(16, 34);
  wav.write("data", 36);
  wav.writeUInt32LE(data.length, 40);
  data.copy(wav, 44);
  await mkdir("audio", { recursive: true });
  await writeFile("audio/cloudline-preview.wav", wav);
  const silentPeak = await page.evaluate(async () => {
    const { Soundscape, BEAT } = await import("/src/audio-score.ts");
    const c = new OfflineAudioContext(2, 24000 * 3, 24000),
      s = new Soundscape(c);
    s.setMix({ music: 0, ambience: 0, effects: 0 }, false, false);
    s.startAir();
    s.schedule(0, 0.05);
    s.tone(72, 0.1, 0.5, 0.2, "effects");
    const b = await c.startRendering();
    let peak = 0;
    for (const n of b.getChannelData(0)) peak = Math.max(peak, Math.abs(n));
    return peak;
  });
  assert.equal(
    silentPeak,
    0,
    "Saved zero mixer levels must not leak sound at startup",
  );
  const lifecycle = await page.evaluate(async () => {
    const { AudioEngine } = await import("/src/audio.ts");
    const engine = new AudioEngine();
    engine.start();
    await engine.context.resume();
    engine.update(false, false, 12);
    const first = engine.context;
    engine.setEnabled(false);
    engine.visibility(true);
    await new Promise((r) => setTimeout(r, 100));
    const suspended = first.state;
    engine.visibility(false);
    engine.setEnabled(true);
    await first.resume();
    engine.update(true, true, 24);
    engine.note("weekly");
    engine.reset();
    await new Promise((r) => setTimeout(r, 100));
    const closed = first.state;
    engine.start();
    const different = engine.context !== first;
    engine.reset();
    return { suspended, closed, different };
  });
  assert.equal(lifecycle.suspended, "suspended");
  assert.equal(lifecycle.closed, "closed");
  assert.equal(lifecycle.different, true);
  assert.deepEqual(errors, []);
  await writeFile(
    "audit/audio-pass.json",
    JSON.stringify(
      {
        metrics,
        lifecycle,
        mixerPersistence: true,
        silentStartup: silentPeak === 0,
        pageErrors: errors,
      },
      null,
      2,
    ),
  );
  console.log({ metrics, lifecycle, errors });
} finally {
  await browser.close();
}
