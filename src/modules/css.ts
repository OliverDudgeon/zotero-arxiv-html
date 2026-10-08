/**
 * CSS rewriting for self-contained snapshots: inline `@import`s (arXiv loads
 * its main stylesheet as `@import "..." layer(ar5iv)`), embed `url()`s as
 * `data:` URIs, and make the page's script-driven dark mode work from CSS.
 * Fetching is injected so this module stays testable.
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
const MAX_DEPTH = 3;

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

const DARK_THEME = /\[data-theme=(["']?)dark\1\]/g;
const AUTO_THEME = ":root:not([data-theme])";

/**
 * arXiv's dark palette applies under `[data-theme=dark]`, an attribute its
 * scripts set from the system theme. Snapshots can't run scripts, so copy
 * those rules under `@media (prefers-color-scheme: dark)` for pages without
 * the attribute. Returns only the new rules, keeping each in its layer.
 */
export function darkModeRules(
  css: string,
  CSSStyleSheetCtor: typeof CSSStyleSheet,
): string {
  const sheet = new CSSStyleSheetCtor();
  sheet.replaceSync(css);
  const out: string[] = [];
  collectDarkRules(sheet.cssRules, [], out);
  return out.join("\n");
}

function collectDarkRules(
  rules: CSSRuleList,
  wrappers: string[],
  out: string[],
) {
  for (const rule of Array.from(rules)) {
    if ("selectorText" in rule && "style" in rule) {
      const styleRule = rule as CSSStyleRule;
      const selectors = splitSelectors(styleRule.selectorText)
        .filter((selector) => selector.match(DARK_THEME))
        .map((selector) => selector.replace(DARK_THEME, AUTO_THEME));
      if (selectors.length) {
        let text = `${selectors.join(", ")} { ${styleRule.style.cssText} }`;
        for (const wrapper of [
          ...wrappers,
          "@media (prefers-color-scheme: dark)",
        ].reverse()) {
          text = `${wrapper} { ${text} }`;
        }
        out.push(text);
      }
    } else if ("cssRules" in rule) {
      // @layer, @media, @supports: keep the prelude so copies cascade the same
      const prelude = rule.cssText.slice(0, rule.cssText.indexOf("{")).trim();
      collectDarkRules(
        (rule as CSSGroupingRule).cssRules,
        [...wrappers, prelude],
        out,
      );
    }
  }
}

/** Split a selector list on top-level commas (not those inside `:is()`). */
function splitSelectors(selectorText: string): string[] {
  const selectors: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < selectorText.length; i++) {
    const char = selectorText[i];
    if (char === "(" || char === "[") depth++;
    else if (char === ")" || char === "]") depth--;
    else if (char === "," && depth === 0) {
      selectors.push(selectorText.slice(start, i).trim());
      start = i + 1;
    }
  }
  selectors.push(selectorText.slice(start).trim());
  return selectors;
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
