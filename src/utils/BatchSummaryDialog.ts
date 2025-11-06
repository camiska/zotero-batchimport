export interface BatchSummaryData {
  totalFiles: number;
  importedCount: number;
  pdfCount: number;
  epubCount: number;
  htmlCount: number;
  otherCount: number;
  duplicateCount?: number;
  errorCount: number;
  errors: string[];
  collectionName?: string;
}

export function showBatchSummary(data: BatchSummaryData): void {
  ztoolkit.log("showBatchSummary called with data:", data);

  let totalRows = 5;
  if (data.otherCount > 0) totalRows++;
  if (data.duplicateCount !== undefined) totalRows++;
  if (data.errorCount > 0) totalRows++;
  if (data.collectionName) totalRows++;

  const dialog = new ztoolkit.Dialog(totalRows, 2);

  ztoolkit.log("Dialog created with rows:", totalRows);

  dialog.addCell(0, 0, {
    tag: "label",
    namespace: "xul",
    attributes: {
      value: "Batch Import Complete",
      style: "font-size: 14px; font-weight: 600; margin-bottom: 12px;",
    },
  });

  dialog.addCell(1, 0, {
    tag: "label",
    namespace: "xul",
    attributes: {
      value: "Files imported:",
      style: "font-weight: 500; text-align: right;",
    },
  });

  dialog.addCell(1, 1, {
    tag: "label",
    namespace: "xul",
    attributes: {
      value: `${data.importedCount} / ${data.totalFiles}`,
      style: "text-align: left;",
    },
  });

  dialog.addCell(2, 0, {
    tag: "label",
    namespace: "xul",
    attributes: {
      value: "PDFs:",
      style: "font-weight: 500; text-align: right;",
    },
  });

  dialog.addCell(2, 1, {
    tag: "label",
    namespace: "xul",
    attributes: {
      value: String(data.pdfCount),
      style: "text-align: left;",
    },
  });

  let row = 3;

  dialog.addCell(row, 0, {
    tag: "label",
    namespace: "xul",
    attributes: {
      value: "EPUBs:",
      style: "font-weight: 500; text-align: right;",
    },
  });

  dialog.addCell(row, 1, {
    tag: "label",
    namespace: "xul",
    attributes: {
      value: String(data.epubCount),
      style: "text-align: left;",
    },
  });

  row++;

  dialog.addCell(row, 0, {
    tag: "label",
    namespace: "xul",
    attributes: {
      value: "HTML files:",
      style: "font-weight: 500; text-align: right;",
    },
  });

  dialog.addCell(row, 1, {
    tag: "label",
    namespace: "xul",
    attributes: {
      value: String(data.htmlCount),
      style: "text-align: left;",
    },
  });

  if (data.otherCount > 0) {
    row++;

    dialog.addCell(row, 0, {
      tag: "label",
      namespace: "xul",
      attributes: {
        value: "Other types:",
        style: "font-weight: 500; text-align: right;",
      },
    });

    dialog.addCell(row, 1, {
      tag: "label",
      namespace: "xul",
      attributes: {
        value: String(data.otherCount),
        style: "text-align: left;",
      },
    });
  }

  if (data.duplicateCount !== undefined) {
    dialog.addCell(row + 1, 0, {
      tag: "label",
      namespace: "xul",
      attributes: {
        value: "Duplicates flagged:",
        style: "font-weight: 500; text-align: right;",
      },
    });

    dialog.addCell(row + 1, 1, {
      tag: "label",
      namespace: "xul",
      attributes: {
        value: String(data.duplicateCount),
        style: "text-align: left;",
      },
    });
    row++;
  }

  if (data.errorCount > 0) {
    dialog.addCell(row + 1, 0, {
      tag: "label",
      namespace: "xul",
      attributes: {
        value: "Errors:",
        style: "font-weight: 500; color: #d9534f; text-align: right;",
      },
    });

    dialog.addCell(row + 1, 1, {
      tag: "label",
      namespace: "xul",
      attributes: {
        value: `${data.errorCount} (check Error Console)`,
        style: "color: #d9534f; text-align: left;",
      },
    });
    row++;
  }

  if (data.collectionName) {
    dialog.addCell(row + 1, 0, {
      tag: "label",
      namespace: "xul",
      attributes: {
        value: `into Collection "${data.collectionName}"`,
        style: "font-style: italic; margin-top: 8px;",
      },
    });
  }

  dialog.addButton("OK", "ok");

  ztoolkit.log("Opening dialog...");

  dialog.open("Import Summary", {
    width: 400,
    centerscreen: true,
    fitContent: true,
  });

  ztoolkit.log("Dialog opened successfully");

  setTimeout(() => {
    try {
      dialog.window?.close();
      ztoolkit.log("Dialog auto-closed after 10 seconds");
    } catch (e) {
      ztoolkit.log("Dialog already closed or error:", e);
    }
  }, 10000);
}
