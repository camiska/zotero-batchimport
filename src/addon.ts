import { config } from "../package.json";
import { ColumnOptions, DialogHelper } from "zotero-plugin-toolkit";
import hooks from "./hooks";
import { createZToolkit } from "./utils/ztoolkit";

class Addon {
  public data: {
    alive: boolean;
    config: typeof config;
    env: "development" | "production";
    initialized?: boolean;
    ztoolkit: ZToolkit;
    progressBus?: Set<(evt: any) => void>;
    publishProgress?: (evt: any) => void;
    subscribeProgress?: (fn: (evt: any) => void) => () => void;
    locale?: {
      current: any;
    };
    prefs?: {
      window: Window;
      columns: Array<ColumnOptions>;
      rows: Array<{ [dataKey: string]: string }>;
    };
    dialog?: DialogHelper;
  };
  public hooks: typeof hooks;
  public api: object;

  constructor() {
    this.data = {
      alive: true,
      config,
      env: __env__,
      initialized: false,
      ztoolkit: createZToolkit(),
    };
    this.data.progressBus = new Set();
    this.data.publishProgress = (evt: any) => {
      try {
        for (const fn of this.data.progressBus!) fn(evt);
      } catch (e) {
        ztoolkit.log("progress bus publish error", e);
      }
    };
    this.data.subscribeProgress = (fn: (evt: any) => void) => {
      this.data.progressBus!.add(fn);
      return () => this.data.progressBus!.delete(fn);
    };
    this.hooks = hooks;
    this.api = {};
  }
}

export default Addon;
