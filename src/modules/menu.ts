import { config } from "../../package.json";
import { getLocaleID } from "../utils/locale";
import { getArxivRef, resolveRegularItems } from "./attachHtml";

const icon = `chrome://${config.addonRef}/content/icons/icon.svg`;

/** Item context menu entry. Zotero unregisters it on plugin shutdown. */
export function registerMenu() {
  Zotero.MenuManager.registerMenu({
    menuID: `${config.addonRef}-item-menu`,
    pluginID: config.addonID,
    target: "main/library/item",
    menus: [
      {
        menuType: "menuitem",
        l10nID: getLocaleID("menuitem-attach-html"),
        icon,
        onShowing: (event, context) => {
          const items = resolveRegularItems(context.items ?? []);
          context.setVisible(items.some((item) => getArxivRef(item)));
        },
        onCommand: (event, context) => {
          addon.hooks.onAttachHtml(context.items ?? []);
        },
      },
    ],
  });
}
