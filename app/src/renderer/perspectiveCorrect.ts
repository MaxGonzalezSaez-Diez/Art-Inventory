/**
 * Lightweight painting straighten — pure JS (no OpenCV).
 * Detects a (possibly angled) quad via edges + Hough lines, then
 * perspective-warps it to a flat rectangle and softens uneven light.
 */

export type Point = { x: number; y: number };

const DETECT_MAX = 900;

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

/** Decode sRGB 0–255 → linear light (fixes oversaturated bilinear warps). */
function srgb8ToLinear(c: number): number {
  const x = c / 255;
  return x <= 0.04045 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
}

/** Encode linear light → sRGB 0–255. */
function linearToSrgb8(c: number): number {
  const x = clamp(c, 0, 1);
  const encoded =
    x <= 0.0031308 ? 12.92 * x : 1.055 * Math.pow(x, 1 / 2.4) - 0.055;
  return clamp(Math.round(encoded * 255), 0, 255);
}

export function defaultCorners(width: number, height: number): Point[] {
  const insetX = width * 0.07;
  const insetY = height * 0.07;
  return [
    { x: insetX, y: insetY },
    { x: width - insetX, y: insetY },
    { x: width - insetX, y: height - insetY },
    { x: insetX, y: height - insetY }
  ];
}

/** Full image — no crop. Use for «Toda la foto». */
export function fullFrameCorners(width: number, height: number): Point[] {
  const maxX = Math.max(0, width - 1);
  const maxY = Math.max(0, height - 1);
  return [
    { x: 0, y: 0 },
    { x: maxX, y: 0 },
    { x: maxX, y: maxY },
    { x: 0, y: maxY }
  ];
}

/** Order as TL, TR, BR, BL. */
export function orderCorners(points: Point[]): Point[] {
  if (points.length !== 4) return points;
  const sorted = [...points].sort((a, b) => a.y - b.y);
  const top = sorted.slice(0, 2).sort((a, b) => a.x - b.x);
  const bottom = sorted.slice(2).sort((a, b) => a.x - b.x);
  return [top[0], top[1], bottom[1], bottom[0]];
}

function dist(a: Point, b: Point) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function quadArea(pts: Point[]) {
  let area = 0;
  for (let i = 0; i < 4; i++) {
    const j = (i + 1) % 4;
    area += pts[i].x * pts[j].y - pts[j].x * pts[i].y;
  }
  return Math.abs(area) / 2;
}

function isConvexQuad(pts: Point[]) {
  let sign = 0;
  for (let i = 0; i < 4; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % 4];
    const c = pts[(i + 2) % 4];
    const cross = (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);
    if (cross === 0) continue;
    const s = cross > 0 ? 1 : -1;
    if (sign === 0) sign = s;
    else if (sign !== s) return false;
  }
  return true;
}

function pointInQuad(p: Point, quad: Point[]) {
  let inside = false;
  for (let i = 0, j = 3; i < 4; j = i++) {
    const xi = quad[i].x;
    const yi = quad[i].y;
    const xj = quad[j].x;
    const yj = quad[j].y;
    const intersect =
      yi > p.y !== yj > p.y &&
      p.x < ((xj - xi) * (p.y - yi)) / (yj - yi + 1e-9) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

function gaussianBlurGray(
  src: Float32Array,
  width: number,
  height: number
): Float32Array {
  const tmp = new Float32Array(src.length);
  const out = new Float32Array(src.length);
  const k = [1, 4, 6, 4, 1];
  const kSum = 16;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let sum = 0;
      for (let i = -2; i <= 2; i++) {
        sum += src[y * width + clamp(x + i, 0, width - 1)] * k[i + 2];
      }
      tmp[y * width + x] = sum / kSum;
    }
  }
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let sum = 0;
      for (let i = -2; i <= 2; i++) {
        sum += tmp[clamp(y + i, 0, height - 1) * width + x] * k[i + 2];
      }
      out[y * width + x] = sum / kSum;
    }
  }
  return out;
}

