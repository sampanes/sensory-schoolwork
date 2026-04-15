import type { RecognitionResult } from "./handwritingModel";

type SlotName = "left" | "right";

export type DebugSaveEntry = {
  timestamp: Date;
  expected: string | null;
  slotName: SlotName;
  outcome:
    | "wrong"
    | "retry"
    | "accepted"
    | "accepted_runner_up"
    | "accepted_correct_top_guess"
    | "accepted_expected_shape";
  reason:
    | "blank_box_has_ink"
    | "wrong_digit_confident"
    | "wrong_digit_low_confidence"
    | "wrong_digit_runner_up_accept"
    | "correct_top_guess"
    | "expected_four_open_shape_accept"
    | "expected_strong_raw_topology_override";
  result: RecognitionResult;
};

export type SerializedDebugEntry = {
  baseFilename: string;
  report: object;
  images: {
    debugPreviewDataUrl: string | null;
    modelInputPreviewDataUrl: string | null;
  };
};

let dirHandle: FileSystemDirectoryHandle | null = null;

function formatTimestamp(date: Date): string {
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  const hh = String(date.getHours()).padStart(2, "0");
  const min = String(date.getMinutes()).padStart(2, "0");
  const ss = String(date.getSeconds()).padStart(2, "0");
  const ms = String(date.getMilliseconds()).padStart(3, "0");
  return `${mm}${dd}_${hh}${min}${ss}_${ms}`;
}

async function getOrPickFolder(): Promise<FileSystemDirectoryHandle | null> {
  if (dirHandle) {
    return dirHandle;
  }

  if (!("showDirectoryPicker" in window)) {
    console.warn("[math debug] File System Access API is not available in this browser. Debug saves are disabled.");
    return null;
  }

  try {
    dirHandle = await (
      window as Window & { showDirectoryPicker: (opts?: object) => Promise<FileSystemDirectoryHandle> }
    ).showDirectoryPicker({ id: "math-debug", mode: "readwrite", startIn: "downloads" });
    console.info("[math debug] Saving wrong-digit captures to selected folder.");
    return dirHandle;
  } catch {
    return null;
  }
}

function canvasToPngBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("canvas.toBlob returned null"))),
      "image/png"
    );
  });
}

function canvasToPngDataUrl(canvas: HTMLCanvasElement): string {
  return canvas.toDataURL("image/png");
}

function upscaleCanvas(source: HTMLCanvasElement, scale = 10): HTMLCanvasElement {
  const out = document.createElement("canvas");
  out.width = source.width * scale;
  out.height = source.height * scale;
  const ctx = out.getContext("2d");
  if (ctx) {
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(source, 0, 0, out.width, out.height);
  }
  return out;
}

function round(n: number, decimals = 6): number {
  return parseFloat(n.toFixed(decimals));
}

function buildReport(
  entry: DebugSaveEntry,
  debugPreviewFilename: string,
  modelPreviewFilename: string
): object {
  const { timestamp, expected, slotName, result } = entry;
  const m = result.preprocessMeta;

  const report: Record<string, unknown> = {
    meta: {
      timestamp: timestamp.toISOString(),
      expected,
      slotName,
      outcome: entry.outcome,
      reason: entry.reason,
      imageFiles: {
        debugPreview: debugPreviewFilename,
        modelInputPreview: modelPreviewFilename,
      },
      imageNotes: {
        debugPreview:
          "280x280 PNG showing the human-readable 28x28 pre-inversion view: black ink on white background.",
        modelInputPreview:
          "280x280 PNG showing the actual model-view 28x28 image after inversion: white ink on black background, before float normalization.",
      },
    },
    recognition: {
      guess: result.guess,
      confidence: round(result.confidence),
      runnerUp: result.runnerUp,
      runnerUpConfidence: round(result.runnerUpConfidence),
      margin: round(result.margin),
      inkRatio: round(result.inkRatio),
      allScoresRanked: result.allScores.map((s) => ({
        digit: s.digit,
        score: round(s.score),
        percent: `${(s.score * 100).toFixed(2)}%`,
      })),
    },
  };

  if (m) {
    const topoCompat: Record<number, string> = { 0: "1 2 3 5 7", 1: "0 2 4 6 9", 2: "8" };
    report.preprocessing = {
      originalCanvasSize: { width: m.originalWidth, height: m.originalHeight },
      inkBounds: m.inkBounds,
      cropPadding: m.cropPadding,
      cropRegion: m.cropRegion,
      croppedSize: m.croppedSize,
      squareSize: m.squareSize,
      resizeDimension: m.resizeDimension,
      edgePadding: m.edgePadding,
      targetDimension: m.targetDimension,
      normalization: m.normalization,
      isCNN: m.isCNN,
      modelInputShape: m.modelInputShape,
      tfBackend: m.tfBackend,
      topology: {
        holeCount: m.holeCount,
        compatibleDigits: topoCompat[m.holeCount] ?? "(unknown - no filter applied)",
        filteredRanking: m.topologyFiltered,
      },
      model: {
        sourceUrl: m.modelSourceUrl,
        isCNN: m.isCNN,
        inputShape: m.modelInputShape,
        backend: m.tfBackend,
      },
      steps: [
        `1. Read canvas pixels (${m.originalWidth}x${m.originalHeight}). Threshold brightness < 245 = ink.`,
        `2. Locate ink bounds: (${m.inkBounds.minX}, ${m.inkBounds.minY}) to (${m.inkBounds.maxX}, ${m.inkBounds.maxY}), ${m.inkBounds.pixelCount} ink pixels.`,
        `3. Add ${m.cropPadding}px padding, crop to ${m.croppedSize.width}x${m.croppedSize.height}.`,
        `4. Squarify by centering shorter axis on white canvas -> ${m.squareSize}x${m.squareSize}.`,
        `5. Resize to ${m.resizeDimension}x${m.resizeDimension}.`,
        `6. Pad with white border (${m.edgePadding}px each side) -> ${m.targetDimension}x${m.targetDimension}.`,
        `7. Invert and normalize for model input: white background -> 0.0, black ink -> 1.0.`,
        m.isCNN
          ? `8. Expand dims -> batch shape ${m.modelInputShape}.`
          : `8. Expand dims and flatten -> batch shape ${m.modelInputShape}.`,
        `9. Predict on ${m.tfBackend} backend.`,
        `10. Count holes and optionally reorder ranking using topology filter.`,
      ],
    };
  }

  return report;
}

