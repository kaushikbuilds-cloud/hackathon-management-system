import "server-only";
import { strToU8, zipSync, type Zippable } from "fflate";

/** Builds a ZIP. Text is compressed; PDFs and images (already compressed) are stored as they are. */
export function makeZip(files: Record<string, Uint8Array | string>): Uint8Array {
  const tree: Zippable = {};
  for (const [path, content] of Object.entries(files)) {
    const bytes = typeof content === "string" ? strToU8(content) : content;
    const text = typeof content === "string" || /\.(csv|txt|json)$/i.test(path);
    tree[path] = [bytes, { level: text ? 6 : 0 }];
  }
  return zipSync(tree);
}

export function safeName(s: string): string {
  return s.replace(/[^A-Za-z0-9]+/g, "_").replace(/^_|_$/g, "") || "file";
}
