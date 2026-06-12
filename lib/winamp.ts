// Renders a classic Winamp 2.x main window (275x116) from a skin spec.
// Drawing helpers are exported for reuse by the .wsz sprite-sheet generator.

export interface SkinSpec {
  skinName: string;
  vibe: string;
  colors: {
    bgDark: string;
    bgLight: string;
    accent: string;
    accent2: string;
    text: string;
    display: string;
    vis1: string;
    vis2: string;
  };
  texture: "scanlines" | "noise" | "checker" | "diagonal" | "gradient";
  shape?: SkinShape;
  trackTitle: string;
}

export type SkinShape = "classic" | "rounded" | "chamfered" | "jagged" | "melted";

export type SkinColors = SkinSpec["colors"];
export type Ctx = CanvasRenderingContext2D;

export const SKIN_W = 275;
export const SKIN_H = 116;

// --- tiny 3x5 pixel font (rows of 3-bit values, MSB = left pixel) ---
const FONT: Record<string, number[]> = {
  A: [2, 5, 7, 5, 5], B: [6, 5, 6, 5, 6], C: [3, 4, 4, 4, 3], D: [6, 5, 5, 5, 6],
  E: [7, 4, 6, 4, 7], F: [7, 4, 6, 4, 4], G: [3, 4, 5, 5, 3], H: [5, 5, 7, 5, 5],
  I: [7, 2, 2, 2, 7], J: [1, 1, 1, 5, 2], K: [5, 5, 6, 5, 5], L: [4, 4, 4, 4, 7],
  M: [5, 7, 7, 5, 5], N: [6, 5, 5, 5, 5], O: [2, 5, 5, 5, 2], P: [6, 5, 6, 4, 4],
  Q: [2, 5, 5, 6, 3], R: [6, 5, 6, 5, 5], S: [3, 4, 2, 1, 6], T: [7, 2, 2, 2, 2],
  U: [5, 5, 5, 5, 7], V: [5, 5, 5, 5, 2], W: [5, 5, 7, 7, 5], X: [5, 5, 2, 5, 5],
  Y: [5, 5, 2, 2, 2], Z: [7, 1, 2, 4, 7],
  "0": [2, 5, 5, 5, 2], "1": [2, 6, 2, 2, 7], "2": [6, 1, 2, 4, 7], "3": [6, 1, 2, 1, 6],
  "4": [5, 5, 7, 1, 1], "5": [7, 4, 6, 1, 6], "6": [3, 4, 6, 5, 2], "7": [7, 1, 2, 2, 2],
  "8": [2, 5, 2, 5, 2], "9": [2, 5, 3, 1, 6],
  ".": [0, 0, 0, 0, 2], "-": [0, 0, 7, 0, 0], ":": [0, 2, 0, 2, 0], "'": [2, 2, 0, 0, 0],
  "/": [1, 1, 2, 4, 4], "&": [2, 5, 2, 5, 3], "!": [2, 2, 2, 0, 2], "?": [6, 1, 2, 0, 2],
  ",": [0, 0, 0, 2, 4], "(": [1, 2, 2, 2, 1], ")": [4, 2, 2, 2, 4], "_": [0, 0, 0, 0, 7],
  "+": [0, 2, 7, 2, 0], "=": [0, 7, 0, 7, 0], "[": [3, 2, 2, 2, 3], "]": [6, 2, 2, 2, 6],
  "^": [2, 5, 0, 0, 0], "%": [5, 1, 2, 4, 5], "$": [3, 6, 2, 3, 6], "#": [5, 7, 5, 7, 5],
  "@": [2, 5, 7, 4, 3], '"': [5, 5, 0, 0, 0], "*": [0, 5, 2, 5, 0], "\\": [4, 4, 2, 1, 1],
  " ": [0, 0, 0, 0, 0],
};

