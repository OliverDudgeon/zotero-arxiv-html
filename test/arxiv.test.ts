import { assert } from "chai";
import {
  buildHtmlUrl,
  findVersion,
  isHtmlUrlFor,
  parseArxivId,
  parseHtmlLink,
} from "../src/modules/arxiv";

describe("arxiv", function () {
  describe("parseArxivId", function () {
    it("reads the ID the arXiv translator writes to Extra", function () {
      assert.deepEqual(parseArxivId({ extra: "arXiv:1810.04805 [cs.CL]" }), {
        id: "1810.04805",
      });
    });

    it("reads old-style IDs from Extra", function () {
      assert.deepEqual(parseArxivId({ extra: "arXiv:hep-th/9901001" }), {
        id: "hep-th/9901001",
      });
    });

    it("keeps a version written in Extra", function () {
      assert.deepEqual(parseArxivId({ extra: "Note\narXiv: 2310.06825v3" }), {
        id: "2310.06825",
        version: 3,
      });
    });

    it("falls back to Archive ID, DOI, then URL", function () {
      assert.deepEqual(parseArxivId({ archiveID: "arXiv:2301.00001" }), {
        id: "2301.00001",
      });
      assert.deepEqual(parseArxivId({ DOI: "10.48550/arXiv.2301.00001" }), {
        id: "2301.00001",
      });
      assert.deepEqual(
        parseArxivId({ url: "http://arxiv.org/abs/2301.00001" }),
        {
          id: "2301.00001",
        },
      );
      assert.deepEqual(
        parseArxivId({ url: "https://arxiv.org/pdf/2301.00001v2.pdf" }),
        { id: "2301.00001", version: 2 },
      );
    });

    it("prefers Extra over a journal URL", function () {
      assert.deepEqual(
        parseArxivId({
          extra: "arXiv:1810.04805 [cs.CL]",
          DOI: "10.18653/v1/N19-1423",
          url: "https://aclanthology.org/N19-1423",
        }),
        { id: "1810.04805" },
      );
    });

    it("returns null for non-arXiv items", function () {
      assert.isNull(
        parseArxivId({
          extra: "PMID: 12345",
          DOI: "10.1000/xyz",
          url: "https://example.com/1810.04805",
        }),
      );
    });
  });

  describe("findVersion", function () {
    it("takes the highest version from arXiv URLs", function () {
      assert.equal(
        findVersion("1810.04805", [
          "https://arxiv.org/pdf/1810.04805v1",
          "http://arxiv.org/abs/1810.04805",
          "https://arxiv.org/pdf/1810.04805v2",
        ]),
        2,
      );
    });

    it("ignores URLs for other papers", function () {
      assert.isUndefined(
        findVersion("1810.04805", ["https://arxiv.org/pdf/1810.048051v2"]),
      );
    });

    it("reads the version line from Extra", function () {
      assert.equal(
        findVersion("1810.04805", [], "arXiv:1810.04805 [cs.CL]\nversion: 4"),
        4,
      );
    });
  });

  describe("buildHtmlUrl", function () {
    it("builds versioned and unversioned URLs without a trailing slash", function () {
      assert.equal(
        buildHtmlUrl({ id: "1810.04805", version: 2 }),
        "https://arxiv.org/html/1810.04805v2",
      );
      assert.equal(
        buildHtmlUrl({ id: "hep-th/9901001" }),
        "https://arxiv.org/html/hep-th/9901001",
      );
    });
  });

  describe("isHtmlUrlFor", function () {
    it("matches any version of the same paper only", function () {
      assert.isTrue(
        isHtmlUrlFor("1810.04805", "https://arxiv.org/html/1810.04805v2"),
      );
      assert.isTrue(
        isHtmlUrlFor("1810.04805", "https://arxiv.org/html/1810.04805"),
      );
      assert.isFalse(
        isHtmlUrlFor("1810.04805", "https://arxiv.org/abs/1810.04805"),
      );
      assert.isFalse(
        isHtmlUrlFor("1810.0480", "https://arxiv.org/html/1810.04805"),
      );
    });
  });

  describe("parseHtmlLink", function () {
    it("reads the HTML link from an abstract page", function () {
      const page = `<a href="https://arxiv.org/html/1810.04805v2" class="abs-button" id="latexml-download-link">HTML (experimental)</a>`;
      assert.deepEqual(parseHtmlLink(page), { id: "1810.04805", version: 2 });
    });

    it("returns null when the page has no HTML link", function () {
      assert.isNull(parseHtmlLink(`<a href="/pdf/2501.00010">PDF</a>`));
    });
  });
});
