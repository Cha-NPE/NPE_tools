import { useState } from "react";
import "./styles.css";

function DGFormatter() {
    // REGION MAPPING
    const areaMap = {
        // Wairarapa
        "masterton":"WWP \n50551886",
        "lansdowne":"WWP \n50551886",
        "carterton":"WWP \n50551886",
        "greytown":"WWP \n50551886",
        "featherston":"WWP \n50551886",
        "martinborough":"WWP \n50551886",
        "eketahuna":"WWP \n50551886",
        "dyerville":"WWP \n50551886",
        "castlepoint":"WWP \n50551886",
        "pahiatua":"WWP \n50551886",

        // Manawatu
        "palmerston north":"WMA \n50551888",
        "feilding":"WMA \n50551888",
        "ashhurst":"WMA \n50551888",
        "bunnythorpe":"WMA \n50551888",
        "woodville":"WMA \n50551888",
        "foxton":"WMA \n50551888", 
        "tangimomana":"WMA \n50551888",
        "aokautere":"WMA \n50551888",
        "cheltenham":"WMA \n50551888",
        "kimbolton":"WMA \n50551888",
        "halcombe":"WMA \n50551888",
        "rongotea":"WMA \n50551888",
        "longburn":"WMA \n50551888",
        "colyton":"WMA \n50551888",

        // Whanganui
        "whanganui":"WWG \n50551887",
        "wanganui":"WWG \n50551887",
        "marton":"WWG \n50551887",
        "taihape":"WWG \n50551887",
        "bulls":"WWG \n50551887",
        "ohakune":"WWG \n50551887",
        "brunswick":"WWG \n50551887",   
        "hunterville":"WWG \n50551887",
        "castlecliff":"WWG \n50551887",
        "durie hill":"WWG \n50551887",
        "gonville":"WWG \n50551887",
        "springvale":"WWG \n50551887",
    };

    const [input, setInput] = useState("");

    const [output, setOutput] = useState({request: "", icp: "", address: "", region: ""});

    function findRegion(address) {
        const lowerAddress = address.toLowerCase();
        const sortedAreas = Object.keys(areaMap).sort((a, b) => b.length - a.length);

        for (const area of sortedAreas) {
            if (lowerAddress.includes(area)) {return areaMap[area];}
        }
        return "UNKNOWN";
    }

    function formatText(textValue) {
        let text = textValue.trim();
        let parts = text.split(" - ");

        if (parts.length < 4) {
            alert("Input format not recognised");
            return;
        }

        let request = parts[1].trim();
        let icp = parts[2].trim();
        let address = parts[3].replace(/\s+,/g, ",").trim();
        let region = findRegion(address);

        setOutput({request, icp, address, region});
        setInput("");
    }

    function handlePaste(e) {
        const pastedText = e.clipboardData.getData("text");
        setTimeout(() => {formatText(pastedText);}, 10);
    }

    async function copyOutput() {
        const regionCode = output.region.split(" \n")[0];
        const poNumber = output.region.split(" \n")[1];
        const formattedRegion = `${regionCode} - Purchase Order 4100000461`;
        
        const outputHtml =
            `<div>DG Labelling request - ${output.request} - ICP ${output.icp}</div>
            <div><strong>${output.address}</strong></div>
            <div>${formattedRegion}</div>
            <div>${poNumber}</div>
            <div>4100000461</div>
            <div>${output.request} - DG Label</div>`;

        const outputText =
            `DG Labelling request - ${output.request} - ICP ${output.icp}
            ${output.address}
            ${formattedRegion}
            ${poNumber}
            ${output.request} - DG Label`;

        await navigator.clipboard.write([
            new ClipboardItem({
                "text/html": new Blob(
                    [outputHtml],
                    { type: "text/html" }
                ),
                "text/plain": new Blob(
                    [outputText],
                    { type: "text/plain" }
                )
            })
        ]);
    }

    return (
        <>
            <div className="titleAndButton">
                <div>
                    <h1>DG Email subject to Job Card Format</h1>
                </div>
            </div>

            <textarea
                placeholder="Enter email subject"
                value={input}
                onChange={(e) => {
                    const value = e.target.value;
                    setInput(value);
                    if (value.trim()) {formatText(value);}
                }}
            />

            <div className="centered-buttons-div">
                <button onClick={copyOutput}>Copy Output</button>
            </div>

            <div className="output">
                {output.request && (
                    <>
                        <div>DG Labelling request - {output.request} - ICP {output.icp}</div>
                        <div><strong>{output.address}</strong></div>
                        <div>{output.region.split(" \n")[0]} - Purchase Order 4100000461</div>
                        <div>{output.region.split(" \n")[1]}</div>
                        <div>{output.request} - DG Label</div>
                    </>
                )}
            </div>
        </>
    );
}

export default DGFormatter;