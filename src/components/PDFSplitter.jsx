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
    const pdf = await pdfjsLib.getDocument({ data: pdfBytes }).promise;
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

    function sanitizeFilename(name) {
        if (!name) return null;
        let s = name.replace(/[<>:\"/\\|?*\x00-\x1F]/g, "");
        s = s.replace(/[\r\n]+/g, " ").replace(/\s+/g, " ").trim();
        s = s.replace(/[.\s]+$/g, "");
        return s || null;
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

            const filename = sanitizeFilename(ocrText) || `Document ${chunkNumber}`;

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

        // helper: convert arbitrary image file (gif/webp/etc) to PNG bytes via canvas
        async function imageFileToPngBytes(file) {
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
                        }, 'image/png');
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

        // helper: embed image file into mergedPdf using its native format and embedded dimensions
        async function embedImageFile(file) {
            try {
                let img;

                if (file.type === 'image/jpeg' || /\.jpe?g$/.test(file.name.toLowerCase())) {
                    const bytes = await file.arrayBuffer();
                    img = await mergedPdf.embedJpg(bytes);
                }
                else if (file.type === 'image/png' || /\.png$/.test(file.name.toLowerCase())) {
                    const bytes = await file.arrayBuffer();
                    img = await mergedPdf.embedPng(bytes);
                }
                else if ((file.type && file.type.startsWith('image/')) || /\.(gif|webp|bmp)$/i.test(file.name)) {
                    const pngBytes = await imageFileToPngBytes(file);
                    img = await mergedPdf.embedPng(pngBytes);
                }
                else {
                    throw new Error('Unsupported image type');
                }

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
                    <button onClick={splitPdf}>Split PDF</button>
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
