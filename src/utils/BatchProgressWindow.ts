export interface BatchProgressOptions {
  onCancel?: () => void;
  heroIconURI: string;
  checkIconURI: string;
  libraryID?: number;
  totalItems?: number;
}

export interface ProgressState {
  totalBatches: number;
  currentBatch: number;
  importing: { current: number; total: number; done: boolean };
  scanningDuplicates: { enabled: boolean; progress: number; done: boolean };
  retrievingMetadata: { progress: number; done: boolean };
}

export class BatchProgressWindow {
  private win?: Window;
  private doc?: Document;
  private elements: {
    currentBatchLabel?: XULLabelElement;
    batchArc?: SVGPathElement;
    batchPercentLabel?: XULLabelElement;
    batchIcon?: XULElement;
    batchMeter?: XULElement;
    batchCheck?: XULLabelElement;
    importingLabel?: XULLabelElement;
    importingArc?: SVGPathElement;
    importingPercentLabel?: XULLabelElement;
    importingIcon?: XULElement;
    importingMeter?: XULElement;
    importingCheck?: XULLabelElement;
    duplicatesRow?: XULElement;
    duplicatesLabel?: XULLabelElement;
    duplicatesArc?: SVGPathElement;
    duplicatesPercentLabel?: XULLabelElement;
    duplicatesIcon?: XULElement;
    duplicatesCheck?: XULLabelElement;
    metadataRow?: XULElement;
    metadataLabel?: XULLabelElement;
    metadataArc?: SVGPathElement;
    metadataPercentLabel?: XULLabelElement;
    metadataIcon?: XULElement;
    metadataCheck?: XULLabelElement;
    cancelButton?: XULButtonElement;
    cancellingLabel?: XULLabelElement;
  } = {};

  private options: BatchProgressOptions;
  private cancelled = false;
  private notifierID?: string;
  private progressCheckInterval?: number;
  private importedItemIDs: Set<number> = new Set();
  private recognizedItemIDs: Set<number> = new Set();
  private totalExpectedItems = 0;

  constructor(options: BatchProgressOptions) {
    this.options = options;
    this.totalExpectedItems = options.totalItems || 0;
  }

  open(): void {
    const ww = Components.classes[
      "@mozilla.org/embedcomp/window-watcher;1"
    ].getService(Components.interfaces.nsIWindowWatcher);

    const features =
      "chrome,titlebar,centerscreen,resizable=yes,width=340,height=600";

    this.win = ww.openWindow(
      Zotero.getMainWindow(),
      "about:blank",
      "_blank",
      features,
      null,
    ) as Window;

    this.win.addEventListener(
      "load",
      () => {
        this.buildUI();
      },
      { once: true },
    );

    Zotero.getMainWindow()?.addEventListener(
      "unload",
      () => {
        this.close();
      },
      { once: true },
    );
  }

