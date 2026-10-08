import { Fetchers } from "./css";

// arXiv's stylesheets, fonts and logos under /static/ are shared by every
// paper, so fetch each once per session. Figures aren't cached.
const cache = new Map<string, Promise<string>>();

export const zoteroFetchers: Fetchers = {
  text: (url) => cached(url, () => fetchText(url)),
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

export async function fetchText(url: string): Promise<string> {
  const xhr = await Zotero.HTTP.request("GET", url, { responseType: "text" });
  return xhr.response as string;
}

function cached(url: string, load: () => Promise<string>) {
  if (!new URL(url).pathname.startsWith("/static/")) {
    return load();
  }
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
