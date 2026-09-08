import { type World, type Node, node, xy } from "./model";
import { type ArtSurface } from "./art";
import { elevationAt } from "./elevation";

export interface SkySurface extends ArtSurface {
  width: number;
  height: number;
}
export interface SkyLot {
  node: Node;
  variant: number;
  height: number;
  depth: number;
}
export function skyHash(x: number, y: number, seed: number) {
  let n = Math.imul(x + 71, 374761393) ^ Math.imul(y + 83, 668265263) ^ seed;
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}

/** Layers of air frame the city; none participate in placement or simulation. */
export class Atmosphere {
  private seed = -1;
  private lots: SkyLot[] = [];
  constructor(private p: SkySurface) {}

  layout(seed: number) {
    if (this.seed !== seed) {
      this.seed = seed;
      this.lots = [];
      for (let y = 1; y < 22; y += 3)
        for (let x = 1; x < 32; x += 3) {
          if (skyHash(x, y, seed) > 0.85) continue;
          this.lots.push({
            node: node(x, y),
            variant: Math.floor(skyHash(x + 57, y - 11, seed) * 8),
            height: 0.12 + skyHash(x - 19, y + 31, seed) * 1.13,
            depth: 2.6 + skyHash(x + 12, y - 7, seed) * 3.6,
          });
        }
    }
    return this.lots;
  }

  private cloud(
    x: number,
    y: number,
    width: number,
    height: number,
    alpha: number,
    warm = false,
  ) {
    const c = this.p.ctx;
    c.save();
    c.translate(x, y);
    c.scale(width, height);
    c.globalAlpha = alpha;
    c.beginPath();
    c.moveTo(-0.53, 0.16);
    c.bezierCurveTo(-0.66, -0.01, -0.5, -0.24, -0.32, -0.19);
    c.bezierCurveTo(-0.36, -0.57, -0.01, -0.63, 0.12, -0.34);
    c.bezierCurveTo(0.27, -0.62, 0.59, -0.32, 0.46, -0.12);
    c.bezierCurveTo(0.74, -0.1, 0.7, 0.28, 0.45, 0.28);
    c.bezierCurveTo(0.19, 0.38, -0.31, 0.4, -0.53, 0.16);
    const g = c.createLinearGradient(0, -0.5, 0, 0.4);
    g.addColorStop(0, warm ? "#FAF3E4" : "#E9EDE4");
    g.addColorStop(0.5, warm ? "#F0EBDD" : "#D8E3DD");
    g.addColorStop(1, "#C0D2D0");
    c.fillStyle = g;
    c.fill();
    c.beginPath();
    c.moveTo(-0.49, -0.12);
    c.bezierCurveTo(-0.33, -0.19, -0.31, -0.13, -0.27, -0.13);
    c.bezierCurveTo(-0.28, -0.45, -0.02, -0.5, 0.1, -0.29);
    c.bezierCurveTo(0.23, -0.43, 0.41, -0.31, 0.43, -0.18);
    c.bezierCurveTo(0.21, -0.27, -0.09, -0.24, -0.49, -0.12);
    c.fillStyle = "#FFF8E826";
    c.fill();
    c.restore();
  }

