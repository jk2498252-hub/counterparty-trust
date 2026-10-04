import { canonicalJson, sha256 } from "./crypto";

export function documentMatches(bytes: Buffer, document: { sizeBytes: number; sha256: string }): boolean {
  return bytes.length === document.sizeBytes && sha256(bytes) === document.sha256;
}

export function reportMatches(report: { snapshot: unknown; sha256: string }): boolean {
  return sha256(canonicalJson(report.snapshot)) === report.sha256;
}
