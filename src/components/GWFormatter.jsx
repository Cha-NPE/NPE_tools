import { useRef, useState } from "react";
import "./styles.css";

function GWFormatter() {
    const inputRef = useRef(null);
    const [outputHtml, setOutputHtml] = useState("");
    const [clearInputsOnCopy, setClearInputsOnCopy] = useState(false);

    function escapeHtml(value) {
        return String(value)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/\"/g, "&quot;")
            .replace(/'/g, "&#39;");
    }

    function getPlainCellText(cell) {
        const divs = [...cell.querySelectorAll("div")];
        const parts = divs.length > 0
            ? divs.map(div => div.textContent.trim()).filter(Boolean)
            : cell.textContent.split(/\r?\n/).map(line => line.trim()).filter(Boolean);

        return parts.map(part => escapeHtml(part)).join("<br>");
    }

    function cleanSiteValue(value) {
        return String(value)
            .replace(/<br\s*\/?>/gi, " ")
            .replace(/\s+/g, " ")
            .replace(/^\s*The address and legal description of the Site is:\s*/i, "")
            .trim();
    }

    function convert() {
        const sourceTable = inputRef.current.querySelector("table");

        if (!sourceTable) {
            alert("Paste a table first");
            return;
        }

        const rows = [...sourceTable.rows];

        let pm = "";
        let wo = "";
        let site = "";
        const detailLabels = ["Powerco's PM:", "WO:", "Site", "Scope of Services:"];
        const tableWidthPt = 467.7; // 16.5cm - full width of the Word template
        const labelColWidthPt = 99; // 3.5cm label column on the Overview table

        rows.forEach(row => {
            const cells = [...row.cells];
            if (cells.length < 2) return;
            const label = cells[0].textContent.trim();
            const value = cells[1].textContent.trim();

            if (label.includes("Project Manager"))
                pm = escapeHtml(value);

            if (label.includes("Work Order Number"))
                wo = escapeHtml(value);

            if (label === "Site") {
                site = cleanSiteValue(getPlainCellText(cells[1]));
            }
        });

        const tableStyle = `width:${tableWidthPt}pt;
        border-collapse:collapse;
        font-family:Arial,sans-serif;
        font-size:11pt;`;

        const footerTable = `
        <br>

        <table border="1" style="${tableStyle}">
            <tr>
                <td><strong>Stock Cable Used:</strong> Ali Size/Meters -&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; Vintol Size/Meters -</td>
            </tr>
        </table>

        <br>

        <table border="1" style="${tableStyle}">
            <tr>
                <td style="width:${(tableWidthPt * 0.36).toFixed(1)}pt;"><strong>Plexus:</strong></td>
                <td style="width:${(tableWidthPt * 0.31).toFixed(1)}pt;">&#9744; <strong>Raukawa:</strong></td>
                <td style="width:${(tableWidthPt * 0.33).toFixed(1)}pt;"><strong>DIALB4UDIG:</strong> M &#9744; P &#9744;</td>
            </tr>
            <tr>
                <td><strong>Scheduled:</strong></td>
                <td><strong>JA PO:</strong></td>
                <td>&#9744; <strong>TMP:</strong></td>
            </tr>
            <tr>
                <td><strong>NAPA:</strong> HV &#9744; LV &#9744; LP &#9744; AP &#9744;</td>
                <td>
                    <table border="0" style="width:100%; border-collapse:collapse; font-family:Arial,sans-serif; font-size:11pt;">
                        <tr>
                            <td style="padding:0;"><strong>Spec Order:</strong></td>
                            <td style="padding:0; text-align:right;">RMU &#9744; Cru &#9744;</td>
                        </tr>
                    </table>
                </td>
                <td>&#9744; <strong>TTM:</strong></td>
            </tr>
            <tr>
                <td><strong>CIVIL:</strong> NPE &#9744; LM &#9744; TD &#9744; FD &#9744;</td>
                <td style="text-align:right;">TX &#9744; ABS &#9744;</td>
                <td>Manned &#9744; Setup &#9744;</td>
            </tr>
        </table>

        <br>

        <table border="1" style="${tableStyle}">
            <tr style="height:170px;">
                <td style="vertical-align:top;">
                    <p style="margin:0;">-</p>
                    <p style="margin:0;">&nbsp;</p>
                    <p style="margin:0;">-</p>
                    <p style="margin:0;">&nbsp;</p>
                    <p style="margin:0;">-</p>
                    <p style="margin:0;">&nbsp;</p>
                    <p style="margin:0;">-</p>
                </td>
            </tr>
        </table>
        `;

        const finalHtml = `

        <table border="0"
        style="width:${tableWidthPt}pt;
        border-collapse:collapse;
        font-family:Arial,sans-serif;
        font-size:11pt;">

            <tr>
                <td style="background-color:#c8b7d9; width:${labelColWidthPt}pt;"><strong>Overview</strong></td>
                <td style="width:${tableWidthPt - labelColWidthPt}pt;"></td>
            </tr>

            <tr>
                <td style="width:${labelColWidthPt}pt;">Powerco's PM:</td>
                <td style="color:#000;">${pm}</td>
            </tr>

            <tr>
                <td style="width:${labelColWidthPt}pt;">WO:</td>
                <td style="color:#000;">${wo}</td>
            </tr>

            <tr>
                <td style="background-color:#c8b7d9; width:${labelColWidthPt}pt;"><strong>Specifications</strong></td>
                <td></td>
            </tr>

            <tr>
                <td style="width:${labelColWidthPt}pt;">Site</td>
                <td style="color:#000;">${site}</td>
            </tr>

            <tr>
                <td style="vertical-align:top; width:${labelColWidthPt}pt;">Scope of Services:</td>
                <td style="color:#000;"></td>
            </tr>

        </table>

        ${footerTable}
        `;

        setOutputHtml(finalHtml);
    }

    async function copyOutput() {
        const temp = document.createElement("div");
        temp.innerHTML = outputHtml;
        await navigator.clipboard.write([
            new ClipboardItem({
                "text/html": new Blob([outputHtml], { type: "text/html" }),
                "text/plain": new Blob([temp.innerText], { type: "text/plain" }
                )
            })
        ]);

        if (clearInputsOnCopy && inputRef.current) {
            inputRef.current.innerHTML = "";
            inputRef.current.textContent = "";
        }
    }

    return (
        <>
            <h1>GW Table Formatter</h1>
            <div ref={inputRef} className="GW-input" contentEditable suppressContentEditableWarning/>
            <div className="centered-buttons-div">
                <button onClick={convert}>Convert</button>
                <button onClick={copyOutput}>Copy Output</button>
            </div>
            <div className="centered-buttons-div">
                <label style={{ marginTop: "12px", marginBottom: "12px" }}>
                    <input
                        type="checkbox"
                        checked={clearInputsOnCopy}
                        onChange={(e) => setClearInputsOnCopy(e.target.checked)}
                    />
                    Clear input boxes after copy
                </label>
            </div>

            <div className="output" dangerouslySetInnerHTML={{__html: outputHtml}}/>
        </>
    );
}

export default GWFormatter;