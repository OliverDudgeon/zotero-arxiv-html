import { assert } from "chai";
import { Fetchers } from "../src/modules/css";
import { buildSnapshot } from "../src/modules/snapshot";

describe("buildSnapshot", function () {
  const page = "https://arxiv.org/html/2610.10259v1";
  const html = `<!DOCTYPE html><html><head>
<link rel="stylesheet" href="/static/main.css">
<link rel="stylesheet" href="https://use.typekit.net/kit.css">
<link rel="icon" href="/static/favicon.png">
<script>document.documentElement.dataset.theme = "dark"</script>
</head><body>
<header><a href="/abs/2610.10259v1">Back to Abstract</a>
<a href="javascript:toggleNavTOC();">ToC</a>
<button onclick="toggleColorScheme();">Theme</button></header>
<nav class="ltx_TOC"><a href="#S1">Intro</a></nav>
<object type="image/svg+xml" data="2610.10259v1/fig.svg" class="ltx_graphics" width="10"></object>
<img src="2610.10259v1/x.png" alt="x">
</body></html>`;
  const fetchers: Fetchers = {
    text: async () => "[data-theme=dark] body { background: black }",
    dataUri: async (url) => `data:image/test,${encodeURIComponent(url)}`,
  };

  let out: Document;

  before(async function () {
    const snapshot = await buildSnapshot(html, page, fetchers, window);
    out = new DOMParser().parseFromString(snapshot, "text/html");
  });

  it("removes scripts and script-only controls", function () {
    assert.isNull(out.querySelector("script, button, a[href^='javascript:']"));
    assert.isNull(out.querySelector("link"));
  });

  it("inlines stylesheets with a system-theme dark mode", function () {
    const css = Array.from(out.querySelectorAll("style"))
      .map((s) => s.textContent)
      .join("\n");
    assert.include(css, "[data-theme=dark] body");
    assert.include(css, "prefers-color-scheme: dark");
    assert.include(css, ":root:not([data-theme]) body");
    assert.include(css, "color-scheme: light dark !important");
  });

  it("embeds figures as images, including SVG objects", function () {
    assert.isNull(out.querySelector("object"));
    const srcs = Array.from(out.querySelectorAll("img")).map((img) =>
      decodeURIComponent(img.getAttribute("src")!),
    );
    assert.deepEqual(srcs, [
      "data:image/test,https://arxiv.org/html/2610.10259v1/fig.svg",
      "data:image/test,https://arxiv.org/html/2610.10259v1/x.png",
    ]);
    assert.equal(out.querySelector("img")!.className, "ltx_graphics");
  });

  it("keeps the table of contents and makes links absolute", function () {
    assert.equal(out.querySelector(".ltx_TOC a")!.getAttribute("href"), "#S1");
    assert.equal(
      out.querySelector("header a")!.getAttribute("href"),
      "https://arxiv.org/abs/2610.10259v1",
    );
  });
});
