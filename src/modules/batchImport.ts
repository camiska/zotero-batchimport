import { getPref } from "../utils/prefs";
import { delay } from "../utils/wait";
import {
  BatchProgressWindow,
  ProgressState,
} from "../utils/BatchProgressWindow";
import { showBatchSummary } from "../utils/BatchSummaryDialog";

const BATCH_SIZE_DEFAULT = 50;

export class BatchImport {
  static registerToolsMenu() {
    try {
      ztoolkit.Menu.register("menuTools", {
        tag: "menuitem",
        id: `${addon.data.config.addonRef}-batch-import-menu`,
        label: "Batch Import PDFs…",
        commandListener: async () => {
          try {
            await BatchImport.run();
          } catch (err) {
            ztoolkit.log("Batch import failed", err);
            Zotero.alert(
              Zotero.getMainWindow(),
              addon.data.config.addonName,
              `Batch import failed: ${String(err)}`,
            );
          }
        },
      });
    } catch (e) {
      ztoolkit.log("Failed to register Tools menu", e);
    }
  }

  static async run() {
    const win = Zotero.getMainWindow();

    const includeSubfolders = getPref("includeSubfolders") ?? true;
    const subfoldersToSubcollections =
      getPref("subfoldersToSubcollections") ?? false;
    const tagDuplicates = getPref("tagDuplicates") ?? false;

    const importPDF = getPref("importPDF") ?? true;
    const importEPUB = getPref("importEPUB") ?? true;
    const importHTML = getPref("importHTML") ?? false;
    const importOtherTypes = getPref("importOtherTypes") ?? false;

    const retrieveMetadata = getPref("retrieveMetadata") ?? true;

    const fileTypes = { importPDF, importEPUB, importHTML, importOtherTypes };

    const source = await BatchImport.pickFolderOrFiles(win, fileTypes);
    if (!source) return;

    const batchSize = BATCH_SIZE_DEFAULT;

    const pane = Zotero.getActiveZoteroPane();
    const libraryID = pane.getSelectedLibraryID();

    let collectionName: string;
    let files: Array<{ file: nsIFile; relDir: string }>;

    if (source.mode === "folder" && source.folder) {
      collectionName = source.folder.leafName || source.folder.path;
      files = await BatchImport.scanForPDFsDetailed(
        source.folder,
        includeSubfolders,
        fileTypes,
      );
    } else if (source.mode === "files" && source.files) {
      collectionName = "Selected Files";
      files = source.files.map((file) => ({ file, relDir: "" }));
    } else {
      return;
    }

    if (files.length === 0) {
      Zotero.alert(
        win,
        addon.data.config.addonName,
        "No matching files found.",
      );
      return;
    }

    const collection = await BatchImport.createCollection(
      libraryID,
      collectionName,
    );

    const sleepyCatURI = `chrome://${addon.data.config.addonRef}/content/icons/batchimport_sleepy_icon.svg`;
    const checkIconURI = `chrome://${addon.data.config.addonRef}/content/icons/batchimport_cat_icon.svg`;

    let cancelled = false;

    const progress = new BatchProgressWindow({
      heroIconURI: sleepyCatURI,
      checkIconURI: checkIconURI,
      libraryID: libraryID,
      totalItems: files.length,
      onCancel: () => {
        ztoolkit.log("[Batch Import] Cancel pressed");
        cancelled = true;
      },
    });

    progress.open();

    await delay(500);

    const totalBatches = Math.ceil(files.length / batchSize);

    const total = files.length;
    let imported = 0;
    let recognizedTriggered = 0;
    const errors: string[] = [];
    let pdfCount = 0;
    let epubCount = 0;
    let htmlCount = 0;
    let otherCount = 0;
    let duplicateCount = 0;

    let existingSigs: Set<string> | null = null;
    if (tagDuplicates) {
      progress.updateProgress({
        scanningDuplicates: { enabled: true, progress: 0, done: false },
      });

      existingSigs = await BatchImport.buildExistingAttachmentSignatures(
        libraryID,
        (progressNow, progressMax) => {
          const pct = Math.round(
            (progressNow / Math.max(1, progressMax)) * 100,
          );
          progress.updateProgress({
            scanningDuplicates: { enabled: true, progress: pct, done: false },
          });
        },
      );

      progress.updateProgress({
        scanningDuplicates: { enabled: true, progress: 100, done: true },
      });
    }

    const allImportedIDs: number[] = [];
    const metadataEligibleIDs: number[] = [];

    for (let i = 0; i < files.length; i += batchSize) {
      if (cancelled) break;
      const batch = files.slice(i, i + batchSize);
      const importedIDs: number[] = [];

      for (const entry of batch) {
        if (cancelled) break;
        const file = entry.file;
        let targetCollection = collection;
        if (subfoldersToSubcollections && entry.relDir) {
          targetCollection = await BatchImport.ensureSubcollection(
            collection,
            libraryID,
            entry.relDir,
          );
        }
        try {
          const item = await Zotero.Attachments.importFromFile({
            file,
            libraryID,
            collections: [targetCollection.id],
          });
          imported++;
          importedIDs.push(item.id);
          allImportedIDs.push(item.id);

          const fileName = (
            typeof file === "string" ? file : (file as any).path || ""
          ).toLowerCase();
          if (fileName.endsWith(".pdf")) {
            pdfCount++;
            metadataEligibleIDs.push(item.id);
          } else if (fileName.endsWith(".epub")) {
            epubCount++;
            metadataEligibleIDs.push(item.id);
          } else if (
            fileName.endsWith(".html") ||
            fileName.endsWith(".htm") ||
            fileName.endsWith(".xhtml")
          ) {
            htmlCount++;
            metadataEligibleIDs.push(item.id);
          } else {
            otherCount++;
          }

          if (existingSigs) {
            try {
              const sig = await BatchImport.signatureForAttachment(item);
              if (sig && existingSigs.has(sig)) {
                item.addTag("batchimportdupe", 0);
                await (item as any).saveTx?.();
                duplicateCount++;
              }
            } catch (e) {
              ztoolkit.log("duplicate tagging error", e);
            }
          }
        } catch (e: any) {
          const filePath = typeof file === "string" ? file : (file as any).path;
          errors.push(`${filePath}: ${String(e)}`);
        }

        progress.updateProgress({
          currentBatch: Math.floor(i / batchSize) + 1,
          totalBatches,
          importing: {
            current: imported,
            total,
            done: false,
          },
        });
      }

      await delay(50);
    }

    progress.updateProgress({
      importing: { current: imported, total, done: true },
    });

    if (!cancelled && metadataEligibleIDs.length > 0 && retrieveMetadata) {
      try {
        progress.updateProgress({
          retrievingMetadata: {
            progress: 0,
            done: false,
          },
        });

        const recognizer = (Zotero as any).PDFRecognizer;
        if (recognizer && typeof recognizer.recognize === "function") {
          const maybePromise = recognizer.recognize(metadataEligibleIDs);
          if (maybePromise && typeof maybePromise.then === "function") {
            await maybePromise;
          }
        } else {
          await (pane as any).selectItems({ items: metadataEligibleIDs });
          pane.recognizeSelected();
          await delay(250);
        }

        recognizedTriggered = metadataEligibleIDs.length;

        progress.updateProgress({
          retrievingMetadata: {
            progress: 100,
            done: true,
          },
        });
      } catch (e: any) {
        errors.push(`metadata retrieval error: ${String(e)}`);
        progress.updateProgress({
          retrievingMetadata: {
            progress: 100,
            done: true,
          },
        });
      }
    } else {
      progress.updateProgress({
        retrievingMetadata: {
          progress: 100,
          done: true,
        },
      });
    }

    ztoolkit.log("Batch import summary", {
      imported,
      total,
      recognizedTriggered,
      errors,
    });

    if (!cancelled) {
      progress.closeAfterDelay(5000);
    }

    await delay(5500);

    if (!cancelled) {
      showBatchSummary({
        totalFiles: total,
        importedCount: imported,
        pdfCount,
        epubCount,
        htmlCount,
        otherCount,
        duplicateCount: tagDuplicates ? duplicateCount : undefined,
        errorCount: errors.length,
        errors,
        collectionName: collection.name,
      });
    }
  }

