import "@fontsource/dm-sans/latin-400.css";
import "@fontsource/dm-sans/latin-500.css";
import "@fontsource/dm-sans/latin-600.css";
import "@fontsource/dm-sans/latin-700.css";
import "@fontsource/manrope/latin-500.css";
import "@fontsource/manrope/latin-600.css";
import "@fontsource/manrope/latin-700.css";
import "@fontsource/manrope/latin-800.css";
import "./style.css";
import { icon } from "./icons";
import {
  type World,
  type Tool,
  type Node,
  xy,
  node,
  TUNE,
  degree,
} from "./model";
import { createWorld } from "./world";
import { chooseSupply, pendingRefunds, planCable, samplePath } from "./graph";
import { Clock, inspect, isStopped, rushActive } from "./simulation";
import { Renderer, type ViewState } from "./render";
import { AudioEngine } from "./audio";
import { type MixChannel, DEFAULT_MIX } from "./audio-score";
import { fixture } from "./fixtures";
import { BoardControls } from "./controls";
import { DialogLayer } from "./dialog";
import { Awareness } from "./awareness";
import {
  tools,
  toolNames,
  descriptions,
  helpPanel,
  menuPanel,
  suppliesPanel,
  resultsPanel,
} from "./panels";
const storage = {
  get(key: string, fallback: string) {
    try {
      return localStorage.getItem("rhr:" + key) ?? fallback;
    } catch {
      return fallback;
    }
  },
  set(key: string, value: string) {
    try {
      localStorage.setItem("rhr:" + key, value);
    } catch {
      /* Private mode remains playable. */
    }
  },
};
const params = new URLSearchParams(location.search);
let w: World =
  import.meta.env.DEV && params.has("fixture")
    ? fixture(params.get("fixture")!)
    : createWorld(Number(params.get("seed")) || 824671);
const audio = new AudioEngine();
audio.enabled = storage.get("sound", "true") === "true";
for (const channel of ["music", "ambience", "effects"] as MixChannel[])
  audio.setLevel(
    channel,
    Number(storage.get("volume-" + channel, String(DEFAULT_MIX[channel]))),
  );
