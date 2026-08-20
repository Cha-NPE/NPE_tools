import { useRef, useState } from "react";
import { PDFDocument } from "pdf-lib";
import * as pdfjsLib from "pdfjs-dist";
import { createWorker } from "tesseract.js";

// Loaded from a CDN so it works regardless of bundler (Vite/CRA/etc).
// Swap for a locally-bundled worker file later if you'd rather not depend on the CDN.
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;

// Rectangle to OCR on page 2 of each split chunk, measured from the top of the page.
const OCR_RECT_TOP_CM = 4;
const OCR_RECT_BOTTOM_CM = 9;
const CM_TO_POINTS = 72 / 2.54; // PDF points per cm (PDF points are 72/inch)
const RENDER_SCALE = 3; // higher render resolution = better OCR accuracy

// Renders `pageNumber` (1-indexed) of a PDF, crops the OCR rectangle out of it,
// and runs it through the given Tesseract worker. Returns the recognized text,
// or null if the page doesn't exist / OCR fails.
async function extractTextFromPageRegion(pdfBytes, pageNumber, ocrWorker) {
    // pdf.js transfers ownership of the typed array it's given to its worker
    // thread, which detaches the underlying buffer. Pass a copy so the
    // original bytes (still needed for saving the PDF) stay intact.
    const pdf = await pdfjsLib.getDocument({ data: pdfBytes.slice() }).promise;
    if (pageNumber > pdf.numPages) return null;

    const page = await pdf.getPage(pageNumber);
    const viewport = page.getViewport({ scale: RENDER_SCALE });

    const pageCanvas = document.createElement("canvas");
    pageCanvas.width = viewport.width;
    pageCanvas.height = viewport.height;
    await page.render({ canvasContext: pageCanvas.getContext("2d"), viewport }).promise;

    const topPx = OCR_RECT_TOP_CM * CM_TO_POINTS * RENDER_SCALE;
    const bottomPx = Math.min(OCR_RECT_BOTTOM_CM * CM_TO_POINTS * RENDER_SCALE, viewport.height);
    const cropHeight = bottomPx - topPx;
    if (cropHeight <= 0) return null;

    const cropCanvas = document.createElement("canvas");
    cropCanvas.width = viewport.width;
    cropCanvas.height = cropHeight;
    cropCanvas.getContext("2d").drawImage(
        pageCanvas,
        0, topPx, viewport.width, cropHeight,
        0, 0, viewport.width, cropHeight
    );

    const blob = await new Promise((resolve) => cropCanvas.toBlob(resolve, "image/png"));
    if (!blob) return null;

    try {
        const { data: { text } } = await ocrWorker.recognize(blob);
        return text;
    }
    catch (error) {
        console.warn(`OCR failed for page ${pageNumber}:`, error);
        return null;
    }
}