export function seededRand(seedText: string): () => number {
  let h = 1779033703;
  for (let i = 0; i < seedText.length; i++) {
    h = Math.imul(h ^ seedText.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return () => {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  };
}

export function shade(hex: string, f: number): string {
  const n = parseInt(hex.slice(1), 16);
  const ch = (v: number) => Math.max(0, Math.min(255, Math.round(v * f)));
  const r = ch((n >> 16) & 255), g = ch((n >> 8) & 255), b = ch(n & 255);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, "0")}`;
}

export function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function px(ctx: Ctx, x: number, y: number, w: number, h: number, color: string) {
  ctx.fillStyle = color;
  ctx.fillRect(x, y, w, h);
}

export function drawText(ctx: Ctx, str: string, x: number, y: number, color: string, scale = 1): number {
  let cx = x;
  for (const raw of str.toUpperCase()) {
    const glyph = FONT[raw] ?? FONT[" "];
    for (let r = 0; r < 5; r++) {
      for (let b = 0; b < 3; b++) {
        if (glyph[r] & (4 >> b)) px(ctx, cx + b * scale, y + r * scale, scale, scale, color);
      }
    }
    cx += 4 * scale;
  }
  return cx;
}

export function bevel(ctx: Ctx, c: SkinColors, x: number, y: number, w: number, h: number, raised: boolean) {
  const lite = raised ? shade(c.bgLight, 1.4) : shade(c.bgDark, 0.5);
  const dark = raised ? shade(c.bgDark, 0.5) : shade(c.bgLight, 1.4);
  px(ctx, x, y, w, 1, lite);
  px(ctx, x, y, 1, h, lite);
  px(ctx, x, y + h - 1, w, 1, dark);
  px(ctx, x + w - 1, y, 1, h, dark);
}

export function button(ctx: Ctx, c: SkinColors, x: number, y: number, w: number, h: number, pressed = false) {
  px(ctx, x, y, w, h, pressed ? shade(c.bgLight, 0.8) : c.bgLight);
  bevel(ctx, c, x, y, w, h, !pressed);
}

export function drawTransportIcon(
  ctx: Ctx,
  c: SkinColors,
  kind: "prev" | "play" | "pause" | "stop" | "next" | "eject",
  bx: number,
  by: number,
) {
  const ICON = shade(c.bgDark, 0.45);
  const tri = (x: number, y: number, dir: 1 | -1) => {
    for (let i = 0; i < 4; i++)
      px(ctx, dir === 1 ? x + i : x + 3 - i, y + i, 1, 8 - i * 2, ICON);
  };
  const cx = bx + 8, cy = by + 5;
  if (kind === "prev") { px(ctx, cx - 2, cy, 2, 8, ICON); tri(cx + 1, cy, -1); tri(cx + 5, cy, -1); }
  if (kind === "play") tri(cx + 2, cy, 1);
  if (kind === "pause") { px(ctx, cx, cy, 3, 8, ICON); px(ctx, cx + 5, cy, 3, 8, ICON); }
  if (kind === "stop") px(ctx, cx, cy + 1, 7, 7, ICON);
  if (kind === "next") { tri(cx - 1, cy, 1); tri(cx + 3, cy, 1); px(ctx, cx + 7, cy, 2, 8, ICON); }
  if (kind === "eject") { tri(bx + 7, by + 4, 1); px(ctx, bx + 5, by + 13, 10, 1, ICON); }
}

export function drawTitleBar(
  ctx: Ctx,
  c: SkinColors,
  name: string,
  ox: number,
  oy: number,
  width: number,
  active: boolean,
) {
  const dim = active ? 1 : 0.55;
  for (let y = 0; y < 14; y++)
    px(ctx, ox, oy + y, width, 1, shade(c.accent, (1.25 - y * 0.05) * dim));
  bevel(ctx, c, ox, oy, width, 14, true);
  for (const sx of [ox + 4, ox + width - 30]) {
    for (let y = 3; y <= 9; y += 3)
      px(ctx, sx, oy + y, sx === ox + 4 ? 60 : 8, 1, shade(c.accent, 0.6 * dim));
  }
  const title = name.slice(0, 24);
  const tw = title.length * 4;
  const tx = ox + Math.floor((width - tw) / 2);
  drawText(ctx, title, tx, oy + 4, shade(c.accent, 0.25));
  drawText(ctx, title, tx, oy + 3, active ? c.text : shade(c.text, 0.6));
  button(ctx, c, ox + width - 12, oy + 3, 9, 9);
  drawText(ctx, "X", ox + width - 9, oy + 5, shade(c.bgDark, 0.6));
  button(ctx, c, ox + width - 22, oy + 3, 9, 9);
  px(ctx, ox + width - 20, oy + 9, 5, 1, shade(c.bgDark, 0.6));
}

export function drawChassisTexture(
  ctx: Ctx,
  spec: SkinSpec,
  rand: () => number,
  x: number,
  y: number,
  w: number,
  h: number,
) {
  const c = spec.colors;
  px(ctx, x, y, w, h, c.bgDark);
  if (spec.texture === "scanlines") {
    for (let yy = y; yy < y + h; yy += 2) px(ctx, x, yy, w, 1, shade(c.bgDark, 0.8));
  } else if (spec.texture === "noise") {
    const count = Math.floor((w * h) / 20);
    for (let i = 0; i < count; i++) {
      const xx = x + Math.floor(rand() * w), yy = y + Math.floor(rand() * h);
      px(ctx, xx, yy, 1, 1, rand() > 0.5 ? shade(c.bgDark, 1.35) : shade(c.bgDark, 0.65));
    }
  } else if (spec.texture === "checker") {
    for (let yy = y; yy < y + h; yy += 4)
      for (let xx = x + ((Math.floor((yy - y) / 4) % 2) ? 0 : 4); xx < x + w; xx += 8)
        px(ctx, xx, yy, Math.min(4, x + w - xx), 4, shade(c.bgDark, 1.18));
  } else if (spec.texture === "diagonal") {
    for (let d = -h; d < w; d += 6)
      for (let yy = 0; yy < h; yy++) {
        const xx = d + yy;
        if (xx >= 0 && xx < w) px(ctx, x + xx, y + yy, Math.min(2, w - xx), 1, shade(c.bgDark, 1.15));
      }
  } else {
    for (let yy = 0; yy < h; yy++)
      px(ctx, x, y + yy, w, 1, shade(c.bgDark, 1.45 - (0.7 * yy) / h));
  }
}

// Window silhouette as a polygon (skin pixel coords), or null for the classic rectangle.
// Used both to mask the canvas preview and to emit REGION.TXT in the .wsz.
export function shapePolygon(shape: SkinShape | undefined): [number, number][] | null {
  const W = SKIN_W, H = SKIN_H;
  switch (shape) {
    case "rounded": {
      const r = 10;
      const pts: [number, number][] = [];
      const corner = (cx: number, cy: number, startDeg: number) => {
        for (let i = 0; i <= 4; i++) {
          const a = ((startDeg + i * 22.5) * Math.PI) / 180;
          pts.push([Math.round(cx + r * Math.cos(a)), Math.round(cy + r * Math.sin(a))]);
        }
      };
      corner(r, r, 180);          // top-left
      corner(W - r, r, 270);      // top-right
      corner(W - r, H - r, 0);    // bottom-right
      corner(r, H - r, 90);       // bottom-left
      return pts;
    }
    case "chamfered": {
      const c = 14;
      return [[c, 0], [W - c, 0], [W, c], [W, H - c], [W - c, H], [c, H], [0, H - c], [0, c]];
    }
    case "jagged": {
      const pts: [number, number][] = [[0, 0], [W, 0]];
      for (let i = 0; ; i++) {
        const x = Math.max(0, W - i * 11);
        pts.push([x, i % 2 ? H - 8 : H]);
        if (x === 0) break;
      }
      return pts;
    }
    case "melted": {
      const pts: [number, number][] = [[0, 0], [W, 0]];
      for (let i = 0; ; i++) {
        const x = Math.max(0, W - i * 5);
        pts.push([x, Math.min(H, H - 5 + Math.round(4 * Math.sin(x / 11)))]);
        if (x === 0) break;
      }
      return pts;
    }
    default:
      return null;
  }
}

function shapePath(shape: SkinShape | undefined): Path2D | null {
  const poly = shapePolygon(shape);
  if (!poly) return null;
  const p = new Path2D();
  p.moveTo(poly[0][0], poly[0][1]);
  for (let i = 1; i < poly.length; i++) p.lineTo(poly[i][0], poly[i][1]);
  p.closePath();
  return p;
}

export function renderSkin(canvas: HTMLCanvasElement, spec: SkinSpec, seedText: string) {
  canvas.width = SKIN_W;
  canvas.height = SKIN_H;
  const ctx = canvas.getContext("2d")!;
  const c = spec.colors;
  const rand = seededRand(seedText + spec.skinName);

  // ---- chassis + texture ----
  px(ctx, 0, 0, SKIN_W, SKIN_H, c.bgDark);
  drawChassisTexture(ctx, spec, rand, 0, 15, SKIN_W, SKIN_H - 15);

  // ---- title bar ----
  drawTitleBar(ctx, c, spec.skinName, 0, 0, SKIN_W, true);

  // ---- LCD time display ----
  px(ctx, 34, 24, 66, 16, "#000000");
  bevel(ctx, c, 34, 24, 66, 16, false);
  const mins = String(Math.floor(rand() * 60)).padStart(2, "0");
  const secs = String(Math.floor(rand() * 60)).padStart(2, "0");
  drawText(ctx, `${mins}:${secs}`, 42, 27, c.display, 2);
  // play indicator triangle
  px(ctx, 27, 27, 2, 6, c.display);
  px(ctx, 29, 28, 2, 4, c.display);
  px(ctx, 31, 29, 1, 2, c.display);

  // ---- visualizer ----
  px(ctx, 24, 43, 76, 17, "#000000");
  bevel(ctx, c, 24, 43, 76, 17, false);
  for (let i = 0; i < 18; i++) {
    const h = 2 + Math.floor(rand() * 13);
    for (let y = 0; y < h; y++) {
      const t = y / 14;
      px(ctx, 26 + i * 4, 58 - y, 3, 1, t > 0.65 ? c.vis2 : c.vis1);
    }
    px(ctx, 26 + i * 4, 58 - h - 1 - Math.floor(rand() * 2), 3, 1, c.vis2);
  }

  // ---- marquee ----
  px(ctx, 108, 24, 157, 12, "#000000");
  bevel(ctx, c, 108, 24, 157, 12, false);
  ctx.save();
  ctx.beginPath();
  ctx.rect(110, 26, 153, 8);
  ctx.clip();
  drawText(ctx, spec.trackTitle.slice(0, 38), 112, 28, c.text);
  ctx.restore();

  // ---- kbps / khz ----
  px(ctx, 108, 41, 30, 9, "#000000");
  drawText(ctx, "192", 111, 43, c.display);
  drawText(ctx, "KBPS", 124, 43, shade(c.text, 0.7));
  px(ctx, 146, 41, 26, 9, "#000000");
  drawText(ctx, "44", 149, 43, c.display);
  drawText(ctx, "KHZ", 159, 43, shade(c.text, 0.7));

  // mono / stereo
  drawText(ctx, "MONO", 200, 43, shade(c.text, 0.45));
  drawText(ctx, "STEREO", 222, 43, c.accent2);

  // ---- volume + balance sliders ----
  const slider = (x: number, w: number, frac: number, rainbow: boolean) => {
    px(ctx, x, 58, w, 9, shade(c.bgDark, 0.7));
    bevel(ctx, c, x, 58, w, 9, false);
    for (let i = 2; i < w - 2; i += 2) {
      const t = i / w;
      px(ctx, x + i, 61, 1, 3, rainbow ? shade(c.accent, 0.5 + t) : shade(c.accent2, 0.5 + t));
    }
    const tx = x + 2 + Math.floor((w - 12) * frac);
    button(ctx, c, tx, 59, 10, 7);
    px(ctx, tx + 4, 60, 2, 5, c.accent2);
  };
  slider(107, 68, rand(), true);
  slider(179, 38, 0.5, false);

  // ---- EQ / PL buttons ----
  button(ctx, c, 219, 70, 22, 11);
  drawText(ctx, "EQ", 226, 73, shade(c.bgDark, 0.55));
  button(ctx, c, 242, 70, 22, 11);
  drawText(ctx, "PL", 249, 73, shade(c.bgDark, 0.55));

  // ---- seek bar ----
  px(ctx, 16, 72, 192, 10, shade(c.bgDark, 0.6));
  bevel(ctx, c, 16, 72, 192, 10, false);
  const seekX = 18 + Math.floor(rand() * 160);
  button(ctx, c, seekX, 73, 28, 8);
  px(ctx, seekX + 2, 75, 24, 1, c.accent);
  px(ctx, seekX + 2, 78, 24, 1, shade(c.accent, 0.5));

  // ---- transport buttons ----
  let bx = 16;
  for (const kind of ["prev", "play", "pause", "stop", "next"] as const) {
    button(ctx, c, bx, 88, 23, 18);
    drawTransportIcon(ctx, c, kind, bx, 88);
    bx += 23;
  }
  button(ctx, c, 136, 89, 22, 16);
  drawTransportIcon(ctx, c, "eject", 136, 89);

  // ---- shuffle / repeat ----
  button(ctx, c, 165, 89, 45, 15);
  drawText(ctx, "SHUFFLE", 169, 94, shade(c.bgDark, 0.55));
  button(ctx, c, 211, 89, 28, 15);
  drawText(ctx, "REP", 217, 94, shade(c.bgDark, 0.55));

  // tiny oracle mark
  drawText(ctx, "ORACLE", 242, 108, shade(c.text, 0.5));

  // outer frame
  bevel(ctx, c, 0, 0, SKIN_W, SKIN_H, true);

  // ---- silhouette cutout ----
  const path = shapePath(spec.shape);
  if (path) {
    ctx.globalCompositeOperation = "destination-in";
    ctx.fill(path);
    ctx.globalCompositeOperation = "source-over";
  }
}

export function downloadSkinPNG(spec: SkinSpec, seedText: string) {
  const base = document.createElement("canvas");
  renderSkin(base, spec, seedText);
  const out = document.createElement("canvas");
  const SCALE = 4;
  out.width = SKIN_W * SCALE;
  out.height = SKIN_H * SCALE;
  const ctx = out.getContext("2d")!;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(base, 0, 0, out.width, out.height);
  out.toBlob((blob) => {
    if (!blob) return;
    triggerDownload(blob, `${safeFileName(spec.skinName)}.png`);
  });
}

export function safeFileName(name: string): string {
  return name.replace(/[^a-z0-9_-]+/gi, "_").toLowerCase() || "untitled";
}

export function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