let best = Number(storage.get("best", "0")) || 0;
const view: ViewState = {
  tool: "cable",
  path: [],
  plan: null,
  hover: null,
  selected: null,
  expressStart: null,
  reduced:
    storage.get(
      "reduced",
      String(matchMedia("(prefers-reduced-motion: reduce)").matches),
    ) === "true",
  dragging: false,
};
document.querySelector("#app")!.innerHTML = `
 <canvas id="board" aria-label="Rooftop cable network. Drag from a home terminal to a matching rooftop terminal." tabindex="0"></canvas>
 <header><div class="brand"><div class="brand-icon">${icon("cable")}</div><div><h1>Rush Hour <b>Rooftops</b></h1><p>A LITTLE CITY ABOVE THE CLOUDS</p></div></div>
 <div class="journey"><span class="status-dot"></span><span id="status">The city is waking up</span></div>
 <div class="top-controls"><div class="score"><strong id="score">0</strong><span>DELIVERED</span></div><div class="divider"></div><div class="calendar"><span id="week">WEEK 01</span><strong id="day">Monday</strong><div class="week-dots" id="days"></div><small id="supply-time"></small></div><div class="playback"><button id="pause" aria-label="Pause" title="Pause / resume · Space">${icon("pause")}</button><button id="speed" aria-label="Double speed" title="Speed · 1 or 2">1×</button></div><button class="small-icon" id="menu" aria-label="City menu" title="City menu · Escape">${icon("menu")}</button><button class="small-icon" id="sound" aria-label="Mute sound" title="Sound">${icon(audio.enabled ? "sound" : "mute")}</button></div></header>
 <div class="district"><span class="tiny-label">BELLWETHER</span><h2>Above the cloudline</h2><span class="district-detail">Rooftop transit authority <span>—</span> Est. today</span></div>
 <div class="map-controls" aria-label="Map view"><button id="zoom-out" aria-label="Zoom out" title="Zoom out · −">−</button><button id="zoom-fit" aria-label="Fit city" title="Fit the city · F">⌖</button><button id="zoom-in" aria-label="Zoom in" title="Zoom in · +">+</button></div>
 <div id="hint" class="hint"><span class="hint-number">01</span><div><b>Every good city starts with a connection.</b><p>Drag a cable from the home to the matching rooftop.</p></div><span class="hint-arrow">↗</span></div>
 <div id="pause-badge" hidden>II <span>PAUSED · BUILD AT YOUR OWN PACE</span></div>
 <div id="preview" hidden></div><div id="toast" role="status" aria-live="polite"></div>
 <div class="bottom"><div class="legend"><span><i class="circle coral"></i> Circle</span><span><i class="triangle"></i> Triangle</span><span><i class="square teal"></i> Square</span></div>
 <nav class="tray" aria-label="Construction tools">${tools.map((t) => `<button class="tool ${t === "cable" ? "selected" : ""}" data-tool="${t}" aria-label="${toolNames[t]}" aria-pressed="${t === "cable"}" title="${descriptions[t]}">${icon(t)}<span class="tool-label">${toolNames[t]}</span>${t !== "erase" && t !== "inspect" ? `<b id="count-${t}">${w.inventory[t]}</b>` : `<span class="erase-shortcut">${t === "erase" ? "RMB" : "I"}</span>`}</button>`).join("")}</nav>
 <div class="utility"><button id="motion" title="Reduced motion" aria-label="Toggle reduced motion">${icon("leaf")}</button><button id="help" aria-label="How to play" title="How to play">${icon("help")}</button></div></div>
 <div class="footer"><span>DRAW CONNECTIONS. KEEP THE CITY MOVING.</span><span id="tool-help">Drag to build <i>·</i> Right-click to erase <i>·</i> Scroll to zoom <i>·</i> Arrows to pan</span></div>
 <aside id="health" hidden aria-label="Network inspection"></aside><div id="edge-alerts"></div><div id="refunds" hidden></div><button id="return-panel" hidden></button><div id="modal" hidden></div><div id="debug" hidden></div>`;
const $ = <T extends HTMLElement = HTMLElement>(selector: string) =>
  document.querySelector<T>(selector)!;
const canvas = $<HTMLCanvasElement>("#board"),
  renderer = new Renderer(
    canvas,
    import.meta.env.DEV && ["1", "2"].includes(params.get("density") ?? "")
      ? Number(params.get("density"))
      : undefined,
  ),
  clock = new Clock();
let mode: "help" | "menu" | null = null,
  wasPaused = false,
  inspectingStop = false,
  debugOpen = false,
  toastUntil = 0,
  toastPriority = 0,
  lastUI = 0,
  lastFrame = performance.now();
let frameTimes: number[] = [],
  simTimes: number[] = [],
  renderTimes: number[] = [],
  maxSim = 0;
