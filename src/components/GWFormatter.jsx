import { useRef, useState } from "react";
import "./styles.css";

function GWFormatter() {
    const inputRef = useRef(null);
    const [outputHtml, setOutputHtml] = useState("");

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
        let scopeHtml = "";

        rows.forEach(row => {
            const cells = [...row.cells];
            if (cells.length < 2) return;
            const label = cells[0].innerText.trim();
            const value = cells[1].innerText.trim();

            if (label.includes("Project Manager"))
                pm = value;

            if (label.includes("Work Order Number"))
                wo = value;

            if (label === "Site") {
                const divs = [...cells[1].querySelectorAll("div")];
                site = divs.slice(1).map(div => div.innerHTML).join("<br>");
            }

            if (label.includes("Scope of Services")) {scopeHtml = "";}
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
                <td>J.A RUSSELL:</td>
            </tr>

            <tr>
                <td>CIVIL:</td>
                <td>SPEC ORDER:</td>
            </tr>

        </table>
        `;

        const finalHtml = `

        <table border="0"
        style="
        border-collapse:collapse;
        width:100%;
        font-family:Arial,sans-serif;
        font-size:11pt;">

            <tr>
                <td style="background-color:#c8b7d9;">
                    <strong>Overview</strong>
                </td>

                <td></td>
            </tr>

            <tr>
                <td><strong>Powerco's PM:</strong></td>
                <td>${pm}</td>
            </tr>

            <tr>
                <td><strong>WO:</strong></td>
                <td>${wo}</td>
            </tr>

            <tr>
                <td style="background-color:#c8b7d9;">
                    <strong>Specifications</strong>
                </td>

                <td></td>
            </tr>

            <tr>
                <td><strong>Site</strong></td>
                <td>${site}</td>
            </tr>

            <tr>
                <td style="vertical-align:top;">
                    <strong>Scope of Services:</strong>
                </td>

                <td>${scopeHtml}</td>
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
    }

    return (
        <>
            <h1>GW Table Formatter</h1>
            <div ref={inputRef} className="GW-input" contentEditable suppressContentEditableWarning/>
            <br />
            <button onClick={convert}>Convert</button>
            <button onClick={copyOutput}>Copy Output</button>
            <div className="output" dangerouslySetInnerHTML={{__html: outputHtml}}/>
        </>
    );
}

export default GWFormatter;