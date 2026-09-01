import React, { useState, useRef, useEffect, useCallback } from "react";

// Loads an external script once and resolves when it's ready.
function loadScript(src) {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) {
      resolve();
      return;
    }
    const script = document.createElement("script");
    script.src = src;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error(`Failed to load ${src}`));
    document.head.appendChild(script);
  });
}

const FIELD_DEFAULTS = {
  pageNum: 1,
  x: 25,
  y: 490,
  w: 540,
  h: 90,
  customScope: "Replace this with the scope details specific to this document.",
  fontSize: 9,
  padding: 10,

  repeatPageNum: 1,
  repeatFontSize: 10,
  repeatAddress: "",
  repeatDesigner: "",
  poleIds: "",

  addrX: 130, addrY: 110, addrW: 200, addrH: 11,
  poleX: 130, poleY: 125, poleW: 200, poleH: 11,
  desX: 130, desY: 155, desW: 200, desH: 11,

  closingPageNum: 1,
};

export default function ScopingPackCreator() {
  const [fields, setFields] = useState(FIELD_DEFAULTS);
  const [uploadStatus, setUploadStatus] = useState("No file loaded.");
  const [repeatUploadStatus, setRepeatUploadStatus] = useState("No file loaded.");
  const [closingUploadStatus, setClosingUploadStatus] = useState("No file loaded.");
  const [status, setStatus] = useState("");
  const [previewPage, setPreviewPage] = useState(1);
  const [pageCount, setPageCount] = useState(null);
  const [downloadEnabled, setDownloadEnabled] = useState(false);
  const [libsReady, setLibsReady] = useState(false);

  const frontBytesRef = useRef(null);
  const repeatBytesRef = useRef(null);
  const closingBytesRef = useRef(null);
  const canvasRef = useRef(null);
  const renderTimerRef = useRef(null);

  // Load pdf-lib and pdf.js once on mount.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await loadScript("https://cdnjs.cloudflare.com/ajax/libs/pdf-lib/1.17.1/pdf-lib.min.js");
        await loadScript("https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js");
        if (cancelled) return;
        window.pdfjsLib.GlobalWorkerOptions.workerSrc =
          "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
        setLibsReady(true);
      } catch (err) {
        setStatus("Error loading PDF libraries: " + err.message);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const updateField = (key) => (e) => {
    setFields((prev) => ({ ...prev, [key]: e.target.value }));
  };

  // ---- PDF building helpers (ported from the original script) ----

  function wrapText(text, font, fontSize, maxWidth) {
    const outLines = [];
    const paragraphs = text.split("\n");
    for (const para of paragraphs) {
      if (para.trim() === "") { outLines.push(""); continue; }
      const words = para.split(" ");
      let line = "";
      for (const word of words) {
        const testLine = line ? line + " " + word : word;
        if (font.widthOfTextAtSize(testLine, fontSize) > maxWidth && line) {
          outLines.push(line);
          line = word;
        } else {
          line = testLine;
        }
      }
      if (line) outLines.push(line);
    }
    return outLines;
  }

  function drawFieldText(page, pageHeight, text, font, fontSize, xPt, yFromTopPt, wPt, hPt, PDFLib) {
    if (!text) return;
    const boxYBottom = pageHeight - yFromTopPt - hPt;
    const textY = boxYBottom + (hPt - fontSize) / 2 + fontSize * 0.15;
    page.drawText(text, {
      x: xPt,
      y: textY,
      size: fontSize,
      font: font,
      color: PDFLib.rgb(0, 0, 0),
    });
  }

  const buildFinalPdf = useCallback(async () => {
    const PDFLib = window.PDFLib;
    const { PDFDocument, rgb, StandardFonts } = PDFLib;

    if (!frontBytesRef.current) {
      throw new Error("Upload a front page PDF first.");
    }

    const pdfDoc = await PDFDocument.load(frontBytesRef.current);
    const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

    // ---- 1. Front page scope box ----
    const pageIndex = Math.max(0, parseInt(fields.pageNum, 10) - 1);
    const frontPages = pdfDoc.getPages();
    if (pageIndex >= frontPages.length) {
      throw new Error(`Front-page PDF only has ${frontPages.length} page(s), but front page number is ${pageIndex + 1}.`);
    }
    const frontPage = frontPages[pageIndex];
    const { height: frontPageHeight } = frontPage.getSize();

    const boxX = parseFloat(fields.x);
    const yFromTop = parseFloat(fields.y);
    const boxW = parseFloat(fields.w);
    const boxH = parseFloat(fields.h);
    const boxY = frontPageHeight - yFromTop - boxH;

    frontPage.drawRectangle({
      x: boxX, y: boxY, width: boxW, height: boxH,
      color: rgb(1, 1, 1),
    });

    const fontSize = parseFloat(fields.fontSize) || 11;
    const padding = parseFloat(fields.padding) || 10;
    const lineHeight = fontSize * 1.35;
    const textMaxWidth = boxW - padding * 2;

    const customLines = wrapText(fields.customScope, fontRegular, fontSize, textMaxWidth);
    const lines = [
      { text: "PROPOSED SCOPE", font: fontBold },
      ...customLines.map((l) => ({ text: l, font: fontRegular })),
      { text: "", font: fontRegular },
      { text: "REQUIRED", font: fontBold },
      { text: "Take clear photos of each whole pole structure side and face", font: fontRegular },
      { text: "Take clear photos of pole top hardware", font: fontRegular },
    ];

    let cursorY = boxY + boxH - padding - fontSize;
    for (const line of lines) {
      if (cursorY < boxY + padding - fontSize) break;
      if (line.text !== "") {
        frontPage.drawText(line.text, {
          x: boxX + padding,
          y: cursorY,
          size: fontSize,
          font: line.font,
          color: rgb(0, 0, 0),
        });
      }
      cursorY -= lineHeight;
    }

    // ---- 2. Repeated page, once per Pole ID ----
    const poleIds = fields.poleIds.split("\n").map((s) => s.trim()).filter((s) => s.length > 0);
    if (poleIds.length > 0) {
      if (!repeatBytesRef.current) {
        throw new Error("Pole IDs were entered but no repeated-page PDF has been uploaded.");
      }
      const repeatDoc = await PDFDocument.load(repeatBytesRef.current);
      const repeatTemplateIndex = Math.max(0, parseInt(fields.repeatPageNum, 10) - 1);
      const repeatDocPages = repeatDoc.getPages();
      if (repeatTemplateIndex >= repeatDocPages.length) {
        throw new Error(`Repeated-page PDF only has ${repeatDocPages.length} page(s), but page number ${repeatTemplateIndex + 1} was requested.`);
      }

      const templateFontSize = parseFloat(fields.repeatFontSize) || 10;
      const address = fields.repeatAddress;
      const designer = fields.repeatDesigner;

      for (const poleId of poleIds) {
        const [copiedPage] = await pdfDoc.copyPages(repeatDoc, [repeatTemplateIndex]);
        pdfDoc.addPage(copiedPage);
        const { height: repeatPageHeight } = copiedPage.getSize();

        drawFieldText(copiedPage, repeatPageHeight, address, fontRegular, templateFontSize,
          parseFloat(fields.addrX), parseFloat(fields.addrY), parseFloat(fields.addrW), parseFloat(fields.addrH), PDFLib);
        drawFieldText(copiedPage, repeatPageHeight, poleId, fontRegular, templateFontSize,
          parseFloat(fields.poleX), parseFloat(fields.poleY), parseFloat(fields.poleW), parseFloat(fields.poleH), PDFLib);
        drawFieldText(copiedPage, repeatPageHeight, designer, fontRegular, templateFontSize,
          parseFloat(fields.desX), parseFloat(fields.desY), parseFloat(fields.desW), parseFloat(fields.desH), PDFLib);
      }
    }

    // ---- 3. Closing page, appended once at the very end ----
    if (closingBytesRef.current) {
      const closingDoc = await PDFDocument.load(closingBytesRef.current);
      const closingIndex = Math.max(0, parseInt(fields.closingPageNum, 10) - 1);
      const closingDocPages = closingDoc.getPages();
      if (closingIndex >= closingDocPages.length) {
        throw new Error(`Closing-page PDF only has ${closingDocPages.length} page(s), but page number ${closingIndex + 1} was requested.`);
      }
      const [copiedClosingPage] = await pdfDoc.copyPages(closingDoc, [closingIndex]);
      pdfDoc.addPage(copiedClosingPage);
    }

    return pdfDoc.save();
  }, [fields]);

  const renderPreview = useCallback(async () => {
    if (!frontBytesRef.current || !libsReady) return;
    try {
      setStatus("Rendering preview...");
      const finalBytes = await buildFinalPdf();

      const loadingTask = window.pdfjsLib.getDocument({ data: finalBytes.slice(0) });
      const pdf = await loadingTask.promise;

      setPageCount(pdf.numPages);
      const clampedPage = Math.max(1, Math.min(previewPage || 1, pdf.numPages));
      if (clampedPage !== previewPage) setPreviewPage(clampedPage);

      const page = await pdf.getPage(clampedPage);
      const viewport = page.getViewport({ scale: 1.5 });
      const canvas = canvasRef.current;
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      const ctx = canvas.getContext("2d");
      await page.render({ canvasContext: ctx, viewport }).promise;

      setStatus("Preview updated. Click download when ready.");
    } catch (err) {
      setStatus("Error: " + err.message);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [buildFinalPdf, libsReady, previewPage]);

  const scheduleRender = useCallback(() => {
    if (!frontBytesRef.current) return;
    clearTimeout(renderTimerRef.current);
    renderTimerRef.current = setTimeout(renderPreview, 300);
  }, [renderPreview]);

  // Re-render whenever fields or preview page change (debounced).
  useEffect(() => {
    scheduleRender();
    return () => clearTimeout(renderTimerRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fields, previewPage, libsReady]);

  const handleFrontUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    frontBytesRef.current = await file.arrayBuffer();
    setUploadStatus(`Loaded: ${file.name}`);
    setDownloadEnabled(true);
    setStatus("PDF loaded. Adjust the fields, then download.");
    renderPreview();
  };

  const handleRepeatUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    repeatBytesRef.current = await file.arrayBuffer();
    setRepeatUploadStatus(`Loaded: ${file.name}`);
    scheduleRender();
  };

  const handleClosingUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    closingBytesRef.current = await file.arrayBuffer();
    setClosingUploadStatus(`Loaded: ${file.name}`);
    scheduleRender();
  };

  const handleDownload = async () => {
    try {
      setStatus("Building PDF...");
      const finalBytes = await buildFinalPdf();
      const blob = new Blob([finalBytes], { type: "application/pdf" });
      const link = document.createElement("a");
      link.download = "scoping-pack.pdf";
      link.href = URL.createObjectURL(blob);
      link.click();
      URL.revokeObjectURL(link.href);
      setStatus("Downloaded.");
    } catch (err) {
      setStatus("Error: " + err.message);
    }
  };

  // ---- styles (kept close to the original) ----
  const styles = {
    body: { fontFamily: "sans-serif", padding: 20, boxSizing: "border-box", width: "100%" },
    control: { marginBottom: 15 },
    label: { display: "block", marginBottom: 4, fontSize: 14, color: "#333" },
    inputNumber: { padding: 4, width: 90 },
    inputText: { padding: 4, width: "100%", boxSizing: "border-box" },
    textarea: { width: "100%", padding: 6, fontFamily: "inherit", fontSize: 14, boxSizing: "border-box" },
    row: { display: "flex", gap: 16, flexWrap: "wrap" },
    rowItem: { flex: "0 0 auto" },
    button: { padding: "8px 16px", cursor: "pointer" },
    buttonDisabled: { cursor: "not-allowed", opacity: 0.5 },
    statusText: { marginTop: 10, fontSize: 14, color: "#555" },
    canvas: { border: "1px solid #ccc", maxWidth: "100%" },
    fieldset: { marginTop: 14 },
    legend: { fontWeight: "bold" },
    hint: { fontSize: 12, color: "#777", marginTop: -6, marginBottom: 10 },
    fileStatus: { fontSize: 12, color: "#777", marginTop: 4 },
    layout: { display: "flex", gap: 30, alignItems: "flex-start", flexWrap: "wrap" },
    leftPanel: { flex: "1 1 420px", minWidth: 320 },
    middlePanel: { flex: "1 1 410px", minWidth: 320 },
    rightPanel: { flex: "1.4 1 550px", minWidth: 400, position: "sticky", top: 20 },
    previewWrap: { border: "1px solid #ddd", padding: 10, background: "#fafafa", overflow: "auto", maxHeight: "95vh" },
    previewControls: { display: "flex", alignItems: "center", gap: 8, marginBottom: 8 },
  };

  return (
    <div style={styles.body}>
      <div>
        <h2>Scoping Pack Creator</h2>
      </div>
      {!libsReady && (
        <div style={styles.statusText}>Loading PDF libraries...</div>
      )}
      <div style={styles.layout}>
        <div style={styles.leftPanel}>
          <fieldset style={styles.fieldset}>
            <legend style={styles.legend}>Front page</legend>
            <div style={styles.control}>
              <input type="file" accept="application/pdf" onChange={handleFrontUpload} />
              <div style={styles.fileStatus}>{uploadStatus}</div>
            </div>
            <div style={styles.row}>
              <div style={styles.rowItem}>
                <label style={styles.label}>Page number</label>
                <input type="number" style={styles.inputNumber} min={1} value={fields.pageNum} onChange={updateField("pageNum")} />
              </div>
              <div style={styles.rowItem}>
                <label style={styles.label}>X (from left, pt)</label>
                <input type="number" style={styles.inputNumber} value={fields.x} onChange={updateField("x")} />
              </div>
              <div style={styles.rowItem}>
                <label style={styles.label}>Y (from TOP, pt)</label>
                <input type="number" style={styles.inputNumber} value={fields.y} onChange={updateField("y")} />
              </div>
              <div style={styles.rowItem}>
                <label style={styles.label}>Width (pt)</label>
                <input type="number" style={styles.inputNumber} value={fields.w} onChange={updateField("w")} />
              </div>
              <div style={styles.rowItem}>
                <label style={styles.label}>Height (pt)</label>
                <input type="number" style={styles.inputNumber} value={fields.h} onChange={updateField("h")} />
              </div>
            </div>
            <div style={styles.control}>
              <label style={styles.label}>Custom scope text (fills the [custom text] section):</label>
              <textarea style={styles.textarea} rows={4} value={fields.customScope} onChange={updateField("customScope")} />
            </div>
            <div style={styles.row}>
              <div style={styles.rowItem}>
                <label style={styles.label}>Font size (pt)</label>
                <input type="number" style={styles.inputNumber} min={6} max={24} value={fields.fontSize} onChange={updateField("fontSize")} />
              </div>
              <div style={styles.rowItem}>
                <label style={styles.label}>Box padding (pt)</label>
                <input type="number" style={styles.inputNumber} min={0} max={40} value={fields.padding} onChange={updateField("padding")} />
              </div>
            </div>
          </fieldset>
          <div style={styles.statusText}>{status}</div>
        </div>

        <div style={styles.middlePanel}>
          <fieldset style={styles.fieldset}>
            <legend style={styles.legend}>Repeated page — one per Pole ID</legend>
            <div style={styles.hint}>
              Upload the page with the Project Address / Pole ID / Designer table.
              It gets appended once per Pole ID listed below, with the fields stamped in.
            </div>
            <div style={styles.control}>
              <input type="file" accept="application/pdf" onChange={handleRepeatUpload} />
              <div style={styles.fileStatus}>{repeatUploadStatus}</div>
            </div>
            <div style={styles.row}>
              <div style={styles.rowItem}>
                <label style={styles.label}>Page number in this file</label>
                <input type="number" style={styles.inputNumber} min={1} value={fields.repeatPageNum} onChange={updateField("repeatPageNum")} />
              </div>
              <div style={styles.rowItem}>
                <label style={styles.label}>Font size (pt)</label>
                <input type="number" style={styles.inputNumber} min={6} max={24} value={fields.repeatFontSize} onChange={updateField("repeatFontSize")} />
              </div>
            </div>
            <div style={styles.control}>
              <label style={styles.label}>Project Address (same on every repeated page)</label>
              <input type="text" style={styles.inputText} value={fields.repeatAddress} onChange={updateField("repeatAddress")} />
            </div>
            <div style={styles.control}>
              <label style={styles.label}>Designer (same on every repeated page)</label>
              <input type="text" style={styles.inputText} value={fields.repeatDesigner} onChange={updateField("repeatDesigner")} />
            </div>
            <div style={styles.control}>
              <label style={styles.label}>Pole IDs (one per line — one repeated page is created per line)</label>
              <textarea
                style={styles.textarea}
                rows={5}
                placeholder={"P-101\nP-102\nP-103"}
                value={fields.poleIds}
                onChange={updateField("poleIds")}
              />
            </div>
            <div style={styles.hint}>Field positions on the repeated page (from top-left of the page, in points).</div>
            <div style={styles.row}>
              <div style={styles.rowItem}>
                <label style={styles.label}>Address X</label>
                <input type="number" style={styles.inputNumber} value={fields.addrX} onChange={updateField("addrX")} />
              </div>
              <div style={styles.rowItem}>
                <label style={styles.label}>Address Y (top)</label>
                <input type="number" style={styles.inputNumber} value={fields.addrY} onChange={updateField("addrY")} />
              </div>
              <div style={styles.rowItem}>
                <label style={styles.label}>Address W</label>
                <input type="number" style={styles.inputNumber} value={fields.addrW} onChange={updateField("addrW")} />
              </div>
              <div style={styles.rowItem}>
                <label style={styles.label}>Address H</label>
                <input type="number" style={styles.inputNumber} value={fields.addrH} onChange={updateField("addrH")} />
              </div>
            </div>
            <div style={styles.row}>
              <div style={styles.rowItem}>
                <label style={styles.label}>Pole ID X</label>
                <input type="number" style={styles.inputNumber} value={fields.poleX} onChange={updateField("poleX")} />
              </div>
              <div style={styles.rowItem}>
                <label style={styles.label}>Pole ID Y (top)</label>
                <input type="number" style={styles.inputNumber} value={fields.poleY} onChange={updateField("poleY")} />
              </div>
              <div style={styles.rowItem}>
                <label style={styles.label}>Pole ID W</label>
                <input type="number" style={styles.inputNumber} value={fields.poleW} onChange={updateField("poleW")} />
              </div>
              <div style={styles.rowItem}>
                <label style={styles.label}>Pole ID H</label>
                <input type="number" style={styles.inputNumber} value={fields.poleH} onChange={updateField("poleH")} />
              </div>
            </div>
            <div style={styles.row}>
              <div style={styles.rowItem}>
                <label style={styles.label}>Designer X</label>
                <input type="number" style={styles.inputNumber} value={fields.desX} onChange={updateField("desX")} />
              </div>
              <div style={styles.rowItem}>
                <label style={styles.label}>Designer Y (top)</label>
                <input type="number" style={styles.inputNumber} value={fields.desY} onChange={updateField("desY")} />
              </div>
              <div style={styles.rowItem}>
                <label style={styles.label}>Designer W</label>
                <input type="number" style={styles.inputNumber} value={fields.desW} onChange={updateField("desW")} />
              </div>
              <div style={styles.rowItem}>
                <label style={styles.label}>Designer H</label>
                <input type="number" style={styles.inputNumber} value={fields.desH} onChange={updateField("desH")} />
              </div>
            </div>
          </fieldset>
        </div>

        <div style={styles.middlePanel}>
          <fieldset style={styles.fieldset}>
            <legend style={styles.legend}>Closing page</legend>
            <div style={styles.hint}>Uploaded as-is and appended once, right at the very end of the pack.</div>
            <div style={styles.control}>
              <input type="file" accept="application/pdf" onChange={handleClosingUpload} />
              <div style={styles.fileStatus}>{closingUploadStatus}</div>
            </div>
            <div style={styles.row}>
              <div style={styles.rowItem}>
                <label style={styles.label}>Page number in this file</label>
                <input type="number" style={styles.inputNumber} min={1} value={fields.closingPageNum} onChange={updateField("closingPageNum")} />
              </div>
            </div>
          </fieldset>
        </div>

        <div style={styles.rightPanel}>
          <h3 style={{ marginTop: 0 }}>Preview</h3>
          <div style={styles.previewControls}>
            <label style={{ margin: 0 }}>Preview page</label>
            <input
              type="number"
              min={1}
              value={previewPage}
              style={{ width: 70 }}
              onChange={(e) => setPreviewPage(parseInt(e.target.value, 10) || 1)}
            />
            <span style={{ fontSize: 13, color: "#777" }}>{pageCount ? `of ${pageCount}` : ""}</span>
          </div>
          <div style={styles.previewWrap}>
            <canvas ref={canvasRef} style={styles.canvas} />
          </div>
          <div style={styles.control}>
            <button
              onClick={handleDownload}
              disabled={!downloadEnabled}
              style={downloadEnabled ? styles.button : { ...styles.button, ...styles.buttonDisabled }}
            >
              Download Modified PDF
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}