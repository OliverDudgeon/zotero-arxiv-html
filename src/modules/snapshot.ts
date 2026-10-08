import { Fetchers, inlineSnapshotImports } from "./css";

// Stylesheets and fonts are shared by every arXiv HTML page, so fetch each
// once per session
const cache = new Map<string, Promise<string>>();

const fetchers: Fetchers = {
  text: (url) =>
    cached(url, async () => {
      const xhr = await Zotero.HTTP.request("GET", url, {
        responseType: "text",
      });
      return xhr.response as string;
    }),
  dataUri: (url) =>
    cached(url, async () => {
      const xhr = await Zotero.HTTP.request("GET", url, {
        responseType: "arraybuffer",
      });
      const type =
        xhr.getResponseHeader("Content-Type")?.split(";")[0].trim() ||
        "application/octet-stream";
      return `data:${type};base64,${toBase64(new Uint8Array(xhr.response))}`;
    }),
};

/**
 * Zotero's snapshotter leaves arXiv's `@import ... layer(...)` stylesheets
 * unresolved; inline them into the saved file so the page renders offline.
 */
export async function fixSnapshotStyles(
  attachment: Zotero.Item,
  pageUrl: string,
) {
  const path = await attachment.getFilePathAsync();
  if (!path) {
    return;
  }
  const html = (await Zotero.File.getContentsAsync(path)) as string;
  const fixed = await inlineSnapshotImports(html, pageUrl, fetchers);
  if (fixed !== html) {
    await Zotero.File.putContentsAsync(path, fixed);
  }
}

function cached(url: string, load: () => Promise<string>) {
  let result = cache.get(url);
  if (!result) {
    result = load();
    // Don't cache failures
    result.catch(() => cache.delete(url));
    cache.set(url, result);
  }
  return result;
}

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}
