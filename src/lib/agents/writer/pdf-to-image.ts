import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readFile, unlink } from "node:fs/promises";
import path from "node:path";
import os from "node:os";

const execFileAsync = promisify(execFile);

/**
 * Convert a single-page PDF file to a base64-encoded PNG string using
 * pdftoppm (poppler-utils). Returns the first page only.
 *
 * @param pdfPath Absolute path to the PDF file.
 * @param opts.dpi Resolution of the rendered image (default 200).
 * @returns Base64-encoded PNG string (without data URL prefix).
 */
/**
 * Return the number of pages in a PDF using `pdfinfo` (poppler-utils).
 */
export async function pdfPageCount(pdfPath: string): Promise<number> {
  const { stdout } = await execFileAsync("pdfinfo", [pdfPath]);
  const match = stdout.match(/^Pages:\s+(\d+)/m);
  if (!match) throw new Error(`pdfinfo did not report a Pages line for ${pdfPath}`);
  return Number.parseInt(match[1], 10);
}

export async function pdfToImageBase64(
  pdfPath: string,
  opts: { dpi?: number } = {},
): Promise<string> {
  const dpi = opts.dpi ?? 100;
  const tmpDir = os.tmpdir();
  const baseName = `pdf2img_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const outPrefix = path.join(tmpDir, baseName);

  await execFileAsync("pdftoppm", [
    "-png",
    "-singlefile",
    "-r",
    String(dpi),
    pdfPath,
    outPrefix,
  ]);

  const pngPath = `${outPrefix}.png`;
  const buffer = await readFile(pngPath);

  // Clean up temp file
  try {
    await unlink(pngPath);
  } catch {
    // ignore cleanup errors
  }

  return buffer.toString("base64");
}