const unlocked = new Set<Tool>(["cable", "erase", "inspect"]);
const dialog = new DialogLayer($("#modal"), () => {
  if (mode) closeMenu();
  else inspectStopped();
});
const controls = new BoardControls(canvas, renderer, view, {
  world: () => w,
  modalOpen: () => dialog.open,
  inspect: selectNode,
  select: selectTool,
  notify: toast,
  changed: syncUI,
  pause: togglePause,
  speed: setSpeed,
  menu: () => openMenu("menu"),
  sound: () => audio.start(),
  debug: () => {
    if (import.meta.env.DEV) {
      debugOpen = !debugOpen;
      $("#debug").hidden = !debugOpen;
      updateDebug();
    }
  },
  preview(plan, x = 0, y = 0) {
    const p = $("#preview");
    p.hidden = !plan;
    if (!plan) return;
    p.textContent =
      plan.reason + (plan.ok ? "" : ` · ${plan.cost} pieces planned`);
    p.classList.toggle("invalid", !plan.ok);
    p.style.left = Math.min(innerWidth - 280, Math.max(12, x + 20)) + "px";
    p.style.top = Math.max(95, y - 48) + "px";
  },
});
const awareness = new Awareness(
  $("#health"),
  $("#edge-alerts"),
  focusNode,
  () => selectNode(null),
);
function toast(message: string, priority = 0) {
  if (performance.now() < toastUntil && priority < toastPriority) return;
  toastPriority = priority;
  $("#toast").textContent = message;
  $("#toast").classList.add("visible");
  toastUntil = performance.now() + (priority ? 6500 : 4400);
}
function selectNode(n: Node | null) {
  view.selected =
    n !== null && (w.roofAt.has(n) || degree(w, n) > 0) ? n : null;
  syncUI();
}
function focusNode(n: Node) {
  controls.cancel();
  renderer.focusNode(n);
  view.selected = n;
  syncUI();
}
function selectTool(tool: Tool) {
  controls.cancel();
  view.tool = tool;
  document.querySelectorAll<HTMLButtonElement>("[data-tool]").forEach((b) => {
    const selected = b.dataset.tool === tool;
    b.classList.toggle("selected", selected);
    b.setAttribute("aria-pressed", String(selected));
  });
  $("#tool-help").textContent = descriptions[tool];
}
function reset(seed: number) {
  dialog.hide();
  mode = null;
  inspectingStop = false;
  audio.reset();
  toastUntil = 0;
  toastPriority = 0;
  $("#toast").classList.remove("visible");
  w = createWorld(seed);
  renderer.fitCity();
  clock.reset();
  view.selected = null;
  controls.cancel();
  selectTool("cable");
  unlocked.clear();
  ["cable", "erase", "inspect"].forEach((t) => unlocked.add(t as Tool));
  frameTimes = [];
  simTimes = [];
  renderTimes = [];
  maxSim = 0;
  audio.start();
  syncUI();
  canvas.focus();
}
function togglePause() {
  if (w.weekly || w.gameOver || dialog.open) return;
  w.paused = !w.paused;
  clock.reset();
  audio.start();
  syncUI();
}
function setSpeed(speed: 1 | 2) {
  if (dialog.open || w.gameOver || w.weekly) return;
  w.speed = speed;
  clock.reset();
  syncUI();
}
function openMenu(next: "help" | "menu") {
  if (w.weekly || w.gameOver) return;
  if (!mode) wasPaused = w.paused;
  audio.start();
  mode = next;
  w.paused = true;
  controls.cancel();
  clock.reset();
  syncUI();
}
function closeMenu() {
  mode = null;
  w.paused = wasPaused;
  dialog.hide();
  clock.reset();
  syncUI();
}
function inspectStopped() {
  inspectingStop = true;
  dialog.hide();
  if (w.gameOver && w.failedRoof !== null) {
    const roof = w.roofs.get(w.failedRoof);
    if (roof) focusNode(roof.node);
  }
  syncUI();
}
function bindRestart() {
  const retry = document.querySelector<HTMLButtonElement>("#retry"),
    fresh = document.querySelector<HTMLButtonElement>("#new-city");
  if (retry) retry.onclick = () => reset(w.seed);
  if (fresh)
    fresh.onclick = () => reset(crypto.getRandomValues(new Uint32Array(1))[0]);
}
function syncModal() {
  if (mode === "help") {
    dialog.show("help", helpPanel(), () => {
      $("#close-help").onclick = closeMenu;
      $("#close-help-play").onclick = closeMenu;
    });
    return;
  }
  if (mode === "menu") {
    dialog.show("menu", menuPanel(audio.levels, audio.enabled), () => {
      $("#menu-sound").onclick = () => {
        audio.setEnabled(!audio.enabled);
        storage.set("sound", String(audio.enabled));
        syncUI();
      };
      document.querySelectorAll<HTMLInputElement>("[data-volume]").forEach(
        (input) =>
          (input.oninput = () => {
            const channel = input.dataset.volume as MixChannel;
            audio.setLevel(channel, Number(input.value) / 100);
            storage.set("volume-" + channel, String(audio.levels[channel]));
            $(`#volume-${channel}-value`).textContent = input.value + "%";
          }),
      );
      $("#resume").onclick = closeMenu;
      $("#menu-help").onclick = () => openMenu("help");
      bindRestart();
    });
    return;
  }
  if (w.weekly && !inspectingStop) {
    controls.cancel();
    dialog.show(`week-${w.claimedWeeks}`, suppliesPanel(w), () => {
      document.querySelectorAll<HTMLButtonElement>("[data-supply]").forEach(
        (b) =>
          (b.onclick = () => {
            if (
              chooseSupply(
                w,
                b.dataset.supply as "cable" | "express" | "roundabout",
              )
            ) {
              inspectingStop = false;
              dialog.hide();
              clock.reset();
              syncUI();
              canvas.focus({ preventScroll: true });
              toast("Supplies ready. Pause any time to redesign your routes.");
            }
          }),
      );
      $("#inspect-week").onclick = inspectStopped;
    });
    return;
  }
  if (w.gameOver && !inspectingStop) {
    controls.cancel();
    best = Math.max(best, w.score);
    storage.set("best", String(best));
    dialog.show("results", resultsPanel(w, best), () => {
      $("#inspect-failure").onclick = inspectStopped;
      bindRestart();
    });
    return;
  }
  dialog.hide();
}
$("#pause").onclick = togglePause;
$("#speed").onclick = () => setSpeed(w.speed === 1 ? 2 : 1);
$("#menu").onclick = () => openMenu("menu");
$("#help").onclick = () => openMenu("help");
$("#zoom-in").onclick = () => {
  controls.cancel();
  renderer.zoomAt(1.25);
};
$("#zoom-out").onclick = () => {
  controls.cancel();
  renderer.zoomAt(0.8);
};
$("#zoom-fit").onclick = () => {
  controls.cancel();
  renderer.fitCity();
};
$("#sound").onclick = () => {
  audio.start();
  audio.setEnabled(!audio.enabled);
  storage.set("sound", String(audio.enabled));
  syncUI();
};
$("#motion").onclick = () => {
  view.reduced = !view.reduced;
  storage.set("reduced", String(view.reduced));
  toast(
    view.reduced ? "Reduced motion on. Cabins keep moving." : "Full motion on.",
  );
  syncUI();
};
$("#return-panel").onclick = () => {
  inspectingStop = false;
  syncUI();
};
document.querySelectorAll<HTMLButtonElement>("[data-tool]").forEach(
  (b) =>
    (b.onclick = () => {
      audio.start();
      selectTool(b.dataset.tool as Tool);
    }),
);
document.addEventListener("visibilitychange", () => {
  clock.visibility(document.hidden);
  controls.cancel();
  audio.visibility(document.hidden);
});
function syncUI() {
  const soundToggle = document.querySelector<HTMLButtonElement>("#menu-sound");
  if (soundToggle) {
    soundToggle.textContent = audio.enabled ? "Sound on" : "Sound off";
    soundToggle.setAttribute("aria-pressed", String(audio.enabled));
  }
  $(".district").classList.toggle("compact", w.score > 0 || w.roofs.size > 2);
  $("#score").textContent = String(w.score);
  const day = Math.floor(w.time / TUNE.day) % 7;
  $("#week").textContent =
    `WEEK ${String(Math.floor((w.time + 1e-7) / TUNE.week) + 1).padStart(2, "0")}`;
  $("#day").textContent = [
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
    "Sunday",
  ][day];
  $("#days").innerHTML = Array.from(
    { length: 7 },
    (_, i) => `<i class="${i <= day ? "on" : ""}"></i>`,
  ).join("");
  $("#supply-time").textContent =
    `Supplies in ${Math.max(0, Math.ceil((w.claimedWeeks + 1) * TUNE.week - w.time))}s`;
  const stoppedForDecision = w.weekly !== null || w.gameOver;
  for (const id of ["pause", "speed", "menu", "help"])
    $<HTMLButtonElement>("#" + id).disabled = stoppedForDecision;
  document
    .querySelectorAll<HTMLButtonElement>("[data-tool]")
    .forEach(
      (b) => (b.disabled = stoppedForDecision && b.dataset.tool !== "inspect"),
    );
  $("#pause").innerHTML = icon(w.paused ? "play" : "pause");
  $("#pause").setAttribute("aria-label", w.paused ? "Resume" : "Pause");
  $("#speed").textContent = `${w.speed}×`;
  $("#speed").classList.toggle("fast", w.speed === 2);
  $("#speed").setAttribute(
    "aria-label",
    w.speed === 1
      ? "Speed 1×. Switch to double speed"
      : "Speed 2×. Switch to normal speed",
  );
  $("#sound").innerHTML = icon(audio.enabled ? "sound" : "mute");
  $("#sound").setAttribute(
    "aria-label",
    audio.enabled ? "Mute sound" : "Enable sound",
  );
  $("#motion").classList.toggle("active", view.reduced);
  $("#motion").setAttribute("aria-pressed", String(view.reduced));
  $("#pause-badge").hidden = !w.paused || !!mode || w.gameOver || !!w.weekly;
  $("#hint").hidden =
    (!w.tutorial &&
      !(!w.paused && w.growth && w.roofs.size > 2 && w.time < 35)) ||
    view.selected !== null;
  if (w.tutorial) {
    $("#hint b").textContent = w.firstRequest
      ? "Watch your first commuter arrive."
      : "Every good city starts with a connection.";
    $("#hint p").textContent = w.firstRequest
      ? "Each cabin makes a delivery, then returns home."
      : "Drag from the home terminal to the matching station. The city will wait.";
  } else {
    $("#hint b").textContent = "A new home. Another way to help.";
    $("#hint p").textContent =
      "Space pauses the city. Connect more homes, or erase and redraw a better route.";
  }
  const overload = [...w.roofs.values()].some((r) => r.overload > 0);
  $("#status").textContent = w.gameOver
    ? "The city takes a breather"
    : w.weekly
      ? "Your weekly supplies have arrived"
      : w.paused
        ? "A moment to plan"
        : overload
          ? "A rooftop needs your attention"
          : rushActive(w)
            ? "Rush hour · keep the city moving"
            : w.score === 0
              ? "The city is waking up"
              : "A little city, going places";
  $(".status-dot").classList.toggle("warning", overload || rushActive(w));
  for (const key of ["cable", "express", "roundabout"] as const) {
    if (w.inventory[key] > 0) unlocked.add(key);
    const b = $(`[data-tool="${key}"]`);
    b.hidden = !unlocked.has(key);
    $(`#count-${key}`).textContent = String(w.inventory[key]);
    b.classList.toggle("empty", w.inventory[key] === 0);
  }
  const refunds = pendingRefunds(w),
    parts = [
      refunds.cable ? `${refunds.cable} cables` : "",
      refunds.express ? `${refunds.express} Express` : "",
      refunds.roundabout ? `${refunds.roundabout} Interchange` : "",
    ].filter(Boolean);
  $("#refunds").hidden = !parts.length;
  $("#refunds").textContent = `Returning after trips: ${parts.join(" · ")}`;
  $("#return-panel").hidden = !inspectingStop || !(w.weekly || w.gameOver);
  $("#return-panel").textContent = w.weekly
    ? "Choose weekly supplies ↗"
    : "Back to results ↗";
  syncModal();
  awareness.update(w, view, renderer);
  if (debugOpen) updateDebug();
}
const p95 = (values: number[]) =>
  [...values].sort((a, b) => a - b)[Math.floor(values.length * 0.95)] ?? 0;
