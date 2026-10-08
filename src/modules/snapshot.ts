/**
 * Build a self-contained snapshot of an arXiv HTML page that renders in
 * Zotero's reader. The reader blocks all scripts and only allows `data:`
 * images, so instead of Zotero's SingleFile snapshot (which captures the page
 * at a narrow viewport and leaves `<object>` figures and layered `@import`s
 * broken) this works from the raw HTML arXiv serves.
 */

import { darkModeRules, embedUrls, Fetchers, inlineImports } from "./css";

// UI that only works with arXiv's scripts: theme/ToC/reading-mode toggles,
// the issue reporter, and the dismissable announcement banner
const SCRIPTED_UI = [
  "script",
  "noscript",
  "dialog",
  "button",
  'a[href^="javascript:"]',
  "a[onclick]",
  ".ds-announcement",
];
const DROPPED_LINKS = ["icon", "apple-touch-icon", "mask-icon", "manifest"];

// The reader sets `color-scheme` inline on the page; let the page follow the
// system theme as it does on arxiv.org
const COLOR_SCHEME_CSS = ":root { color-scheme: light dark !important; }";

export async function buildSnapshot(
  html: string,
  pageUrl: string,
  fetchers: Fetchers,
  win: Window,
): Promise<string> {
  const doc: Document = new win.DOMParser().parseFromString(html, "text/html");
  const origin = new URL(pageUrl).origin;
  const resolve = (url: string) => new URL(url, pageUrl).href;
  const all = <T extends Element = Element>(selector: string) =>
    Array.from(doc.querySelectorAll(selector)) as T[];

  all([...SCRIPTED_UI, "base"].join(",")).forEach((el) => el.remove());
  for (const el of all("[onclick]")) {
    el.removeAttribute("onclick");
  }

  // Stylesheets: inline same-origin ones, drop third-party (web font kits)
  for (const link of all<HTMLLinkElement>("link[rel]")) {
    const rels = link.rel.toLowerCase().split(/\s+/);
    const href = link.getAttribute("href");
    if (!rels.includes("stylesheet") || !href) {
      if (rels.some((rel) => DROPPED_LINKS.includes(rel))) link.remove();
      continue;
    }
    const url = resolve(href);
    if (new URL(url).origin !== origin) {
      link.remove();
      continue;
    }
    const style = doc.createElement("style");
    const media = link.getAttribute("media");
    if (media) style.setAttribute("media", media);
    style.textContent = await processCss(
      await fetchers.text(url),
      url,
      fetchers,
    );
    link.replaceWith(style);
  }
  for (const style of all("style")) {
    if (
      !style.textContent?.includes("url(") &&
      !style.textContent?.includes("@import")
    ) {
      continue;
    }
    style.textContent = await processCss(style.textContent, pageUrl, fetchers);
  }

  const css = all("style")
    .map((style) => style.textContent)
    .join("\n");
  const extra = doc.createElement("style");
  extra.textContent = `${COLOR_SCHEME_CSS}\n${darkModeRules(css, win.CSSStyleSheet)}`;
  doc.head!.append(extra);

  // Images: embed, turning SVG <object>s (blocked by the reader) into <img>s
  for (const object of all('object[type="image/svg+xml"][data]')) {
    const img = doc.createElement("img");
    for (const { name, value } of Array.from(object.attributes)) {
      if (name !== "type" && name !== "data") img.setAttribute(name, value);
    }
    img.setAttribute("src", object.getAttribute("data")!);
    img.setAttribute("alt", object.textContent?.trim() || "Refer to caption");
    object.replaceWith(img);
  }
  for (const img of all("img[src]")) {
    img.removeAttribute("srcset");
    const src = img.getAttribute("src")!;
    if (!src.startsWith("data:")) {
      img.setAttribute("src", await fetchers.dataUri(resolve(src)));
    }
  }

  // Links: absolute, so they still work from the saved file
  for (const a of all("a[href]")) {
    const href = a.getAttribute("href")!;
    if (!href.startsWith("#")) a.setAttribute("href", resolve(href));
  }

  return `<!DOCTYPE html>\n${doc.documentElement!.outerHTML}`;
}

async function processCss(css: string, baseUrl: string, fetchers: Fetchers) {
  return embedUrls(
    await inlineImports(css, baseUrl, fetchers),
    baseUrl,
    fetchers,
  );
}