  private buildUI(): void {
    if (!this.win) return;

    this.doc = this.win.document;
    this.doc.title = "Batch Import Progress";
    const style = this.doc.createElement("style");
    style.textContent = `
      html, body {
        background-color: #515253 !important;
        margin: 0;
        padding: 0;
        height: 100%;
        overflow: auto;
      }
      vbox {
        background-color: #515253 !important;
      }
      progress {
        -moz-appearance: none;
        appearance: none;
        height: 16px;
        background-color: #232221 !important;
        border-radius: 4px;
        overflow: hidden;
        border: 2px solid #232221 !important;
      }
      progress::-webkit-progress-bar {
        background-color: #232221 !important;
        border-radius: 3px;
      }
      progress::-webkit-progress-value {
        background-color: #f2f2f2 !important;
        border-radius: 3px;
      }
      progress::-moz-progress-bar {
        background-color: #f2f2f2 !important;
        border-radius: 3px;
      }
      label {
        color: #000000ff;
      }
      button {
        -moz-appearance: button;
        background-color: #232221 !important;
        color: #232221 !important;
        border: 1px solid #151414 !important;
        border-radius: 6px;
        padding: 12px 24px !important;
        cursor: pointer;
        font-size: 16px !important;
        font-weight: 700 !important;
        min-height: 40px !important;
        min-width: 150px !important;
      }
      button:hover:not([disabled]) {
        background-color: #353331 !important;
      }
      button[disabled] {
        opacity: 0.5;
        cursor: not-allowed;
      }
    `;
    this.doc.head?.appendChild(style);

    const ui = ztoolkit.UI;

    const container = ui.createElement(this.doc, "vbox", {
      namespace: "xul",
      enableElementRecord: true,
      attributes: {
        flex: "1",
        style: "padding: 15px; gap: 0;",
      },
      children: [
        {
          tag: "image",
          namespace: "xul",
          attributes: {
            src: this.options.heroIconURI,
            style:
              "width: 288px; height: 162px; align-self: center; margin-top: 4px; margin-bottom: 4px;",
          },
        },
        {
          tag: "label",
          namespace: "xul",
          attributes: {
            value: "Batch Import Progress",
            style:
              "font-size: 22px; font-weight: 800; text-align: center; margin-bottom: 12px; align-self: center; width: 100%;",
          },
        },
        {
          tag: "vbox",
          namespace: "xul",
          attributes: { style: "margin-bottom: 8px;" },
          children: [
            {
              tag: "hbox",
              namespace: "xul",
              attributes: { style: "align-items: center; margin-bottom: 4px;" },
              children: [
                {
                  tag: "image",
                  namespace: "xul",
                  id: "batch-progress-batch-icon",
                  attributes: {
                    src: `chrome://zotero/content/icons/unfinished_batchimport_cat_icon.svg`,
                    width: "24",
                    height: "24",
                    style: "flex-shrink: 0;",
                  },
                },
                {
                  tag: "label",
                  namespace: "xul",
                  id: "batch-progress-current-batch",
                  attributes: {
                    value: "Processing batch 0 of 0",
                    style: "font-weight: 500; flex: 1; margin-left: 8px;",
                  },
                },
                {
                  tag: "label",
                  namespace: "xul",
                  id: "batch-progress-batch-check",
                  attributes: {
                    value: "✔",
                    style:
                      "font-size: 16px; color: #f2f2f2; line-height: 16px; flex-shrink: 0;",
                    hidden: "true",
                  },
                },
              ],
            },
            {
              tag: "progress",
              namespace: "html",
              id: "batch-progress-batch-meter",
              attributes: {
                max: "100",
                value: "0",
                style:
                  "width: calc(100% - 32px); height: 16px; margin-left: 32px;",
              },
            },
          ],
        },
        {
          tag: "vbox",
          namespace: "xul",
          attributes: { style: "margin-bottom: 8px;" },
          children: [
            {
              tag: "hbox",
              namespace: "xul",
              attributes: { style: "align-items: center; margin-bottom: 4px;" },
              children: [
                {
                  tag: "image",
                  namespace: "xul",
                  id: "batch-progress-importing-icon",
                  attributes: {
                    src: `chrome://zotero/content/icons/unfinished_batchimport_cat_icon.svg`,
                    width: "24",
                    height: "24",
                    style: "flex-shrink: 0;",
                  },
                },
                {
                  tag: "label",
                  namespace: "xul",
                  id: "batch-progress-importing-label",
                  attributes: {
                    value: "Importing items...",
                    style: "flex: 1; margin-left: 8px;",
                  },
                },
                {
                  tag: "label",
                  namespace: "xul",
                  id: "batch-progress-importing-check",
                  attributes: {
                    value: "✔",
                    style:
                      "font-size: 16px; color: #f2f2f2; line-height: 16px; flex-shrink: 0;",
                    hidden: "true",
                  },
                },
              ],
            },
            {
              tag: "progress",
              namespace: "html",
              id: "batch-progress-importing-meter",
              attributes: {
                max: "100",
                value: "0",
                style:
                  "width: calc(100% - 32px); height: 16px; margin-left: 32px;",
              },
            },
          ],
        },
        {
          tag: "vbox",
          namespace: "xul",
          id: "batch-progress-duplicates-row",
          attributes: {
            style: "margin-bottom: 8px;",
            hidden: "true",
          },
          children: [
            {
              tag: "hbox",
              namespace: "xul",
              attributes: { style: "align-items: center;" },
              children: [
                {
                  tag: "image",
                  namespace: "xul",
                  id: "batch-progress-duplicates-icon",
                  attributes: {
                    src: `chrome://zotero/content/icons/unfinished_batchimport_cat_icon.svg`,
                    width: "24",
                    height: "24",
                    style: "flex-shrink: 0;",
                  },
                },
                {
                  tag: "label",
                  namespace: "xul",
                  id: "batch-progress-duplicates-label",
                  attributes: {
                    value: "Scanning for duplicates...",
                    style: "flex: 1; margin-left: 8px;",
                  },
                },
                {
                  tag: "label",
                  namespace: "xul",
                  id: "batch-progress-duplicates-check",
                  attributes: {
                    value: "✔",
                    style:
                      "font-size: 16px; color: #f2f2f2; line-height: 16px; flex-shrink: 0;",
                    hidden: "true",
                  },
                },
              ],
            },
          ],
        },
        {
          tag: "vbox",
          namespace: "xul",
          id: "batch-progress-metadata-row",
          attributes: { style: "margin-bottom: 8px;" },
          children: [
            {
              tag: "hbox",
              namespace: "xul",
              attributes: { style: "align-items: center;" },
              children: [
                {
                  tag: "image",
                  namespace: "xul",
                  id: "batch-progress-metadata-icon",
                  attributes: {
                    src: `chrome://zotero/content/icons/unfinished_batchimport_cat_icon.svg`,
                    width: "24",
                    height: "24",
                    style: "flex-shrink: 0;",
                  },
                },
                {
                  tag: "label",
                  namespace: "xul",
                  id: "batch-progress-metadata-label",
                  attributes: {
                    value: "Retrieving metadata...",
                    style: "flex: 1; margin-left: 8px;",
                  },
                },
                {
                  tag: "label",
                  namespace: "xul",
                  id: "batch-progress-metadata-check",
                  attributes: {
                    value: "✔",
                    style:
                      "font-size: 16px; color: #f2f2f2; line-height: 16px; flex-shrink: 0;",
                    hidden: "true",
                  },
                },
              ],
            },
          ],
        },

        {
          tag: "label",
          namespace: "xul",
          id: "batch-progress-cancelling",
          attributes: {
            value: "Cancelling...",
            style:
              "text-align: center; color: #000000ff; font-weight: 700; font-size: 16px; margin-top: 12px; margin-bottom: 12px; padding: 8px; background-color: rgba(114, 25, 22, 0); border-radius: 4px;",
            hidden: "true",
          },
        },
        {
          tag: "html:button",
          id: "batch-progress-cancel-btn",
          attributes: {
            style:
              "align-self: center; min-width: 150px; color: #f2f2f2 !important; background-color: #232221 !important; font-size: 16px !important; font-weight: 800 !important; padding: 12px 24px; border-radius: 6px; border: 1px solid #151414; cursor: pointer; text-align: center; display: flex; align-items: center; justify-content: center; margin-top: 12px;",
          },
          listeners: [
            {
              type: "click",
              listener: () => this.handleCancel(),
            },
          ],
          children: [
            {
              tag: "text",
              properties: {
                textContent: "Cancel",
              },
            },
          ],
        },
      ],
    });

    this.doc.body?.appendChild(container);

    this.replaceProgressMetersWithArcs();

    this.cacheElements();

    this.setupProgressTracking();
  }

