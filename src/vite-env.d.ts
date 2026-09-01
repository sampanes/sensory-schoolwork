/// <reference types="vite/client" />

/**
 * Injected by `define` in vite.config.ts. Format: "<short sha>[+] <YYYY-MM-DD>",
 * where a trailing "+" on the sha means the build had uncommitted changes.
 */
declare const __BUILD_STAMP__: string;
