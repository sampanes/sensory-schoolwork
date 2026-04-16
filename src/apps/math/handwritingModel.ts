import * as tf from "@tensorflow/tfjs";

export const DIGITS = "0123456789";

const BASE_URL = import.meta.env.BASE_URL ?? "/";

function withBaseUrl(path: string) {
  const normalizedBase = BASE_URL.endsWith("/") ? BASE_URL : `${BASE_URL}/`;
  const normalizedPath = path.startsWith("/") ? path.slice(1) : path;
  return `${normalizedBase}${normalizedPath}`;
}

type ModelCandidate = {
  url: string;
  kind: "graph" | "layers";
  label: string;
  inputMode: "inverted_uint8" | "inverted_unit_float";
};

const MODEL_CANDIDATES: ModelCandidate[] = [
  {
    url: withBaseUrl("models/math/candidate_cnn/model.json"),
    kind: "graph",
    label: "local_cnn_graph",
    inputMode: "inverted_uint8",
  },
  {
    url: withBaseUrl("models/math/current_linear/model.json"),
    kind: "layers",
    label: "local_linear_fallback",
    inputMode: "inverted_unit_float",
  },
];

// ── Topology: which digits are compatible with each hole count ───────────────
// 0 holes → strokes with no enclosed region  (1 2 3 5 7)
// 1 hole  → one enclosed loop                (0 2 4 6 9)  — 2 included because
//           a loopy 2 closes its bottom curve into a hole
// 2 holes → two enclosed loops               (8)
const TOPOLOGY_COMPAT: ReadonlyMap<number, ReadonlySet<number>> = new Map([
  [0, new Set([1, 2, 3, 5, 7])],
  [1, new Set([0, 2, 4, 6, 9])],
  [2, new Set([8])],
]);

export type PreprocessMeta = {
  originalWidth: number;
  originalHeight: number;
  inkBounds: { minX: number; minY: number; maxX: number; maxY: number; pixelCount: number };
  cropPadding: number;
  cropRegion: { x: number; y: number; width: number; height: number };
  croppedSize: { width: number; height: number };
  squareSize: number;
  resizeDimension: number;
  edgePadding: number;
  targetDimension: number;
  normalization: string;
  isCNN: boolean;
  modelInputShape: string;
  tfBackend: string;
  modelSourceUrl: string;
  holeCount: number;
  topologyFiltered: boolean;
};

export type LoadedModelInfo = {
  modelSourceUrl: string;
  isCNN: boolean;
  modelInputShape: string;
  tfBackend: string;
  inputMode: "inverted_uint8" | "inverted_unit_float";
};

export type RecognitionResult = {
  hasInk: boolean;
  guess: string | null;
  confidence: number;
  runnerUp: string | null;
  runnerUpConfidence: number;
  margin: number;
  inkRatio: number;
  allScores: Array<{ digit: string; score: number }>;
  preprocessMeta: PreprocessMeta | null;
  processedCanvas: HTMLCanvasElement | null;
  modelInputPreviewCanvas: HTMLCanvasElement | null;
};

type InkBounds = {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  pixelCount: number;
};

export type DigitModel = tf.GraphModel | tf.LayersModel;

let modelPromise: Promise<DigitModel> | null = null;
let loadedModelInfo: LoadedModelInfo | null = null;

export function getLoadedHandwritingModelInfo(): LoadedModelInfo | null {
  return loadedModelInfo;
}

export async function loadHandwritingModel() {
  if (!modelPromise) {
    modelPromise = (async () => {
      await tf.ready();

      try {
        await tf.setBackend("webgl");
      } catch {
        await tf.setBackend("cpu");
      }

      let model: DigitModel | null = null;
      let loadedFrom: ModelCandidate | null = null;

      for (const candidate of MODEL_CANDIDATES) {
        try {
          model = candidate.kind === "graph"
            ? await tf.loadGraphModel(candidate.url)
            : await tf.loadLayersModel(candidate.url);
          loadedFrom = candidate;
          break;
        } catch {
          console.warn(`Failed to load digit model from ${candidate.url}, trying next...`);
        }
      }

      if (!model) {
        throw new Error("Could not load digit handwriting model from any source.");
      }

      const isCNN = (model.inputs[0].shape?.length ?? 0) >= 4;
      const modelInputShape = isCNN ? "[1, 28, 28, 1]" : "[1, 784]";

      tf.tidy(() => {
        const warmupInput = isCNN ? tf.randomNormal([1, 28, 28, 1]) : tf.randomNormal([1, 784]);
        const warmupOutput = model.predict(warmupInput);
        const tensor = Array.isArray(warmupOutput) ? warmupOutput[0] : warmupOutput;
        (tensor as tf.Tensor).dataSync();
      });

      loadedModelInfo = {
        modelSourceUrl: loadedFrom ? `${loadedFrom.label}: ${loadedFrom.url}` : "(unknown)",
        isCNN,
        modelInputShape,
        tfBackend: tf.getBackend() ?? "unknown",
        inputMode: loadedFrom?.inputMode ?? "inverted_unit_float",
      };

      return model;
    })();
  }

  return modelPromise;
}