export function buildDebugEntryBaseFilename(entry: DebugSaveEntry): string {
  const ts = formatTimestamp(entry.timestamp);
  return `${entry.expected ?? "blank"}_${ts}`;
}

export async function serializeDebugEntry(entry: DebugSaveEntry): Promise<SerializedDebugEntry> {
  const baseFilename = buildDebugEntryBaseFilename(entry);
  const debugPreviewFilename = `${baseFilename}_debug.png`;
  const modelPreviewFilename = `${baseFilename}_model.png`;

  const upscaledDebug = entry.result.processedCanvas ? upscaleCanvas(entry.result.processedCanvas, 10) : null;
  const upscaledModel = entry.result.modelInputPreviewCanvas
    ? upscaleCanvas(entry.result.modelInputPreviewCanvas, 10)
    : null;

  return {
    baseFilename,
    report: buildReport(entry, debugPreviewFilename, modelPreviewFilename),
    images: {
      debugPreviewDataUrl: upscaledDebug ? canvasToPngDataUrl(upscaledDebug) : null,
      modelInputPreviewDataUrl: upscaledModel ? canvasToPngDataUrl(upscaledModel) : null,
    },
  };
}

export async function saveDebugEntry(entry: DebugSaveEntry): Promise<void> {
  const handle = await getOrPickFolder();
  if (!handle) {
    return;
  }

  const base = buildDebugEntryBaseFilename(entry);
  const debugPreviewFilename = `${base}_debug.png`;
  const modelPreviewFilename = `${base}_model.png`;
  const reportFilename = `${base}.json`;

  try {
    if (entry.result.processedCanvas) {
      const upscaledDebug = upscaleCanvas(entry.result.processedCanvas, 10);
      const debugBlob = await canvasToPngBlob(upscaledDebug);
      const debugHandle = await handle.getFileHandle(debugPreviewFilename, { create: true });
      const debugWritable = await debugHandle.createWritable();
      await debugWritable.write(debugBlob);
      await debugWritable.close();
    }

    if (entry.result.modelInputPreviewCanvas) {
      const upscaledModel = upscaleCanvas(entry.result.modelInputPreviewCanvas, 10);
      const modelBlob = await canvasToPngBlob(upscaledModel);
      const modelHandle = await handle.getFileHandle(modelPreviewFilename, { create: true });
      const modelWritable = await modelHandle.createWritable();
      await modelWritable.write(modelBlob);
      await modelWritable.close();
    }

    const report = buildReport(entry, debugPreviewFilename, modelPreviewFilename);
    const reportHandle = await handle.getFileHandle(reportFilename, { create: true });
    const reportWritable = await reportHandle.createWritable();
    await reportWritable.write(JSON.stringify(report, null, 2));
    await reportWritable.close();
  } catch (err) {
    console.error("[math debug] Failed to write debug files:", err);
  }
}
