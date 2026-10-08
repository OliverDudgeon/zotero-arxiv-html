import { assert } from "chai";
import { Fetchers, inlineSnapshotImports } from "../src/modules/css";

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

  describe("inlineSnapshotImports", function () {
    it("inlines layered imports and embeds their fonts", async function () {
      const html = `<style>@import "/static/a.css" layer(ar5iv);\n@layer ar5iv;</style>`;
      assert.equal(
        await inlineSnapshotImports(html, page, fetchers),
        `<style>@layer ar5iv {\n@font-face{src:url("data:font/woff2;base64,${"https://arxiv.org/static/f.woff2".length}")}.ltx_a{color:red}\n}\n@layer ar5iv;</style>`,
      );
    });

    it("handles url() imports, anonymous layers and media queries", async function () {
      const html = `<style>@import url("/static/b.css") layer screen;</style>`;
      assert.equal(
        await inlineSnapshotImports(html, page, fetchers),
        `<style>@media screen {\n@layer {\n.b{background:url(data:image/png;base64,AA)}\n}\n}</style>`,
      );
      assert.deepEqual(fetched, ["https://arxiv.org/static/b.css"]);
    });

    it("resolves nested imports against the stylesheet URL", async function () {
      const out = await inlineSnapshotImports(
        `<style>@import "/static/c.css";</style>`,
        page,
        fetchers,
      );
      assert.include(out, ".b{background");
      assert.notInclude(out, "@import");
    });

    it("leaves text outside style blocks alone", async function () {
      const html = `<p>@import "/static/a.css";</p>`;
      assert.equal(await inlineSnapshotImports(html, page, fetchers), html);
      assert.isEmpty(fetched);
    });
  });
});
