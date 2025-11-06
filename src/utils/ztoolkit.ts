import { config } from "../../package.json";

export { createZToolkit };

function createZToolkit() {
  const _ztoolkit = new MyToolkit();
  initZToolkit(_ztoolkit);
  return _ztoolkit;
}

function initZToolkit(_ztoolkit: ReturnType<typeof createZToolkit>) {
  const env = __env__;
  _ztoolkit.basicOptions.log.prefix = `[${config.addonName}]`;
  _ztoolkit.basicOptions.log.disableConsole = env === "production";
  _ztoolkit.UI.basicOptions.ui.enableElementRecord = true;
  _ztoolkit.UI.basicOptions.ui.enableElementJSONLog = __env__ === "development";
  _ztoolkit.UI.basicOptions.ui.enableElementDOMLog = __env__ === "development";
  // Getting basicOptions.debug will load global modules like the debug bridge.
  // since we want to deprecate it, should avoid using it unless necessary.
  // _ztoolkit.basicOptions.debug.disableDebugBridgePassword =
  //   __env__ === "development";
  _ztoolkit.basicOptions.api.pluginID = config.addonID;
  _ztoolkit.ProgressWindow.setIconURI(
    "default",
    `chrome://${config.addonRef}/content/icons/batchimport_cat_icon.svg`,
  );
}

import { BasicTool, unregister, makeHelperTool } from "zotero-plugin-toolkit";
import {
  UITool,
  MenuManager,
  KeyboardManager,
  ProgressWindowHelper,
  LargePrefHelper,
  VirtualizedTableHelper,
  DialogHelper,
  FilePickerHelper,
} from "zotero-plugin-toolkit";

class MyToolkit extends BasicTool {
  UI: UITool;
  Menu: MenuManager;
  Keyboard: KeyboardManager;
  ProgressWindow: typeof ProgressWindowHelper;
  LargePref: typeof LargePrefHelper;
  VirtualizedTable: typeof VirtualizedTableHelper;
  Dialog: typeof DialogHelper;
  FilePicker: typeof FilePickerHelper;

  constructor() {
    super();
    this.UI = new UITool(this);
    this.Menu = new MenuManager(this);
    this.Keyboard = new KeyboardManager(this);
    this.ProgressWindow = makeHelperTool(ProgressWindowHelper, this);
    this.LargePref = LargePrefHelper;
    this.VirtualizedTable = VirtualizedTableHelper;
    this.Dialog = makeHelperTool(DialogHelper, this);
    this.FilePicker = makeHelperTool(FilePickerHelper, this);
  }

  unregisterAll() {
    unregister(this);
  }
}
