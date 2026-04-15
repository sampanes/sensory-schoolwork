import { serializeDebugEntry, type DebugSaveEntry, type SerializedDebugEntry } from "./debugSaver";

type DebugSessionBundle = {
  exportedAt: string;
  app: "math_test";
  version: 1;
  notes: string[];
  entries: SerializedDebugEntry[];
};

const sessionEntries: SerializedDebugEntry[] = [];

function formatExportTimestamp(date: Date): string {
  const yyyy = String(date.getFullYear());
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  const hh = String(date.getHours()).padStart(2, "0");
  const min = String(date.getMinutes()).padStart(2, "0");
  const ss = String(date.getSeconds()).padStart(2, "0");
  return `${yyyy}${mm}${dd}_${hh}${min}${ss}`;
}

function downloadJson(filename: string, payload: object) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = objectUrl;
  anchor.download = filename;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1_000);
}

export async function appendDebugSessionEntry(entry: DebugSaveEntry): Promise<number> {
  const serialized = await serializeDebugEntry(entry);
  sessionEntries.push(serialized);
  return sessionEntries.length;
}

export function getDebugSessionCount(): number {
  return sessionEntries.length;
}

export function clearDebugSession(): number {
  sessionEntries.length = 0;
  return 0;
}

export function exportDebugSessionBundle(): number {
  const bundle: DebugSessionBundle = {
    exportedAt: new Date().toISOString(),
    app: "math_test",
    version: 1,
    notes: [
      "One digit per box only. Tens may be blank for one-digit answers.",
      "Each entry includes embedded debug/model preview PNG data URLs for mobile export convenience.",
    ],
    entries: [...sessionEntries],
  };

  const filename = `math_debug_session_${formatExportTimestamp(new Date())}.json`;
  downloadJson(filename, bundle);
  return sessionEntries.length;
}