function sobelMag(
  gray: Float32Array,
  width: number,
  height: number
): Float32Array {
  const mag = new Float32Array(width * height);
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const i = y * width + x;
      const gx =
        -gray[i - width - 1] +
        gray[i - width + 1] -
        2 * gray[i - 1] +
        2 * gray[i + 1] -
        gray[i + width - 1] +
        gray[i + width + 1];
      const gy =
        -gray[i - width - 1] -
        2 * gray[i - width] -
        gray[i - width + 1] +
        gray[i + width - 1] +
        2 * gray[i + width] +
        gray[i + width + 1];
      mag[i] = Math.hypot(gx, gy);
    }
  }
  return mag;
}

type Line = { rho: number; theta: number; votes: number };

/** Lightweight Hough — finds strong straight edges (works for angled frames). */
function houghLines(
  mag: Float32Array,
  width: number,
  height: number,
  thr: number
): Line[] {
  const maxRho = Math.ceil(Math.hypot(width, height));
  const thetaSteps = 180;
  const acc = new Float32Array((maxRho * 2 + 1) * thetaSteps);
  const step = Math.max(1, Math.floor(Math.min(width, height) / 220));

  const cosT = new Float32Array(thetaSteps);
  const sinT = new Float32Array(thetaSteps);
  for (let t = 0; t < thetaSteps; t++) {
    const theta = (t * Math.PI) / thetaSteps;
    cosT[t] = Math.cos(theta);
    sinT[t] = Math.sin(theta);
  }

  // Weight each vote by gradient strength: a painting's border is far
  // sharper than its interior texture, which would otherwise out-vote it.
  let maxVote = 0;
  for (let y = 2; y < height - 2; y += step) {
    for (let x = 2; x < width - 2; x += step) {
      const m = mag[y * width + x];
      if (m < thr) continue;
      const weight = Math.min(m / thr, 12);
      for (let t = 0; t < thetaSteps; t++) {
        const rho = Math.round(x * cosT[t] + y * sinT[t]);
        const idx = (rho + maxRho) * thetaSteps + t;
        const v = acc[idx] + weight;
        acc[idx] = v;
        if (v > maxVote) maxVote = v;
      }
    }
  }

  const lines: Line[] = [];
  const minVotes = Math.max(
    Math.min(width, height) / 12,
    maxVote * 0.18
  );
  // Theta wraps around, so t=0 (perfectly vertical edges) must be included.
  for (let ri = 1; ri < maxRho * 2; ri++) {
    for (let t = 0; t < thetaSteps; t++) {
      const v = acc[ri * thetaSteps + t];
      if (v < minVotes) continue;
      const tPrev = t === 0 ? thetaSteps - 1 : t - 1;
      const tNext = t === thetaSteps - 1 ? 0 : t + 1;
      if (
        v >= acc[ri * thetaSteps + tPrev] &&
        v >= acc[ri * thetaSteps + tNext] &&
        v >= acc[(ri - 1) * thetaSteps + t] &&
        v >= acc[(ri + 1) * thetaSteps + t]
      ) {
        lines.push({
          rho: ri - maxRho,
          theta: (t * Math.PI) / thetaSteps,
          votes: v
        });
      }
    }
  }
  lines.sort((a, b) => b.votes - a.votes);
  // Keep both orientations: a strongly textured painting can otherwise fill
  // the whole list with interior lines of a single orientation.
  const vertical: Line[] = [];
  const horizontal: Line[] = [];
  for (const line of lines) {
    const deg = ((line.theta * 180) / Math.PI) % 180;
    const bucket = deg < 45 || deg > 135 ? vertical : horizontal;
    if (bucket.length < 24) bucket.push(line);
  }
  return [...vertical, ...horizontal];
}