function snapshot() {
  return {
    seed: w.seed,
    tick: w.tick,
    time: w.time,
    score: w.score,
    paused: w.paused,
    gameOver: w.gameOver,
    tutorial: w.tutorial,
    weekly: w.weekly,
    bounds: w.bounds,
    inventory: w.inventory,
    refunds: pendingRefunds(w),
    selected: view.selected,
    zoom: renderer.zoom,
    scale: renderer.scale,
    roofs: [...w.roofs.values()].map((r) => ({
      ...r,
      point: renderer.point(r.node),
    })),
    edges: [...w.edges.values()].map((e) => ({
      ...e,
      refs: e.refs.size,
      aPoint: renderer.point(e.a),
      bPoint: renderer.point(e.b),
    })),
    grid: Array.from({ length: 32 * 22 }, (_, n) => ({
      node: n,
      ...xy(n),
      point: renderer.point(n),
      park: w.parks.has(n),
    })),
    errors: inspect(w),
    metrics: {
      frameP95: p95(frameTimes),
      simulationP95: p95(simTimes),
      renderP95: p95(renderTimes),
      maxSimulation: maxSim,
    },
    cabins: [...w.cabins.values()].map((c) => ({
      id: c.id,
      state: c.state,
      point: renderer.cabinPoint(w, c, 1),
    })),
  };
}
function updateDebug() {
  if (!debugOpen) return;
  const d = snapshot();
  $("#debug").innerHTML =
    `<b>TRANSIT INSPECTOR</b><pre>seed ${w.seed} · tick ${w.tick}\ncabins ${w.cabins.size} · pending ${w.requests.size}\nframe p95 ${d.metrics.frameP95.toFixed(2)} ms\nrender p95 ${d.metrics.renderP95.toFixed(2)} ms\nsim p95 ${d.metrics.simulationP95.toFixed(2)} ms\nsim maximum ${maxSim.toFixed(2)} ms\n${d.errors.length ? d.errors.join("\n") : "✓ Simulation invariants hold"}</pre><div class="fixtures">${["opening", "busy", "junction", "overload", "failure", "weekly", "performance"].map((n) => `<button data-fixture="${n}">${n}</button>`).join("")}</div>`;
  document.querySelectorAll<HTMLButtonElement>("[data-fixture]").forEach(
    (b) =>
      (b.onclick = () => {
        reset(w.seed);
        w =
          b.dataset.fixture === "opening"
            ? createWorld()
            : fixture(b.dataset.fixture!);
        syncUI();
      }),
  );
}
if (import.meta.env.DEV)
  Object.defineProperty(window, "__RHR__", {
    value: { snapshot },
    configurable: true,
  });
