import { useRef } from "react";
import { PDFDocument } from "pdf-lib";

function PdfSplitter() {
    const splitInputRef = useRef(null);
    const combineInputRef = useRef(null);

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

    async function combinePdfs() {
        const files = combineInputRef.current.files;

        if (!files || files.length === 0) {
            alert("Select PDF files to combine first.");
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

        // helper: embed image file into mergedPdf as a new page
        async function embedImageFile(file) {
            const lower = (file.type || file.name || '').toLowerCase();

            try {
                if (file.type === 'image/jpeg' || /\.jpe?g$/.test(file.name.toLowerCase())) {
                    const bytes = await file.arrayBuffer();
                    const img = await mergedPdf.embedJpg(bytes);
                    const { width, height } = img.scale(1);
                    const page = mergedPdf.addPage([width, height]);
                    page.drawImage(img, { x: 0, y: 0, width, height });
                    return;
                }

                if (file.type === 'image/png' || /\.png$/.test(file.name.toLowerCase())) {
                    const bytes = await file.arrayBuffer();
                    const img = await mergedPdf.embedPng(bytes);
                    const { width, height } = img.scale(1);
                    const page = mergedPdf.addPage([width, height]);
                    page.drawImage(img, { x: 0, y: 0, width, height });
                    return;
                }

                // fallback: convert other image types (gif, webp, etc) to PNG bytes
                if ((file.type && file.type.startsWith('image/')) || /\.(gif|webp|bmp)$/i.test(file.name)) {
                    const pngBytes = await imageFileToPngBytes(file);
                    const img = await mergedPdf.embedPng(pngBytes);
                    const { width, height } = img.scale(1);
                    const page = mergedPdf.addPage([width, height]);
                    page.drawImage(img, { x: 0, y: 0, width, height });
                    return;
                }

                throw new Error('Unsupported image type');
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

            <section style={{ marginBottom: "20px" }}>
                <h3>Split a PDF</h3>
                <input type="file" accept=".pdf" ref={splitInputRef} />
                <br />
                <br />
                <button onClick={splitPdf}>Split PDF</button>
            </section>

            <section>
                <h3>Combine PDFs / Images</h3>
                <input type="file" accept=".pdf,image/*" ref={combineInputRef} multiple />
                <br />
                <br />
                <button onClick={combinePdfs}>Combine Files</button>
            </section>
        </>
    );
}

export default PdfSplitter;
