import { toApiAnnotation, ApiAnnotationPayload } from "./api";
import type { Annotation } from "./annotation-service";

// Windows passes the URL on the browser's command line, which caps out near 32k chars.
export const MAX_IMPORT_URL_LENGTH = 30000;

export interface ImportPayload {
  version: 1;
  vault: string;
  scope: string[];
  annotations: ApiAnnotationPayload[];
}

export function buildImportUrl(
  siteUrl: string,
  vault: string,
  scope: string[],
  annotations: Annotation[]
): string {
  const payload: ImportPayload = {
    version: 1,
    vault,
    scope,
    annotations: annotations.map((a) => toApiAnnotation(a, vault)),
  };
  return `${siteUrl}/obsidian-import#${toBase64Url(JSON.stringify(payload))}`;
}

function toBase64Url(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...Array.from(bytes.subarray(i, i + chunkSize)));
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
