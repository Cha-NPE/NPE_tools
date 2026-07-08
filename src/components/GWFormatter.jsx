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
        const labelColWidthPx = 2000;

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

        const footerTable = `
        <br>

        <table border="1"
        style="width:100%;
        border-collapse:collapse;
        font-family:Arial,sans-serif;
        font-size:11pt;">

            <tr>
                <td nowrap>
                    <strong>Stock&nbsp;Cable&nbsp;Used:</strong>
                </td>
                <td style="width:100%;"></td>
            </tr>

            <tr>
                <td nowrap>
                    <strong>Ali&nbsp;Size/Meters:</strong>
                </td>
                <td style=width:100%"></td>
            </tr>

            <tr>
                <td nowrap>
                    <strong>Vintol&nbsp;Size/Meters:</strong>
                </td>

                <td style="width:100%"></td>
            </tr>

        </table>

        <br>

        <table border="1"
        style="width:100%;
        border-collapse:collapse;
        font-family:Arial,sans-serif;
        font-size:11pt;">

            <tr>
                <td>PLEXUS:</td>
                <td>C-TTM CONFIRMED/REQ:</td>
            </tr>

            <tr>
                <td>SCHEDULED:</td>
                <td>DIALB4UDIG:</td>
            </tr>

            <tr>
                <td>NAPA:</td>
                <td>J A RUSSELL:</td>
            </tr>

            <tr>
                <td>CIVIL:</td>
                <td>SPEC ORDER:</td>
            </tr>

        </table>
        `;

        const finalHtml = `

        <table border="0"
        style="width:100%;
        border-collapse:collapse;
        font-family:Arial,sans-serif;
        font-size:11pt;">

            <tr>
                <td style="background-color:#c8b7d9; white-space:nowrap; width:${labelColWidthPx}px;"><strong>Overview</strong></td>
                <td></td>
            </tr>

            <tr>
                <td style="white-space:nowrap; width:${labelColWidthPx}px;">Powerco's PM:</td>
                <td style="color:#000;">${pm}</td>
            </tr>

            <tr>
                <td style="white-space:nowrap; width:${labelColWidthPx}px;">WO:</td>
                <td style="color:#000;">${wo}</td>
            </tr>

            <tr>
                <td style="background-color:#c8b7d9; white-space:nowrap; width:${labelColWidthPx}px;"><strong>Specifications</strong></td>
                <td></td>
            </tr>

            <tr>
                <td style="white-space:nowrap; width:${labelColWidthPx}px;">Site</td>
                <td style="color:#000;">${site}</td>
            </tr>

            <tr>
                <td style="vertical-align:top; white-space:nowrap; width:${labelColWidthPx}px;">Scope of Services:</td>
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
            <br />
            <div className="centered-buttons-div">
                <button onClick={convert}>Convert</button>
                <button onClick={copyOutput}>Copy Output</button>
            </div>
            <div className="centered-buttons-div">
                <label style={{ marginRight: "12px" }}>
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