  private replaceProgressMetersWithArcs(): void {
    this.cacheElements();
    this.setupProgressTracking();
  }

  private setupProgressTracking(): void {
    if (!this.options.libraryID) return;

    this.notifierID = Zotero.Notifier.registerObserver(
      {
        notify: (event: string, type: string, ids: number[]) => {
          if (type === "item") {
            if (event === "add") {
              ids.forEach((id) => this.importedItemIDs.add(id));
            } else if (event === "modify") {
              ids.forEach(async (id) => {
                try {
                  const item = await Zotero.Items.getAsync(id);
                  if (item && item.getField && item.getField("title")) {
                    this.recognizedItemIDs.add(id);
                  }
                } catch (e) {
                  // Ignore errors
                }
              });
            }
          }
        },
      },
      ["item"],
    );

    this.progressCheckInterval = this.win!.setInterval(() => {
      this.checkAndUpdateProgress();
    }, 15000) as any;
  }

  private async checkAndUpdateProgress(): Promise<void> {
    if (!this.options.libraryID || this.cancelled) return;

    if (this.totalExpectedItems > 0) {
      const importPercent = Math.min(
        100,
        Math.round((this.importedItemIDs.size / this.totalExpectedItems) * 100),
      );
      if (this.elements.importingMeter) {
        (this.elements.importingMeter as unknown as HTMLProgressElement).value =
          importPercent;
      }
    }

    if (this.importedItemIDs.size > 0) {
      const metadataPercent = Math.min(
        100,
        Math.round(
          (this.recognizedItemIDs.size / this.importedItemIDs.size) * 100,
        ),
      );
    }
  }