function lineIntersection(a: Line, b: Line): Point | null {
  const ct1 = Math.cos(a.theta);
  const st1 = Math.sin(a.theta);
  const ct2 = Math.cos(b.theta);
  const st2 = Math.sin(b.theta);
  const det = ct1 * st2 - st1 * ct2;
  if (Math.abs(det) < 1e-6) return null;
  return {
    x: (st2 * a.rho - st1 * b.rho) / det,
    y: (-ct2 * a.rho + ct1 * b.rho) / det
  };
}

/**
 * Fraction of the quad's perimeter that actually lies on a strong gradient.
 * This is what separates the painting's real border from any large
 * rectangle that happens to fit inside the frame.
 */
function edgeSupport(
  ordered: Point[],
  mag: Float32Array,
  width: number,
  height: number,
  thr: number
): number {
  const SAMPLES = 48;
  const BAND = 3;
  let hits = 0;
  let total = 0;
  for (let side = 0; side < 4; side++) {
    const a = ordered[side];
    const b = ordered[(side + 1) % 4];
    const len = dist(a, b) || 1;
    const nx = -(b.y - a.y) / len;
    const ny = (b.x - a.x) / len;
    for (let s = 0; s < SAMPLES; s++) {
      const t = (s + 0.5) / SAMPLES;
      const px = a.x + (b.x - a.x) * t;
      const py = a.y + (b.y - a.y) * t;
      total++;
      for (let d = -BAND; d <= BAND; d++) {
        const x = Math.round(px + nx * d);
        const y = Math.round(py + ny * d);
        if (x < 0 || y < 0 || x >= width || y >= height) continue;
        if (mag[y * width + x] >= thr) {
          hits++;
          break;
        }
      }
    }
  }
  return total ? hits / total : 0;
}

function scoreQuad(
  ordered: Point[],
  width: number,
  height: number,
  click?: Point | null,
  edges?: { mag: Float32Array; thr: number } | null
): number {
  if (!isConvexQuad(ordered)) return -1;
  const area = quadArea(ordered);
  const frame = width * height;
  const fill = area / frame;
  if (fill < 0.08 || fill > 0.97) return -1;
  for (let i = 0; i < 4; i++) {
    if (dist(ordered[i], ordered[(i + 1) % 4]) < Math.min(width, height) * 0.12) {
      return -1;
    }
    if (
      ordered[i].x < -width * 0.05 ||
      ordered[i].y < -height * 0.05 ||
      ordered[i].x > width * 1.05 ||
      ordered[i].y > height * 1.05
    ) {
      return -1;
    }
  }
  // Do NOT penalize unequal sides — angled shots are trapezoids.
  let score = area * (fill > 0.18 && fill < 0.92 ? 1.3 : 1);
  if (edges) {
    const support = edgeSupport(ordered, edges.mag, width, height, edges.thr);
    if (support < 0.35) return -1;
    // Edge support dominates: a real border beats a merely large quad.
    score = Math.pow(support, 3) * (0.5 + fill);
  }
  if (click) {
    if (pointInQuad(click, ordered)) score *= 4;
    else {
      const cx =
        (ordered[0].x + ordered[1].x + ordered[2].x + ordered[3].x) / 4;
      const cy =
        (ordered[0].y + ordered[1].y + ordered[2].y + ordered[3].y) / 4;
      score *= 1 / (1 + Math.hypot(click.x - cx, click.y - cy) / 140);
    }
  }
  return score;
}