function PdfSplitter() {
    const splitInputRef = useRef(null);
    const combineInputRef = useRef(null);
    const [combineDropFiles, setCombineDropFiles] = useState([]);
    const [isDragActive, setIsDragActive] = useState(false);
    const [activeTab, setActiveTab] = useState('split');
    const [ocrResults, setOcrResults] = useState([]);
    const [isSplitting, setIsSplitting] = useState(false);

    function sanitizeFilename(name) {
        if (!name) return null;
        let s = name.replace(/[<>:\"/\\|?*\x00-\x1F]/g, "");
        s = s.replace(/[\r\n]+/g, " ").replace(/\s+/g, " ").trim();
        s = s.replace(/[.\s]+$/g, "");
        return s || null;
    }

    // Pulls the Customer Works Application Number and the site address out of
    // the raw OCR text for a chunk. The form is a fixed layout, so both fields
    // are found by anchoring on the surrounding label text rather than trying
    // to parse the whole form.
    function extractFieldsFromOcrText(text) {
        if (!text) return { appNumber: null, address: null };

        // "Customer Works Application Number: 00059387" -> "00059387"
        const appNumberMatch = text.match(/Customer\s*Works\s*Application\s*Number:?\s*(\d+)/i);
        const appNumber = appNumberMatch ? appNumberMatch[1] : null;

        // The address sits between "Contractor:" and "Date Work Completed:" on
        // the form, but OCR runs the contractor name and address together with
        // no separator (e.g. "Contractor: NPE-Tech 77 Aranui Road Date Work
        // Completed:"). The contractor name doesn't contain digits, so the
        // address is taken to start at the first digit in that span (the house
        // number) and run to the end of the span.
        let address = null;
        const contractorMatch = text.match(/Contractor:?/i);
        const dateMatch = text.match(/Date\s*Work\s*Completed/i);
        if (contractorMatch && dateMatch) {
            const contractorEnd = contractorMatch.index + contractorMatch[0].length;
            const dateStart = dateMatch.index;
            if (dateStart > contractorEnd) {
                const between = text.slice(contractorEnd, dateStart);
                const digitIdx = between.search(/\d/);
                if (digitIdx !== -1) {
                    address = between.slice(digitIdx).replace(/\s+/g, " ").trim();
                    // Drop stray trailing OCR noise like a lone pipe/quote left
                    // over from a table border (e.g. "30 Freyberg Street |\"").
                    address = address.replace(/[|"'`]+$/g, "").trim() || null;
                }
            }
        }

        return { appNumber, address };
    }

    // Builds the "[App Number] - [Address] - As Builts" filename. Returns null
    // if either field couldn't be confidently read, so the caller can fall
    // back to a generic name instead of saving a wrong/incomplete filename.
    function buildAsBuiltsFilename(ocrText) {
        const { appNumber, address } = extractFieldsFromOcrText(ocrText);
        if (!appNumber || !address) return { filename: null, appNumber, address };
        const filename = sanitizeFilename(`${appNumber} - ${address} - As Builts`);
        return { filename, appNumber, address };
    }

    function downloadBlob(bytes, filename) {
        const blob = new Blob([bytes], { type: "application/pdf" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${filename}.pdf`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
    }

    async function requestWritePermission(folderHandle) {
        if (!folderHandle) return false;

        try {
            if (typeof folderHandle.requestPermission === "function") {
                const perm = await folderHandle.requestPermission({ mode: "readwrite" });
                return perm === "granted";
            }
            if (typeof folderHandle.queryPermission === "function") {
                let permission = await folderHandle.queryPermission({ mode: "readwrite" });
                if (permission !== "granted") {
                    permission = await folderHandle.requestPermission({ mode: "readwrite" });
                }
                return permission === "granted";
            }
        }
        catch (error) {
            console.warn("Write permission error:", error);
        }

        return false;
    }

    // Save bytes to the provided folderHandle when available, otherwise
    // prompt the user for a folder once (when savePdf is called without a handle).
    async function savePdf(bytes, filename, folderHandle = null) {
        let useDirectorySave = false;
        let handle = folderHandle;

        if (!handle) {
            // fall back to prompting the user (legacy behavior)
            handle = await window.showDirectoryPicker();
        }

        useDirectorySave = await requestWritePermission(handle).catch(() => false);

        if (useDirectorySave) {
            try {
                const fileHandle = await handle.getFileHandle(`${filename}.pdf`, { create: true });
                const writable = await fileHandle.createWritable();
                await writable.write(bytes);
                await writable.close();
                return true;
            }
            catch (error) {
                console.warn("Directory save failed:", error);
            }
        }

        downloadBlob(bytes, filename);
        return false;
    }

    async function splitPdf() {
        const file = splitInputRef.current.files[0];

        if (!file) {
            alert("Select a PDF to split first.");
            return;
        }

        setOcrResults([]);
        setIsSplitting(true);

        const pdfBytes = await file.arrayBuffer();
        const sourcePdf = await PDFDocument.load(pdfBytes);
        const pageCount = sourcePdf.getPageCount();

        // prompt once for a save directory and reuse it for all chunks
        let folderHandle = null;
        try {
            folderHandle = await window.showDirectoryPicker();
            const granted = await requestWritePermission(folderHandle).catch(() => false);
            if (!granted) folderHandle = null;
        }
        catch (e) {
            folderHandle = null;
        }

        // One OCR worker reused across every chunk, terminated once the loop finishes.
        const ocrWorker = await createWorker("eng");

        let fileNumber = 1;
        let successCount = 0;
        let failureCount = 0;

        for (let i = 0; i < pageCount; i += 2) {
            const chunkNumber = fileNumber;
            let outputBytes;

            try {
                const newPdf = await PDFDocument.create();
                const pages = await newPdf.copyPages(sourcePdf, [i, i + 1].filter((p) => p < pageCount));
                pages.forEach((page) => newPdf.addPage(page));
                outputBytes = await newPdf.save();
            }
            catch (error) {
                console.error("Failed to build PDF chunk", chunkNumber, error);
                failureCount++;
                fileNumber++;
                continue;
            }

            let ocrText = null;
            try {
                ocrText = await extractTextFromPageRegion(outputBytes, 2, ocrWorker);
            }
            catch (error) {
                console.warn("OCR step failed for chunk", chunkNumber, error);
            }

            const { filename: parsedFilename, appNumber, address } = buildAsBuiltsFilename(ocrText);
            const filename = parsedFilename || `Document ${chunkNumber}`;
            if (!parsedFilename) {
                console.warn(`Chunk ${chunkNumber}: couldn't parse App Number/Address from OCR text, using fallback name.`);
            }

            setOcrResults((current) => [
                ...current,
                { chunkNumber, filename, appNumber, address, ocrText: ocrText || "", usedFallback: !parsedFilename }
            ]);

            try {
                if (folderHandle) {
                    await savePdf(outputBytes, filename, folderHandle);
                }
                else {
                    // user didn't choose a folder (or permission denied) — download
                    downloadBlob(outputBytes, filename);
                }

                successCount++;
            }
            catch (error) {
                console.error("Save failed for chunk", chunkNumber, error);
                failureCount++;
            }

            fileNumber++;
        }

        await ocrWorker.terminate();
        setIsSplitting(false);

        alert(`Finished. ${successCount} files saved, ${failureCount} failures.`);
    }

    function handleCombineDragOver(event) {
        event.preventDefault();
        setIsDragActive(true);
    }

    function handleCombineDragLeave(event) {
        event.preventDefault();
        setIsDragActive(false);
    }

    function handleCombineDrop(event) {
        event.preventDefault();
        setIsDragActive(false);

        const droppedFiles = Array.from(event.dataTransfer.files || []);
        if (droppedFiles.length > 0) {
            setCombineDropFiles((currentFiles) => [...currentFiles, ...droppedFiles]);
            if (combineInputRef.current) {
                combineInputRef.current.value = null;
            }
        }
    }

    function clearCombineDropFiles() {
        setCombineDropFiles([]);
    }

    async function combinePdfs() {
        const selectedFiles = combineInputRef.current?.files ? Array.from(combineInputRef.current.files) : [];
        const files = combineDropFiles.length > 0 ? combineDropFiles : selectedFiles;

        if (!files || files.length === 0) {
            alert("Select PDF/image files to combine first.");
            return;
        }

        const mergedPdf = await PDFDocument.create();

        // helper: draw an image file onto a canvas (which applies EXIF orientation
        // for us) and re-encode it as bytes in the given output format. Re-encoding
        // JPEGs back to JPEG (instead of PNG) keeps this fast and keeps file sizes
        // close to the original — PNG is lossless and re-compressing a multi-
        // megapixel photo as PNG is what made the combiner slow.
        async function normalizeImageOrientation(file, outputType) {
            return await new Promise((resolve, reject) => {
                const url = URL.createObjectURL(file);
                const img = new Image();
                img.onload = async () => {
                    try {
                        const canvas = document.createElement('canvas');
                        canvas.width = img.naturalWidth || img.width;
                        canvas.height = img.naturalHeight || img.height;
                        const ctx = canvas.getContext('2d');
                        ctx.drawImage(img, 0, 0);
                        canvas.toBlob((blob) => {
                            if (!blob) return reject(new Error('Canvas toBlob failed'));
                            blob.arrayBuffer().then((ab) => {
                                resolve(new Uint8Array(ab));
                                URL.revokeObjectURL(url);
                            }).catch(reject);
                        }, outputType, outputType === 'image/jpeg' ? 0.92 : undefined);
                    }
                    catch (e) {
                        URL.revokeObjectURL(url);
                        reject(e);
                    }
                };
                img.onerror = (e) => {
                    URL.revokeObjectURL(url);
                    reject(new Error('Image load failed'));
                };
                img.src = url;
            });
        }

        // helper: embed image file into mergedPdf.
        // Every format is routed through the canvas (normalizeImageOrientation)
        // rather than embedding raw bytes. This matters most for JPEGs:
        // phone/camera photos often store an EXIF "Orientation" tag instead of
        // rotating the actual pixel data, and pdf-lib's embedJpg ignores that tag
        // entirely, which is what caused images to come out sideways/upside-down.
        // Drawing through an <img>/<canvas> first makes the browser apply that
        // EXIF rotation for us. JPEGs are re-encoded back to JPEG (cheap, small);
        // everything else is re-encoded as PNG (lossless, needed since gif/webp/bmp
        // don't have a pdf-lib embed path of their own).
        async function embedImageFile(file) {
            try {
                const name = (file.name || '').toLowerCase();
                const isJpeg = file.type === 'image/jpeg' || /\.jpe?g$/.test(name);
                const isSupported =
                    isJpeg ||
                    (file.type && file.type.startsWith('image/')) ||
                    /\.(png|gif|webp|bmp)$/i.test(name);

                if (!isSupported) {
                    throw new Error('Unsupported image type');
                }

                const outputType = isJpeg ? 'image/jpeg' : 'image/png';
                const normalizedBytes = await normalizeImageOrientation(file, outputType);
                const img = isJpeg
                    ? await mergedPdf.embedJpg(normalizedBytes)
                    : await mergedPdf.embedPng(normalizedBytes);

                const dimensions = img.scale(1);
                const page = mergedPdf.addPage([dimensions.width, dimensions.height]);
                page.drawImage(img, { x: 0, y: 0, width: dimensions.width, height: dimensions.height });
            }
            catch (err) {
                throw err;
            }
        }

        // prompt once for a save directory and reuse it
        let folderHandle = null;
        try {
            folderHandle = await window.showDirectoryPicker();
            const granted = await requestWritePermission(folderHandle).catch(() => false);
            if (!granted) folderHandle = null;
        }
        catch (e) {
            folderHandle = null;
        }

        for (const file of files) {
            try {
                const name = (file.name || '').toLowerCase();

                if (file.type === 'application/pdf' || name.endsWith('.pdf')) {
                    const fileBytes = await file.arrayBuffer();
                    const sourcePdf = await PDFDocument.load(fileBytes);
                    const copiedPages = await mergedPdf.copyPages(sourcePdf, sourcePdf.getPageIndices());
                    copiedPages.forEach((page) => mergedPdf.addPage(page));
                }
                else if (file.type && file.type.startsWith('image/') || /\.(png|jpe?g|gif|webp|bmp)$/i.test(name)) {
                    await embedImageFile(file);
                }
                else {
                    console.warn('Skipping unsupported file type:', file.name);
                }
            }
            catch (error) {
                console.error(`Failed to append file ${file.name}`, error);
                alert(`Failed to combine file: ${file.name} — ${error.message}`);
                return;
            }
        }

        const outputBytes = await mergedPdf.save();
        const filename = sanitizeFilename("Combined") || "Combined";

        try {
            if (folderHandle) {
                await savePdf(outputBytes, filename, folderHandle);
            }
            else {
                downloadBlob(outputBytes, filename);
            }

            alert("Combined PDF saved successfully.");
        }
        catch (error) {
            console.error("Failed to save combined PDF", error);
            alert("Failed to save combined PDF.");
        }
    }

    return (
        <>
            <h2>PDF Tools</h2>

            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px' }}>
                <span style={{ fontWeight: activeTab === 'split' ? 700 : 400 }}>Split</span>
                <label style={{ position: 'relative', display: 'inline-block', width: '72px', height: '32px' }}>
                    <input
                        type="checkbox"
                        checked={activeTab === 'combine'}
                        onChange={(event) => setActiveTab(event.target.checked ? 'combine' : 'split')}
                        style={{ opacity: 0, width: 0, height: 0 }}
                    />
                    <span style={{
                        position: 'absolute',
                        cursor: 'pointer',
                        inset: 0,
                        backgroundColor: activeTab === 'combine' ? '#007acc' : '#ccc',
                        borderRadius: '999px',
                        transition: 'background-color 0.2s ease'
                    }} />
                    <span style={{
                        position: 'absolute',
                        top: '4px',
                        left: activeTab === 'combine' ? '40px' : '4px',
                        width: '24px',
                        height: '24px',
                        background: '#fff',
                        borderRadius: '50%',
                        transition: 'left 0.2s ease'
                    }} />
                </label>
                <span style={{ fontWeight: activeTab === 'combine' ? 700 : 400 }}>Combine</span>
            </div>

            {activeTab === 'split' && (
                <section style={{ marginBottom: '20px' }}>
                    <input type="file" accept=".pdf" ref={splitInputRef} />
                    <br />
                    <br />
                    <button onClick={splitPdf} disabled={isSplitting}>
                        {isSplitting ? "Splitting…" : "Split PDF"}
                    </button>

                    {ocrResults.length > 0 && (() => {
                        const fallbackResults = ocrResults.filter((result) => result.usedFallback);
                        if (fallbackResults.length === 0) return null;

                        return (
                            <div style={{ marginTop: '20px' }}>
                                <strong>Chunks that couldn't be auto-named ({fallbackResults.length})</strong>
                                <p style={{ margin: '4px 0 8px', color: '#666' }}>
                                    These fell back to "Document N" because the App Number and/or Address
                                    couldn't be read from the OCR text. Check the raw text below and rename manually if needed.
                                </p>
                                <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: '8px' }}>
                                    <thead>
                                        <tr>
                                            <th style={{ textAlign: 'left', borderBottom: '1px solid #ccc', padding: '6px' }}>Chunk</th>
                                            <th style={{ textAlign: 'left', borderBottom: '1px solid #ccc', padding: '6px' }}>Filename used</th>
                                            <th style={{ textAlign: 'left', borderBottom: '1px solid #ccc', padding: '6px' }}>App Number</th>
                                            <th style={{ textAlign: 'left', borderBottom: '1px solid #ccc', padding: '6px' }}>Address</th>
                                            <th style={{ textAlign: 'left', borderBottom: '1px solid #ccc', padding: '6px' }}>Raw OCR text</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {fallbackResults.map((result) => (
                                            <tr key={result.chunkNumber}>
                                                <td style={{ borderBottom: '1px solid #eee', padding: '6px', verticalAlign: 'top' }}>
                                                    {result.chunkNumber}
                                                </td>
                                                <td style={{ borderBottom: '1px solid #eee', padding: '6px', verticalAlign: 'top', color: '#b45309' }}>
                                                    {result.filename}
                                                </td>
                                                <td style={{ borderBottom: '1px solid #eee', padding: '6px', verticalAlign: 'top', color: result.appNumber ? '#000' : '#999' }}>
                                                    {result.appNumber || "—"}
                                                </td>
                                                <td style={{ borderBottom: '1px solid #eee', padding: '6px', verticalAlign: 'top', color: result.address ? '#000' : '#999' }}>
                                                    {result.address || "—"}
                                                </td>
                                                <td style={{ borderBottom: '1px solid #eee', padding: '6px', verticalAlign: 'top', whiteSpace: 'pre-wrap', color: result.ocrText ? '#000' : '#999' }}>
                                                    {result.ocrText || "(no text detected)"}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        );
                    })()}
                </section>
            )}

            {activeTab === 'combine' && (
                <section>
                    <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', alignItems: 'flex-start' }}>
                        <div
                            onClick={() => combineInputRef.current?.click()}
                            onDragOver={handleCombineDragOver}
                            onDragLeave={handleCombineDragLeave}
                            onDrop={handleCombineDrop}
                            style={{
                                flex: '1 1 320px',
                                minWidth: '280px',
                                border: isDragActive ? '2px dashed #007acc' : '2px dashed #999',
                                borderRadius: '8px',
                                padding: '20px',
                                textAlign: 'center',
                                background: isDragActive ? '#eef7ff' : '#fafafa',
                                cursor: 'pointer',
                                userSelect: 'none'
                            }}
                        >
                            <p style={{ margin: 0 }}><strong>Drag files here</strong></p>
                            <p style={{ margin: '6px 0 0' }}>or click this area to select image files</p>
                        </div>

                        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'flex-start', width: '100%', minWidth: '220px' }}>
                            <button
                                type="button"
                                onClick={combinePdfs}
                                style={{
                                    padding: '14px 26px',
                                    fontSize: '16px',
                                    borderRadius: '10px',
                                    minWidth: '220px',
                                    background: 'linear-gradient(90deg,#2563eb,#4f46e5)',
                                    color: '#fff',
                                    border: 'none',
                                    cursor: 'pointer',
                                    boxShadow: '0 8px 18px rgba(37,99,235,0.12)'
                                }}
                            >
                                Combine Files
                            </button>
                        </div>

                        <div style={{
                            flex: '0 0 320px',
                            minWidth: '220px',
                            height: '280px',
                            display: 'flex',
                            flexDirection: 'column',
                            border: '1px solid #ccc',
                            borderRadius: '8px',
                            background: '#fff',
                            overflow: 'hidden'
                        }}>
                            <div style={{
                                flex: '1 1 auto',
                                overflowY: 'auto',
                                padding: '12px'
                            }}>
                                <strong>Selected files</strong>
                                {combineDropFiles.length > 0 ? (
                                    <ul style={{ paddingLeft: '20px', marginTop: '8px' }}>
                                        {combineDropFiles.map((file, index) => (
                                            <li key={index}>{file.name}</li>
                                        ))}
                                    </ul>
                                ) : (
                                    <p style={{ marginTop: '8px', color: '#666' }}>No files added yet.</p>
                                )}
                            </div>
                            <div style={{ padding: '12px', borderTop: '1px solid #eee', background: '#fafafa' }}>
                                <button
                                    type="button"
                                    onClick={clearCombineDropFiles}
                                    style={{ width: '100%' }}
                                >
                                    Clear files
                                </button>
                            </div>
                        </div>
                    </div>

                    <input
                        type="file"
                        accept=".pdf,image/*"
                        ref={combineInputRef}
                        multiple
                        style={{ display: 'none' }}
                        onChange={(event) => {
                            const files = Array.from(event.target.files || []);
                            if (files.length > 0) {
                                setCombineDropFiles((current) => [...current, ...files]);
                            }
                        }}
                    />
                </section>
            )}
        </>
    );
}

export default PdfSplitter;