  private cacheElements(): void {
    if (!this.doc) return;

    this.elements.currentBatchLabel = this.doc.getElementById(
      "batch-progress-current-batch",
    ) as any;
    this.elements.batchArc = this.doc.getElementById("batch-arc") as any;
    const batchIcon = this.doc.getElementById(
      "batch-progress-batch-icon",
    ) as any;
    if (batchIcon) this.elements.batchIcon = batchIcon;
    const batchMeter = this.doc.getElementById(
      "batch-progress-batch-meter",
    ) as any;
    if (batchMeter) this.elements.batchMeter = batchMeter;
    const batchCheck = this.doc.getElementById(
      "batch-progress-batch-check",
    ) as any;
    if (batchCheck) this.elements.batchCheck = batchCheck;

    this.elements.importingLabel = this.doc.getElementById(
      "batch-progress-importing-label",
    ) as any;
    this.elements.importingArc = this.doc.getElementById(
      "importing-arc",
    ) as any;
    const importingIcon = this.doc.getElementById(
      "batch-progress-importing-icon",
    ) as any;
    if (importingIcon) this.elements.importingIcon = importingIcon;
    const importingMeter = this.doc.getElementById(
      "batch-progress-importing-meter",
    ) as any;
    if (importingMeter) this.elements.importingMeter = importingMeter;
    const importingCheck = this.doc.getElementById(
      "batch-progress-importing-check",
    ) as any;
    if (importingCheck) this.elements.importingCheck = importingCheck;

    this.elements.duplicatesRow = this.doc.getElementById(
      "batch-progress-duplicates-row",
    ) as any;
    this.elements.duplicatesLabel = this.doc.getElementById(
      "batch-progress-duplicates-label",
    ) as any;
    const duplicatesIcon = this.doc.getElementById(
      "batch-progress-duplicates-icon",
    ) as any;
    if (duplicatesIcon) this.elements.duplicatesIcon = duplicatesIcon;
    const duplicatesCheck = this.doc.getElementById(
      "batch-progress-duplicates-check",
    ) as any;
    if (duplicatesCheck) this.elements.duplicatesCheck = duplicatesCheck;

    this.elements.metadataRow = this.doc.getElementById(
      "batch-progress-metadata-row",
    ) as any;
    this.elements.metadataLabel = this.doc.getElementById(
      "batch-progress-metadata-label",
    ) as any;
    const metadataIcon = this.doc.getElementById(
      "batch-progress-metadata-icon",
    ) as any;
    if (metadataIcon) this.elements.metadataIcon = metadataIcon;
    const metadataCheck = this.doc.getElementById(
      "batch-progress-metadata-check",
    ) as any;
    if (metadataCheck) this.elements.metadataCheck = metadataCheck;

    this.elements.cancelButton = this.doc.getElementById(
      "batch-progress-cancel-btn",
    ) as any;
    this.elements.cancellingLabel = this.doc.getElementById(
      "batch-progress-cancelling",
    ) as any;
  }

