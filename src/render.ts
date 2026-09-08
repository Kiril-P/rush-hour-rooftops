import {
  type World,
  type Node,
  type Roof,
  type Cabin,
  type Tool,
  xy,
  node,
  degree,
  TUNE,
  pending,
  within,
} from "./model";
import { type Plan, legalExpress } from "./graph";
import { signalPhase } from "./traffic";
import { CityArt, TRANSIT_HEIGHT, COLORS, SHADE } from "./art";
import { Atmosphere, skyHash } from "./atmosphere";
import { elevationAt } from "./elevation";
import { roofInsight, junctionInsight, waitingAt } from "./insight";
export { COLORS } from "./art";
const DARK = SHADE;
const INK = "#46535D",
  GROUND = "#F3EFE5";
export interface ViewState {
  tool: Tool;
  path: Node[];
  plan: Plan | null;
  hover: Node | null;
  selected?: Node | null;
  expressStart: Node | null;
  reduced: boolean;
  dragging: boolean;
}
export class Renderer {
  art = new CityArt(this);
  atmosphere = new Atmosphere(this);
  zoom = 1;
  panX = 0;
  panY = 0;
  sceneSeed = 824671;
  ages = new WeakMap<object, number>();
  age(object: object) {
    const now = performance.now();
    if (!this.ages.has(object)) this.ages.set(object, now);
    return (now - this.ages.get(object)!) / 1000;
  }
  ctx: CanvasRenderingContext2D;
  width = 1440;
  height = 900;
  scale = 60;
  cx = 15.5;
  cy = 10.5;
  ox = 720;
  oy = 450;
  frameMs = 0;
  constructor(
    public canvas: HTMLCanvasElement,
    public density?: number,
  ) {
    this.ctx = canvas.getContext("2d")!;
    this.resize();
  }
  resize() {
    this.width = innerWidth;
    this.height = innerHeight;
    const dpr = this.density ?? Math.min(devicePixelRatio || 1, 2);
    this.canvas.width = this.width * dpr;
    this.canvas.height = this.height * dpr;
    this.canvas.style.width = this.width + "px";
    this.canvas.style.height = this.height + "px";
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  project(x: number, y: number, z = TRANSIT_HEIGHT) {
    return {
      x: this.ox + (x - this.cx + (y - this.cy) * 0.25) * this.scale,
      y: this.oy + ((y - this.cy) * 0.71 - z) * this.scale,
    };
  }
  point(n: Node, z = TRANSIT_HEIGHT) {
    const p = xy(n);
    return this.project(p.x, p.y, z + elevationAt(p.x, p.y, this.sceneSeed));
  }
  gridAt(x: number, y: number) {
    let gy =
        (y - this.oy + this.scale * TRANSIT_HEIGHT) / (this.scale * 0.71) +
        this.cy,
      gx = 0;
    // The elevation derivative is bounded below the projection slope, making this
    // fixed-point inverse converge even between lattice nodes and at every zoom.
    for (let i = 0; i < 16; i++) {
      gx = (x - this.ox) / this.scale + this.cx - (gy - this.cy) * 0.25;
      gy =
        (y -
          this.oy +
          this.scale * (TRANSIT_HEIGHT + elevationAt(gx, gy, this.sceneSeed))) /
          (this.scale * 0.71) +
        this.cy;
    }
    gx = (x - this.ox) / this.scale + this.cx - (gy - this.cy) * 0.25;
    return { x: gx, y: gy };
  }
  zoomAt(factor: number, x = this.width / 2, y = this.height * 0.53) {
    const next = Math.max(0.8, Math.min(2.5, this.zoom * factor)),
      ratio = next / this.zoom;
    this.panX =
      x - this.width * 0.5 - (x - this.width * 0.5 - this.panX) * ratio;
    this.panY =
      y - this.height * 0.53 - (y - this.height * 0.53 - this.panY) * ratio;
    this.zoom = next;
    this.scale *= ratio;
    this.ox = this.width * 0.5 + this.panX;
    this.oy = this.height * 0.53 + this.panY;
  }
  fitCity() {
    this.zoom = 1;
    this.panX = 0;
    this.panY = 0;
  }
  focusNode(n: Node) {
    const p = this.point(n);
    this.panX += this.width * 0.5 - p.x;
    this.panY += this.height * 0.43 - p.y;
    this.ox = this.width * 0.5 + this.panX;
    this.oy = this.height * 0.53 + this.panY;
  }
  pick(x: number, y: number): Node | null {
    const g = this.gridAt(x, y);
    const ix = Math.round(g.x),
      iy = Math.round(g.y);
    return ix >= 0 && ix < 32 && iy >= 0 && iy < 22 ? node(ix, iy) : null;
  }
  poly(
    points: { x: number; y: number }[],
    fill: string | CanvasGradient,
    stroke?: string,
    lw = 1,
  ) {
    const c = this.ctx;
    c.beginPath();
    points.forEach((p, i) => (i ? c.lineTo(p.x, p.y) : c.moveTo(p.x, p.y)));
    c.closePath();
    c.fillStyle = fill;
    c.fill();
    if (stroke) {
      c.strokeStyle = stroke;
      c.lineWidth = lw;
      c.stroke();
    }
  }
  groundRect(x: number, y: number, w: number, h: number, fill: string, z = 0) {
    this.poly(
      [
        this.project(x, y, z),
        this.project(x + w, y, z),
        this.project(x + w, y + h, z),
        this.project(x, y + h, z),
      ],
      fill,
    );
  }
  line(
    a: { x: number; y: number },
    b: { x: number; y: number },
    color: string,
    width: number,
  ) {
    const c = this.ctx;
    c.strokeStyle = color;
    c.lineWidth = width;
    c.lineCap = "round";
    c.beginPath();
    c.moveTo(a.x, a.y);
    c.lineTo(b.x, b.y);
    c.stroke();
  }
  circle(
    x: number,
    y: number,
    r: number,
    fill: string,
    stroke?: string,
    width = 1,
  ) {
    const c = this.ctx;
    c.beginPath();
    c.arc(x, y, r, 0, Math.PI * 2);
    c.fillStyle = fill;
    c.fill();
    if (stroke) {
      c.strokeStyle = stroke;
      c.lineWidth = width;
      c.stroke();
    }
  }
  roundRect(
    x: number,
    y: number,
    w: number,
    h: number,
    r: number,
    fill: string,
    stroke?: string,
  ) {
    const c = this.ctx;
    c.beginPath();
    c.roundRect(x, y, w, h, r);
    c.fillStyle = fill;
    c.fill();
    if (stroke) {
      c.strokeStyle = stroke;
      c.lineWidth = 1;
      c.stroke();
    }
  }
  emblem(x: number, y: number, size: number, color: number, fill: string) {
    if (color === 0) this.circle(x, y, size * 0.48, fill);
    else if (color === 1)
      this.poly(
        [
          { x, y: y - size * 0.57 },
          { x: x + size * 0.56, y: y + size * 0.4 },
          { x: x - size * 0.56, y: y + size * 0.4 },
        ],
        fill,
      );
    else
      this.roundRect(
        x - size * 0.45,
        y - size * 0.45,
        size * 0.9,
        size * 0.9,
        size * 0.1,
        fill,
      );
  }
  text(
    text: string,
    x: number,
    y: number,
    size: number,
    color = INK,
    weight = 500,
    align: CanvasTextAlign = "center",
  ) {
    const c = this.ctx;
    c.fillStyle = color;
    c.textAlign = align;
    c.textBaseline = "middle";
    c.font = `${weight} ${size}px "Trebuchet MS", sans-serif`;
    c.fillText(text, x, y);
  }
  draw(w: World, v: ViewState, alpha: number, elapsed: number) {
    const start = performance.now(),
      c = this.ctx,
      b = w.bounds;
    this.sceneSeed = w.seed;
    this.art.time = w.time;
    this.art.reduced = v.reduced;
    const cols = b.maxX - b.minX + 1,
      rows = b.maxY - b.minY + 1,
      target =
        Math.min(
          (this.width - 135) / (cols + rows * 0.25 + 1),
          (this.height - 220) / (rows * 0.71 + 2.6),
        ) * this.zoom;
    if (!v.dragging) {
      const ease = v.reduced ? 1 : Math.min(1, elapsed * 5);
      this.scale += (target - this.scale) * ease;
      this.cx += ((b.minX + b.maxX) / 2 - this.cx) * ease;
      this.cy += ((b.minY + b.maxY) / 2 - this.cy) * ease;
    }
    this.ox = this.width * 0.5 + this.panX;
    this.oy = this.height * 0.53 + this.panY;
    const s = this.scale;
    const selected =
      v.selected ??
      (v.hover !== null && w.roofAt.has(v.hover) ? v.hover : null);
    const selectedRoof = selected === null ? null : w.roofAt.get(selected);
    const insight = selectedRoof
      ? roofInsight(w, selectedRoof)
      : selected !== null && degree(w, selected)
        ? junctionInsight(w, selected)
        : null;
    c.clearRect(0, 0, this.width, this.height);
    c.fillStyle = GROUND;
    c.fillRect(0, 0, this.width, this.height);
    this.atmosphere.sky(w.time, v.reduced);
    this.atmosphere.rift(w, v.dragging || v.tool === "span");
    // Islands are grouped, with open sky between them. The clear transport corridors
    // are based on real nodes, so future construction never hides behind decoration.
    const network = new Set<Node>(),
      clear = new Set<Node>();
    for (const e of w.edges.values()) {
      network.add(e.a);
      network.add(e.b);
    }
    for (const n of [...network, ...w.roofAt.keys()]) {
      const p = xy(n);
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++)
          if (p.x + dx >= 0 && p.x + dx < 32 && p.y + dy >= 0 && p.y + dy < 22)
            clear.add(node(p.x + dx, p.y + dy));
    }
    const islands: { y: number; x: number; draw: () => void }[] = [];
    for (const lot of this.atmosphere.layout(w.seed)) {
      const p = xy(lot.node);
      if (
        !within(w, lot.node) ||
        w.water.has(lot.node) ||
        w.parks.has(lot.node) ||
        clear.has(lot.node)
      )
        continue;
      islands.push({
        y: p.y,
        x: p.x,
        draw: () =>
          this.art.decoration(p.x, p.y, lot.variant, lot.height, lot.depth),
      });
    }
    for (const n of w.parks)
      if (within(w, n)) {
        const p = xy(n);
        islands.push({
          y: p.y,
          x: p.x,
          draw: () =>
            this.art.park(p.x, p.y, Math.floor(skyHash(p.x, p.y, w.seed) * 8)),
        });
      }
    for (const r of w.roofs.values()) {
      const p = xy(r.node);
      islands.push({ y: p.y, x: p.x, draw: () => this.roof(w, r, v) });
    }
    for (const n of network)
      if (!w.roofAt.has(n) && !w.water.has(n)) {
        const p = xy(n);
        islands.push({
          y: p.y,
          x: p.x,
          draw: () => this.art.support(p.x, p.y, degree(w, n) > 2),
        });
      }
    islands.sort((a, b) => a.y - b.y || a.x - b.x);
    this.art.layer = "foundations";
    for (const island of islands) {
      this.art.lift = elevationAt(island.x, island.y, w.seed);
      island.draw();
    }
    this.atmosphere.foreground(w.time, v.reduced);
    this.art.layer = "caps";
    for (const island of islands) {
      this.art.lift = elevationAt(island.x, island.y, w.seed);
      island.draw();
    }
    this.art.layer = "all";
    this.art.lift = 0;
    // The city boundary and protected gardens establish the construction grammar.
    const building = v.dragging || v.tool === "express";
    c.save();
    c.setLineDash([2, 7]);
    c.globalAlpha = building ? 0.65 : 0.25;
    const corners = [
      node(b.minX, b.minY),
      node(b.maxX, b.minY),
      node(b.maxX, b.maxY),
      node(b.minX, b.maxY),
    ];
    for (let i = 0; i < 4; i++)
      this.line(
        this.point(corners[i]),
        this.point(corners[(i + 1) % 4]),
        "#7A9A90",
        1,
      );
    c.restore();
    if (building)
      for (const n of w.parks)
        if (within(w, n)) {
          const p = this.point(n);
          this.circle(
            p.x,
            p.y,
            Math.max(9, s * 0.22),
            "#F7F0D9CE",
            "#947C61",
            1.5,
          );
          this.line(
            { x: p.x - 4, y: p.y - 4 },
            { x: p.x + 4, y: p.y + 4 },
            "#947C61",
            1.5,
          );
          this.line(
            { x: p.x + 4, y: p.y - 4 },
            { x: p.x - 4, y: p.y + 4 },
            "#947C61",
            1.5,
          );
        }
    // A very light construction lattice is continuously readable, with stronger feedback in a gesture.
    c.save();
    c.globalAlpha = v.dragging ? 0.8 : 0.4;
    for (let y = b.minY; y <= b.maxY; y++)
      for (let x = b.minX; x <= b.maxX; x++) {
        const n = node(x, y);
        if (w.roofAt.has(n) || w.parks.has(n) || w.water.has(n)) continue;
        const p = this.point(n);
        this.circle(p.x, p.y, v.dragging ? 1.8 : 1.1, "#72968C");
      }
    c.restore();
    const roofs = [...w.roofs.values()].sort(
      (a, b) => xy(a.node).y - xy(b.node).y || a.node - b.node,
    );

    // Supports precede elevated lines and cabins.
    const nodes = new Set<Node>();
    for (const e of w.edges.values()) {
      nodes.add(e.a);
      nodes.add(e.b);
    }
    for (const n of nodes)
      if (!w.roofAt.has(n) && !w.water.has(n)) {
        const p = this.point(n);
        const d = degree(w, n),
          control = w.controllers.get(n);
        if (d > 2) {
          this.circle(p.x, p.y, s * 0.17, "#E8E5DC", INK, s * 0.025);
          if (control?.kind === "roundabout") {
            this.circle(p.x, p.y, s * 0.135, "#C9D7C8", INK, s * 0.035);
            this.circle(p.x, p.y, s * 0.055, GROUND);
            this.text("↻", p.x, p.y, s * 0.22, INK, 600);
          } else if (control?.kind === "signal") {
            const phase = Math.floor(w.time / TUNE.phase) % 2;
            for (const e of w.edges.values())
              if (e.a === n || e.b === n) {
                const q = this.point(e.a === n ? e.b : e.a),
                  dx = q.x - p.x,
                  dy = q.y - p.y,
                  len = Math.hypot(dx, dy),
                  green = signalPhase(e.a === n ? e.b : e.a, n) === phase;
                this.circle(
                  p.x + (dx / len) * s * 0.22,
                  p.y + (dy / len) * s * 0.22,
                  s * 0.045,
                  green ? "#609D83" : "#E97868",
                  "#F5F1E7",
                  1,
                );
              }
          }
        } else this.circle(p.x, p.y, s * 0.065, INK);
      }
    for (const e of [...w.edges.values()].sort(
      (a, b) => (a.kind === "express" ? 1 : 0) - (b.kind === "express" ? 1 : 0),
    ))
      this.cable(
        w,
        e.a,
        e.b,
        e.kind === "express",
        e.retiring,
        e.number,
        v.reduced ? 1 : Math.min(1, this.age(e) * 5 + 0.05),
        insight?.edges.has(e.id) ? "#61B39A" : undefined,
      );
    if (insight)
      for (const n of insight.matches) {
        const p = this.point(n),
          roof = w.roofAt.get(n),
          color = roof ? COLORS[roof.color] : "#719786";
        this.circle(p.x, p.y, Math.max(11, s * 0.24), "#FFFAEAC0", color, 2.5);
        if (roof)
          this.emblem(p.x, p.y, Math.max(9, s * 0.18), roof.color, color);
      }
    for (const n of nodes)
      if (degree(w, n) > 2 && !w.roofAt.has(n)) {
        const count = waitingAt(w, n).length;
        if (count >= 2) {
          const p = this.point(n);
          this.roundRect(
            p.x - 13,
            p.y - 29,
            26,
            18,
            8,
            count >= 4 ? "#EAA57F" : "#F7EED8",
          );
          this.text(String(count), p.x, p.y - 20, 11, "#794F3F", 700);
        }
      }
    if (w.tutorial && !w.firstRequest) {
      const h = roofs.find((r) => r.kind === "home")!,
        d = roofs.find((r) => r.kind === "destination")!,
        a = this.point(h.node),
        b = this.point(d.node);
      c.save();
      c.setLineDash([3, 8]);
      c.globalAlpha = 0.42;
      this.line(a, b, COLORS[0], 2);
      c.restore();
      const hx = a.x - Math.max(38, s * 0.8),
        hy = a.y + 10,
        dx = b.x + Math.max(64, s * 1.2),
        dy = b.y + 19;
      this.line(
        { x: hx + 25, y: hy },
        { x: a.x - s * 0.12, y: a.y },
        "#C7AE95",
        1,
      );
      this.roundRect(hx - 26, hy - 10, 52, 20, 9, "#FAF6E8E8");
      this.text("HOME", hx, hy, 8, "#927866", 700);
      this.line(
        { x: dx - 55, y: dy },
        { x: b.x + s * 0.1, y: b.y },
        "#C7AE95",
        1,
      );
      this.roundRect(dx - 58, dy - 10, 116, 20, 9, "#FAF6E8E8");
      this.text("MATCHING ROOFTOP", dx, dy, 8, "#927866", 700);
    }
    for (const cabin of [...w.cabins.values()]
      .filter((c) => c.state !== "idle")
      .sort(
        (a, b) =>
          this.cabinPoint(w, a, alpha).y - this.cabinPoint(w, b, alpha).y,
      ))
      this.drawCabin(w, cabin, alpha, v);
    for (const r of roofs) if (r.kind === "destination") this.marker(w, r, v);
    // Placement feedback sits above the transport plane.
    if (v.path.length > 1) {
      const color = v.plan?.ok ? "#63977E" : "#C76453";
      c.save();
      c.setLineDash([s * 0.09, s * 0.08]);
      for (let i = 1; i < v.path.length; i++)
        this.line(
          this.point(v.path[i - 1]),
          this.point(v.path[i]),
          v.plan?.ok || i <= (v.plan?.validThrough ?? 0)
            ? "#63977E"
            : "#C76453",
          s * 0.065,
        );
      c.restore();
      for (const n of [v.path[0], v.path.at(-1)!]) {
        const p = this.point(n);
        this.circle(p.x, p.y, s * 0.13, GROUND, color, 2);
      }
    }
    if (v.expressStart !== null && v.hover !== null) {
      const error = legalExpress(w, v.expressStart, v.hover);
      c.save();
      c.globalAlpha = 0.7;
      this.cable(w, v.expressStart, v.hover, true, !!error, 0, 1);
      c.restore();
    }
    if (v.tool === "signal" || v.tool === "roundabout")
      for (const n of nodes)
        if (degree(w, n, true) > 2 && !w.roofAt.has(n) && !w.water.has(n)) {
          const p = this.point(n);
          c.save();
          c.globalAlpha = 0.7;
          this.circle(p.x, p.y, s * 0.28, "#FFFFFF88", "#63977E", 2);
          c.restore();
        }
    if (v.hover !== null && within(w, v.hover)) {
      const p = this.point(v.hover);
      this.circle(
        p.x,
        p.y,
        Math.max(6, s * 0.19),
        "#FFFFFF33",
        v.tool === "erase" ? "#CE6C5D" : "#5B766C",
        1.5,
      );
    }
    this.frameMs = performance.now() - start;
  }
  cable(
    w: World,
    a: Node,
    b: Node,
    express: boolean,
    retiring: boolean,
    number: number,
    reveal: number,
    highlight?: string,
  ) {
    const c = this.ctx,
      s = this.scale,
      p = this.point(a),
      q = this.point(b),
      dx = q.x - p.x,
      dy = q.y - p.y,
      len = Math.hypot(dx, dy) || 1,
      nx = -dy / len,
      ny = dx / len,
      offset = express ? s * 0.055 : s * 0.047,
      arc = express ? -Math.min(s * 1.3, len * 0.14) : s * 0.032;
    c.save();
    if (retiring) {
      c.globalAlpha = 0.38;
      c.setLineDash([s * 0.12, s * 0.12]);
    }
    for (const lane of [-1, 1]) {
      c.beginPath();
      c.moveTo(p.x + nx * offset * lane, p.y + ny * offset * lane);
      const end = { x: p.x + dx * reveal, y: p.y + dy * reveal };
      c.quadraticCurveTo(
        (p.x + end.x) / 2 + nx * offset * lane,
        (p.y + end.y) / 2 + ny * offset * lane + arc * 2 * reveal,
        end.x + nx * offset * lane,
        end.y + ny * offset * lane,
      );
      if (highlight) {
        c.strokeStyle = highlight;
        c.lineWidth = Math.max(7, s * 0.16);
        c.globalAlpha = 0.25;
        c.stroke();
        c.globalAlpha = 1;
      }
      c.strokeStyle = express ? "#E7D39E" : "#FAF6EA";
      c.lineWidth = express ? s * 0.065 : s * 0.06;
      c.stroke();
      c.strokeStyle = express ? "#9B814D" : INK;
      c.lineWidth = express ? s * 0.033 : s * 0.022;
      c.stroke();
    }
    if (number > 0)
      for (const n of [a, b]) {
        const pos = this.point(n);
        this.circle(pos.x, pos.y - s * 0.17, s * 0.145, "#E7CB86", GROUND, 2);
        this.text(String(number), pos.x, pos.y - s * 0.17, s * 0.17, INK, 700);
      }
    c.restore();
  }
  roof(w: World, r: Roof, v: ViewState) {
    this.art.roof(w, r, v.reduced ? 1 : Math.min(1, this.age(r) / 0.4));
    if (this.art.layer === "foundations") return;
    if (w.time - r.born < 2.5 && r.born > 0 && !v.reduced) {
      const c = this.ctx;
      c.save();
      c.globalAlpha = Math.max(0, 1 - (w.time - r.born) / 2.5) * 0.6;
      const q = this.point(r.node);
      this.circle(
        q.x,
        q.y,
        this.scale * (0.6 + (w.time - r.born) * 0.12),
        "#FFFFFF00",
        COLORS[r.color],
        1.6,
      );
      c.restore();
    }
  }
  cabinPoint(w: World, c: Cabin, alpha: number) {
    const s = this.scale;
    if (c.edge) {
      const e = w.edges.get(c.edge);
      if (e) {
        const a = this.point(c.from),
          b = this.point(c.to),
          t = (c.previous + (c.progress - c.previous) * alpha) / e.length,
          dx = b.x - a.x,
          dy = b.y - a.y,
          len = Math.hypot(dx, dy) || 1,
          arc =
            e.kind === "express" ? -Math.min(s * 1.3, len * 0.14) : s * 0.032;
        const point = {
          x: a.x + dx * t - (dy / len) * s * 0.047,
          y: a.y + dy * t + (dx / len) * s * 0.047 + 4 * arc * t * (1 - t),
        };
        // Blend incoming/outgoing lane offsets over a short turn; roundabouts add
        // clockwise circulation around their platform without changing travel time.
        const progress = c.previous + (c.progress - c.previous) * alpha;
        if (c.incoming !== null && progress < 0.4 && !w.roofAt.has(c.from)) {
          const previous = this.point(c.incoming),
            ix = a.x - previous.x,
            iy = a.y - previous.y,
            il = Math.hypot(ix, iy) || 1,
            u = Math.min(1, progress / 0.4),
            blend = 1 - u * u * (3 - 2 * u);
          point.x += (-iy / il + dy / len) * s * 0.047 * blend;
          point.y += (ix / il - dx / len) * s * 0.047 * blend;
          if (w.controllers.get(c.from)?.kind === "roundabout") {
            const circle = Math.sin(u * Math.PI) * s * 0.17;
            point.x += (-dy / len) * circle;
            point.y += (dx / len) * circle;
          }
        }
        return point;
      }
    }
    const p = this.point(c.node);
    const queue = [...w.cabins.values()]
      .filter(
        (x) =>
          x.node === c.node &&
          (x.state === "queued" || x.state === "servicing"),
      )
      .sort((a, b) => a.arrived - b.arrived || a.id - b.id);
    const idx = queue.findIndex((x) => x.id === c.id);
    return {
      x: p.x + (idx >= 0 ? (idx % 3) - 1 : 0) * s * 0.19,
      y: p.y + s * 0.27 + (idx >= 0 ? Math.floor(idx / 3) : 0) * s * 0.14,
    };
  }
  drawCabin(w: World, cabin: Cabin, alpha: number, v: ViewState) {
    const c = this.ctx,
      s = Math.max(50, this.scale),
      p = this.cabinPoint(w, cabin, alpha),
      color = COLORS[cabin.color];
    c.save();
    c.translate(p.x, p.y);
    if (!v.reduced) c.rotate(Math.sin(w.time * 3 + cabin.id) * 0.028);
    this.line({ x: 0, y: 0 }, { x: 0, y: s * 0.1 }, INK, s * 0.018);
    this.circle(0, 0, s * 0.03, INK);
    this.roundRect(
      -s * 0.115,
      s * 0.07,
      s * 0.23,
      s * 0.17,
      s * 0.045,
      color,
      DARK[cabin.color],
    );
    this.poly(
      [
        { x: s * 0.075, y: s * 0.08 },
        { x: s * 0.145, y: s * 0.105 },
        { x: s * 0.145, y: s * 0.205 },
        { x: s * 0.075, y: s * 0.23 },
      ],
      DARK[cabin.color],
    );
    this.line(
      { x: -s * 0.07, y: s * 0.065 },
      { x: s * 0.07, y: s * 0.065 },
      "#FFF4DA",
      s * 0.024,
    );
    this.roundRect(
      -s * 0.064,
      s * 0.095,
      s * 0.052,
      s * 0.055,
      s * 0.01,
      "#D5E9E2",
    );
    this.roundRect(
      s * 0.012,
      s * 0.095,
      s * 0.052,
      s * 0.055,
      s * 0.01,
      "#D5E9E2",
    );
    // A high contrast shape plate survives the fitted city scale.
    this.roundRect(
      -s * 0.065,
      s * 0.155,
      s * 0.13,
      s * 0.13,
      s * 0.025,
      "#FFF9E8",
    );
    this.emblem(0, s * 0.22, s * 0.1, cabin.color, DARK[cabin.color]);
    if (cabin.state === "returning")
      this.line(
        { x: -s * 0.075, y: s * 0.125 },
        { x: s * 0.075, y: s * 0.125 },
        "#FFF9E8",
        s * 0.018,
      );
    if (cabin.state === "servicing") {
      c.beginPath();
      c.arc(
        0,
        s * 0.19,
        s * 0.22,
        -Math.PI / 2,
        -Math.PI / 2 + Math.PI * 2 * (1 - cabin.serviceLeft / TUNE.service),
      );
      c.strokeStyle = "#FFFAE8";
      c.lineWidth = 2;
      c.stroke();
    }
    c.restore();
  }
  marker(w: World, r: Roof, v: ViewState) {
    const c = this.ctx,
      s = Math.max(44, this.scale),
      p = this.point(r.node),
      count = pending(w, r.id),
      threshold = r.large ? 10 : 6,
      warning = r.overload > 0;
    const x = p.x + s * 0.35,
      y = p.y - s * 0.67;
    c.save();
    if (warning) {
      const remaining = Math.max(0, Math.ceil(TUNE.grace - r.overload));
      this.circle(x, y, s * 0.32, "#F9F2E5");
      c.beginPath();
      c.arc(
        x,
        y,
        s * 0.29,
        -Math.PI / 2,
        -Math.PI / 2 + Math.PI * 2 * (1 - r.overload / TUNE.grace),
      );
      c.strokeStyle = "#D96755";
      c.lineWidth = Math.max(3, s * 0.055);
      c.stroke();
      this.text(String(count), x, y, s * 0.26, "#BC4D40", 700);
      this.roundRect(
        x - s * 0.3,
        y - s * 0.64,
        s * 0.6,
        s * 0.24,
        s * 0.09,
        "#D96755",
      );
      this.text(`${remaining}s`, x, y - s * 0.52, s * 0.15, "#FFFAEF", 700);
      if (!v.reduced && Math.sin(w.time * 6) > 0)
        this.text("!", x + s * 0.43, y, s * 0.25, "#D96755", 700);
    } else {
      this.roundRect(
        x - s * 0.235,
        y - s * 0.2,
        s * 0.47,
        s * 0.37,
        s * 0.17,
        "#FCF9F0",
        "#D9D6CA",
      );
      this.text(
        r.openedAt === null
          ? `${Math.max(0, Math.ceil(TUNE.stationGrace - (w.time - r.born)))}s`
          : String(count),
        x,
        y - s * 0.005,
        s * (r.openedAt === null ? 0.17 : 0.22),
        INK,
        700,
      );
    }
    this.poly(
      [
        { x: x - s * 0.04, y: y + s * 0.16 },
        { x: x + s * 0.07, y: y + s * 0.16 },
        { x: x - s * 0.05, y: y + s * 0.27 },
      ],
      "#FCF9F0",
    );
    const total = Math.min(count, threshold);
    for (let i = 0; i < threshold; i++) {
      const px = x + (i - (threshold - 1) / 2) * s * 0.075;
      this.circle(
        px,
        y + s * 0.33,
        s * 0.021,
        i < total ? COLORS[r.color] : "#D7D7CB",
      );
    }
    if (r.large)
      this.text("Ⅱ", p.x - s * 0.36, p.y - s * 0.55, s * 0.17, INK, 700);
    if (!v.reduced && w.time - r.pulse < 0.7) {
      const t = (w.time - r.pulse) / 0.7;
      c.globalAlpha = 1 - t;
      this.text(
        "+1",
        x + s * 0.42,
        y - s * 0.15 - t * s * 0.4,
        s * 0.24,
        COLORS[r.color],
        700,
      );
    }
    c.restore();
  }
}
