import { type World, type Node, pending, degree, TUNE } from "./model";
import { type Renderer, type ViewState } from "./render";
import { roofInsight, junctionInsight, shapes } from "./insight";
import { route } from "./routing";

/** Stable DOM controls preserve focus while their live status changes. */
export class Awareness {
  private alerts = new Map<number, HTMLButtonElement>();
  private selected: Node | null = null;
  constructor(
    private panel: HTMLElement,
    private edge: HTMLElement,
    private focus: (n: Node) => void,
    private close: () => void,
  ) {}
  update(w: World, v: ViewState, r: Renderer) {
    const n = v.selected ?? null,
      roof = n === null ? null : w.roofAt.get(n),
      info = roof
        ? roofInsight(w, roof)
        : n !== null && degree(w, n)
          ? junctionInsight(w, n)
          : null;
    this.panel.hidden = !info;
    if (info) {
      if (this.selected !== n || !this.panel.childElementCount) {
        this.panel.innerHTML =
          '<button class="close" aria-label="Close inspection">×</button><span class="eyebrow"></span><h3></h3><p></p><div class="health-counts"></div><button class="health-focus" hidden>Show queued junction ↗</button>';
        this.panel.querySelector<HTMLButtonElement>(".close")!.onclick =
          this.close;
      }
      this.panel.dataset.tone = info.tone;
      this.panel.querySelector(".eyebrow")!.textContent = info.title;
      this.panel.querySelector("h3")!.textContent = info.status;
      this.panel.querySelector("p")!.textContent = info.detail;
      this.panel.querySelector(".health-counts")!.textContent = roof
        ? `${info.incoming} outbound · ${info.returning} returning · ${info.idle} available`
        : "";
      const b = this.panel.querySelector<HTMLButtonElement>(".health-focus")!;
      b.hidden = info.bottleneck === null;
      b.onclick = () => info.bottleneck !== null && this.focus(info.bottleneck);
    }
    this.selected = n;
    const candidates = [...w.roofs.values()]
      .filter((roof) => {
        const p = r.point(roof.node),
          outside =
            p.x < 65 || p.x > r.width - 65 || p.y < 145 || p.y > r.height - 150;
        if (!outside) return false;
        return (
          roof.overload > 0 ||
          ![...w.roofs.values()].some(
            (other) =>
              other.color === roof.color &&
              other.kind !== roof.kind &&
              route(w, roof.node, other.node),
          )
        );
      })
      .sort(
        (a, b) =>
          b.overload - a.overload ||
          (a.kind === "destination" ? 0 : 1) -
            (b.kind === "destination" ? 0 : 1) ||
          b.born - a.born,
      )
      .slice(0, 3);
    const ids = new Set(candidates.map((r) => r.id));
    for (const [id, b] of this.alerts)
      if (!ids.has(id)) {
        b.remove();
        this.alerts.delete(id);
      }
    // Stack persistent alerts in a safe rail. The arrow tells the direction; clicking
    // is an explicit camera action and never lets auto-panning interrupt a gesture.
    for (const [i, roof] of candidates.entries()) {
      let b = this.alerts.get(roof.id);
      if (!b) {
        b = document.createElement("button");
        b.className = "edge-alert";
        b.dataset.roof = String(roof.id);
        b.onclick = () => this.focus(roof.node);
        this.edge.append(b);
        this.alerts.set(roof.id, b);
      }
      const p = r.point(roof.node),
        angle = Math.atan2(p.y - r.height * 0.45, p.x - r.width * 0.5),
        arrows = ["→", "↘", "↓", "↙", "←", "↖", "↑", "↗"],
        arrow = arrows[(Math.round(angle / (Math.PI / 4)) + 8) % 8];
      const detail =
        roof.overload > 0
          ? `${Math.ceil(TUNE.grace - roof.overload)}s · ${pending(w, roof.id)} waiting`
          : roof.kind === "home"
            ? "Unconnected home"
            : "New station";
      b.textContent = `${arrow} ${shapes[roof.color]} · ${detail}`;
      b.dataset.warning = String(roof.overload > 0);
      b.style.top = `${178 + i * 42}px`;
    }
  }
}