function getInkBounds(imageData: ImageData, threshold = 245): InkBounds | null {
  const { data, width, height } = imageData;
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  let pixelCount = 0;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = (y * width + x) * 4;
      const red = data[index];
      const green = data[index + 1];
      const blue = data[index + 2];
      const alpha = data[index + 3];
      const brightness = (red + green + blue) / 3;

      if (alpha > 0 && brightness < threshold) {
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
        pixelCount += 1;
      }
    }
  }

  if (maxX === -1 || maxY === -1) {
    return null;
  }

  return { minX, minY, maxX, maxY, pixelCount };
}

const CROP_PADDING = 16;

function cropToCanvas(sourceCanvas: HTMLCanvasElement, bounds: InkBounds) {
  const startX = Math.max(bounds.minX - CROP_PADDING, 0);
  const startY = Math.max(bounds.minY - CROP_PADDING, 0);
  const width = Math.min(sourceCanvas.width - startX, bounds.maxX - bounds.minX + 1 + CROP_PADDING * 2);
  const height = Math.min(sourceCanvas.height - startY, bounds.maxY - bounds.minY + 1 + CROP_PADDING * 2);

  const outputCanvas = document.createElement("canvas");
  outputCanvas.width = Math.max(width, 1);
  outputCanvas.height = Math.max(height, 1);

  const outputContext = outputCanvas.getContext("2d");
  if (!outputContext) {
    return { canvas: outputCanvas, region: { x: startX, y: startY, width, height } };
  }

  outputContext.fillStyle = "#ffffff";
  outputContext.fillRect(0, 0, outputCanvas.width, outputCanvas.height);
  outputContext.drawImage(sourceCanvas, startX, startY, width, height, 0, 0, width, height);

  return { canvas: outputCanvas, region: { x: startX, y: startY, width, height } };
}

/**
 * Count enclosed background regions (holes) in a 28×28 canvas using
 * flood-fill from the border. Each unreachable background component is a hole.
 *
 * Threshold of 200: anything darker than near-white is treated as ink.
 * This is intentionally loose so anti-aliased stroke edges stay connected.
 */
function countHoles(canvas: HTMLCanvasElement): number {
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return -1;

  const w = canvas.width;
  const h = canvas.height;
  const data = ctx.getImageData(0, 0, w, h).data;

  // true = ink pixel (dark)
  const ink = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) {
    const brightness = (data[i * 4] + data[i * 4 + 1] + data[i * 4 + 2]) / 3;
    ink[i] = brightness < 200 ? 1 : 0;
  }

  // BFS from every border background pixel to find exterior background
  const exterior = new Uint8Array(w * h);
  const queue: number[] = [];

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = y * w + x;
      if (!ink[idx] && (y === 0 || y === h - 1 || x === 0 || x === w - 1)) {
        exterior[idx] = 1;
        queue.push(idx);
      }
    }
  }

  let qi = 0;
  while (qi < queue.length) {
    const idx = queue[qi++];
    const x = idx % w;
    const y = (idx - x) / w;

    if (x > 0     && !ink[idx - 1] && !exterior[idx - 1]) { exterior[idx - 1] = 1; queue.push(idx - 1); }
    if (x < w - 1 && !ink[idx + 1] && !exterior[idx + 1]) { exterior[idx + 1] = 1; queue.push(idx + 1); }
    if (y > 0     && !ink[idx - w] && !exterior[idx - w]) { exterior[idx - w] = 1; queue.push(idx - w); }
    if (y < h - 1 && !ink[idx + w] && !exterior[idx + w]) { exterior[idx + w] = 1; queue.push(idx + w); }
  }

  // Each connected interior background region that was never reached = one hole
  const visited = new Uint8Array(w * h);
  let holes = 0;

  for (let start = 0; start < w * h; start++) {
    if (ink[start] || exterior[start] || visited[start]) continue;

    holes++;
    const q2: number[] = [start];
    visited[start] = 1;
    let qi2 = 0;

    while (qi2 < q2.length) {
      const idx = q2[qi2++];
      const x = idx % w;
      const y = (idx - x) / w;

      if (x > 0     && !ink[idx - 1] && !exterior[idx - 1] && !visited[idx - 1]) { visited[idx - 1] = 1; q2.push(idx - 1); }
      if (x < w - 1 && !ink[idx + 1] && !exterior[idx + 1] && !visited[idx + 1]) { visited[idx + 1] = 1; q2.push(idx + 1); }
      if (y > 0     && !ink[idx - w] && !exterior[idx - w] && !visited[idx - w]) { visited[idx - w] = 1; q2.push(idx - w); }
      if (y < h - 1 && !ink[idx + w] && !exterior[idx + w] && !visited[idx + w]) { visited[idx + w] = 1; q2.push(idx + w); }
    }
  }

  return holes;
}

