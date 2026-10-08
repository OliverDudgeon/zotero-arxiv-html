import { assert } from "chai";
import { darkModeRules, Fetchers, inlineImports } from "../src/modules/css";

describe("css", function () {
  const files: Record<string, string> = {
    "https://arxiv.org/static/a.css":
      "@font-face{src:url('/static/f.woff2')}.ltx_a{color:red}",
    "https://arxiv.org/static/b.css":
      ".b{background:url(data:image/png;base64,AA)}",
    "https://arxiv.org/static/c.css": "@import 'b.css';.c{}",
  };
  let fetched: string[];
  const fetchers: Fetchers = {
    text: async (url) => {
      fetched.push(url);
      if (!(url in files)) throw new Error(`404 ${url}`);
      return files[url];
    },
    dataUri: async (url) => {
      fetched.push(url);
      return `data:font/woff2;base64,${url.length}`;
    },
  };
  const page = "https://arxiv.org/html/2610.10259v1";

  beforeEach(function () {
    fetched = [];
  });

  describe("inlineImports", function () {
    it("inlines layered imports and embeds their fonts", async function () {
      const css = `@import "/static/a.css" layer(ar5iv);\n@layer ar5iv;`;
      assert.equal(
        await inlineImports(css, page, fetchers),
        `@layer ar5iv {\n@font-face{src:url("data:font/woff2;base64,${"https://arxiv.org/static/f.woff2".length}")}.ltx_a{color:red}\n}\n@layer ar5iv;`,
      );
    });

    it("handles url() imports, anonymous layers and media queries", async function () {
      assert.equal(
        await inlineImports(
          `@import url("/static/b.css") layer screen;`,
          page,
          fetchers,
        ),
        `@media screen {\n@layer {\n.b{background:url(data:image/png;base64,AA)}\n}\n}`,
      );
      assert.deepEqual(fetched, ["https://arxiv.org/static/b.css"]);
    });

    it("resolves nested imports against the stylesheet URL", async function () {
      const out = await inlineImports(
        `@import "/static/c.css";`,
        page,
        fetchers,
      );
      assert.include(out, ".b{background");
      assert.notInclude(out, "@import");
    });
  });

  describe("darkModeRules", function () {
    it("copies dark theme rules under prefers-color-scheme, in their layer", function () {
      const out = darkModeRules(
        `@layer tokens { :root, [data-theme=light] { --bg: white; } [data-theme=dark] { --bg: black; } }
         .x, [data-theme="dark"] .y { color: red; }`,
        CSSStyleSheet,
      );
      assert.equal(
        out.replace(/\s+/g, " "),
        `@layer tokens { @media (prefers-color-scheme: dark) { :root:not([data-theme]) { --bg: black; } } } ` +
          `@media (prefers-color-scheme: dark) { :root:not([data-theme]) .y { color: red; } }`,
      );
    });
  });
});
