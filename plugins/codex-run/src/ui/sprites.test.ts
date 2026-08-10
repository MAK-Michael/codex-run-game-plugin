import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { inflateSync } from "node:zlib";

const CELL_SIZE = 64;
const PLAYER_FRAMES = 6;

function paeth(left: number, above: number, upperLeft: number): number {
  const estimate = left + above - upperLeft;
  const leftDistance = Math.abs(estimate - left);
  const aboveDistance = Math.abs(estimate - above);
  const upperLeftDistance = Math.abs(estimate - upperLeft);
  return leftDistance <= aboveDistance && leftDistance <= upperLeftDistance
    ? left
    : aboveDistance <= upperLeftDistance
      ? above
      : upperLeft;
}

function decodeRgbaPng(data: Buffer): { width: number; height: number; pixels: Buffer } {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  assert.deepEqual(data.subarray(0, 8), signature);

  let offset = 8;
  let width = 0;
  let height = 0;
  const imageData: Buffer[] = [];
  while (offset < data.length) {
    const length = data.readUInt32BE(offset);
    const type = data.toString("ascii", offset + 4, offset + 8);
    const chunk = data.subarray(offset + 8, offset + 8 + length);
    offset += length + 12;
    if (type === "IHDR") {
      width = chunk.readUInt32BE(0);
      height = chunk.readUInt32BE(4);
      assert.deepEqual([...chunk.subarray(8, 13)], [8, 6, 0, 0, 0], "atlas must be 8-bit non-interlaced RGBA");
    } else if (type === "IDAT") {
      imageData.push(chunk);
    } else if (type === "IEND") {
      break;
    }
  }

  const bytesPerPixel = 4;
  const rowSize = width * bytesPerPixel;
  const filtered = inflateSync(Buffer.concat(imageData));
  const pixels = Buffer.alloc(width * height * bytesPerPixel);
  let sourceOffset = 0;
  for (let y = 0; y < height; y += 1) {
    const filter = filtered[sourceOffset++];
    for (let x = 0; x < rowSize; x += 1) {
      const left = x >= bytesPerPixel ? pixels[y * rowSize + x - bytesPerPixel] : 0;
      const above = y > 0 ? pixels[(y - 1) * rowSize + x] : 0;
      const upperLeft = y > 0 && x >= bytesPerPixel ? pixels[(y - 1) * rowSize + x - bytesPerPixel] : 0;
      const predictor =
        filter === 0
          ? 0
          : filter === 1
            ? left
            : filter === 2
              ? above
              : filter === 3
                ? Math.floor((left + above) / 2)
                : filter === 4
                  ? paeth(left, above, upperLeft)
                  : assert.fail(`unsupported PNG filter ${filter}`);
      pixels[y * rowSize + x] = (filtered[sourceOffset++] + predictor) & 0xff;
    }
  }
  return { width, height, pixels };
}

function inKnotBody(x: number, y: number): boolean {
  const dx = (x - 31.5) / 22.5;
  const dy = (y - 26.5) / 22.5;
  return dx * dx + dy * dy <= 1 && y <= 46;
}

test("sprite atlas keeps the exact palette and one shared Codex knot body", () => {
  const atlasPath = new URL("../../assets/game-sprites.png", import.meta.url);
  const { width, height, pixels } = decodeRgbaPng(readFileSync(atlasPath));
  assert.deepEqual([width, height], [512, 192]);

  const palette = new Set<string>();
  for (let index = 0; index < pixels.length; index += 4) {
    palette.add(pixels.subarray(index, index + 4).toString("hex"));
  }
  assert.deepEqual([...palette].sort(), ["00000000", "16836fff", "53565cff"]);

  const knotBodies = Array.from({ length: PLAYER_FRAMES }, (_, frame) => {
    const bytes: number[] = [];
    for (let y = 0; y < CELL_SIZE; y += 1) {
      for (let x = 0; x < CELL_SIZE; x += 1) {
        if (!inKnotBody(x, y)) continue;
        const pixelOffset = (y * width + frame * CELL_SIZE + x) * 4;
        bytes.push(...pixels.subarray(pixelOffset, pixelOffset + 4));
      }
    }
    return bytes;
  });
  for (const body of knotBodies.slice(1)) assert.deepEqual(body, knotBodies[0]);

  for (let y = CELL_SIZE * 2; y < CELL_SIZE * 3; y += 1) {
    for (let x = 0; x < CELL_SIZE; x += 1) {
      const alphaOffset = (y * width + x) * 4 + 3;
      assert.equal(pixels[alphaOffset], 0, "removed token-chain cell must remain empty");
    }
  }
});
