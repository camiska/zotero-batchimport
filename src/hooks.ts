import { initLocale } from "./utils/locale";
import { createZToolkit } from "./utils/ztoolkit";
import { config, homepage } from "../package.json";
import { registerPrefsScripts } from "./modules/preferenceScript";
import { getPref } from "./utils/prefs";

async function onStartup() {
  await Promise.all([
    Zotero.initializationPromise,
    Zotero.unlockPromise,
    Zotero.uiReadyPromise,
  ]);

  initLocale();

  Zotero.PreferencePanes.register({
    pluginID: config.addonID,
    src: `chrome://${config.addonRef}/content/preferences.xhtml`,
    label: config.addonName,
    helpURL: homepage,
    image: `chrome://${config.addonRef}/content/icons/batchimport_cat_icon.svg`,
  });

  await Promise.all(
    Zotero.getMainWindows().map((win) => onMainWindowLoad(win)),
  );

  addon.data.initialized = true;
}

async function onMainWindowLoad(_win: _ZoteroTypes.MainWindow): Promise<void> {
  addon.data.ztoolkit = createZToolkit();

  const win = Zotero.getMainWindow();
  if (win && win.MozXULElement) {
    win.MozXULElement.insertFTLIfNeeded(
      `${addon.data.config.addonRef}-mainWindow.ftl`,
    );
  }

  Zotero.MenuManager.registerMenu({
    menuID: `${addon.data.config.addonRef}-batch-import`,
    pluginID: addon.data.config.addonID,
    target: "main/menubar/tools",
    menus: [
      {
        menuType: "menuitem",
        l10nID: "batchimport-menu-batch-import",
        icon: `chrome://${addon.data.config.addonRef}/content/icons/batchimport_cat_icon.svg`,
        onCommand: async () => {
          const mod = await import("./modules/batchImport.js");
          await mod.BatchImport.run();
        },
      },
    ],
  });

  const showToolbarButton = getPref("showToolbarButton") ?? false;
  if (showToolbarButton) {
    registerToolbarButton();
  }

  Zotero.Prefs.registerObserver(
    `extensions.zotero.${config.addonRef}.showToolbarButton`,
    (value: boolean) => {
      if (value) {
        registerToolbarButton();
      } else {
        unregisterToolbarButton();
      }
    },
    true,
  );
}

function registerToolbarButton(): void {
  try {
    const doc = Zotero.getMainWindow()?.document;
    if (!doc) return;

    const existingButton = doc.getElementById(
      `${config.addonRef}-toolbar-button`,
    );
    if (existingButton) return;

    const toolbar = doc.getElementById("zotero-items-toolbar");
    if (!toolbar) return;

    const button = ztoolkit.UI.createElement(doc, "toolbarbutton", {
      id: `${config.addonRef}-toolbar-button`,
      namespace: "xul",
      attributes: {
        class: "zotero-tb-button",
        tooltiptext: "Batch Import...",
        style:
          "list-style-image: url('chrome://" +
          config.addonRef +
          "/content/icons/batchimport_cat_icon.svg'); margin-left: 4px; margin-right: 4px; min-width: 32px; min-height: 32px;",
      },
      listeners: [
        {
          type: "command",
          listener: async () => {
            const mod = await import("./modules/batchImport.js");
            await mod.BatchImport.run();
          },
        },
      ],
    });

    toolbar.insertBefore(button, toolbar.firstChild);
  } catch (e) {
    ztoolkit.log("Failed to register toolbar button", e);
  }
}

function unregisterToolbarButton(): void {
  try {
    const doc = Zotero.getMainWindow()?.document;
    if (!doc) return;

    const button = doc.getElementById(`${config.addonRef}-toolbar-button`);
    if (button) {
      button.remove();
    }
  } catch (e) {
    ztoolkit.log("Failed to unregister toolbar button", e);
  }
}

async function onMainWindowUnload(_win: Window): Promise<void> {
  ztoolkit.unregisterAll();
  addon.data.dialog?.window?.close();
}

function onShutdown(): void {
  ztoolkit.unregisterAll();
  addon.data.dialog?.window?.close();
  addon.data.alive = false;
  delete (Zotero as any)[addon.data.config.addonInstance];
}

async function onNotify(
  event: string,
  type: string,
  ids: Array<string | number>,
  extraData: { [key: string]: any },
) {
  ztoolkit.log("notify", event, type, ids, extraData);
  return;
}

/**
 * This function is just an example of dispatcher for Preference UI events.
 * Any operations should be placed in a function to keep this funcion clear.
 * @param type event type
 * @param data event data
 */
async function onPrefsEvent(type: string, data: { [key: string]: any }) {
  if (type === "load" && data?.window) {
    await registerPrefsScripts(data.window);
  }
}

function onShortcuts(_type: string) {
  return;
}

function onDialogEvents(_type: string) {
  return;
}

export default {
  onStartup,
  onShutdown,
  onMainWindowLoad,
  onMainWindowUnload,
  onNotify,
  onPrefsEvent,
  onShortcuts,
  onDialogEvents,
};