function quadFromHough(
  mag: Float32Array,
  width: number,
  height: number,
  thr: number,
  click?: Point | null
): { corners: Point[]; score: number } | null {
  const lines = houghLines(mag, width, height, thr);
  if (lines.length < 4) return null;

  // Cluster into near-horizontal and near-vertical (allows angled frames).
  const horiz: Line[] = [];
  const vert: Line[] = [];
  for (const line of lines) {
    const deg = ((line.theta * 180) / Math.PI) % 180;
    if (deg < 35 || deg > 145) vert.push(line);
    else if (deg > 55 && deg < 125) horiz.push(line);
  }
  if (horiz.length < 2 || vert.length < 2) {
    // Fall back: take top lines by votes and try combinations
    horiz.length = 0;
    vert.length = 0;
    for (const line of lines.slice(0, 16)) {
      const deg = ((line.theta * 180) / Math.PI) % 180;
      if (deg < 45 || deg > 135) vert.push(line);
      else horiz.push(line);
    }
  }
  if (horiz.length < 2 || vert.length < 2) return null;

  // Distinct rhos. Seed with the outermost lines: a painting's border lies
  // outside its interior texture, which otherwise wins on votes alone.
  function pickDistinct(list: Line[], n: number): Line[] {
    if (list.length === 0) return [];
    const byRho = [...list].sort((a, b) => a.rho - b.rho);
    const seeds = [byRho[0], byRho[byRho.length - 1]];
    const out: Line[] = [];
    const minGap = Math.min(width, height) * 0.08;
    for (const line of [...seeds, ...list]) {
      if (out.some((o) => Math.abs(o.rho - line.rho) <= minGap)) continue;
      out.push(line);
      if (out.length >= n) break;
    }
    return out;
  }
  const H = pickDistinct(horiz, 6);
  const V = pickDistinct(vert, 6);
  if (H.length < 2 || V.length < 2) return null;

  let best: Point[] | null = null;
  let bestScore = -1;
  for (let i = 0; i < H.length; i++) {
    for (let j = i + 1; j < H.length; j++) {
      for (let k = 0; k < V.length; k++) {
        for (let l = k + 1; l < V.length; l++) {
          const p1 = lineIntersection(H[i], V[k]);
          const p2 = lineIntersection(H[i], V[l]);
          const p3 = lineIntersection(H[j], V[k]);
          const p4 = lineIntersection(H[j], V[l]);
          if (!p1 || !p2 || !p3 || !p4) continue;
          const ordered = orderCorners([p1, p2, p3, p4]);
          const s = scoreQuad(ordered, width, height, click, { mag, thr });
          if (s > bestScore) {
            bestScore = s;
            best = ordered;
          }
        }
      }
    }
  }
  return best && bestScore > 0 ? { corners: best, score: bestScore } : null;
}

/** Corner-from-edge-ring fallback (works when Hough is sparse). */
function quadFromEdgeRing(
  mag: Float32Array,
  width: number,
  height: number,
  thr: number,
  click?: Point | null
): { corners: Point[]; score: number } | null {
  const cx = click?.x ?? width / 2;
  const cy = click?.y ?? height / 2;
  const points: Point[] = [];
  const step = Math.max(1, Math.floor(Math.min(width, height) / 200));
  for (let y = 2; y < height - 2; y += step) {
    for (let x = 2; x < width - 2; x += step) {
      if (mag[y * width + x] >= thr) points.push({ x, y });
    }
  }
  if (points.length < 40) return null;

  const scored = points
    .map((p) => ({ p, d: Math.hypot(p.x - cx, p.y - cy) }))
    .sort((a, b) => b.d - a.d);
  const ring = scored.slice(0, Math.min(500, scored.length)).map((s) => s.p);

  const buckets: Point[][] = [[], [], [], []];
  for (const p of ring) {
    const right = p.x >= cx;
    const bottom = p.y >= cy;
    const idx = right ? (bottom ? 1 : 0) : bottom ? 2 : 3;
    buckets[idx].push(p);
  }
  const corners: Point[] = [];
  for (let i = 0; i < 4; i++) {
    const bucket = buckets[i];
    if (bucket.length === 0) return null;
    let best = bucket[0];
    let bestD = -1;
    for (const p of bucket) {
      const d = Math.hypot(p.x - cx, p.y - cy);
      if (d > bestD) {
        bestD = d;
        best = p;
      }
    }
    corners.push(best);
  }
  const ordered = orderCorners(corners);
  const s = scoreQuad(ordered, width, height, click, { mag, thr });
  return s > 0 ? { corners: ordered, score: s } : null;
}

