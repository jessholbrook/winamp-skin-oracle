import { describe, expect, it } from "vitest";
import type { SkinSpec } from "./winamp";
import { buildZip, canvasToBMP, viscolorTxt } from "./wsz";

const SPEC: SkinSpec = {
  skinName: "test_skin",
  vibe: "a test vibe",
  colors: {
    bgDark: "#10141c",
    bgLight: "#2a3242",
    accent: "#e05910",
    accent2: "#10c0e0",
    text: "#d8e0f0",
    display: "#40ff80",
    vis1: "#ff8020",
    vis2: "#ffe040",
  },
  texture: "scanlines",
  shape: "classic",
  trackTitle: "1. Test - Track",
};

// Minimal stand-in for an HTMLCanvasElement backed by a known RGBA buffer.
function fakeCanvas(w: number, h: number, rgba: Uint8ClampedArray): HTMLCanvasElement {
  return {
    width: w,
    height: h,
    getContext: () => ({ getImageData: () => ({ data: rgba }) }),
  } as unknown as HTMLCanvasElement;
}

// CRC-32 reference implementation for verifying the zip writer.
function refCrc32(data: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < data.length; i++) {
    c ^= data[i];
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  return (c ^ 0xffffffff) >>> 0;
}

describe("canvasToBMP", () => {
  // 2x2 image: red, green / blue, white
  const rgba = new Uint8ClampedArray([
    255, 0, 0, 255,   0, 255, 0, 255,
    0, 0, 255, 255,   255, 255, 255, 255,
  ]);
  const bmp = canvasToBMP(fakeCanvas(2, 2, rgba));
  const dv = new DataView(bmp.buffer, bmp.byteOffset, bmp.byteLength);

  it("writes a valid BITMAPINFOHEADER", () => {
    expect(bmp[0]).toBe(0x42); // 'B'
    expect(bmp[1]).toBe(0x4d); // 'M'
    expect(dv.getUint32(2, true)).toBe(bmp.length); // file size
    expect(dv.getUint32(10, true)).toBe(54); // pixel data offset
    expect(dv.getUint32(14, true)).toBe(40); // header size
    expect(dv.getInt32(18, true)).toBe(2); // width
    expect(dv.getInt32(22, true)).toBe(2); // height (bottom-up)
    expect(dv.getUint16(28, true)).toBe(24); // bpp
  });

  it("pads each row to a 4-byte stride", () => {
    // 2px * 3 bytes = 6 → padded to 8
    expect(bmp.length).toBe(54 + 8 * 2);
  });

  it("stores rows bottom-up in BGR order", () => {
    // First stored row = bottom image row (blue, white)
    expect([...bmp.slice(54, 60)]).toEqual([255, 0, 0, 255, 255, 255]);
    // Second stored row = top image row (red, green)
    expect([...bmp.slice(62, 68)]).toEqual([0, 0, 255, 0, 255, 0]);
  });
});

describe("buildZip", () => {
  const enc = new TextEncoder();
  const files = [
    { name: "A.TXT", data: enc.encode("hello winamp") },
    { name: "B.BIN", data: new Uint8Array([0, 1, 2, 3, 254, 255]) },
  ];

  async function zipBytes() {
    return new Uint8Array(await buildZip(files).arrayBuffer());
  }

  it("starts with a local file header and ends with EOCD", async () => {
    const z = await zipBytes();
    const dv = new DataView(z.buffer);
    expect(dv.getUint32(0, true)).toBe(0x04034b50); // local header sig
    expect(dv.getUint32(z.length - 22, true)).toBe(0x06054b50); // EOCD sig
  });

  it("EOCD entry counts, sizes, and offsets are consistent", async () => {
    const z = await zipBytes();
    const dv = new DataView(z.buffer);
    const eocd = z.length - 22;
    expect(dv.getUint16(eocd + 8, true)).toBe(files.length); // entries (this disk)
    expect(dv.getUint16(eocd + 10, true)).toBe(files.length); // entries (total)
    const cdSize = dv.getUint32(eocd + 12, true);
    const cdOffset = dv.getUint32(eocd + 16, true);
    expect(cdOffset + cdSize).toBe(eocd); // central dir sits right before EOCD
    expect(dv.getUint32(cdOffset, true)).toBe(0x02014b50); // central dir sig
  });

  it("stores file data uncompressed with correct CRCs", async () => {
    const z = await zipBytes();
    const dv = new DataView(z.buffer);
    let off = 0;
    for (const f of files) {
      expect(dv.getUint32(off, true)).toBe(0x04034b50);
      expect(dv.getUint16(off + 8, true)).toBe(0); // method: store
      expect(dv.getUint32(off + 14, true)).toBe(refCrc32(f.data));
      expect(dv.getUint32(off + 18, true)).toBe(f.data.length); // compressed
      expect(dv.getUint32(off + 22, true)).toBe(f.data.length); // uncompressed
      const nameLen = dv.getUint16(off + 26, true);
      const name = new TextDecoder().decode(z.slice(off + 30, off + 30 + nameLen));
      expect(name).toBe(f.name);
      const dataStart = off + 30 + nameLen;
      expect([...z.slice(dataStart, dataStart + f.data.length)]).toEqual([...f.data]);
      off = dataStart + f.data.length;
    }
  });

  it("central directory offsets point at each local header", async () => {
    const z = await zipBytes();
    const dv = new DataView(z.buffer);
    const eocd = z.length - 22;
    let cd = dv.getUint32(eocd + 16, true);
    for (const f of files) {
      expect(dv.getUint32(cd, true)).toBe(0x02014b50);
      const nameLen = dv.getUint16(cd + 28, true);
      const localOffset = dv.getUint32(cd + 42, true);
      expect(dv.getUint32(localOffset, true)).toBe(0x04034b50);
      const name = new TextDecoder().decode(z.slice(cd + 46, cd + 46 + nameLen));
      expect(name).toBe(f.name);
      cd += 46 + nameLen;
    }
  });
});

describe("viscolorTxt", () => {
  const lines = viscolorTxt(SPEC).split("\r\n");

  it("emits exactly 24 color lines (the VISCOLOR.TXT format)", () => {
    // trailing CRLF produces one empty final element
    expect(lines[lines.length - 1]).toBe("");
    expect(lines.length - 1).toBe(24);
  });

  it("every line is an r,g,b triple in range", () => {
    for (const line of lines.slice(0, -1)) {
      const parts = line.split(",").map(Number);
      expect(parts).toHaveLength(3);
      for (const v of parts) {
        expect(Number.isInteger(v)).toBe(true);
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(255);
      }
    }
  });

  it("line 2 is the chassis color and the last line is vis2", () => {
    expect(lines[1]).toBe("16,20,28"); // #10141c
    expect(lines[23]).toBe("255,224,64"); // #ffe040
  });
});
