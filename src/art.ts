import { type Roof, type World, xy } from "./model";
import { skyHash } from "./atmosphere";

export const TRANSIT_HEIGHT = 1.08;
export const COLORS = ["#E77862", "#D4AC47", "#469E98"];
export const SHADE = ["#B95443", "#A17C30", "#327774"];
type Point = { x: number; y: number };
/** Shared drawing surface. Art has no access to simulation mutations. */
export interface ArtSurface {
  ctx: CanvasRenderingContext2D;
  scale: number;
  project(x: number, y: number, z?: number): Point;
  poly(
    points: Point[],
    fill: string | CanvasGradient,
    stroke?: string,
    lw?: number,
  ): void;
  groundRect(
    x: number,
    y: number,
    w: number,
    h: number,
    fill: string,
    z?: number,
  ): void;
  line(a: Point, b: Point, color: string, width: number): void;
  circle(
    x: number,
    y: number,
    r: number,
    fill: string,
    stroke?: string,
    width?: number,
  ): void;
  roundRect(
    x: number,
    y: number,
    w: number,
    h: number,
    r: number,
    fill: string,
    stroke?: string,
  ): void;
  emblem(x: number, y: number, size: number, color: number, fill: string): void;
}

/** Seeded sky-city architecture with separate foundation and rooftop passes. */
export class CityArt {
  lift = 0;
  time = 0;
  reduced = false;
  layer: "all" | "foundations" | "caps" = "all";
  private p: ArtSurface;
  constructor(surface: ArtSurface) {
    this.p = {
      get ctx() {
        return surface.ctx;
      },
      get scale() {
        return surface.scale;
      },
      project: (x, y, z = TRANSIT_HEIGHT) =>
        surface.project(x, y, z + this.lift),
      poly: surface.poly.bind(surface),
      line: surface.line.bind(surface),
      circle: surface.circle.bind(surface),
      roundRect: surface.roundRect.bind(surface),
      emblem: surface.emblem.bind(surface),
      groundRect: (x, y, w, h, fill, z = 0) =>
        this.p.poly(
          [
            this.p.project(x, y, z),
            this.p.project(x + w, y, z),
            this.p.project(x + w, y + h, z),
            this.p.project(x, y + h, z),
          ],
          fill,
        ),
    };
  }
  box(
    x: number,
    y: number,
    w: number,
    h: number,
    z: number,
    base: number,
    top = "#EEEADF",
    front = "#CBCABE",
    side = "#AFB5AA",
  ) {
    const p = this.p,
      points = [
        p.project(x, y, z),
        p.project(x + w, y, z),
        p.project(x + w, y + h, z),
        p.project(x, y + h, z),
      ];
    p.poly(
      [
        points[3],
        points[2],
        p.project(x + w, y + h, base),
        p.project(x, y + h, base),
      ],
      front,
    );
    p.poly(
      [
        points[1],
        points[2],
        p.project(x + w, y + h, base),
        p.project(x + w, y, base),
      ],
      side,
    );
    p.poly(points, top);
    return points;
  }
  spire(
    x: number,
    y: number,
    w: number,
    h: number,
    top: number,
    depth: number,
    variant = 0,
  ) {
    if (this.layer === "caps") return;
    const p = this.p,
      c = p.ctx,
      s = p.scale,
      bottom = top - depth;
    const corners = (z: number, inset = 0) => [
      p.project(x + inset, y + inset, z),
      p.project(x + w - inset, y + inset, z),
      p.project(x + w - inset, y + h - inset, z),
      p.project(x + inset, y + h - inset, z),
    ];
    const a = corners(top),
      b = corners(bottom, Math.min(w, h) * 0.18);
    const light = c.createLinearGradient(0, a[3].y, 0, b[3].y);
    light.addColorStop(
      0,
      ["#D6CFB7", "#C9D4BB", "#CDD1C2", "#D6C8B6"][variant % 4],
    );
    light.addColorStop(0.4, "#AEC4B8");
    light.addColorStop(0.82, "#9CB8B4AA");
    light.addColorStop(1, "#93B3B400");
    const dark = c.createLinearGradient(0, a[1].y, 0, b[2].y);
    dark.addColorStop(0, "#8CAEA5");
    dark.addColorStop(0.4, "#739B9B");
    dark.addColorStop(0.84, "#85A8ADAA");
    dark.addColorStop(1, "#8BADB200");
    p.poly([a[3], a[2], b[2], b[3]], light);
    p.poly([a[1], a[2], b[2], b[1]], dark);
    // Recessed ribs and sparse tall windows give each shaft an architectural rhythm.
    c.save();
    for (let row = 0; row < Math.floor(depth / 0.42) - 1; row++) {
      const z = top - 0.28 - row * 0.42,
        t = (top - z) / depth,
        inset = Math.min(w, h) * 0.18 * t;
      c.globalAlpha = Math.max(0, 0.4 * (1 - t));
      for (let col = 0; col < (w > 0.6 ? 3 : 1); col++) {
        const px = x + inset + w * 0.16 + col * w * 0.24,
          ww = w * 0.08;
        p.poly(
          [
            p.project(px, y + h - inset, z),
            p.project(px + ww, y + h - inset, z),
            p.project(px + ww, y + h - inset, z - 0.18),
            p.project(px, y + h - inset, z - 0.18),
          ],
          "#608C89",
        );
      }
    }
    c.globalAlpha = 0.32;
    for (const t of [0.12, 0.87])
      p.line(
        p.project(x + w * t, y + h, top - 0.04),
        p.project(
          x + w * (0.18 + t * 0.64),
          y + h - h * 0.18,
          bottom + depth * 0.25,
        ),
        "#E6E3C5",
        s * 0.018,
      );
    c.restore();
    // Cantilevered courses break the otherwise uniform vertical silhouette.
    if (w > 0.6) {
      const z = top - (variant % 2 ? 0.66 : 1.12);
      this.box(
        x - 0.05,
        y - 0.05,
        w + 0.1,
        h + 0.1,
        z + 0.065,
        z,
        "#DCDAC4",
        "#B9C7B5",
        "#91ABA0",
      );
      if (variant % 3 === 0) {
        this.planter(x + 0.05, y + h - 0.1, w * 0.55, z + 0.07);
      }
    }
    this.box(
      x - 0.055,
      y - 0.055,
      w + 0.11,
      h + 0.11,
      top + 0.07,
      top,
      "#EEE9D2",
      "#D0D1B8",
      "#A3B9A6",
    );
    // Hanging roots and garden tendrils reinforce the floating silhouette.
    if (w > 0.6 && variant % 2 === 0)
      for (let i = 0; i < 2; i++) {
        const px = x + w * (0.18 + i * 0.49),
          z = top - 0.1;
        const a = p.project(px, y + h + 0.02, z),
          b = p.project(px + 0.04, y + h + 0.02, z - 0.32 - i * 0.12);
        c.beginPath();
        c.moveTo(a.x, a.y);
        c.quadraticCurveTo(a.x - s * 0.045, a.y + s * 0.2, b.x, b.y);
        c.strokeStyle = "#739B7B";
        c.lineWidth = s * 0.021;
        c.stroke();
        for (let j = 1; j <= 3; j++) {
          const t = j / 4;
          p.circle(
            a.x + (b.x - a.x) * t + (j % 2 ? -0.025 : 0.025) * s,
            a.y + (b.y - a.y) * t,
            s * 0.028,
            j % 2 ? "#91B38B" : "#71997C",
          );
        }
      }
  }
  windows(
    x: number,
    y: number,
    w: number,
    h: number,
    z: number,
    floors: number,
    cols: number,
    tint = "#8CABA7",
  ) {
    const p = this.p;
    for (let row = 0; row < floors; row++) {
      const level = 0.12 + row * 0.22;
      if (level + 0.12 > z - 0.045) continue;
      for (let col = 0; col < cols; col++) {
        const at = x + 0.085 + ((w - 0.13) * col) / cols,
          ww = ((w - 0.17) / cols) * 0.54;
        p.poly(
          [
            p.project(at, y + h, level + 0.115),
            p.project(at + ww, y + h, level + 0.115),
            p.project(at + ww, y + h, level),
            p.project(at, y + h, level),
          ],
          tint,
        );
        p.line(
          p.project(at, y + h, level + 0.11),
          p.project(at + ww, y + h, level + 0.11),
          "#F5EEDC",
          p.scale * 0.018,
        );
      }
      for (let col = 0; col < 2; col++) {
        const at = y + 0.09 + (col * (h - 0.12)) / 2;
        p.poly(
          [
            p.project(x + w, at, level + 0.115),
            p.project(x + w, at + 0.12, level + 0.115),
            p.project(x + w, at + 0.12, level),
            p.project(x + w, at, level),
          ],
          "#79948F",
        );
      }
    }
  }
  rail(
    x: number,
    y: number,
    w: number,
    h: number,
    z: number,
    color = "#F8F5E8",
  ) {
    const p = this.p,
      s = p.scale;
    for (const [a, b] of [
      [
        [x, y],
        [x + w, y],
      ],
      [
        [x + w, y],
        [x + w, y + h],
      ],
      [
        [x, y + h],
        [x + w, y + h],
      ],
    ] as [number[], number[]][]) {
      p.line(
        p.project(a[0], a[1], z + 0.1),
        p.project(b[0], b[1], z + 0.1),
        color,
        Math.max(0.7, s * 0.023),
      );
      for (let i = 0; i <= 4; i++) {
        const t = i / 4,
          px = a[0] + (b[0] - a[0]) * t,
          py = a[1] + (b[1] - a[1]) * t;
        p.line(
          p.project(px, py, z),
          p.project(px, py, z + 0.1),
          color,
          Math.max(0.6, s * 0.015),
        );
      }
    }
  }
  shrub(x: number, y: number, z: number, size = 0.1) {
    const p = this.p,
      s = p.scale,
      q = p.project(x, y, z);
    p.circle(q.x + s * 0.028, q.y + s * 0.015, s * size, "#6D8870");
    p.circle(q.x - s * 0.025, q.y - s * 0.025, s * size * 0.9, "#91AD83");
    p.circle(q.x - s * 0.036, q.y - s * 0.045, s * size * 0.5, "#B1C392");
  }
  planter(x: number, y: number, w: number, z: number) {
    this.box(x, y, w, 0.12, z + 0.07, z, "#B4B88E", "#A7987F", "#8D8B73");
    for (let i = 0; i < Math.max(1, Math.floor(w / 0.13)); i++)
      this.shrub(x + 0.06 + i * 0.13, y + 0.06, z + 0.095, 0.067);
  }
  tree(x: number, y: number, size = 0.2, z = 0) {
    const p = this.p,
      s = p.scale,
      g = p.project(x, y, z);
    p.ctx.save();
    p.ctx.globalAlpha *= 0.12;
    p.circle(g.x + s * 0.13, g.y + s * 0.06, size * s, "#526F5F");
    p.ctx.restore();
    p.line(g, p.project(x, y, z + 0.33), "#8F8A71", s * 0.035);
    p.line(
      p.project(x, y, z + 0.2),
      p.project(x - 0.08, y, z + 0.31),
      "#8F8A71",
      s * 0.024,
    );
    this.shrub(x, y, z + 0.42, size);
    this.shrub(x + 0.05, y + 0.025, z + 0.48, size * 0.72);
  }
  solar(x: number, y: number, z: number, w = 0.3) {
    const p = this.p;
    this.box(x, y, w, 0.18, z + 0.075, z, "#79999C", "#748A8A", "#657F80");
    for (let i = 1; i < 3; i++)
      p.line(
        p.project(x + (w * i) / 3, y, z + 0.076),
        p.project(x + (w * i) / 3, y + 0.18, z + 0.076),
        "#B9CBCA",
        p.scale * 0.013,
      );
    p.line(
      p.project(x, y + 0.09, z + 0.076),
      p.project(x + w, y + 0.09, z + 0.076),
      "#B9CBCA",
      p.scale * 0.012,
    );
  }
  pergola(x: number, y: number, z: number, w = 0.35) {
    const p = this.p,
      s = p.scale;
    for (const [dx, dy] of [
      [0, 0],
      [w, 0],
      [w, 0.25],
      [0, 0.25],
    ])
      p.line(
        p.project(x + dx, y + dy, z),
        p.project(x + dx, y + dy, z + 0.19),
        "#B1A07B",
        s * 0.026,
      );
    for (let i = 0; i < 5; i++)
      p.line(
        p.project(x + (w * i) / 4, y - 0.02, z + 0.19),
        p.project(x + (w * i) / 4, y + 0.28, z + 0.19),
        "#DBCA9F",
        s * 0.031,
      );
  }
  pitched(
    x: number,
    y: number,
    w: number,
    h: number,
    z: number,
    color: string,
    dark: string,
  ) {
    const p = this.p,
      ridge = 0.15;
    p.poly(
      [
        p.project(x, y, z),
        p.project(x + w, y, z),
        p.project(x + w, y + h / 2, z + ridge),
        p.project(x, y + h / 2, z + ridge),
      ],
      color,
    );
    p.poly(
      [
        p.project(x, y + h / 2, z + ridge),
        p.project(x + w, y + h / 2, z + ridge),
        p.project(x + w, y + h, z),
        p.project(x, y + h, z),
      ],
      dark,
    );
    p.poly(
      [
        p.project(x + w, y, z),
        p.project(x + w, y + h / 2, z + ridge),
        p.project(x + w, y + h, z),
      ],
      "#D9D0B9",
    );
    p.line(
      p.project(x, y + h / 2, z + ridge),
      p.project(x + w, y + h / 2, z + ridge),
      "#F5DAB9",
      p.scale * 0.021,
    );
    for (let i = 1; i < 5; i++)
      p.line(
        p.project(x + (w * i) / 5, y + h / 2, z + ridge + 0.004),
        p.project(x + (w * i) / 5, y + h, z + 0.004),
        color,
        p.scale * 0.012,
      );
  }
  tank(x: number, y: number, z: number) {
    const p = this.p,
      s = p.scale;
    for (const dx of [-0.07, 0.07])
      p.line(
        p.project(x + dx, y, z),
        p.project(x + dx, y, z + 0.12),
        "#8C9385",
        s * 0.022,
      );
    const q = p.project(x, y, z + 0.21);
    p.roundRect(
      q.x - s * 0.1,
      q.y,
      s * 0.2,
      s * 0.14,
      s * 0.025,
      "#B4BBA8",
      "#969F92",
    );
    p.ctx.beginPath();
    p.ctx.ellipse(q.x, q.y, s * 0.1, s * 0.045, 0, 0, Math.PI * 2);
    p.ctx.fillStyle = "#DCE0C9";
    p.ctx.fill();
    p.line(
      { x: q.x - s * 0.09, y: q.y + s * 0.085 },
      { x: q.x + s * 0.09, y: q.y + s * 0.085 },
      "#8D9A8B",
      s * 0.014,
    );
  }
  decoration(
    x: number,
    y: number,
    variant: number,
    height: number,
    depth = 3.8,
  ) {
    const p = this.p,
      s = p.scale,
      w =
        variant >= 6
          ? 1.62
          : variant === 3
            ? 0.94
            : variant === 0
              ? 0.78
              : 0.68,
      h = variant >= 6 ? 1.12 : variant === 3 ? 0.78 : 0.65,
      bx = x - w / 2,
      by = y - h / 2;
    const fronts = ["#C9BFA8", "#BEC9B6", "#D1BFAF", "#B5C8BF", "#D2C8AB"];
    this.spire(bx, by, w, h, 0.035, depth, variant);
    if (this.layer === "foundations") return;
    this.box(
      bx - 0.035,
      by - 0.035,
      w + 0.07,
      h + 0.07,
      0.035,
      0,
      "#E4E1D2",
      "#CCCDBF",
      "#C0C4B5",
    );
    this.box(
      bx,
      by,
      w,
      h,
      height,
      0.035,
      "#E6E3D5",
      fronts[variant % 5],
      "#ADB7AA",
    );
    this.windows(bx, by, w, h, height, Math.ceil(height / 0.22), 3, "#A1B5AC");
    this.box(
      bx - 0.018,
      by - 0.018,
      w + 0.036,
      h + 0.036,
      height + 0.045,
      height,
      "#ECE9DD",
      "#D1D2C3",
      "#C0C6B9",
    );
    const z = height + 0.048;
    if (variant === 0) {
      this.pitched(
        bx + 0.03,
        by + 0.03,
        w - 0.06,
        h - 0.06,
        z,
        "#C8B2A0",
        "#A49487",
      );
    } else if (variant === 1) {
      p.groundRect(
        bx + 0.055,
        by + 0.055,
        w - 0.11,
        h - 0.11,
        "#BAC8A2",
        z + 0.003,
      );
      this.pergola(bx + 0.07, by + 0.05, z, 0.29);
      this.planter(bx + 0.07, by + h - 0.18, 0.37, z);
    } else if (variant === 2) {
      this.solar(bx + 0.06, by + 0.07, z, 0.39);
      this.box(
        bx + 0.39,
        by + 0.34,
        0.16,
        0.19,
        z + 0.1,
        z,
        "#D6D4C7",
        "#B3BAAC",
        "#A3AEA2",
      );
    } else if (variant === 3) {
      this.observatory(x, y - 0.08, z);
      this.planter(bx + 0.1, by + h - 0.17, 0.5, z);
    } else if (variant === 4) {
      this.pergola(bx + 0.08, by + 0.09, z, 0.38);
      this.planter(bx + 0.06, by + 0.44, 0.43, z);
    } else if (variant >= 6) {
      p.groundRect(
        bx + 0.06,
        by + 0.06,
        w - 0.12,
        h - 0.12,
        "#B9CAA4",
        z + 0.003,
      );
      this.box(
        bx + 0.1,
        by + 0.08,
        0.57,
        0.51,
        z + 0.35,
        z,
        "#E8E2CF",
        "#C4CAB6",
        "#A1B5A8",
      );
      this.pitched(
        bx + 0.07,
        by + 0.05,
        0.63,
        0.57,
        z + 0.35,
        "#ABB8A7",
        "#8FA294",
      );
      this.pergola(bx + 0.93, by + 0.08, z, 0.46);
      this.planter(bx + 0.12, by + h - 0.2, w - 0.25, z);
      this.tree(bx + 1.12, by + 0.7, 0.15, z);
      if (variant === 7) this.observatory(bx + 0.37, by + 0.33, z + 0.39);
    } else {
      this.solar(bx + 0.07, by + 0.07, z, 0.25);
      this.windmill(x + 0.08, y + 0.08, z);
    }
    if (variant !== 0)
      this.rail(bx + 0.02, by + 0.02, w - 0.04, h - 0.04, z, "#D9DDCC");
    const door = p.project(x - 0.04, by + h, 0.16);
    p.roundRect(door.x, door.y, s * 0.075, s * 0.12, 1, "#919F91");
  }
  observatory(x: number, y: number, z: number) {
    const p = this.p,
      c = p.ctx,
      s = p.scale;
    this.box(
      x - 0.25,
      y - 0.24,
      0.5,
      0.48,
      z + 0.22,
      z,
      "#E9E6D5",
      "#CED9C7",
      "#9FB9AD",
    );
    for (const dx of [-0.17, 0, 0.17])
      p.line(
        p.project(x + dx, y + 0.245, z + 0.03),
        p.project(x + dx, y + 0.245, z + 0.18),
        "#80A7A1",
        s * 0.062,
      );
    const q = p.project(x, y, z + 0.23),
      r = s * 0.31;
    c.beginPath();
    c.moveTo(q.x - r, q.y);
    c.bezierCurveTo(
      q.x - r,
      q.y - r * 1.23,
      q.x + r,
      q.y - r * 1.23,
      q.x + r,
      q.y,
    );
    c.bezierCurveTo(
      q.x + r * 0.65,
      q.y + r * 0.32,
      q.x - r * 0.65,
      q.y + r * 0.32,
      q.x - r,
      q.y,
    );
    const g = c.createLinearGradient(q.x - r, q.y, q.x + r, q.y);
    g.addColorStop(0, "#B8CEAE");
    g.addColorStop(0.42, "#90B9A6");
    g.addColorStop(1, "#639C98");
    c.fillStyle = g;
    c.fill();
    p.line(
      { x: q.x - r, y: q.y },
      { x: q.x + r, y: q.y },
      "#DDE6C9",
      s * 0.028,
    );
    const top = { x: q.x, y: q.y - r * 0.92 };
    for (const dx of [-0.55, 0.55]) {
      c.beginPath();
      c.moveTo(top.x, top.y);
      c.quadraticCurveTo(
        q.x + dx * r,
        q.y - r * 0.4,
        q.x + dx * r,
        q.y + r * 0.15,
      );
      c.strokeStyle = "#D1DEC4";
      c.lineWidth = s * 0.016;
      c.stroke();
    }
    p.line(top, { x: top.x, y: top.y - s * 0.18 }, "#8A9C82", s * 0.02);
    p.circle(top.x, top.y - s * 0.18, s * 0.035, "#DAC67D");
  }
  windmill(x: number, y: number, z: number) {
    const p = this.p,
      s = p.scale,
      hub = p.project(x, y, z + 0.56),
      foot = p.project(x, y, z);
    p.line(foot, hub, "#97AAA0", s * 0.037);
    p.circle(hub.x, hub.y, s * 0.055, "#E8E8D5");
    for (let i = 0; i < 3; i++) {
      const a = (this.reduced ? 0.35 : this.time * 0.4) + (i * Math.PI * 2) / 3,
        dx = Math.cos(a),
        dy = Math.sin(a),
        nx = -dy,
        ny = dx;
      p.poly(
        [
          { x: hub.x + dx * s * 0.04, y: hub.y + dy * s * 0.04 },
          {
            x: hub.x + dx * s * 0.38 + nx * s * 0.012,
            y: hub.y + dy * s * 0.38 + ny * s * 0.012,
          },
          {
            x: hub.x + dx * s * 0.32 - nx * s * 0.035,
            y: hub.y + dy * s * 0.32 - ny * s * 0.035,
          },
          {
            x: hub.x + dx * s * 0.07 - nx * s * 0.045,
            y: hub.y + dy * s * 0.07 - ny * s * 0.045,
          },
        ],
        "#F0EAD4",
        "#C7D1BA",
        s * 0.009,
      );
    }
  }
  park(x: number, y: number, variant: number) {
    const p = this.p;
    this.spire(x - 0.46, y - 0.46, 0.92, 0.92, 0, 2.5 + variant * 0.1, variant);
    if (this.layer === "foundations") return;
    this.box(
      x - 0.46,
      y - 0.46,
      0.92,
      0.92,
      0.025,
      0,
      "#D2DABB",
      "#C4CDB0",
      "#BCC9AA",
    );
    p.groundRect(x - 0.46, y - 0.05, 0.92, 0.12, "#E8E4D0", 0.029);
    this.tree(x - 0.21, y - 0.21, 0.2);
    this.tree(x + 0.23, y + 0.21, 0.16);
    if (variant % 2 === 0) {
      this.box(
        x + 0.12,
        y - 0.24,
        0.25,
        0.08,
        0.1,
        0.04,
        "#B6A67B",
        "#9C926F",
        "#879171",
      );
      this.planter(x - 0.35, y + 0.24, 0.23, 0.026);
    }
  }
  support(x: number, y: number, junction: boolean) {
    const p = this.p,
      s = p.scale,
      z = junction ? 0.38 : 0.27;
    this.spire(
      x - 0.12,
      y - 0.12,
      0.24,
      0.24,
      0,
      2.2 + skyHash(Math.round(x), Math.round(y), 311) * 2.2,
      1,
    );
    if (this.layer === "foundations") return;
    this.box(
      x - 0.17,
      y - 0.15,
      0.34,
      0.3,
      z,
      0,
      "#D9DDD0",
      "#BEC6B8",
      "#9CAA9E",
    );
    this.box(
      x - 0.2,
      y - 0.18,
      0.4,
      0.36,
      z + 0.04,
      z,
      "#EDF0E2",
      "#CCD6C7",
      "#AFBDAF",
    );
    const bottom = p.project(x, y, z + 0.04),
      top = p.project(x, y, TRANSIT_HEIGHT);
    p.line(bottom, top, "#80958A", s * 0.048);
    p.line(
      { x: bottom.x - s * 0.05, y: bottom.y },
      { x: top.x - s * 0.028, y: top.y + s * 0.09 },
      "#B4C2B1",
      s * 0.021,
    );
    p.line(
      { x: top.x - s * 0.16, y: top.y },
      { x: top.x + s * 0.16, y: top.y },
      "#566F69",
      s * 0.045,
    );
    for (const offset of [-0.11, 0.11])
      p.circle(
        top.x + offset * s,
        top.y,
        s * 0.035,
        "#F3EFDE",
        "#536B65",
        s * 0.02,
      );
  }
  roof(w: World, r: Roof, grow: number) {
    const p = this.p,
      s = p.scale,
      { x, y } = xy(r.node),
      home = r.kind === "home",
      width = home ? 0.83 : 1.27,
      depth = home ? 0.79 : 1.07;
    const bx = x - width / 2,
      by = y - depth / 2,
      z =
        (home
          ? 0.43 + skyHash(x, y, w.seed) * 0.42
          : r.large
            ? 0.86
            : 0.62 + skyHash(x, y, w.seed) * 0.29) *
        (0.45 + 0.55 * grow),
      color = COLORS[r.color],
      dark = SHADE[r.color];
    this.spire(
      bx,
      by,
      width,
      depth,
      0,
      3.4 + skyHash(x + 41, y - 13, w.seed) * 2.9,
      r.id % 4,
    );
    if (this.layer === "foundations") return;
    this.box(
      bx - 0.045,
      by - 0.035,
      width + 0.09,
      depth + 0.07,
      0.045,
      0,
      "#E3DDC8",
      "#CBC6B4",
      "#BCC3B1",
    );
    this.box(
      bx,
      by,
      width,
      depth,
      z,
      0.045,
      "#F8F3E4",
      home ? "#DCD2BA" : "#D4D7C9",
      "#AFBFB3",
    );
    this.windows(bx, by, width, depth, z, 4, home ? 3 : 5, "#82AAA6");
    // Cornice and colored facade ribbon make playable roofs read at city zoom.
    this.box(
      bx - 0.025,
      by - 0.025,
      width + 0.05,
      depth + 0.05,
      z + 0.035,
      z,
      color,
      dark,
      dark,
    );
    this.box(
      bx,
      by,
      width,
      depth,
      z + 0.065,
      z + 0.035,
      "#F5F0DE",
      "#E2DDC7",
      "#C7D0BA",
    );
    const deck = z + 0.07;
    if (home) {
      this.box(
        bx + 0.06,
        by + 0.055,
        0.5,
        0.36,
        deck + 0.13,
        deck,
        color,
        dark,
        dark,
      );
      this.pitched(bx + 0.035, by + 0.03, 0.55, 0.41, deck + 0.13, color, dark);
      this.planter(bx + 0.07, by + depth - 0.17, 0.2, deck);
      this.pergola(bx + 0.58, by + 0.045, deck, 0.15);
      const emblem = p.project(x - 0.105, y - 0.22, deck + 0.31);
      p.emblem(emblem.x, emblem.y, s * 0.21, r.color, "#FFF7E8");
      let parked = 0;
      for (const cabin of w.cabins.values())
        if (cabin.home === r.id && cabin.state === "idle") {
          const q = p.project(
            x - 0.03 + parked++ * 0.22,
            y + 0.22,
            deck + 0.025,
          );
          p.roundRect(
            q.x - s * 0.085,
            q.y - s * 0.045,
            s * 0.17,
            s * 0.115,
            s * 0.03,
            color,
            dark,
          );
          p.roundRect(
            q.x - s * 0.055,
            q.y - s * 0.025,
            s * 0.11,
            s * 0.035,
            1,
            "#DDF0E8",
          );
        }
    } else {
      // Glass station hall, open boarding apron, cantilevered colored canopy.
      this.box(
        bx + 0.11,
        by + 0.07,
        width - 0.22,
        0.36,
        deck + 0.2,
        deck,
        "#DAEAE1",
        "#77AAA5",
        "#61958F",
      );
      for (let i = 1; i < 5; i++)
        p.line(
          p.project(bx + 0.11 + ((width - 0.22) * i) / 5, by + 0.43, deck),
          p.project(
            bx + 0.11 + ((width - 0.22) * i) / 5,
            by + 0.43,
            deck + 0.2,
          ),
          "#C9E0D3",
          s * 0.025,
        );
      this.box(
        bx + 0.065,
        by + 0.025,
        width - 0.13,
        0.43,
        deck + 0.255,
        deck + 0.215,
        color,
        dark,
        dark,
      );
      const emblem = p.project(x, y - 0.24, deck + 0.263);
      p.emblem(emblem.x, emblem.y, s * 0.28, r.color, "#FFF9E8");
      this.planter(bx + 0.055, by + depth - 0.17, 0.24, deck);
      this.planter(bx + width - 0.3, by + depth - 0.17, 0.24, deck);
      // Boarding marks are aligned with the logical terminal, never extra nodes.
      for (const dx of [-0.2, 0.2])
        p.groundRect(
          x + dx - 0.018,
          y + 0.09,
          0.036,
          0.2,
          "#E5BD64",
          deck + 0.003,
        );
      if (r.large) {
        this.solar(bx + 0.08, by + 0.07, deck + 0.26, 0.25);
        this.tank(bx + width - 0.19, by + 0.17, deck + 0.26);
      }
    }
    this.rail(bx + 0.015, by + 0.015, width - 0.03, depth - 0.03, deck);
    const port = p.project(x, y, TRANSIT_HEIGHT),
      foot = p.project(x, y, deck);
    p.line(foot, port, "#536F68", s * 0.04);
    p.circle(
      port.x,
      port.y,
      Math.max(5.5, s * 0.105),
      "#FBF7E7",
      "#536F68",
      Math.max(1, s * 0.023),
    );
    p.emblem(port.x, port.y, Math.max(5, s * 0.105), r.color, color);
  }
}