  private static async createCollection(libraryID: number, baseName: string) {
    const ts = new Date();
    const pad = (n: number) => n.toString().padStart(2, "0");
    const name = `${baseName} – Batch Import ${ts.getFullYear()}-${pad(
      ts.getMonth() + 1,
    )}-${pad(ts.getDate())} ${pad(ts.getHours())}${pad(ts.getMinutes())}`;
    const col = new Zotero.Collection({ name, libraryID });
    await col.saveTx?.();
    return col;
  }

  private static async pickFolderOrFiles(
    win: Window,
    fileTypes: {
      importPDF: boolean;
      importEPUB: boolean;
      importHTML: boolean;
      importOtherTypes: boolean;
    },
  ): Promise<{
    mode: "folder" | "files";
    folder?: nsIFile;
    files?: nsIFile[];
  } | null> {
    const Services = (globalThis as any).Services || (Zotero as any).Services;
    const ps = Services.prompt;
    const flags =
      ps.BUTTON_TITLE_IS_STRING * ps.BUTTON_POS_0 +
      ps.BUTTON_TITLE_IS_STRING * ps.BUTTON_POS_1 +
      ps.BUTTON_TITLE_IS_STRING * ps.BUTTON_POS_2;

    const buttonPressed = ps.confirmEx(
      win,
      "Batch Import",
      "Select import source:",
      flags,
      "Cancel",
      "Select Folder",
      "Select Files",
      null,
      {},
    );

    ztoolkit.log("[Batch Import] Button pressed:", buttonPressed);

    if (buttonPressed === 0) return null;

    if (buttonPressed === 1) {
      try {
        const fp: any = new (ztoolkit as any).FilePicker(
          "Select Folder",
          "folder",
        );
        const path = await fp.open();
        if (path) {
          const f = Components.classes[
            "@mozilla.org/file/local;1"
          ].createInstance(Components.interfaces.nsIFile);
          f.initWithPath(path);
          if (f.exists() && f.isDirectory()) {
            return { mode: "folder", folder: f };
          }
        }
      } catch (e) {
        ztoolkit.log("Toolkit folder picker failed", e);
      }

      try {
        const fp = Components.classes[
          "@mozilla.org/filepicker;1"
        ].createInstance(Components.interfaces.nsIFilePicker);
        fp.init(
          win,
          "Select Folder",
          Components.interfaces.nsIFilePicker.modeGetFolder,
        );
        const rv = await new Promise<number>((resolve) => fp.open(resolve));
        if (rv === Components.interfaces.nsIFilePicker.returnOK && fp.file) {
          return { mode: "folder", folder: fp.file as nsIFile };
        }
      } catch (e) {
        ztoolkit.log("Folder picker failed", e);
      }
    } else if (buttonPressed === 2) {
      ztoolkit.log("[Batch Import] Opening file picker for multiple files");
      try {
        const filters: [string, string][] = [];
        const extensions: string[] = [];

        if (fileTypes.importPDF) extensions.push("*.pdf");
        if (fileTypes.importEPUB) extensions.push("*.epub");
        if (fileTypes.importHTML) extensions.push("*.html", "*.htm", "*.xhtml");
        if (fileTypes.importOtherTypes) {
          extensions.push(
            "*.jpg",
            "*.jpeg",
            "*.png",
            "*.gif",
            "*.bmp",
            "*.tiff",
            "*.svg",
            "*.webp",
            "*.mp3",
            "*.mp4",
            "*.wav",
            "*.avi",
            "*.mov",
            "*.mkv",
            "*.flac",
            "*.ogg",
            "*.webm",
          );
        }

        if (extensions.length > 0) {
          filters.push(["Allowed Files", extensions.join("; ")]);
        }

        ztoolkit.log(
          "[Batch Import] File picker configured with filters:",
          extensions,
        );

        const filePicker = new ztoolkit.FilePicker(
          "Select Files",
          "multiple",
          filters,
          undefined,
          win,
        );

        const result = await filePicker.open();
        ztoolkit.log("[Batch Import] File picker returned:", result);

        if (result && Array.isArray(result) && result.length > 0) {
          const files: nsIFile[] = [];
          for (const filePath of result) {
            try {
              const file = Zotero.File.pathToFile(filePath);
              files.push(file);
              ztoolkit.log("[Batch Import] Selected file:", filePath);
            } catch (e) {
              ztoolkit.log(
                "[Batch Import] Error converting file path:",
                filePath,
                e,
              );
            }
          }
          if (files.length > 0) {
            ztoolkit.log("[Batch Import] Returning", files.length, "files");
            return { mode: "files", files };
          } else {
            ztoolkit.log("[Batch Import] No valid files after conversion");
          }
        } else {
          ztoolkit.log("[Batch Import] No files selected or user cancelled");
        }
      } catch (e) {
        ztoolkit.log("[Batch Import] File picker failed:", e);
      }
    }

    return null;
  }

