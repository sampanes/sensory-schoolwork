/**
 * A stand-in for window.localStorage, so the preference helpers can be tested
 * in Node. Install it before calling them; each call to installStorage starts
 * from an empty store.
 */
export class MemoryStorage {
  private readonly values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.has(key) ? (this.values.get(key) as string) : null;
  }

  setItem(key: string, value: string) {
    this.values.set(key, String(value));
  }

  removeItem(key: string) {
    this.values.delete(key);
  }

  has(key: string) {
    return this.values.has(key);
  }
}

export function installStorage(entries: Record<string, string> = {}): MemoryStorage {
  const storage = new MemoryStorage();
  for (const [key, value] of Object.entries(entries)) {
    storage.setItem(key, value);
  }
  (globalThis as { window?: unknown }).window = { localStorage: storage };
  return storage;
}