/**
 * Reorder ranked scores so topologically-consistent digits come first.
 * Incompatible digits are pushed to the back (still visible as runner-ups).
 * Returns whether the top entry changed.
 */
function applyTopologyFilter(
  ranked: Array<{ score: number; index: number }>,
  holeCount: number
): { filtered: Array<{ score: number; index: number }>; changed: boolean } {
  const compat = TOPOLOGY_COMPAT.get(holeCount);
  if (!compat) return { filtered: ranked, changed: false };

  const yes = ranked.filter((r) => compat.has(r.index));
  const no = ranked.filter((r) => !compat.has(r.index));
  const filtered = [...yes, ...no];
  const changed = filtered[0]?.index !== ranked[0]?.index;

  return { filtered, changed };
}

const emptyResult = (inkRatio = 0): RecognitionResult => ({
  hasInk: false,
  guess: null,
  confidence: 0,
  runnerUp: null,
  runnerUpConfidence: 0,
  margin: 0,
  inkRatio,
  allScores: [],
  preprocessMeta: null,
  processedCanvas: null,
  modelInputPreviewCanvas: null,
});

export async function recognizeCanvas(
  model: DigitModel,
  canvas: HTMLCanvasElement
): Promise<RecognitionResult> {
  const context = canvas.getContext("2d", { willReadFrequently: true });

  if (!context) {
    return emptyResult();
  }

  const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
  const bounds = getInkBounds(imageData);

  if (!bounds) {
    return emptyResult();
  }

  const inkRatio = bounds.pixelCount / (imageData.width * imageData.height);
  const { canvas: croppedCanvas, region: cropRegion } = cropToCanvas(canvas, bounds);

  // ── Pipeline constants ───────────────────────────────────────────────────────
  // edgePadding=4 matches MNIST's standard: digit in a 20×20 center,
  // 4px white border on each side → 28×28 total.
  const targetDimension = 28;
  const edgePadding = 4;
  const resizeDimension = targetDimension - edgePadding * 2; // 20

  // ── Step 1: squarify (center shorter axis on white canvas) ──────────────────
  const squareSize = Math.max(croppedCanvas.width, croppedCanvas.height);
  const deltaX = Math.floor((squareSize - croppedCanvas.width) / 2);
  const deltaY = Math.floor((squareSize - croppedCanvas.height) / 2);

  const squareCanvas = document.createElement("canvas");
  squareCanvas.width = squareSize;
  squareCanvas.height = squareSize;

  const squareContext = squareCanvas.getContext("2d");
  if (!squareContext) {
    return emptyResult(inkRatio);
  }

  squareContext.fillStyle = "#ffffff";
  squareContext.fillRect(0, 0, squareSize, squareSize);
  squareContext.drawImage(croppedCanvas, deltaX, deltaY);

  // ── Step 2: build 28×28 viewable canvas for debug/topology ──────────────────
  // White background, black ink — pre-inversion view of what the model receives.
  // drawImage bilinear ≈ tf.image.resizeBilinear so it faithfully represents
  // the 20×20 digit region with 4px white borders.
  const processedCanvas = document.createElement("canvas");
  processedCanvas.width = targetDimension;
  processedCanvas.height = targetDimension;
  const processedCtx = processedCanvas.getContext("2d");
  if (processedCtx) {
    processedCtx.fillStyle = "#ffffff";
    processedCtx.fillRect(0, 0, targetDimension, targetDimension);
    processedCtx.drawImage(
      squareCanvas,
      0, 0, squareSize, squareSize,
      edgePadding, edgePadding, resizeDimension, resizeDimension
    );
  }

  // Debug-only visualization of the actual normalized model input:
  // black background with white ink after inversion, still rendered as 0-255 pixels.
  const modelInputPreviewCanvas = document.createElement("canvas");
  modelInputPreviewCanvas.width = targetDimension;
  modelInputPreviewCanvas.height = targetDimension;
  const modelInputPreviewCtx = modelInputPreviewCanvas.getContext("2d");
  if (modelInputPreviewCtx) {
    modelInputPreviewCtx.fillStyle = "#000000";
    modelInputPreviewCtx.fillRect(0, 0, targetDimension, targetDimension);
    modelInputPreviewCtx.drawImage(processedCanvas, 0, 0);

    const previewImageData = modelInputPreviewCtx.getImageData(0, 0, targetDimension, targetDimension);
    const { data } = previewImageData;
    for (let i = 0; i < data.length; i += 4) {
      const value = 255 - data[i];
      data[i] = value;
      data[i + 1] = value;
      data[i + 2] = value;
      data[i + 3] = 255;
    }
    modelInputPreviewCtx.putImageData(previewImageData, 0, 0);
  }

  // ── Step 3: topology — count enclosed loops in the 28×28 bitmask ────────────
  const holeCount = countHoles(processedCanvas);

  // ── Step 4: run the model ────────────────────────────────────────────────────
  const isCNN = (model.inputs[0].shape?.length ?? 0) >= 4;

  const scores = tf.tidy(() => {
    // fromPixels: white bg (255), black ink (~0)
    let tensor = tf.browser.fromPixels(squareCanvas, 1) as tf.Tensor3D;
    // Resize digit to 20×20
    tensor = tf.image.resizeBilinear(tensor, [resizeDimension, resizeDimension]);
    // Pad 4px with 255 (white) → 28×28
    tensor = tf.pad(tensor, [[edgePadding, edgePadding], [edgePadding, edgePadding], [0, 0]], 255) as tf.Tensor3D;
    // Invert + normalize: white→0.0 (background), black→1.0 (ink) — MNIST format
    const invertedFloat = tf.scalar(255).sub(tensor.toFloat()) as tf.Tensor3D;
    const prepared = loadedModelInfo?.inputMode === "inverted_uint8"
      ? invertedFloat
      : tf.scalar(1).sub(tensor.toFloat().div(255)) as tf.Tensor3D;
    const batched = isCNN ? prepared.expandDims(0) : prepared.expandDims(0).reshape([1, 784]);
    const prediction = model.predict(batched as tf.Tensor);
    const outputTensor = Array.isArray(prediction) ? prediction[0] : prediction;

    return Array.from((outputTensor as tf.Tensor).dataSync());
  });

  if (!scores.length) {
    return emptyResult(inkRatio);
  }

  // ── Step 5: rank + topology filter ──────────────────────────────────────────
  const rawRanked = scores
    .map((score, index) => ({ score, index }))
    .sort((a, b) => b.score - a.score);

  const { filtered: ranked, changed: topologyFiltered } = applyTopologyFilter(rawRanked, holeCount);

  const best = ranked[0];
  const second = ranked[1] ?? ranked[0];

  // ── Step 6: build result ─────────────────────────────────────────────────────
  const allScores = scores
    .map((score, index) => ({ digit: DIGITS[index] ?? String(index), score }))
    .sort((a, b) => b.score - a.score);

  const preprocessMeta: PreprocessMeta = {
    originalWidth: canvas.width,
    originalHeight: canvas.height,
    inkBounds: { ...bounds },
    cropPadding: CROP_PADDING,
    cropRegion,
    croppedSize: { width: croppedCanvas.width, height: croppedCanvas.height },
    squareSize,
    resizeDimension,
    edgePadding,
    targetDimension,
    normalization: "inverted: 1 - pixel/255  (white→0.0, black→1.0)",
    isCNN,
    modelInputShape: isCNN
      ? `[1, ${targetDimension}, ${targetDimension}, 1]`
      : `[1, ${targetDimension * targetDimension}]`,
    tfBackend: tf.getBackend() ?? "unknown",
    modelSourceUrl: loadedModelInfo?.modelSourceUrl ?? "(unknown)",
    holeCount,
    topologyFiltered,
  };

  return {
    hasInk: true,
    guess: DIGITS[best.index] ?? null,
    confidence: best.score,
    runnerUp: DIGITS[second.index] ?? null,
    runnerUpConfidence: second.score,
    margin: best.score - second.score,
    inkRatio,
    allScores,
    preprocessMeta,
    processedCanvas,
    modelInputPreviewCanvas,
  };
}

export function canvasHasInk(canvas: HTMLCanvasElement): boolean {
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) {
    return false;
  }

  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  return getInkBounds(imageData) !== null;
}
