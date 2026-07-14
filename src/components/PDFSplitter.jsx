import { useRef, useState } from "react";
import { PDFDocument } from "pdf-lib";
import * as exifr from "exifr";

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

            const filename = sanitizeFilename(`Document ${chunkNumber}`) || `Document ${chunkNumber}`;

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

        async function embedImageFile(file) {
            let img;    

            // Read EXIF orientation (defaults to 1 if none exists)
            const orientation = (await exifr.orientation(file).catch(() => 1)) || 1;

            if (
                file.type === "image/jpeg" ||
                /\.jpe?g$/i.test(file.name)
            ) {
                img = await mergedPdf.embedJpg(await file.arrayBuffer());
            }
            else if (
                file.type === "image/png" ||
                /\.png$/i.test(file.name)
            ) {
                img = await mergedPdf.embedPng(await file.arrayBuffer());
            }
            else {
                throw new Error(
                    `Unsupported image format: ${file.name}\n\n` +
                    "Only PNG and JPEG images can be combined without quality loss."
                );
            }

            const rotate90 = orientation === 6 || orientation === 8;
            const pageWidth = rotate90 ? img.height : img.width;
            const pageHeight = rotate90 ? img.width : img.height;

            const page = mergedPdf.addPage([pageWidth, pageHeight]);

            switch (orientation) {
                case 3: // 180°
                    page.drawImage(img, {
                        x: img.width,
                        y: img.height,
                        width: -img.width,
                        height: -img.height,
                    });
                    break;

                case 6: // 90° clockwise
                    page.drawImage(img, {
                        x: pageWidth,
                        y: 0,
                        width: -img.height,
                        height: img.width,
                        rotate: { angle: Math.PI / 2 },
                    });
                    break;

                case 8: // 90° counter-clockwise
                    page.drawImage(img, {
                        x: 0,
                        y: pageHeight,
                        width: img.height,
                        height: -img.width,
                        rotate: { angle: -Math.PI / 2 },
                    });
                    break;

                default:
                    page.drawImage(img, {
                        x: 0,
                        y: 0,
                        width: img.width,
                        height: img.height,
                    });
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
                    <div
                        style={{
                            display: "flex",
                            gap: "20px",
                            alignItems: "stretch",
                        }}
                    >
                        {/* LEFT SIDE */}
                        <div
                            style={{
                                flex: "0 0 85%",
                                display: "flex",
                                flexDirection: "column",
                                gap: "20px",
                            }}
                        >
                            <div
                                onClick={() => combineInputRef.current?.click()}
                                onDragOver={handleCombineDragOver}
                                onDragLeave={handleCombineDragLeave}
                                onDrop={handleCombineDrop}
                                style={{
                                    border: isDragActive
                                        ? "2px dashed #007acc"
                                        : "2px dashed #999",
                                    borderRadius: "8px",
                                    padding: "40px",
                                    textAlign: "center",
                                    background: isDragActive ? "#eef7ff" : "#fafafa",
                                    cursor: "pointer",
                                    minHeight: "220px",

                                    display: "flex",
                                    flexDirection: "column",
                                    justifyContent: "center",
                                }}
                            >
                                <p style={{ margin: 0 }}>
                                    <strong>Drag files here</strong>
                                </p>

                                <p style={{ marginTop: "8px" }}>
                                    or click this area to select PDF/image files
                                </p>
                            </div>

                            <button
                                type="button"
                                onClick={combinePdfs}
                                style={{
                                    alignSelf: "center",
                                    padding: "14px 32px",
                                    fontSize: "16px",
                                    borderRadius: "10px",
                                    minWidth: "220px",
                                    background:
                                        "linear-gradient(90deg,#2563eb,#4f46e5)",
                                    color: "#fff",
                                    border: "none",
                                    cursor: "pointer",
                                }}
                            >
                                Combine Files
                            </button>
                        </div>

                        {/* RIGHT SIDE */}
                        <div
                            style={{
                                flex: "0 0 15%",
                                display: "flex",
                                flexDirection: "column",
                                border: "1px solid #ccc",
                                borderRadius: "8px",
                                background: "#fff",
                                minHeight: "320px",
                                overflow: "hidden",
                            }}
                        >
                            <div
                                style={{
                                    flex: 1,
                                    overflowY: "auto",
                                    padding: "12px",
                                }}
                            >
                                <strong>Selected files</strong>

                                {combineDropFiles.length > 0 ? (
                                    <ul style={{ paddingLeft: "20px", marginTop: "8px" }}>
                                        {combineDropFiles.map((file, index) => (
                                            <li key={index}>{file.name}</li>
                                        ))}
                                    </ul>
                                ) : (
                                    <p style={{ marginTop: "8px", color: "#666" }}>
                                        No files added yet.
                                    </p>
                                )}
                            </div>

                            <div
                                style={{
                                    padding: "12px",
                                    borderTop: "1px solid #eee",
                                    background: "#fafafa",
                                }}
                            >
                                <button
                                    type="button"
                                    onClick={clearCombineDropFiles}
                                    style={{ width: "100%" }}
                                >
                                    Clear Files
                                </button>
                            </div>
                        </div>
                    </div>

                    <input
                        type="file"
                        accept=".pdf,image/*"
                        ref={combineInputRef}
                        multiple
                        style={{ display: "none" }}
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