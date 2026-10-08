import {
  ArxivRef,
  buildAbsUrl,
  buildHtmlUrl,
  findVersion,
  isHtmlUrlFor,
  parseArxivId,
  parseHtmlLink,
} from "./arxiv";
import { fetchText, zoteroFetchers } from "./fetch";
import { buildSnapshot } from "./snapshot";
import { getString } from "../utils/locale";

// arXiv asks for one request at a time with a pause between them
const REQUEST_DELAY_MS = 3000;
const CLOSE_DELAY_MS = 4000;
const CLOSE_DELAY_ON_FAILURE_MS = 15000;

type Status =
  | { kind: "attached"; version?: number }
  | { kind: "exists" | "no-id" | "no-html" | "failed" };

/** Find the arXiv ID of a regular item, or null if it has none. */
export function getArxivRef(item: Zotero.Item): ArxivRef | null {
  return parseArxivId({
    extra: item.getField("extra"),
    archiveID: getFieldSafe(item, "archiveID"),
    DOI: getFieldSafe(item, "DOI"),
    url: item.getField("url"),
  });
}

/**
 * Map a selection to the regular items it refers to: attachments and notes
 * stand in for their parent.
 */
export function resolveRegularItems(items: Zotero.Item[]): Zotero.Item[] {
  const resolved = new Map<number, Zotero.Item>();
  for (const item of items) {
    const regular = item.isRegularItem() ? item : item.parentItem;
    if (regular?.isRegularItem()) {
      resolved.set(regular.id, regular);
    }
  }
  return [...resolved.values()];
}

export async function attachHtmlToItems(selection: Zotero.Item[]) {
  const items = resolveRegularItems(selection);
  if (!items.length) {
    return;
  }

  const progress = new ztoolkit.ProgressWindow(getString("progress-title"), {
    closeOnClick: true,
    closeTime: -1,
  });
  items.forEach((item) =>
    progress.createLine({
      text: getString("status-pending", { args: { title: titleOf(item) } }),
      type: "default",
      progress: 0,
    }),
  );
  progress.show();

  let anyFailed = false;
  let lastRequest = 0;
  const waitForTurn = async () => {
    const wait = lastRequest + REQUEST_DELAY_MS - Date.now();
    if (wait > 0) {
      await Zotero.Promise.delay(wait);
    }
    lastRequest = Date.now();
  };

  for (const [idx, item] of items.entries()) {
    progress.changeLine({ idx, progress: 50 });
    let status: Status;
    try {
      status = await attachHtml(item, waitForTurn);
    } catch (e) {
      Zotero.debug(`[arXiv HTML] Failed for item ${item.key}: ${e}`);
      status = { kind: "failed" };
    }
    const failed = status.kind === "failed" || status.kind === "no-html";
    anyFailed ||= failed;
    progress.changeLine({
      idx,
      progress: 100,
      type:
        status.kind === "attached" ? "success" : failed ? "fail" : "default",
      text: describe(item, status),
    });
  }

  progress.startCloseTimer(
    anyFailed ? CLOSE_DELAY_ON_FAILURE_MS : CLOSE_DELAY_MS,
  );
}

async function attachHtml(
  item: Zotero.Item,
  waitForTurn: () => Promise<void>,
): Promise<Status> {
  const ref = getArxivRef(item);
  if (!ref) {
    return { kind: "no-id" };
  }

  const attachments = Zotero.Items.get(item.getAttachments());
  const attachmentUrls = attachments.map((a) => a.getField("url"));
  if (attachmentUrls.some((url) => isHtmlUrlFor(ref.id, url))) {
    return { kind: "exists" };
  }

  // Prefer the version the item was saved at, so the HTML matches the PDF
  let target: ArxivRef | null = {
    id: ref.id,
    version:
      ref.version ??
      findVersion(
        ref.id,
        [...attachmentUrls, item.getField("url")],
        item.getField("extra"),
      ),
  };
  if (!target.version) {
    // Ask the abstract page for the latest version; it only links to the
    // HTML when arXiv has one
    await waitForTurn();
    target = parseHtmlLink(await fetchText(buildAbsUrl(ref.id)));
    if (!target) {
      return { kind: "no-html" };
    }
  }

  await waitForTurn();
  const url = buildHtmlUrl(target);
  let page: string;
  try {
    page = await fetchText(url);
  } catch (e) {
    // Zotero.HTTP.UnexpectedStatusException; arXiv 404s when there's no HTML
    if ((e as { status?: number })?.status === 404) {
      return { kind: "no-html" };
    }
    throw e;
  }
  await Zotero.Attachments.importFromSnapshotContent({
    url,
    snapshotContent: await buildSnapshot(
      page,
      url,
      zoteroFetchers,
      Zotero.getMainWindow(),
    ),
    parentItemID: item.id,
    title: target.version
      ? getString("attachment-title", { args: { version: target.version } })
      : getString("attachment-title-latest"),
  });
  return { kind: "attached", version: target.version };
}

function describe(item: Zotero.Item, status: Status): string {
  const title = titleOf(item);
  switch (status.kind) {
    case "attached":
      return status.version
        ? getString("status-attached", {
            args: { title, version: status.version },
          })
        : getString("status-attached-latest", { args: { title } });
    case "exists":
      return getString("status-exists", { args: { title } });
    case "no-id":
      return getString("status-no-id", { args: { title } });
    case "no-html":
      return getString("status-no-html", { args: { title } });
    case "failed":
      return getString("status-failed", { args: { title } });
  }
}

function titleOf(item: Zotero.Item): string {
  const title = item.getDisplayTitle();
  return title.length > 40 ? `${title.slice(0, 39)}…` : title;
}

function getFieldSafe(item: Zotero.Item, field: string): string {
  try {
    return String(item.getField(field) ?? "");
  } catch {
    return "";
  }
}
