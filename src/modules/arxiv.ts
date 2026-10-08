/**
 * Pure helpers for finding arXiv IDs on items and building arXiv HTML URLs.
 * Nothing in here touches Zotero, so it can be unit tested directly.
 */

export interface ArxivRef {
  id: string;
  version?: number;
}

export interface ItemFields {
  extra?: string;
  archiveID?: string;
  DOI?: string;
  url?: string;
}

// New-style (2301.00001) or old-style (hep-th/9901001) ID, optional version
const ID = String.raw`(\d{4}\.\d{4,5}|[a-z]+(?:-[a-z]+)*(?:\.[A-Z]{2})?\/\d{7})(?:v(\d+))?(?!\d)`;

const SOURCES: Array<[keyof ItemFields, RegExp]> = [
  ["extra", new RegExp(String.raw`(?:^|\s)arXiv:\s*${ID}`, "im")],
  ["archiveID", new RegExp(String.raw`^arXiv:\s*${ID}`, "i")],
  ["DOI", new RegExp(String.raw`^10\.48550\/arXiv\.${ID}$`, "i")],
  ["url", new RegExp(String.raw`arxiv\.org\/(?:abs|pdf|html)\/${ID}`, "i")],
];

/**
 * Find the arXiv ID of an item. Extra is checked first because the arXiv
 * translator always writes it there, even when a journal DOI replaced the
 * preprint metadata.
 */
export function parseArxivId(fields: ItemFields): ArxivRef | null {
  for (const [field, regex] of SOURCES) {
    const match = fields[field]?.match(regex);
    if (match) {
      return toRef(match);
    }
  }
  return null;
}

/**
 * Find the paper version the item was saved at, from versioned arXiv URLs
 * (e.g. the attached PDF) or the `version: N` line the translator adds to
 * Extra. Returns the highest version found.
 */
export function findVersion(
  id: string,
  urls: string[],
  extra = "",
): number | undefined {
  const urlRegex = new RegExp(
    String.raw`arxiv\.org\/(?:abs|pdf|html)\/${escapeRegExp(id)}v(\d+)(?!\d)`,
    "i",
  );
  const versions = urls
    .map((url) => url.match(urlRegex)?.[1])
    .concat(extra.match(/^version:\s*(\d+)\s*$/im)?.[1])
    .filter((v): v is string => !!v)
    .map(Number);
  return versions.length ? Math.max(...versions) : undefined;
}

export function buildHtmlUrl({ id, version }: ArxivRef): string {
  return `https://arxiv.org/html/${id}${version ? `v${version}` : ""}`;
}

export function buildAbsUrl(id: string): string {
  return `https://arxiv.org/abs/${id}`;
}

/** Whether `url` is an arXiv HTML URL for the paper `id` (any version). */
export function isHtmlUrlFor(id: string, url: string): boolean {
  return new RegExp(
    String.raw`^https?:\/\/arxiv\.org\/html\/${escapeRegExp(id)}(?:v\d+)?\/?$`,
    "i",
  ).test(url);
}

/**
 * Read the "HTML (experimental)" link from an arXiv abstract page. The link
 * is only present when arXiv has an HTML version of the paper.
 */
export function parseHtmlLink(absPage: string): ArxivRef | null {
  const anchor = absPage.match(
    /<a\b[^>]*\bid=["']latexml-download-link["'][^>]*>/i,
  )?.[0];
  const href = anchor?.match(/\bhref=["']([^"']+)["']/i)?.[1];
  const match = href?.match(
    new RegExp(String.raw`arxiv\.org\/html\/${ID}`, "i"),
  );
  return match ? toRef(match) : null;
}

function toRef(match: RegExpMatchArray): ArxivRef {
  const [, id, version] = match;
  return version ? { id, version: Number(version) } : { id };
}

function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");
}
