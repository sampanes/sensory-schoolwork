import * as tf from "@tensorflow/tfjs";

export const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

const MODEL_URLS = [
  "https://cdn.jsdelivr.net/gh/mbotsu/emnist-letters@master/models/model_fp16/model.json",
  "https://cdn.jsdelivr.net/gh/mbotsu/emnist-letters@master/models/model/model.json",
];

export type RecognitionResult = {
  hasInk: boolean;
  guess: string | null;
  confidence: number;
  runnerUp: string | null;
  runnerUpConfidence: number;
  margin: number;
  inkRatio: number;
};

type InkBounds = {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  pixelCount: number;
};

let modelPromise: Promise<tf.LayersModel> | null = null;

export async function loadHandwritingModel() {
  if (!modelPromise) {
    modelPromise = (async () => {
      await tf.ready();

      try {
        await tf.setBackend("webgl");
      } catch {
        await tf.setBackend("cpu");
      }

      let model: tf.LayersModel | null = null;

      for (const url of MODEL_URLS) {
        try {
          model = await tf.loadLayersModel(url);
          break;
        } catch {
          console.warn(`Failed to load model from ${url}, trying next…`);
        }
      }

      if (!model) {
        throw new Error("Could not load handwriting model from any source.");
      }

      tf.tidy(() => {
        const warmupInput = tf.randomNormal([1, 28, 28, 1]);
        const warmupOutput = model.predict(warmupInput);
        const tensor = Array.isArray(warmupOutput) ? warmupOutput[0] : warmupOutput;
        (tensor as tf.Tensor).dataSync();
      });

      return model;
    })();
  }

  return modelPromise;
}

export function clearCanvasSurface(canvas: HTMLCanvasElement) {
  const context = canvas.getContext("2d");

  if (!context) {
    return;
  }

  context.save();
  context.setTransform(1, 0, 0, 1, 0, 0);
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.restore();
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

function cropToCanvas(sourceCanvas: HTMLCanvasElement, bounds: InkBounds) {
  const padding = 16;
  const startX = Math.max(bounds.minX - padding, 0);
  const startY = Math.max(bounds.minY - padding, 0);
  const width = Math.min(sourceCanvas.width - startX, bounds.maxX - bounds.minX + 1 + padding * 2);
  const height = Math.min(sourceCanvas.height - startY, bounds.maxY - bounds.minY + 1 + padding * 2);

  const outputCanvas = document.createElement("canvas");
  outputCanvas.width = Math.max(width, 1);
  outputCanvas.height = Math.max(height, 1);

  const outputContext = outputCanvas.getContext("2d");

  if (!outputContext) {
    return outputCanvas;
  }

  outputContext.fillStyle = "#ffffff";
  outputContext.fillRect(0, 0, outputCanvas.width, outputCanvas.height);
  outputContext.drawImage(
    sourceCanvas,
    startX,
    startY,
    width,
    height,
    0,
    0,
    width,
    height
  );

  return outputCanvas;
}

export async function recognizeCanvas(
  model: tf.LayersModel,
  canvas: HTMLCanvasElement
): Promise<RecognitionResult> {
  const context = canvas.getContext("2d", { willReadFrequently: true });

  if (!context) {
    return {
      hasInk: false,
      guess: null,
      confidence: 0,
      runnerUp: null,
      runnerUpConfidence: 0,
      margin: 0,
      inkRatio: 0,
    };
  }

  const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
  const bounds = getInkBounds(imageData);

  if (!bounds) {
    return {
      hasInk: false,
      guess: null,
      confidence: 0,
      runnerUp: null,
      runnerUpConfidence: 0,
      margin: 0,
      inkRatio: 0,
    };
  }

  const inkRatio = bounds.pixelCount / (imageData.width * imageData.height);
  const croppedCanvas = cropToCanvas(canvas, bounds);

  const scores = tf.tidy(() => {
    const targetDimension = 28;
    const edgePadding = 2;
    const resizeDimension = targetDimension - edgePadding * 2;
    const squareSize = Math.max(croppedCanvas.width, croppedCanvas.height);
    const deltaX = Math.floor((squareSize - croppedCanvas.width) / 2);
    const deltaY = Math.floor((squareSize - croppedCanvas.height) / 2);

    const squareCanvas = document.createElement("canvas");
    squareCanvas.width = squareSize;
    squareCanvas.height = squareSize;

    const squareContext = squareCanvas.getContext("2d");

    if (!squareContext) {
      return [] as number[];
    }

    squareContext.fillStyle = "#ffffff";
    squareContext.fillRect(0, 0, squareSize, squareSize);
    squareContext.drawImage(croppedCanvas, deltaX, deltaY);

    let tensor = tf.browser.fromPixels(squareCanvas, 1) as tf.Tensor3D;
    tensor = tf.image.resizeBilinear(tensor, [resizeDimension, resizeDimension]);
    tensor = tf.pad(tensor, [[edgePadding, edgePadding], [edgePadding, edgePadding], [0, 0]], 255) as tf.Tensor3D;

    const normalized = tf.scalar(1).sub(tensor.toFloat().div(255)) as tf.Tensor3D;
    const batched = normalized.expandDims(0);
    const prediction = model.predict(batched);
    const outputTensor = Array.isArray(prediction) ? prediction[0] : prediction;

    return Array.from((outputTensor as tf.Tensor).dataSync());
  });

  if (!scores.length) {
    return {
      hasInk: false,
      guess: null,
      confidence: 0,
      runnerUp: null,
      runnerUpConfidence: 0,
      margin: 0,
      inkRatio,
    };
  }

  const ranked = scores
    .map((score, index) => ({ score, index }))
    .sort((first, second) => second.score - first.score);

  const best = ranked[0];
  const second = ranked[1] ?? ranked[0];

  return {
    hasInk: true,
    guess: LETTERS[best.index] ?? null,
    confidence: best.score,
    runnerUp: LETTERS[second.index] ?? null,
    runnerUpConfidence: second.score,
    margin: best.score - second.score,
    inkRatio,
  };
}
