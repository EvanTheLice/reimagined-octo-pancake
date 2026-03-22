import { createHash } from "crypto";
import { readFileSync } from "fs";

export function calculateFileChecksum(filePath: string): string {
  const fileBuffer = readFileSync(filePath);
  return createHash("sha256").update(fileBuffer).digest("hex");
}

export function calculateBufferChecksum(buffer: Buffer): string {
  return createHash("sha256").update(buffer).digest("hex");
}