/**
 * Detect painting corners in full image coordinates.
 * Optional click focuses search around that point (like tapping the subject).
 */
export function detectPaintingCorners(
  image: HTMLImageElement | HTMLCanvasElement,
  click?: Point | null
): { corners: Point[]; detected: boolean } {
  const srcW =
    image instanceof HTMLImageElement ? image.naturalWidth : image.width;
  const srcH =
    image instanceof HTMLImageElement ? image.naturalHeight : image.height;
  if (srcW < 32 || srcH < 32) {
    return { corners: defaultCorners(srcW, srcH), detected: false };
  }

  const scale = Math.min(1, DETECT_MAX / Math.max(srcW, srcH));
  const w = Math.max(32, Math.round(srcW * scale));
  const h = Math.max(32, Math.round(srcH * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) {
    return { corners: defaultCorners(srcW, srcH), detected: false };
  }
  ctx.drawImage(image, 0, 0, w, h);
  const { data } = ctx.getImageData(0, 0, w, h);
  const gray = new Float32Array(w * h);
  for (let i = 0, p = 0; i < data.length; i += 4, p++) {
    gray[p] = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
  }
  const blurred = gaussianBlurGray(gray, w, h);
  const mag = sobelMag(blurred, w, h);
  let sum = 0;
  for (let i = 0; i < mag.length; i++) sum += mag[i];
  const mean = sum / (mag.length || 1);
  const thr = Math.max(22, mean * 1.55);

  const clickScaled = click
    ? { x: click.x * scale, y: click.y * scale }
    : null;

  const fromHough = quadFromHough(mag, w, h, thr, clickScaled);
  const fromRing = quadFromEdgeRing(mag, w, h, thr, clickScaled);

  let best = fromHough;
  if (!best || (fromRing && fromRing.score > best.score)) best = fromRing;

  if (!best) {
    return { corners: defaultCorners(srcW, srcH), detected: false };
  }

  const inv = 1 / scale;
  return {
    corners: best.corners.map((p) => ({
      x: clamp(p.x * inv, 0, srcW - 1),
      y: clamp(p.y * inv, 0, srcH - 1)
    })),
    detected: true
  };
}

function getPerspectiveTransform(src: Point[], dst: Point[]): Float64Array {
  const A: number[][] = [];
  const b: number[] = [];
  for (let i = 0; i < 4; i++) {
    const { x, y } = src[i];
    const u = dst[i].x;
    const v = dst[i].y;
    A.push([x, y, 1, 0, 0, 0, -x * u, -y * u]);
    b.push(u);
    A.push([0, 0, 0, x, y, 1, -x * v, -y * v]);
    b.push(v);
  }
  const h = solveLinear8(A, b);
  return new Float64Array([...h, 1]);
}

function solveLinear8(A: number[][], b: number[]): number[] {
  const n = 8;
  const M = A.map((row, i) => [...row, b[i]]);
  for (let col = 0; col < n; col++) {
    let pivot = col;
    for (let r = col + 1; r < n; r++) {
      if (Math.abs(M[r][col]) > Math.abs(M[pivot][col])) pivot = r;
    }
    [M[col], M[pivot]] = [M[pivot], M[col]];
    const div = M[col][col] || 1e-12;
    for (let c = col; c <= n; c++) M[col][c] /= div;
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const f = M[r][col];
      for (let c = col; c <= n; c++) M[r][c] -= f * M[col][c];
    }
  }
  return M.map((row) => row[n]);
}

function applyHomography(H: Float64Array, x: number, y: number): Point {
  const w = H[6] * x + H[7] * y + H[8];
  return {
    x: (H[0] * x + H[1] * y + H[2]) / w,
    y: (H[3] * x + H[4] * y + H[5]) / w
  };
}