  sky(time: number, reduced: boolean) {
    const p = this.p,
      c = p.ctx,
      w = p.width,
      h = p.height;
    const sky = c.createLinearGradient(0, 0, w * 0.45, h);
    sky.addColorStop(0, "#F5F0E5");
    sky.addColorStop(0.36, "#E2E7DE");
    sky.addColorStop(0.73, "#B5CED0");
    sky.addColorStop(1, "#91ADB9");
    c.fillStyle = sky;
    c.fillRect(0, 0, w, h);
    const sun = c.createRadialGradient(
      w * 0.22,
      h * 0.19,
      0,
      w * 0.22,
      h * 0.19,
      w * 0.55,
    );
    sun.addColorStop(0, "#FFF4DB99");
    sun.addColorStop(1, "#FFF4DB00");
    c.fillStyle = sun;
    c.fillRect(0, 0, w, h);
    // Distant spires establish the scale before the playable skyline.
    c.save();
    c.globalAlpha = 0.1;
    for (let i = 0; i < 13; i++) {
      const x = w * (0.02 + i * 0.085),
        y = h * (0.4 + skyHash(i, 4, 119) * 0.13),
        tall = h * (0.05 + skyHash(i, 7, 119) * 0.15),
        wide = w * (0.007 + skyHash(i, 3, 119) * 0.009);
      c.fillStyle = "#809EAA";
      c.beginPath();
      c.moveTo(x - wide, y + tall);
      c.lineTo(x - wide * 0.65, y);
      c.lineTo(x - wide * 0.48, y);
      c.lineTo(x - wide * 0.35, y - tall * 0.14);
      c.lineTo(x + wide * 0.2, y - tall * 0.14);
      c.lineTo(x + wide * 0.3, y);
      c.lineTo(x + wide * 0.7, y);
      c.lineTo(x + wide, y + tall);
      c.fill();
    }
    c.restore();
    const drift = reduced ? 0 : Math.sin(time * 0.025) * w * 0.009;
    this.cloud(w * 0.03 + drift, h * 0.4, w * 0.47, h * 0.16, 0.52, true);
    this.cloud(w * 0.79 - drift, h * 0.3, w * 0.38, h * 0.24, 0.52, true);
    this.cloud(w * 0.48 + drift, h * 0.53, w * 0.65, h * 0.14, 0.28);
    this.cloud(w * 0.98 + drift, h * 0.61, w * 0.34, h * 0.21, 0.38);
    // Soft vertical shafts through the cloud sea, kept behind all infrastructure.
    const shaft = c.createLinearGradient(0, h * 0.2, 0, h);
    shaft.addColorStop(0, "#FFF6DE00");
    shaft.addColorStop(0.5, "#FFF6DE10");
    shaft.addColorStop(1, "#FFF6DE00");
    p.poly(
      [
        { x: w * 0.16, y: 0 },
        { x: w * 0.34, y: 0 },
        { x: w * 0.64, y: h },
        { x: w * 0.24, y: h },
      ],
      shaft,
    );
  }

  rift(w: World, dragging: boolean) {
    const p = this.p,
      c = p.ctx,
      points = [...w.water]
        .map(xy)
        .filter((q) => q.y >= w.bounds.minY && q.y <= w.bounds.maxY)
        .sort((a, b) => a.y - b.y);
    if (!points.length) return;
    // Wind streaks follow the actual unbuildable rift, revealing the crossing rule.
    for (const q of points)
      if (q.y % 3 === 0) {
        const a = p.project(q.x - 0.18, q.y, -0.65),
          b = p.project(q.x + 0.2, q.y + 0.32, -0.65);
        p.line(a, b, "#EFF5E5AA", Math.max(0.7, p.scale * 0.018));
      }
    if (dragging)
      for (const q of points) {
        const pos = p.project(q.x, q.y, 1.08 + elevationAt(q.x, q.y, w.seed));
        p.circle(pos.x, pos.y, 2, "#79A8B8");
      }
  }

  foreground(time: number, reduced: boolean) {
    const p = this.p,
      c = p.ctx,
      w = p.width,
      h = p.height,
      drift = reduced ? 0 : Math.sin(time * 0.018) * w * 0.012;
    // A transparent veil dissolves roots; the roofs and cables are painted afterward.
    const veil = c.createLinearGradient(0, h * 0.56, 0, h);
    veil.addColorStop(0, "#D1DFD900");
    veil.addColorStop(0.52, "#D0DFDB38");
    veil.addColorStop(1, "#D8E3DBB8");
    c.fillStyle = veil;
    c.fillRect(0, h * 0.56, w, h * 0.44);
    this.cloud(w * 0.05 + drift, h * 0.9, w * 0.6, h * 0.2, 0.62, true);
    this.cloud(w * 0.63 - drift, h * 1.0, w * 0.76, h * 0.29, 0.63);
    this.cloud(w * 1.04 + drift, h * 0.88, w * 0.5, h * 0.19, 0.72, true);
  }
}
