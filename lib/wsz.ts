// Builds a real Winamp 2.x skin (.wsz = zip of BMP sprite sheets) from a SkinSpec.
// Sprite layouts follow the classic Winamp skin format (same regions Webamp reads).
// Winamp falls back to the base skin for any files we omit (EQ/playlist windows).

import {
  type SkinSpec,
  type SkinColors,
  type Ctx,
  SKIN_W,
  renderSkin,
  shade,
  hexToRgb,
  px,
  drawText,
  bevel,
  button,
  drawTransportIcon,
  drawTitleBar,
  drawChassisTexture,
  seededRand,
  shapePolygon,
  safeFileName,
  triggerDownload,
} from "./winamp";

function cnv(w: number, h: number): [HTMLCanvasElement, Ctx] {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return [c, c.getContext("2d")!];
}

// ---------- 24-bit BMP encoder ----------

function canvasToBMP(canvas: HTMLCanvasElement): Uint8Array {
  const w = canvas.width, h = canvas.height;
  const rgba = canvas.getContext("2d")!.getImageData(0, 0, w, h).data;
  const stride = (w * 3 + 3) & ~3;
  const size = 54 + stride * h;
  const buf = new Uint8Array(size);
  const dv = new DataView(buf.buffer);
  buf[0] = 0x42; buf[1] = 0x4d;          // "BM"
  dv.setUint32(2, size, true);
  dv.setUint32(10, 54, true);            // pixel data offset
  dv.setUint32(14, 40, true);            // BITMAPINFOHEADER
  dv.setInt32(18, w, true);
  dv.setInt32(22, h, true);              // positive = bottom-up
  dv.setUint16(26, 1, true);             // planes
  dv.setUint16(28, 24, true);            // bpp
  dv.setUint32(34, stride * h, true);
  for (let y = 0; y < h; y++) {
    const src = (h - 1 - y) * w * 4;
    let off = 54 + y * stride;
    for (let x = 0; x < w; x++) {
      const s = src + x * 4;
      buf[off++] = rgba[s + 2]; // B
      buf[off++] = rgba[s + 1]; // G
      buf[off++] = rgba[s];     // R
    }
  }
  return buf;
}