  private static async scanForPDFsDetailed(
    root: nsIFile,
    recursive: boolean,
    fileTypes: {
      importPDF: boolean;
      importEPUB: boolean;
      importHTML: boolean;
      importOtherTypes: boolean;
    },
  ): Promise<Array<{ file: nsIFile; relDir: string }>> {
    const results: Array<{ file: nsIFile; relDir: string }> = [];
    const rootPath = root.path;

    const extensions: string[] = [];

    if (fileTypes.importPDF) extensions.push("pdf");
    if (fileTypes.importEPUB) extensions.push("epub");
    if (fileTypes.importHTML) extensions.push("html", "htm", "xhtml");
    if (fileTypes.importOtherTypes) {
      extensions.push(
        "jpg",
        "jpeg",
        "png",
        "gif",
        "bmp",
        "tiff",
        "svg",
        "webp",
        "mp3",
        "mp4",
        "wav",
        "avi",
        "mov",
        "mkv",
        "flac",
        "ogg",
        "webm",
      );
    }

    if (extensions.length === 0) {
      return results;
    }

    const pattern = new RegExp(`\\.(${extensions.join("|")})$`, "i");

    const walk = (dir: nsIFile) => {
      const entries = dir.directoryEntries;
      while (entries.hasMoreElements()) {
        const entry = entries
          .getNext()
          .QueryInterface(Components.interfaces.nsIFile);
        if (entry.isDirectory()) {
          if (recursive) walk(entry);
        } else if (pattern.test(entry.leafName)) {
          let relDir = "";
          try {
            const parentPath = entry.parent?.path || rootPath;
            if (parentPath.startsWith(rootPath)) {
              relDir = parentPath
                .substring(rootPath.length)
                .replace(/^\\|^\//, "");
            }
          } catch (e) {
            ztoolkit.log("Path error", e);
          }
          results.push({ file: entry, relDir });
        }
      }
    };

    try {
      walk(root);
    } catch (e) {
      ztoolkit.log("Directory scan error", e);
    }

    return results;
  }

  private static async ensureSubcollection(
    rootCollection: Zotero.Collection,
    libraryID: number,
    relDir: string,
  ): Promise<Zotero.Collection> {
    if (!relDir) return rootCollection;
    const parts = relDir.split(/\\|\//).filter(Boolean);
    let current = rootCollection;
    for (const part of parts) {
      const existing = current
        .getChildCollections(false)
        .find((c) => c.name === part);
      if (existing) {
        current = existing;
      } else {
        const newCol = new Zotero.Collection({
          name: part,
          libraryID,
          parentID: current.id,
        });
        await newCol.saveTx?.();
        current = newCol;
      }
    }
    return current;
  }

  private static async signatureForAttachment(
    item: Zotero.Item,
  ): Promise<string | null> {
    try {
      const name = item.attachmentFilename;
      const size = await Zotero.Attachments.getTotalFileSize(item, true);
      if (!name || !size) return null;
      return `${name}|${size}`;
    } catch {
      return null;
    }
  }

  private static async buildExistingAttachmentSignatures(
    libraryID: number,
    onProgress?: (progress: number, progressMax: number) => void,
  ): Promise<Set<string>> {
    const sigs = new Set<string>();
    try {
      const items = await Zotero.Items.getAll(libraryID, false, false, false);
      let processed = 0;
      const total = items.length;
      for (const it of items) {
        if (
          typeof (it as any).isFileAttachment === "function"
            ? (it as any).isFileAttachment()
            : it.isAttachment() && it.isFileAttachment()
        ) {
          const sig = await BatchImport.signatureForAttachment(
            it as Zotero.Item,
          );
          if (sig) sigs.add(sig);
        }
        processed++;
        if (onProgress) onProgress(processed, total);
        if (processed % 50 === 0) await delay(0);
      }
    } catch (e) {
      ztoolkit.log("Error building existing attachment signature set", e);
    }
    return sigs;
  }
}
