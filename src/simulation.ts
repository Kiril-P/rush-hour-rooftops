import {
  type World,
  TUNE,
  addRequest,
  pending,
  degree,
  type Supply,
} from "./model";
import { spawn, revealedBounds } from "./world";
import { dispatch, traffic } from "./traffic";
import { route } from "./routing";

export const isStopped = (w: World) =>
  w.paused || w.weekly !== null || w.gameOver;
export const rushActive = (w: World) =>
  w.time >= TUNE.rushEvery && w.time % TUNE.rushEvery < TUNE.rushDuration;
export function requestInterval(w: World, large = false) {
  return (
    (Math.max(
      TUNE.requestMin,
      TUNE.request * Math.pow(TUNE.demandGrowth, w.claimedWeeks),
    ) /
      (large ? 1.5 : 1)) *
    (rushActive(w) ? TUNE.rushFactor : 1)
  );
}
function hasMatchingRoute(w: World, destination: number, color: number) {
  for (const h of w.roofs.values())
    if (h.kind === "home" && h.color === color && route(w, h.node, destination))
      return true;
  return false;
}
export function step(w: World) {
  if (isStopped(w)) return;
  // The opening clock belongs to the tutorial until a usable first route exists.
  // A disconnected gesture never starts demand or dismisses the instructions.
  if (w.tutorial && !w.firstRequest && w.demand) {
    const h = [...w.roofs.values()].find((r) => r.kind === "home");
    const d = [...w.roofs.values()].find((r) => r.kind === "destination");
    if (!h || !d || !route(w, h.node, d.node)) return;
  }
  w.tick++;
  w.time = w.tick * TUNE.dt;
  if (!w.firstRequest && w.demand) {
    const d = [...w.roofs.values()].find((r) => r.kind === "destination");
    if (d) {
      addRequest(w, d.id);
      d.openedAt = w.time;
      d.nextRequest = w.time + TUNE.request;
      w.firstRequest = true;
    }
  }
  if (w.time + 1e-8 >= w.dispatchAt) {
    if (w.demand)
      for (const d of w.roofs.values())
        if (d.kind === "destination" && d.openedAt === null) {
          if (
            w.time - d.born >= TUNE.stationGrace ||
            hasMatchingRoute(w, d.node, d.color)
          ) {
            d.openedAt = w.time;
            d.nextRequest = w.time + TUNE.stationWarmup;
            w.events.push({
              type: "open",
              text: hasMatchingRoute(w, d.node, d.color)
                ? "Station connected. Commuters arrive shortly."
                : "A new station is opening. It still needs a route.",
            });
          }
        }
    dispatch(w);
    w.dispatchAt = w.time + TUNE.dispatch;
  }
  if (w.demand)
    for (const d of w.roofs.values())
      if (
        d.kind === "destination" &&
        d.openedAt !== null &&
        w.time >= d.nextRequest
      ) {
        addRequest(w, d.id);
        d.nextRequest = w.time + w.rng.jitter(requestInterval(w, d.large));
      }
  traffic(w, TUNE.dt);
  if (w.score > 0) w.tutorial = false;
  for (const d of w.roofs.values())
    if (d.kind === "destination") {
      const previous = d.overload;
      d.overload = Math.max(
        0,
        d.overload +
          (pending(w, d.id) >= (d.large ? TUNE.largeOverload : TUNE.overload)
            ? TUNE.dt
            : -TUNE.dt * 2),
      );
      if (previous === 0 && d.overload > 0)
        w.events.push({
          type: "warning",
          text: "A station is filling up. Inspect its route or bypass a busy junction.",
        });
      if (d.overload >= TUNE.grace - 1e-8) {
        d.overload = TUNE.grace;
        w.gameOver = true;
        w.failedRoof = d.id;
        w.events.push({ type: "gameover" });
        return;
      }
    }
  if (w.growth) {
    const bounds = revealedBounds(w.time);
    if (bounds.minX !== w.bounds.minX || bounds.maxX !== w.bounds.maxX) {
      w.bounds = bounds;
      w.events.push({
        type: "expand",
        text: "More skyline to explore. New routes, new possibilities.",
      });
    }
    if (w.time >= w.nextHome) {
      spawn(w, "home");
      w.nextHome = w.time + w.rng.jitter(TUNE.homeEvery);
    }
    if (w.time >= w.nextDestination) {
      spawn(w, "destination");
      w.nextDestination = w.time + w.rng.jitter(TUNE.destinationEvery);
    }
    if (w.time + 1e-8 >= (w.claimedWeeks + 1) * TUNE.week) {
      const hasJunction = [...w.edges.values()].some((e) =>
        [e.a, e.b].some(
          (n) =>
            degree(w, n, true) >= 3 &&
            !w.roofAt.has(n) &&
            w.controllers.get(n)?.kind !== "roundabout",
        ),
      );
      const alternative: Supply = hasJunction ? "roundabout" : "cable";
      w.weekly = ["express", alternative];
      w.events.push({ type: "weekly" });
    }
    if (
      w.time >= TUNE.rushEvery &&
      Math.abs(w.time % TUNE.rushEvery) < TUNE.dt * 0.5
    )
      w.events.push({
        type: "rush",
        text: "Rush hour. More commuters for the next 14 seconds.",
      });
  }
}
// Wall-clock backlog is discarded on visibility transitions and pause ownership changes.
export class Clock {
  accumulator = 0;
  last: number | null = null;
  hidden = false;
  reset() {
    this.accumulator = 0;
    this.last = null;
  }
  visibility(hidden: boolean) {
    this.hidden = hidden;
    this.reset();
  }
  advance(w: World, now: number) {
    if (this.hidden || isStopped(w)) {
      this.reset();
      return 0;
    }
    if (this.last === null) {
      this.last = now;
      return 0;
    }
    const elapsed = Math.max(0, Math.min(0.1, (now - this.last) / 1000));
    this.last = now;
    this.accumulator += elapsed * w.speed;
    let steps = 0;
    while (this.accumulator >= TUNE.dt - 1e-10) {
      step(w);
      this.accumulator -= TUNE.dt;
      steps++;
      if (isStopped(w)) {
        this.reset();
        break;
      }
    }
    return steps;
  }
  get alpha() {
    return this.accumulator / TUNE.dt;
  }
}
export function inspect(w: World) {
  const issues: string[] = [];
  if (
    w.cabins.size !==
    [...w.roofs.values()].filter((r) => r.kind === "home").length * 2
  )
    issues.push("Cabin ownership count");
  const reserved = new Set<number>();
  for (const r of w.requests.values())
    if (r.cabin !== null) {
      if (reserved.has(r.cabin)) issues.push("Cabin reserved twice");
      reserved.add(r.cabin);
      const c = w.cabins.get(r.cabin);
      if (!c || c.request !== r.id) issues.push(`Reservation mismatch ${r.id}`);
    }
  for (const e of w.edges.values()) {
    for (const from of [e.a, e.b]) {
      const lane = [...w.cabins.values()]
        .filter((c) => c.edge === e.id && c.from === from)
        .sort((a, b) => a.progress - b.progress);
      for (let i = 1; i < lane.length; i++)
        if (lane[i].progress - lane[i - 1].progress < TUNE.spacing - 1e-6)
          issues.push(`Lane spacing ${e.id}`);
    }
    for (const id of e.refs)
      if (!w.cabins.get(id)?.refs.has(e.id))
        issues.push("Orphan edge reference");
  }
  for (const c of w.cabins.values())
    for (const id of c.refs)
      if (!w.edges.get(id)?.refs.has(c.id))
        issues.push("Missing retained edge");
  for (const [key, count] of Object.entries(w.inventory))
    if (count < 0) issues.push(`Negative ${key}`);
  return [...issues, ...w.diagnostics];
}