function sampleBilinear(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  x: number,
  y: number
): [number, number, number, number] {
  if (x < 0 || y < 0 || x >= width - 1 || y >= height - 1) {
    const xx = clamp(Math.round(x), 0, width - 1);
    const yy = clamp(Math.round(y), 0, height - 1);
    const i = (yy * width + xx) * 4;
    return [data[i], data[i + 1], data[i + 2], data[i + 3]];
  }
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const fx = x - x0;
  const fy = y - y0;
  const i00 = (y0 * width + x0) * 4;
  const i10 = i00 + 4;
  const i01 = i00 + width * 4;
  const i11 = i01 + 4;
  // Interpolate RGB in linear light — gamma-space sampling looks too intense.
  const out: [number, number, number, number] = [0, 0, 0, 0];
  for (let c = 0; c < 3; c++) {
    const v =
      srgb8ToLinear(data[i00 + c]) * (1 - fx) * (1 - fy) +
      srgb8ToLinear(data[i10 + c]) * fx * (1 - fy) +
      srgb8ToLinear(data[i01 + c]) * (1 - fx) * fy +
      srgb8ToLinear(data[i11 + c]) * fx * fy;
    out[c] = linearToSrgb8(v);
  }
  out[3] = clamp(
    Math.round(
      data[i00 + 3] * (1 - fx) * (1 - fy) +
        data[i10 + 3] * fx * (1 - fy) +
        data[i01 + 3] * (1 - fx) * fy +
        data[i11 + 3] * fx * fy
    ),
    0,
    255
  );
  return out;
}

function flattenLightingInPlace(
  pixels: Uint8ClampedArray,
  width: number,
  height: number
) {
  const gray = new Float32Array(width * height);
  for (let i = 0, p = 0; i < pixels.length; i += 4, p++) {
    gray[p] = 0.299 * pixels[i] + 0.587 * pixels[i + 1] + 0.114 * pixels[i + 2];
  }
  const smallW = Math.max(8, Math.round(width / 22));
  const smallH = Math.max(8, Math.round(height / 22));
  const small = new Float32Array(smallW * smallH);
  for (let y = 0; y < smallH; y++) {
    for (let x = 0; x < smallW; x++) {
      const x0 = Math.floor((x * width) / smallW);
      const x1 = Math.floor(((x + 1) * width) / smallW);
      const y0 = Math.floor((y * height) / smallH);
      const y1 = Math.floor(((y + 1) * height) / smallH);
      let sum = 0;
      let n = 0;
      for (let yy = y0; yy < y1; yy++) {
        for (let xx = x0; xx < x1; xx++) {
          sum += gray[yy * width + xx];
          n++;
        }
      }
      small[y * smallW + x] = n ? sum / n : 128;
    }
  }
  let mean = 0;
  for (let i = 0; i < small.length; i++) mean += small[i];
  mean /= small.length || 1;
  const target = clamp(mean, 90, 190);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const sx = ((x + 0.5) * smallW) / width - 0.5;
      const sy = ((y + 0.5) * smallH) / height - 0.5;
      const x0 = clamp(Math.floor(sx), 0, smallW - 1);
      const y0 = clamp(Math.floor(sy), 0, smallH - 1);
      const x1 = Math.min(x0 + 1, smallW - 1);
      const y1 = Math.min(y0 + 1, smallH - 1);
      const fx = clamp(sx - x0, 0, 1);
      const fy = clamp(sy - y0, 0, 1);
      const local =
        small[y0 * smallW + x0] * (1 - fx) * (1 - fy) +
        small[y0 * smallW + x1] * fx * (1 - fy) +
        small[y1 * smallW + x0] * (1 - fx) * fy +
        small[y1 * smallW + x1] * fx * fy;
      const gain = clamp(target / Math.max(20, local), 0.75, 1.4);
      const i = (y * width + x) * 4;
      pixels[i] = clamp(pixels[i] * gain, 0, 255);
      pixels[i + 1] = clamp(pixels[i + 1] * gain, 0, 255);
      pixels[i + 2] = clamp(pixels[i + 2] * gain, 0, 255);
    }
  }
}