if (
  import.meta.env.DEV &&
  ["preview", "blocked-preview"].includes(params.get("fixture") ?? "")
) {
  renderer.draw(w, view, 1, 1);
  view.path =
    params.get("fixture") === "preview"
      ? samplePath(node(11, 12), node(16, 9))
      : samplePath(node(13, 12), node(15, 12));
  view.dragging = true;
  view.plan = planCable(w, view.path);
}
function animate(now: number) {
  const delta = now - lastFrame;
  lastFrame = now;
  const start = performance.now();
  clock.advance(w, now);
  const sim = performance.now() - start;
  maxSim = Math.max(maxSim, sim);
  audio.update(
    isStopped(w),
    rushActive(w),
    [...w.cabins.values()].filter((c) => c.state !== "idle").length,
  );
  for (const event of w.events.splice(0)) {
    audio.note(event.type);
    if (event.text) toast(event.text, event.type === "warning" ? 1 : 0);
  }
  renderer.draw(
    w,
    view,
    isStopped(w) ? 1 : clock.alpha,
    Math.min(0.1, delta / 1000),
  );
  if (!document.hidden) {
    frameTimes.push(delta);
    simTimes.push(sim);
    renderTimes.push(renderer.frameMs);
    if (frameTimes.length > 600) {
      frameTimes.shift();
      simTimes.shift();
      renderTimes.shift();
    }
  }
  if (now - lastUI > 150) {
    syncUI();
    lastUI = now;
  }
  if (now > toastUntil) $("#toast").classList.remove("visible");
  requestAnimationFrame(animate);
}
renderer.draw(w, view, 1, 1);
syncUI();
requestAnimationFrame(animate);
