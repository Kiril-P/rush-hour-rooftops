import { type World, type Node, type Tool, xy } from "./model";
import {
  buildCable,
  planCable,
  buildExpress,
  placeUpgrade,
  retire,
  removeUpgrade,
  type Plan,
} from "./graph";
import { CableStroke } from "./input";
import { eraseTarget } from "./picking";
import { type Renderer, type ViewState } from "./render";

interface ControlHost {
  world(): World;
  modalOpen(): boolean;
  inspect(node: Node | null): void;
  select(tool: Tool): void;
  notify(message: string): void;
  changed(): void;
  pause(): void;
  speed(value: 1 | 2): void;
  menu(): void;
  sound(): void;
  preview(plan: Plan | null, x?: number, y?: number): void;
  debug(): void;
}

/** Owns complete gestures. Construction uses the grid; erasing uses visible curves. */
export class BoardControls {
  private stroke: CableStroke | null = null;
  private start: { x: number; y: number; node: Node | null } | null = null;
  private eraseLast: { x: number; y: number } | null = null;
  private pan: { x: number; y: number; startX: number; startY: number } | null =
    null;
  constructor(
    private canvas: HTMLCanvasElement,
    private renderer: Renderer,
    private view: ViewState,
    private host: ControlHost,
  ) {
    canvas.addEventListener("contextmenu", (e) => e.preventDefault());
    canvas.addEventListener("pointerdown", (e) => this.down(e));
    canvas.addEventListener("pointermove", (e) => this.move(e));
    canvas.addEventListener("pointerup", (e) => this.up(e));
    canvas.addEventListener("pointercancel", () => this.cancel());
    canvas.addEventListener("pointerleave", () => {
      if (!view.dragging) view.hover = null;
    });
    canvas.addEventListener(
      "wheel",
      (e) => {
        e.preventDefault();
        if (!view.dragging && !host.modalOpen())
          renderer.zoomAt(
            Math.exp(-Math.sign(e.deltaY) * 0.13),
            e.clientX,
            e.clientY,
          );
      },
      { passive: false },
    );
    window.addEventListener("keydown", (e) => this.key(e));
    window.addEventListener("resize", () => {
      this.cancel();
      renderer.resize();
    });
    window.addEventListener("blur", () => this.cancel());
  }
  cancel() {
    this.pan = null;
    this.stroke = null;
    this.start = null;
    this.eraseLast = null;
    this.view.path = [];
    this.view.plan = null;
    this.view.dragging = false;
    this.view.expressStart = null;
    this.host.preview(null);
  }
  private pick(x: number, y: number) {
    let nearest: Node | null = null,
      best = Math.max(14, this.renderer.scale * 0.25);
    for (const roof of this.host.world().roofs.values()) {
      const p = this.renderer.point(roof.node),
        d = Math.hypot(p.x - x, p.y - y);
      if (d < best) {
        nearest = roof.node;
        best = d;
      }
    }
    return nearest ?? this.renderer.pick(x, y);
  }
  private grid(x: number, y: number) {
    const n = this.pick(x, y);
    return n !== null && this.host.world().roofAt.has(n)
      ? xy(n)
      : this.renderer.gridAt(x, y);
  }
  private erase(x: number, y: number) {
    const w = this.host.world(),
      last = this.eraseLast ?? { x, y };
    const steps = Math.max(
      1,
      Math.ceil(Math.hypot(x - last.x, y - last.y) / 5),
    );
    for (let i = 1; i <= steps; i++) {
      const target = eraseTarget(
        w,
        this.renderer,
        last.x + ((x - last.x) * i) / steps,
        last.y + ((y - last.y) * i) / steps,
      );
      if (target?.kind === "upgrade") removeUpgrade(w, target.node);
      else if (target) retire(w, target.id);
    }
    this.eraseLast = { x, y };
    this.host.changed();
  }
  private down(e: PointerEvent) {
    if (this.host.modalOpen()) return;
    const w = this.host.world();
    if (e.button === 1 || (e.button === 0 && e.altKey)) {
      e.preventDefault();
      this.cancel();
      this.pan = {
        x: e.clientX,
        y: e.clientY,
        startX: this.renderer.panX,
        startY: this.renderer.panY,
      };
      this.view.dragging = true;
      this.canvas.setPointerCapture(e.pointerId);
      return;
    }
    this.canvas.focus({ preventScroll: true });
    this.host.sound();
    const readOnly = w.gameOver || w.weekly !== null;
    if (
      !readOnly &&
      (e.button === 2 || (this.view.tool === "erase" && e.button === 0))
    ) {
      // Curves can visibly extend beyond the logical grid. Never reject them by grid coordinates.
      this.eraseLast = null;
      this.erase(e.clientX, e.clientY);
      if (e.button === 0) {
        this.view.dragging = true;
        this.canvas.setPointerCapture(e.pointerId);
      }
      return;
    }
    if (e.button !== 0) return;
    const n = this.pick(e.clientX, e.clientY);
    if (n === null) return;
    if (readOnly || this.view.tool === "inspect") {
      this.host.inspect(n);
      return;
    }
    if (this.view.tool === "express") {
      if (this.view.expressStart === null) {
        if (w.parks.has(n) || w.water.has(n)) {
          this.host.notify("Choose an open terminal or build point.");
          return;
        }
        this.view.expressStart = n;
        this.host.notify(
          "Choose the other end. Express skips every junction along the way.",
        );
      } else {
        const error = buildExpress(w, this.view.expressStart, n);
        if (error) this.host.notify(error);
        else {
          this.view.expressStart = null;
          this.host.notify("Express connected. A faster way home.");
        }
      }
      this.host.changed();
      return;
    }
    if (this.view.tool === "roundabout" || this.view.tool === "signal") {
      const error = placeUpgrade(w, n, this.view.tool);
      this.host.notify(
        error ??
          "Interchange installed. More than twice the junction capacity.",
      );
      this.host.changed();
      return;
    }
    this.start = { x: e.clientX, y: e.clientY, node: n };
    this.stroke = new CableStroke(this.grid(e.clientX, e.clientY));
    this.view.dragging = true;
    this.view.path = this.stroke.path;
    this.view.plan = null;
    this.canvas.setPointerCapture(e.pointerId);
  }
  private move(e: PointerEvent) {
    if (this.pan) {
      this.renderer.panX = this.pan.startX + e.clientX - this.pan.x;
      this.renderer.panY = this.pan.startY + e.clientY - this.pan.y;
      return;
    }
    this.view.hover = this.pick(e.clientX, e.clientY);
    if (!this.view.dragging || !(e.buttons & 1)) return;
    if (this.view.tool === "erase") {
      this.erase(e.clientX, e.clientY);
      return;
    }
    if (this.stroke) {
      this.view.path = this.stroke.update(this.grid(e.clientX, e.clientY));
      this.view.plan = planCable(this.host.world(), this.view.path);
      this.host.preview(this.view.plan, e.clientX, e.clientY);
    }
  }
  private up(e: PointerEvent) {
    if (!this.view.dragging) return;
    if (this.pan) {
      this.cancel();
      return;
    }
    if (this.view.tool === "erase") {
      this.erase(e.clientX, e.clientY);
      this.cancel();
      return;
    }
    const n = this.pick(e.clientX, e.clientY),
      start = this.start;
    if (start && Math.hypot(e.clientX - start.x, e.clientY - start.y) < 5) {
      this.cancel();
      this.host.inspect(start.node);
      return;
    }
    if (n === null) {
      this.cancel();
      this.host.notify("Gesture cancelled outside the city.");
      return;
    }
    if (this.stroke)
      this.view.path = this.stroke.update(this.grid(e.clientX, e.clientY));
    if (this.view.path.length > 1) {
      const plan = buildCable(this.host.world(), this.view.path);
      this.host.notify(
        plan.ok ? `${plan.cost} cable pieces placed.` : plan.reason,
      );
    }
    this.cancel();
    if (this.canvas.hasPointerCapture(e.pointerId))
      this.canvas.releasePointerCapture(e.pointerId);
    this.host.changed();
  }
  private key(e: KeyboardEvent) {
    if (this.host.modalOpen()) return;
    const target = e.target as HTMLElement;
    if (target.closest("button,input,textarea,select,a,[contenteditable=true]"))
      return;
    if (e.code === "Space") {
      e.preventDefault();
      this.host.pause();
    } else if (e.key === "1" || e.key === "2")
      this.host.speed(Number(e.key) as 1 | 2);
    else if (e.key === "Escape") {
      if (this.view.dragging || this.view.expressStart !== null) this.cancel();
      else if (this.view.selected !== null) this.host.inspect(null);
      else this.host.menu();
    } else if (e.key === "+" || e.key === "=") {
      this.cancel();
      this.renderer.zoomAt(1.25);
    } else if (e.key === "-") {
      this.cancel();
      this.renderer.zoomAt(0.8);
    } else if (e.key.toLowerCase() === "f") {
      this.cancel();
      this.renderer.fitCity();
    } else if (
      ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.key)
    ) {
      e.preventDefault();
      this.cancel();
      this.renderer.panX +=
        e.key === "ArrowLeft" ? 45 : e.key === "ArrowRight" ? -45 : 0;
      this.renderer.panY +=
        e.key === "ArrowUp" ? 45 : e.key === "ArrowDown" ? -45 : 0;
    } else if (e.key.toLowerCase() === "c") this.host.select("cable");
    else if (e.key.toLowerCase() === "e") this.host.select("erase");
    else if (e.key.toLowerCase() === "i") this.host.select("inspect");
    else if (e.key.toLowerCase() === "d") this.host.debug();
  }
}