export function warpPaintingPerspective(
  image: HTMLImageElement,
  corners: Point[],
  options?: { flattenLighting?: boolean; maxSide?: number }
): HTMLCanvasElement {
  const ordered = orderCorners(corners);
  const [tl, tr, br, bl] = ordered;
  let outW = Math.max(
    64,
    Math.round(Math.max(dist(tl, tr), dist(bl, br)))
  );
  let outH = Math.max(
    64,
    Math.round(Math.max(dist(tl, bl), dist(tr, br)))
  );
  const maxSide = options?.maxSide ?? 3200;
  const scale = Math.min(1, maxSide / Math.max(outW, outH));
  outW = Math.max(64, Math.round(outW * scale));
  outH = Math.max(64, Math.round(outH * scale));

  const srcCanvas = document.createElement("canvas");
  srcCanvas.width = image.naturalWidth;
  srcCanvas.height = image.naturalHeight;
  const sctx = srcCanvas.getContext("2d", {
    willReadFrequently: true,
    colorSpace: "srgb"
  });
  if (!sctx) throw new Error("No se pudo leer la imagen.");
  // Exact pixel read — no smoothing before getImageData.
  sctx.imageSmoothingEnabled = false;
  sctx.drawImage(image, 0, 0);
  const srcData = sctx.getImageData(0, 0, srcCanvas.width, srcCanvas.height);

  const dst: Point[] = [
    { x: 0, y: 0 },
    { x: outW - 1, y: 0 },
    { x: outW - 1, y: outH - 1 },
    { x: 0, y: outH - 1 }
  ];
  const Hinv = getPerspectiveTransform(dst, ordered);

  const out = document.createElement("canvas");
  out.width = outW;
  out.height = outH;
  const octx = out.getContext("2d", { colorSpace: "srgb" });
  if (!octx) throw new Error("No se pudo crear el lienzo.");
  const outImg = octx.createImageData(outW, outH);
  const pixels = outImg.data;

  for (let y = 0; y < outH; y++) {
    for (let x = 0; x < outW; x++) {
      const src = applyHomography(Hinv, x, y);
      const [r, g, b, a] = sampleBilinear(
        srcData.data,
        srcCanvas.width,
        srcCanvas.height,
        src.x,
        src.y
      );
      const i = (y * outW + x) * 4;
      pixels[i] = r;
      pixels[i + 1] = g;
      pixels[i + 2] = b;
      pixels[i + 3] = a;
    }
  }
  if (options?.flattenLighting === true) {
    flattenLightingInPlace(pixels, outW, outH);
  }
  octx.putImageData(outImg, 0, 0);
  return out;
}

export function canvasToJpegDataUrl(canvas: HTMLCanvasElement, quality = 0.98) {
  return canvas.toDataURL("image/jpeg", quality);
}

/** Prefer PNG for intermediates so colors aren’t shifted before the edit step. */
export function canvasToPngDataUrl(canvas: HTMLCanvasElement) {
  return canvas.toDataURL("image/png");
}

/** Detect + warp in one step (sync, light — no WASM). */
export function autoScanPainting(
  image: HTMLImageElement,
  click?: Point | null
): {
  dataUrl: string;
  corners: Point[];
  detected: boolean;
  canvas: HTMLCanvasElement;
} {
  const { corners, detected } = detectPaintingCorners(image, click);
  // Do not auto-flatten lighting — that changes the painting’s real colors.
  const canvas = warpPaintingPerspective(image, corners, {
    flattenLighting: false
  });
  return {
    dataUrl: canvasToPngDataUrl(canvas),
    corners,
    detected,
    canvas
  };
}