// ---------- store-only ZIP writer ----------

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(data: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < data.length; i++) c = CRC_TABLE[(c ^ data[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

const DOS_DATE = ((2026 - 1980) << 9) | (6 << 5) | 11; // fixed, deterministic
const DOS_TIME = (12 << 11) | (0 << 5);

function buildZip(files: { name: string; data: Uint8Array }[]): Blob {
  const enc = new TextEncoder();
  const parts: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;

  for (const f of files) {
    const name = enc.encode(f.name);
    const crc = crc32(f.data);

    const lh = new Uint8Array(30 + name.length);
    const lv = new DataView(lh.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(4, 20, true);            // version needed
    lv.setUint16(8, 0, true);             // method: store
    lv.setUint16(10, DOS_TIME, true);
    lv.setUint16(12, DOS_DATE, true);
    lv.setUint32(14, crc, true);
    lv.setUint32(18, f.data.length, true);
    lv.setUint32(22, f.data.length, true);
    lv.setUint16(26, name.length, true);
    lh.set(name, 30);
    parts.push(lh, f.data);

    const ce = new Uint8Array(46 + name.length);
    const cv = new DataView(ce.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(4, 20, true);            // version made by
    cv.setUint16(6, 20, true);            // version needed
    cv.setUint16(10, 0, true);            // method: store
    cv.setUint16(12, DOS_TIME, true);
    cv.setUint16(14, DOS_DATE, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, f.data.length, true);
    cv.setUint32(24, f.data.length, true);
    cv.setUint16(28, name.length, true);
    cv.setUint32(42, offset, true);
    ce.set(name, 46);
    central.push(ce);

    offset += lh.length + f.data.length;
  }

  const cdSize = central.reduce((s, c) => s + c.length, 0);
  const eocd = new Uint8Array(22);
  const ev = new DataView(eocd.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, files.length, true);
  ev.setUint16(10, files.length, true);
  ev.setUint32(12, cdSize, true);
  ev.setUint32(16, offset, true);

  return new Blob([...parts, ...central, eocd] as BlobPart[], { type: "application/zip" });
}

// ---------- sprite sheets ----------

function mainBmp(spec: SkinSpec, seedText: string): Uint8Array {
  const canvas = document.createElement("canvas");
  renderSkin(canvas, spec, seedText);
  return canvasToBMP(canvas);
}

function titlebarBmp(spec: SkinSpec): Uint8Array {
  const c = spec.colors;
  const [canvas, ctx] = cnv(344, 87);
  px(ctx, 0, 0, 344, 87, c.bgDark);
  drawTitleBar(ctx, c, spec.skinName, 27, 0, SKIN_W, true);   // active
  drawTitleBar(ctx, c, spec.skinName, 27, 15, SKIN_W, false); // inactive
  drawTitleBar(ctx, c, spec.skinName, 27, 29, SKIN_W, true);  // windowshade active
  drawTitleBar(ctx, c, spec.skinName, 27, 42, SKIN_W, false); // windowshade inactive
  // small 9x9 buttons: menu (0,0), minimize (9,0), close (18,0); pressed row at y=9
  for (const [bx, pressed] of [[0, false], [9, false], [18, false], [0, true], [9, true], [18, true]] as const) {
    const by = pressed ? 9 : 0;
    button(ctx, c, bx, by, 9, 9, pressed);
  }
  drawText(ctx, "X", 21, 2, shade(c.bgDark, 0.6));
  px(ctx, 11, 6, 5, 1, shade(c.bgDark, 0.6)); // minimize dash
  // shade-mode toggle buttons at (0,18)/(9,18)
  button(ctx, c, 0, 18, 9, 9);
  button(ctx, c, 9, 18, 9, 9, true);
  return canvasToBMP(canvas);
}

function cbuttonsBmp(spec: SkinSpec): Uint8Array {
  const c = spec.colors;
  const [canvas, ctx] = cnv(136, 36);
  px(ctx, 0, 0, 136, 36, c.bgDark);
  const kinds = ["prev", "play", "pause", "stop", "next"] as const;
  for (const pressed of [false, true]) {
    const oy = pressed ? 18 : 0;
    kinds.forEach((kind, i) => {
      const ox = i * 23;
      button(ctx, c, ox, oy, 23, 18, pressed);
      drawTransportIcon(ctx, c, kind, ox + (pressed ? 1 : 0), oy + (pressed ? 1 : 0));
    });
  }
  // eject: 22x16 at (114,0), pressed at (114,16)
  button(ctx, c, 114, 0, 22, 16);
  drawTransportIcon(ctx, c, "eject", 114, 0);
  button(ctx, c, 114, 16, 22, 16, true);
  drawTransportIcon(ctx, c, "eject", 115, 17);
  return canvasToBMP(canvas);
}

function numbersBmp(spec: SkinSpec): Uint8Array {
  const c = spec.colors;
  const [canvas, ctx] = cnv(99, 13);
  px(ctx, 0, 0, 99, 13, "#000000");
  for (let d = 0; d <= 9; d++) {
    drawText(ctx, String(d), d * 9 + 1, 1, c.display, 2);
  }
  return canvasToBMP(canvas);
}

function textBmp(spec: SkinSpec): Uint8Array {
  const c = spec.colors;
  const [canvas, ctx] = cnv(155, 18);
  px(ctx, 0, 0, 155, 18, "#000000");
  const rows = [
    'ABCDEFGHIJKLMNOPQRSTUVWXYZ"@   ',
    "0123456789..:()-'!_+\\/[]^&%.=$#",
    "AOA?*                          ",
  ];
  rows.forEach((row, r) => {
    for (let i = 0; i < 31; i++) {
      drawText(ctx, row[i] ?? " ", i * 5 + 1, r * 6, c.text);
    }
  });
  return canvasToBMP(canvas);
}

function sliderSheet(
  spec: SkinSpec,
  sheetW: number,
  grooveX: number,
  grooveW: number,
  fillColor: string,
  centerOut: boolean,
): Uint8Array {
  const c = spec.colors;
  const [canvas, ctx] = cnv(sheetW, 433);
  px(ctx, 0, 0, sheetW, 433, c.bgDark);
  for (let f = 0; f < 28; f++) {
    const oy = f * 15;
    px(ctx, grooveX, oy + 2, grooveW, 11, shade(c.bgDark, 0.7));
    bevel(ctx, c, grooveX, oy + 2, grooveW, 11, false);
    const frac = f / 27;
    for (let i = 2; i < grooveW - 2; i += 2) {
      const t = i / grooveW;
      let lit: boolean;
      if (centerOut) {
        lit = Math.abs(t - 0.5) <= Math.abs(frac - 0.5) + 0.02 &&
          (frac >= 0.5 ? t >= 0.48 && t <= frac : t <= 0.52 && t >= frac);
      } else {
        lit = t <= frac;
      }
      px(ctx, grooveX + i, oy + 5, 1, 5, lit ? shade(fillColor, 0.5 + t) : shade(c.bgDark, 1.15));
    }
  }
  // thumbs: pressed at (0,422), normal at (15,422), each 14x11
  button(ctx, c, 0, 422, 14, 11, true);
  px(ctx, 6, 423, 2, 9, shade(c.accent2, 0.8));
  button(ctx, c, 15, 422, 14, 11);
  px(ctx, 21, 423, 2, 9, c.accent2);
  return canvasToBMP(canvas);
}

function posbarBmp(spec: SkinSpec): Uint8Array {
  const c = spec.colors;
  const [canvas, ctx] = cnv(307, 10);
  px(ctx, 0, 0, 307, 10, shade(c.bgDark, 0.6));
  bevel(ctx, c, 0, 0, 248, 10, false);
  px(ctx, 4, 4, 240, 2, shade(c.bgDark, 0.85));
  for (const [ox, pressed] of [[248, false], [278, true]] as const) {
    button(ctx, c, ox, 0, 29, 10, pressed);
    px(ctx, ox + 2, 2, 25, 1, c.accent);
    px(ctx, ox + 2, 6, 25, 1, shade(c.accent, 0.5));
  }
  return canvasToBMP(canvas);
}

function monosterBmp(spec: SkinSpec): Uint8Array {
  const c = spec.colors;
  const [canvas, ctx] = cnv(56, 24);
  px(ctx, 0, 0, 56, 24, c.bgDark);
  drawText(ctx, "STEREO", 2, 3, c.accent2);                 // lit (0,0) 29x12
  drawText(ctx, "STEREO", 2, 15, shade(c.text, 0.35));      // dim (0,12)
  drawText(ctx, "MONO", 34, 3, c.accent2);                  // lit (29,0) 27x12
  drawText(ctx, "MONO", 34, 15, shade(c.text, 0.35));       // dim (29,12)
  return canvasToBMP(canvas);
}

function playpausBmp(spec: SkinSpec): Uint8Array {
  const c = spec.colors;
  const [canvas, ctx] = cnv(42, 9);
  px(ctx, 0, 0, 42, 9, "#000000");
  // play triangle (0,0)
  px(ctx, 2, 1, 2, 7, c.display);
  px(ctx, 4, 2, 2, 5, c.display);
  px(ctx, 6, 3, 1, 3, c.display);
  // pause (9,0)
  px(ctx, 10, 1, 3, 7, c.display);
  px(ctx, 15, 1, 3, 7, c.display);
  // stop (18,0)
  px(ctx, 19, 1, 7, 7, c.display);
  // work indicators (36,0) dim / (39,0) lit, each 3x9
  px(ctx, 36, 3, 2, 3, shade(c.display, 0.35));
  px(ctx, 39, 3, 2, 3, c.display);
  return canvasToBMP(canvas);
}

function shufrepBmp(spec: SkinSpec): Uint8Array {
  const c = spec.colors;
  const [canvas, ctx] = cnv(92, 85);
  px(ctx, 0, 0, 92, 85, c.bgDark);
  const label = (txt: string, x: number, y: number, w: number, h: number, pressed: boolean, on: boolean) => {
    button(ctx, c, x, y, w, h, pressed);
    const tw = txt.length * 4 - 1;
    drawText(
      ctx,
      txt,
      x + Math.floor((w - tw) / 2) + (pressed ? 1 : 0),
      y + Math.floor((h - 5) / 2) + (pressed ? 1 : 0),
      on ? c.accent2 : shade(c.bgDark, 0.55),
    );
  };
  // repeat: 28x15 at x=0; shuffle: 47x15 at x=28
  // rows: 0 off-up, 15 off-down, 30 on-up, 45 on-down
  for (const [row, pressed, on] of [[0, false, false], [15, true, false], [30, false, true], [45, true, true]] as const) {
    label("REPEAT", 0, row, 28, 15, pressed, on);
    label("SHUFFLE", 28, row, 47, 15, pressed, on);
  }
  // EQ / PL: 23x12 cells. up at x=0/23, pressed at x=46/69; off row y=61, on row y=73
  for (const [row, on] of [[61, false], [73, true]] as const) {
    label("EQ", 0, row, 23, 12, false, on);
    label("PL", 23, row, 23, 12, false, on);
    label("EQ", 46, row, 23, 12, true, on);
    label("PL", 69, row, 23, 12, true, on);
  }
  return canvasToBMP(canvas);
}

// EQMAIN.BMP — the equalizer window sprite sheet (275x315).
// Regions (classic Winamp layout, same coords Webamp reads):
//   (0,0)    275x116  window background
//   y=119    ON/AUTO button states: off@x10/36, on@x69/95, off-pressed@x128/154, on-pressed@x187/213
//   (0,134)  275x14   title bar (selected), (0,149) unselected
//   (0,164)  11x11    slider thumb, (0,176) pressed
//   (13,164) 28 slider-position frames, 14x63 each, 14 per row at 15px pitch, rows y=164/229
//   (224,164) 44x12   presets button, (224,176) pressed
//   (0,294)  113x19   spectrum graph background, (115,294) 1x19 graph line color ramp
function eqmainBmp(spec: SkinSpec, seedText: string): Uint8Array {
  const c = spec.colors;
  const [canvas, ctx] = cnv(275, 315);
  px(ctx, 0, 0, 275, 315, c.bgDark);

  // ---- window background (0,0 275x116) ----
  const rand = seededRand(seedText + spec.skinName + "eq");
  drawChassisTexture(ctx, spec, rand, 0, 14, 275, 102);
  drawTitleBar(ctx, c, "EQUALIZER", 0, 0, 275, true); // under the real titlebar sprite
  // graph display well at (86,17) 113x19
  px(ctx, 85, 16, 115, 21, "#000000");
  bevel(ctx, c, 85, 16, 115, 21, false);
  // db scale left of the preamp slider
  drawText(ctx, "+12", 2, 40, shade(c.text, 0.6));
  drawText(ctx, "0", 6, 67, shade(c.text, 0.6));
  drawText(ctx, "-12", 2, 94, shade(c.text, 0.6));
  // sunken wells behind preamp + 10 band sliders
  const sliderXs = [21, ...Array.from({ length: 10 }, (_, i) => 78 + i * 18)];
  for (const sx of sliderXs) {
    px(ctx, sx - 1, 37, 16, 65, shade(c.bgDark, 0.75));
    bevel(ctx, c, sx - 1, 37, 16, 65, false);
  }
  // labels under sliders
  drawText(ctx, "PREAMP", 16, 104, shade(c.text, 0.7));
  const freqs = ["60", "170", "310", "600", "1K", "3K", "6K", "12K", "14K", "16K"];
  freqs.forEach((f, i) => {
    drawText(ctx, f, 85 + i * 18 - f.length * 2, 104, shade(c.text, 0.7));
  });
  bevel(ctx, c, 0, 0, 275, 116, true);

  // ---- ON / AUTO buttons (y=119), 4 states each ----
  const toggle = (label: string, x: number, w: number, on: boolean, pressed: boolean) => {
    button(ctx, c, x, 119, w, 12, pressed);
    const o = pressed ? 1 : 0;
    px(ctx, x + 3 + o, 123 + o, 3, 3, on ? c.accent2 : shade(c.bgDark, 0.6)); // indicator lamp
    drawText(ctx, label, x + 9 + o, 122 + o, on ? c.accent2 : shade(c.bgDark, 0.55));
  };
  toggle("ON", 10, 25, false, false);
  toggle("ON", 69, 25, true, false);
  toggle("ON", 128, 25, false, true);
  toggle("ON", 187, 25, true, true);
  toggle("AUTO", 36, 33, false, false);
  toggle("AUTO", 95, 33, true, false);
  toggle("AUTO", 154, 33, false, true);
  toggle("AUTO", 213, 33, true, true);

  // ---- title bars ----
  drawTitleBar(ctx, c, "EQUALIZER", 0, 134, 275, true);
  drawTitleBar(ctx, c, "EQUALIZER", 0, 149, 275, false);

  // ---- slider thumbs (0,164)/(0,176) 11x11 ----
  button(ctx, c, 0, 164, 11, 11);
  px(ctx, 4, 166, 3, 7, c.accent2);
  button(ctx, c, 0, 176, 11, 11, true);
  px(ctx, 5, 167 + 10, 3, 7, shade(c.accent2, 0.8));

  // ---- 28 slider-position frames, level-meter style ----
  for (let f = 0; f < 28; f++) {
    const ox = 13 + (f % 14) * 15;
    const oy = 164 + Math.floor(f / 14) * 65;
    px(ctx, ox, oy, 14, 63, shade(c.bgDark, 0.7));
    bevel(ctx, c, ox, oy, 14, 63, false);
    px(ctx, ox + 6, oy + 2, 2, 59, "#000000");
    const lit = Math.round(57 * (f / 27));
    for (let y = 0; y < lit; y++) {
      const t = y / 57;
      px(ctx, ox + 4, oy + 60 - y, 6, 1, shade(t > 0.6 ? c.vis2 : c.vis1, 0.7 + t * 0.5));
    }
  }

  // ---- presets button (224,164)/(224,176) 44x12 ----
  button(ctx, c, 224, 164, 44, 12);
  drawText(ctx, "PRESETS", 230, 167, shade(c.bgDark, 0.55));
  button(ctx, c, 224, 176, 44, 12, true);
  drawText(ctx, "PRESETS", 231, 180, shade(c.bgDark, 0.55));

  // ---- graph background (0,294) 113x19 + line color ramp (115,294) 1x19 ----
  px(ctx, 0, 294, 113, 19, "#000000");
  px(ctx, 0, 303, 113, 1, shade(c.display, 0.25)); // center db line
  for (let x = 0; x < 113; x += 8) px(ctx, x, 294, 1, 19, shade(c.display, 0.12));
  const [r1, g1, b1] = hexToRgb(c.vis2);
  const [r2, g2, b2] = hexToRgb(c.vis1);
  for (let y = 0; y < 19; y++) {
    const t = y / 18;
    ctx.fillStyle = `rgb(${Math.round(r1 + (r2 - r1) * t)},${Math.round(g1 + (g2 - g1) * t)},${Math.round(b1 + (b2 - b1) * t)})`;
    ctx.fillRect(115, 294 + y, 1, 1);
  }

  return canvasToBMP(canvas);
}

// PLEDIT.BMP — the playlist window sprite sheet (280x186). The window is
// resizable, so the art is corners + tileable segments rather than one fixed
// background. Coordinates verified against Webamp's sprite map.
function pleditBmp(spec: SkinSpec, seedText: string): Uint8Array {
  const c = spec.colors;
  const [canvas, ctx] = cnv(280, 186);
  px(ctx, 0, 0, 280, 186, c.bgDark);
  const rand = seededRand(seedText + spec.skinName + "pl");
  const tex = (x: number, y: number, w: number, h: number) =>
    drawChassisTexture(ctx, spec, rand, x, y, w, h);

  // titlebar-style gradient segment, optionally with centered text
  const titleSeg = (x: number, y: number, w: number, h: number, active: boolean, text?: string) => {
    const dim = active ? 1 : 0.55;
    for (let r = 0; r < h; r++)
      px(ctx, x, y + r, w, 1, shade(c.accent, (1.3 - (r * 0.8) / h) * dim));
    bevel(ctx, c, x, y, w, h, true);
    for (let r = 5; r < h - 5; r += 4)
      px(ctx, x + 3, y + r, w - 6, 1, shade(c.accent, 0.6 * dim));
    if (text) {
      const tw = text.length * 4;
      const tx = x + ((w - tw) >> 1);
      px(ctx, tx - 4, y + ((h - 9) >> 1), tw + 6, 9, shade(c.accent, 0.45 * dim));
      drawText(ctx, text, tx, y + ((h - 5) >> 1) + 1, shade(c.accent, 0.2));
      drawText(ctx, text, tx, y + ((h - 5) >> 1), active ? c.text : shade(c.text, 0.6));
    }
  };

  // ---- top frame: selected row y=0, unselected row y=21 ----
  for (const [oy, act] of [[0, true], [21, false]] as const) {
    titleSeg(0, oy, 25, 20, act);                  // top-left corner
    titleSeg(26, oy, 100, 20, act, "PLAYLIST");    // title bar
    titleSeg(127, oy, 25, 20, act);                // top tile
    titleSeg(153, oy, 25, 20, act);                // top-right corner
    button(ctx, c, 166, oy + 5, 9, 9);             // close box in right corner
    drawText(ctx, "X", 169, oy + 7, shade(c.bgDark, 0.6));
  }

  // ---- side tiles ----
  tex(0, 42, 12, 29);                              // left edge tile
  px(ctx, 0, 42, 1, 29, shade(c.bgLight, 1.4));
  tex(31, 42, 20, 29);                             // right edge tile (holds scrollbar)
  px(ctx, 50, 42, 1, 29, shade(c.bgDark, 0.5));
  px(ctx, 36, 42, 8, 29, shade(c.bgDark, 0.6));    // scrollbar groove

  // ---- bottom tile + corners ----
  tex(179, 0, 25, 38);                             // bottom tile
  px(ctx, 179, 0, 25, 1, shade(c.bgLight, 1.4));
  tex(0, 72, 125, 38);                             // bottom-left corner (button cluster)
  px(ctx, 0, 72, 125, 1, shade(c.bgLight, 1.4));
  px(ctx, 0, 72, 1, 38, shade(c.bgLight, 1.4));
  const clusters = ["ADD", "REM", "SEL", "MISC"];
  clusters.forEach((label, i) => {
    const bx = 11 + i * 29;
    button(ctx, c, bx, 88, 22, 18);
    drawText(ctx, label, bx + 11 - label.length * 2, 95, shade(c.bgDark, 0.55));
  });
  tex(126, 72, 150, 38);                           // bottom-right corner
  px(ctx, 126, 72, 150, 1, shade(c.bgLight, 1.4));
  px(ctx, 275, 72, 1, 38, shade(c.bgDark, 0.5));
  px(ctx, 156, 78, 76, 12, "#000000");             // time readout panel
  bevel(ctx, c, 156, 78, 76, 12, false);
  drawText(ctx, "0:00/0:00", 176, 81, c.display);
  button(ctx, c, 250, 88, 22, 18);                 // LIST button
  drawText(ctx, "LIST", 253, 95, shade(c.bgDark, 0.55));
  // mini transport glyphs
  const MG = shade(c.text, 0.6);
  let gx = 132;
  for (const g of ["[", "(", ")", "!", "]"]) {
    drawText(ctx, g, gx, 97, MG);
    gx += 7;
  }

  // ---- mini visualizer background (205,0) 75x38 ----
  px(ctx, 205, 0, 75, 38, "#000000");
  for (let x = 205; x < 280; x += 8) px(ctx, x, 0, 1, 38, shade(c.display, 0.12));
  px(ctx, 205, 19, 75, 1, shade(c.display, 0.25));

  // ---- windowshade strips ----
  titleSeg(72, 42, 25, 14, true);                  // shade left (selected)
  titleSeg(72, 57, 25, 14, false);                 // shade tile
  titleSeg(99, 42, 50, 14, true);                  // shade right selected
  titleSeg(99, 57, 50, 14, false);                 // shade right
  for (const oy of [42, 57]) {
    button(ctx, c, 138, oy + 2, 9, 9);
    drawText(ctx, "X", 141, oy + 4, shade(c.bgDark, 0.6));
  }

  // ---- pressed window buttons ----
  button(ctx, c, 52, 42, 9, 9, true);              // close pressed
  drawText(ctx, "X", 55, 44, shade(c.bgDark, 0.6));
  button(ctx, c, 62, 42, 9, 9, true);              // collapse pressed
  drawText(ctx, "^", 65, 44, shade(c.bgDark, 0.6));
  button(ctx, c, 150, 42, 9, 9, true);             // expand pressed
  drawText(ctx, "V", 153, 44, shade(c.bgDark, 0.6));

  // ---- scrollbar handles (52,53)/(61,53) 8x18 ----
  button(ctx, c, 52, 53, 8, 18);
  px(ctx, 55, 56, 2, 12, c.accent2);
  button(ctx, c, 61, 53, 8, 18, true);
  px(ctx, 64, 57, 2, 12, shade(c.accent2, 0.8));

  // ---- popup menu entries (22x18 each; normal + highlighted column pairs) ----
  const menuItem = (label: string, x: number, y: number, hot: boolean) => {
    if (hot) {
      px(ctx, x, y, 22, 18, shade(c.accent, 0.8));
      bevel(ctx, c, x, y, 22, 18, false);
    } else {
      px(ctx, x, y, 22, 18, shade(c.bgDark, 1.2));
      bevel(ctx, c, x, y, 22, 18, true);
    }
    drawText(ctx, label, x + 11 - label.length * 2, y + 7, hot ? c.text : shade(c.text, 0.7));
  };
  const menus: [number, string[]][] = [
    [0, ["URL", "DIR", "FILE"]],          // ADD
    [54, ["ALL", "CROP", "REM", "MISC"]], // REMOVE (4th row at y=168)
    [104, ["INV", "ZERO", "ALL"]],        // SELECT
    [154, ["SORT", "INFO", "OPTS"]],      // MISC
    [204, ["NEW", "SAVE", "LOAD"]],       // LIST
  ];
  for (const [mx, items] of menus) {
    items.forEach((label, row) => {
      menuItem(label, mx, 111 + row * 19, false);
      menuItem(label, mx + 23, 111 + row * 19, true);
    });
  }
  // menu side bars (3px vertical accent strips)
  for (const [bx, bh] of [[48, 54], [100, 72], [150, 54], [200, 54], [250, 54]] as const) {
    px(ctx, bx, 111, 3, bh, shade(c.accent, 0.7));
    px(ctx, bx, 111, 1, bh, shade(c.accent, 1.1));
  }

  return canvasToBMP(canvas);
}

// ---------- text files ----------

function viscolorTxt(spec: SkinSpec): string {
  const c = spec.colors;
  const lines: string[] = [];
  const [br, bg, bb] = hexToRgb(c.bgDark);
  lines.push("0,0,0", `${br},${bg},${bb}`);
  const [r1, g1, b1] = hexToRgb(spec.colors.vis1);
  const [r2, g2, b2] = hexToRgb(spec.colors.vis2);
  for (let i = 0; i < 16; i++) {
    const t = i / 15;
    lines.push(
      `${Math.round(r1 + (r2 - r1) * t)},${Math.round(g1 + (g2 - g1) * t)},${Math.round(b1 + (b2 - b1) * t)}`,
    );
  }
  for (let i = 0; i < 5; i++) {
    const [r, g, b] = hexToRgb(shade(c.vis2, 0.6 + i * 0.1));
    lines.push(`${r},${g},${b}`);
  }
  lines.push(hexToRgb(c.vis2).join(","));
  return lines.join("\r\n") + "\r\n";
}

function pleditTxt(spec: SkinSpec): string {
  const c = spec.colors;
  return [
    "[Text]",
    `Normal=${c.text}`,
    `Current=${c.display}`,
    `NormalBG=${c.bgDark}`,
    `SelectedBG=${c.bgLight}`,
    "Font=Arial",
    "",
  ].join("\r\n");
}

function regionTxt(spec: SkinSpec): string | null {
  const poly = shapePolygon(spec.shape);
  if (!poly) return null;
  return [
    "[Normal]",
    `NumPoints=${poly.length}`,
    `PointList=${poly.map(([x, y]) => `${x},${y}`).join(",")}`,
    "",
  ].join("\r\n");
}

function readmeTxt(spec: SkinSpec): string {
  return [
    spec.skinName,
    "=".repeat(spec.skinName.length),
    "",
    `"${spec.vibe}"`,
    "",
    "generated by the winamp skin oracle.",
    "it really whips.",
    "",
  ].join("\r\n");
}

// ---------- public API ----------

export function buildWSZBlob(spec: SkinSpec, seedText: string): Blob {
  const enc = new TextEncoder();
  const c = spec.colors;
  const files = [
    { name: "MAIN.BMP", data: mainBmp(spec, seedText) },
    { name: "TITLEBAR.BMP", data: titlebarBmp(spec) },
    { name: "CBUTTONS.BMP", data: cbuttonsBmp(spec) },
    { name: "NUMBERS.BMP", data: numbersBmp(spec) },
    { name: "TEXT.BMP", data: textBmp(spec) },
    { name: "VOLUME.BMP", data: sliderSheet(spec, 68, 0, 68, c.accent, false) },
    { name: "BALANCE.BMP", data: sliderSheet(spec, 47, 9, 38, c.accent2, true) },
    { name: "POSBAR.BMP", data: posbarBmp(spec) },
    { name: "MONOSTER.BMP", data: monosterBmp(spec) },
    { name: "PLAYPAUS.BMP", data: playpausBmp(spec) },
    { name: "SHUFREP.BMP", data: shufrepBmp(spec) },
    { name: "EQMAIN.BMP", data: eqmainBmp(spec, seedText) },
    { name: "PLEDIT.BMP", data: pleditBmp(spec, seedText) },
    { name: "VISCOLOR.TXT", data: enc.encode(viscolorTxt(spec)) },
    { name: "PLEDIT.TXT", data: enc.encode(pleditTxt(spec)) },
    { name: "README.TXT", data: enc.encode(readmeTxt(spec)) },
  ];
  const region = regionTxt(spec);
  if (region) files.push({ name: "REGION.TXT", data: enc.encode(region) });
  return buildZip(files);
}

export function downloadWSZ(spec: SkinSpec, seedText: string) {
  const blob = buildWSZBlob(spec, seedText);
  triggerDownload(blob, `${safeFileName(spec.skinName)}.wsz`);
}
