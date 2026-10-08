/**
 * Inline `@import` rules that Zotero's snapshotter (SingleFile) leaves behind.
 *
 * arXiv's HTML pages load their main stylesheet as
 * `@import "/static/.../ar5iv.css" layer(ar5iv);`, which SingleFile doesn't
 * resolve, so the saved snapshot points at a root-relative URL that doesn't
 * exist offline. Fetching is injected so this module stays testable.
 */

export interface Fetchers {
  /** Fetch a stylesheet as text */
  text: (url: string) => Promise<string>;
  /** Fetch a resource (font, image) as a `data:` URI */
  dataUri: (url: string) => Promise<string>;
}

// @import url("a.css") | "a.css"  [layer | layer(name)]  [media query];
const IMPORT =
  /@import\s+(?:url\(\s*(["']?)([^"')]+)\1\s*\)|(["'])([^"']+)\3)\s*(layer(?:\(\s*([^)\s]+)\s*\))?)?\s*([^;]*);/g;
const URL_REF = /url\(\s*(["']?)([^"')]+)\1\s*\)/g;
const STYLE = /(<style\b[^>]*>)([\s\S]*?)(<\/style>)/gi;
const MAX_DEPTH = 3;

/** Inline the `@import`s in every `<style>` block of a saved HTML page. */
export async function inlineSnapshotImports(
  html: string,
  pageUrl: string,
  fetchers: Fetchers,
): Promise<string> {
  return replaceAsync(html, STYLE, async (_, open, css, close) => {
    return open + (await inlineImports(css, pageUrl, fetchers)) + close;
  });
}

/**
 * Replace each `@import` in `css` with the imported stylesheet wrapped in the
 * equivalent `@layer`/`@media` block, with its `url()`s embedded.
 */
export async function inlineImports(
  css: string,
  baseUrl: string,
  fetchers: Fetchers,
  depth = 0,
): Promise<string> {
  if (depth >= MAX_DEPTH) {
    return css;
  }
  return replaceAsync(
    css,
    IMPORT,
    async (match, _q1, url1, _q2, url2, layer, layerName, media) => {
      const url = new URL(url1 ?? url2, baseUrl).href;
      let imported = await fetchers.text(url);
      imported = await inlineImports(imported, url, fetchers, depth + 1);
      imported = await embedUrls(imported, url, fetchers);
      return wrap(imported, layer && (layerName ?? ""), media.trim());
    },
  );
}

/** Replace relative and remote `url()`s with `data:` URIs. */
export async function embedUrls(
  css: string,
  baseUrl: string,
  fetchers: Fetchers,
): Promise<string> {
  return replaceAsync(css, URL_REF, async (match, _quote, ref: string) => {
    if (/^(data:|#)/i.test(ref)) {
      return match;
    }
    const dataUri = await fetchers.dataUri(new URL(ref, baseUrl).href);
    return `url("${dataUri}")`;
  });
}

/** `layer` is a layer name, "" for an anonymous layer, or undefined. */
function wrap(css: string, layer: string | undefined, media: string) {
  let out = css;
  if (layer !== undefined) {
    out = `@layer${layer ? ` ${layer}` : ""} {\n${out}\n}`;
  }
  if (media) {
    out = `@media ${media} {\n${out}\n}`;
  }
  return out;
}

async function replaceAsync(
  str: string,
  regex: RegExp,
  replacer: (...groups: any[]) => Promise<string>,
): Promise<string> {
  const matches = [...str.matchAll(regex)];
  let out = "";
  let last = 0;
  // Sequential, so fetches go one at a time
  for (const match of matches) {
    out += str.slice(last, match.index) + (await replacer(...match));
    last = match.index! + match[0].length;
  }
  return out + str.slice(last);
}