  updateProgress(state: Partial<ProgressState>): void {
    if (!this.doc) return;

    if (state.totalBatches !== undefined && state.currentBatch !== undefined) {
      this.elements.currentBatchLabel?.setAttribute(
        "value",
        `Processing batch ${state.currentBatch} of ${state.totalBatches}`,
      );
      const batchProgress =
        state.totalBatches > 0
          ? Math.round((state.currentBatch / state.totalBatches) * 100)
          : 0;
      if (this.elements.batchMeter) {
        (this.elements.batchMeter as unknown as HTMLProgressElement).value =
          batchProgress;
      }

      if (state.currentBatch === state.totalBatches && state.totalBatches > 0) {
        setTimeout(() => {
          this.elements.batchMeter?.setAttribute("hidden", "true");
          setTimeout(() => {
            this.elements.batchCheck?.setAttribute("hidden", "false");
            this.elements.batchCheck?.setAttribute(
              "style",
              "font-size: 32px; color: #f2f2f2; line-height: 32px; flex-shrink: 0;",
            );
          }, 1000);
        }, 1000);
      }
    }

    if (state.importing) {
      const { current, total, done } = state.importing;
      this.elements.importingLabel?.setAttribute(
        "value",
        `Importing items... ${current}/${total}`,
      );
      const progress = total > 0 ? Math.round((current / total) * 100) : 0;
      if (this.elements.importingMeter) {
        (this.elements.importingMeter as unknown as HTMLProgressElement).value =
          progress;
      }

      if (done) {
        setTimeout(() => {
          this.elements.importingMeter?.setAttribute("hidden", "true");
          setTimeout(() => {
            this.elements.importingCheck?.setAttribute("hidden", "false");
            this.elements.importingCheck?.setAttribute(
              "style",
              "font-size: 32px; color: #f2f2f2; line-height: 32px; flex-shrink: 0;",
            );
          }, 1000);
        }, 1000);
      }
    }

    if (state.scanningDuplicates) {
      const { enabled, done } = state.scanningDuplicates;
      if (enabled) {
        this.elements.duplicatesRow?.setAttribute("hidden", "false");
        this.elements.duplicatesLabel?.setAttribute(
          "value",
          "Scanning for duplicates...",
        );

        if (done) {
          setTimeout(() => {
            this.elements.duplicatesCheck?.setAttribute("hidden", "false");
            this.elements.duplicatesCheck?.setAttribute(
              "style",
              "font-size: 32px; color: #f2f2f2; line-height: 32px; flex-shrink: 0;",
            );
          }, 1000);
        }
      }
    }

    if (state.retrievingMetadata) {
      const { done } = state.retrievingMetadata;
      this.elements.metadataLabel?.setAttribute(
        "value",
        "Retrieving metadata...",
      );

      if (done) {
        setTimeout(() => {
          this.elements.metadataCheck?.setAttribute("hidden", "false");
          this.elements.metadataCheck?.setAttribute(
            "style",
            "font-size: 32px; color: #f2f2f2; line-height: 32px; flex-shrink: 0;",
          );
        }, 1000);
      }
    }
  }
  private handleCancel(): void {
    if (this.cancelled) return;
    this.cancelled = true;

    this.elements.cancelButton?.setAttribute("disabled", "true");
    this.elements.cancellingLabel?.setAttribute("hidden", "false");

    setTimeout(() => {
      this.options.onCancel?.();
      this.close();
    }, 2000);
  }

  closeAfterDelay(delayMs: number = 4000): void {
    setTimeout(() => {
      this.close();
    }, delayMs);
  }

  close(): void {
    try {
      if (this.notifierID) {
        Zotero.Notifier.unregisterObserver(this.notifierID);
        this.notifierID = undefined;
      }
      if (this.progressCheckInterval && this.win) {
        this.win.clearInterval(this.progressCheckInterval);
        this.progressCheckInterval = undefined;
      }

      this.win?.close();
    } catch (e) {
      ztoolkit.log("BatchProgressWindow close failed", e);
    }
  }

  isOpen(): boolean {
    return !!(this.win && !this.win.closed);
  }
}
