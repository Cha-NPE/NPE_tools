import { useRef } from "react";
import { PDFDocument } from "pdf-lib";

function PdfSplitter() {
    const fileInputRef = useRef(null);

    async function splitPdf() {
        const file = fileInputRef.current.files[0];

        if (!file) {
            alert("Select a PDF first");
            return;
        }

        const pdfBytes = await file.arrayBuffer();
        const sourcePdf = await PDFDocument.load(pdfBytes);

        const pageCount = sourcePdf.getPageCount();

        const folderHandle = await window.showDirectoryPicker();

        // Request persistent write permission up-front. If the user doesn't grant it,
        // we'll fall back to downloading files via the browser downloads folder.
        let useDirectorySave = true;
        try {
            // Some browsers implement requestPermission/queryPermission on handles
            if (typeof folderHandle.requestPermission === "function") {
                const perm = await folderHandle.requestPermission({ mode: "readwrite" });
                console.log("folderHandle.requestPermission:", perm);
                if (perm !== "granted") {
                    console.warn("Directory write permission not granted; falling back to downloads.");
                    useDirectorySave = false;
                }
            }
            else if (typeof folderHandle.queryPermission === "function") {
                const q = await folderHandle.queryPermission({ mode: "readwrite" });
                console.log("folderHandle.queryPermission:", q);
                if (q !== "granted") {
                    const r = await folderHandle.requestPermission({ mode: "readwrite" }).catch(() => null);
                    console.log("folderHandle.requestPermission (fallback):", r);
                    if (r !== "granted") {
                        useDirectorySave = false;
                    }
                }
            }
        }
        catch (e) {
            console.warn("Directory permission request threw:", e);
            useDirectorySave = false;
        }

        let fileNumber = 1;
        let successCount = 0;
        let failureCount = 0;

        function sanitizeFilename(name) {
            if (!name) return null;
            // remove control chars and characters invalid on Windows
            let s = name.replace(/[<>:\"/\\|?*\x00-\x1F]/g, "");
            // replace newlines with space and collapse whitespace
            s = s.replace(/[\r\n]+/g, " ").replace(/\s+/g, " ").trim();
            // remove trailing dots/spaces
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

        for (let i = 0; i < pageCount; i += 2) {
            const chunkNumber = fileNumber;
            let filename;
            let outputBytes;

            try {
                const newPdf = await PDFDocument.create();

                const pages = await newPdf.copyPages(
                    sourcePdf,
                    [i, i + 1].filter((p) => p < pageCount)
                );

                pages.forEach((page) => newPdf.addPage(page));

                outputBytes = await newPdf.save();
            }
            catch (error) {
                console.error("Failed to build PDF chunk", chunkNumber, error);
                failureCount++;
                fileNumber++;
                continue;
            }

            filename = sanitizeFilename(`Document ${chunkNumber}`) || `Document ${chunkNumber}`;

            if (useDirectorySave) {
                try {
                    const fileHandle = await folderHandle.getFileHandle(
                        `${filename}.pdf`,
                        { create: true }
                    );
                    const writable = await fileHandle.createWritable();
                    await writable.write(outputBytes);
                    await writable.close();
                    console.log("Saved file to directory:", `${filename}.pdf`);
                    successCount++;
                }
                catch (error) {
                    console.error("Directory save failed for chunk", chunkNumber, error);
                    console.warn("Falling back to browser download for", `${filename}.pdf`);
                    try {
                        downloadBlob(outputBytes, filename);
                        successCount++;
                    }
                    catch (downloadError) {
                        console.error("Fallback download failed for", filename, downloadError);
                        failureCount++;
                    }
                }
            }
            else {
                // Directory saving not available; download via browser
                try {
                    downloadBlob(outputBytes, filename);
                    console.log("Downloaded file via browser:", `${filename}.pdf`);
                    successCount++;
                }
                catch (downloadError) {
                    console.error("Download failed for", filename, downloadError);
                    failureCount++;
                }
            }

            fileNumber++;
        }

        alert(`Finished. ${successCount} files saved, ${failureCount} failures.`);

    }

    return (
        <>
            <h2>Split PDF into 2-page files</h2>

            <input
                type="file"
                accept=".pdf"
                ref={fileInputRef}
            />

            <br />
            <br />

            <button onClick={splitPdf}>
                Split PDF
            </button>
        </>
    );
}

export default PdfSplitter;