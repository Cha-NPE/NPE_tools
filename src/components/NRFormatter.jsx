import { useRef, useState } from "react";
import "./styles.css";

function NRFormatter() {
    const sapInputRef = useRef(null);
    const [emailText, setEmailText] = useState("");
    const [outputHtml, setOutputHtml] = useState("");

    function getValue(text, startLabel, endLabels = null) {
        const startIndex = text.indexOf(startLabel);

        if (startIndex === -1) { return ""; }

        const valueStart = startIndex + startLabel.length;
        let valueEnd = text.length;

        if (endLabels) {
            if (!Array.isArray(endLabels)) { endLabels = [endLabels]; }

            endLabels.forEach(label => {
                const index = text.indexOf(label, valueStart);
                if (index !== -1 && index < valueEnd) {valueEnd = index;}
            });
        }

        return text.substring(valueStart, valueEnd).trim();
    }

    function addLine(label, value){
        if (!value?.trim()) { return "";}
        return `${label}: ${value}`;
    }

    function formatPhone(phone) {
        if (!phone) { return ""; }

        let digits = phone.replace(/\D/g, "");

        if (digits.startsWith("640")) { digits = "64" + digits.substring(3); }

        if (digits.startsWith("642") && digits.length >= 10){
            const local = "0" + digits.substring(2);
            return local.replace(/(\d{3})(\d{3})(\d+)/, "$1 $2 $3");
        }

        if (digits.startsWith("64") && digits.length >= 10){
            const local = "0" + digits.substring(2);
            return local.replace(/(\d{2})(\d{3})(\d+)/, "$1 $2 $3");
        }
        return phone;
    }

    function getSection(text, sectionHeader, nextHeaders = []){
        const startIndex = text.indexOf(sectionHeader);

        if (startIndex === -1) { return "";}

        const contentStart = startIndex + sectionHeader.length;

        let endIndex = text.length;
        nextHeaders.forEach(header => {
            const index = text.indexOf(header, contentStart);

            if (index !== -1 && index < endIndex){ endIndex = index;}
        });

        return text.substring(contentStart, endIndex).trim();
    }

    function convertSAPText() {
        const text = sapInputRef.current.innerText;
        const originalHTML = sapInputRef.current.innerHTML;
        
        const siteDetailsSection = getSection(text, "SITE DETAILS", ["CONNECTION DETAILS"]);
        const connectionSection = getSection(text, "CONNECTION DETAILS - NEW CONNECTION", ["APPLICANT DETAILS"]);
        const electricianSection = getSection(text, "ELECTRICIAN DETAILS", ["ELECTRICITY BILL PAYER DETAILS"]);

        //Email input
        const emailContent = emailText;

        //Details from email
        const workOrderNumber = getValue(emailContent, "Work order number:", "Subject:");
        const fullSubject = getValue(emailContent, "Subject:", "Work order status:");
        const parts = fullSubject.split("-");
        const subject = parts.slice(0, 3).join("-");
        const icpNumber = getValue(emailContent, "ICP number:", "END");

        //Details from SAP
        const jobClassification = getValue(text, "Network Ready Job Classification:", ["Permanent/Temporary:", "SITE DETAILS"]);
        const permanent = getValue(text, "Permanent/Temporary:", "SITE DETAILS");

        const siteAddress = getValue(siteDetailsSection, "Site Address:", ["Legal Description:", "Additional Details"]);
        const legalDescription = getValue(siteDetailsSection, "Legal Description:", "Additional Details:");
        const additionalDetails = getValue(siteDetailsSection, "Additional Details:", "Meter Number");

        const phasesRequired = getValue(connectionSection, "Phases Required:",["Load Demand:", "Required"]);
        const loadDemand = getValue(connectionSection, "Load Demand:","BTS Installation Details:");
        let assetType = getValue(connectionSection, "Asset Type:","Asset Number:");
        const assetNumber = getValue(connectionSection, "Asset Number:","Transformer Site ID:");
        const transformerSite = getValue(connectionSection, "Transformer Site ID:","High Level Job Scope:");
        const jobScope = getValue(connectionSection, "High Level Job Scope:","Land Description:");
        const landDescription = getValue(connectionSection, "Land Description:","Comments:");
        const comments = getValue(connectionSection, "Comments:");

        const electricianCompany = getValue(electricianSection, "Company:", "Name:");
        const electricianName = getValue(electricianSection, "Name:", "Phone:");
        const electricianPhone = formatPhone(getValue(electricianSection, "Phone:", "Email:"));
        const electricianEmail = getValue(electricianSection, "Email:", "Nominated Inspector/Meter Installer:");
        const inspector = getValue(electricianSection, "Nominated Inspector/Meter Installer:", "END");

        const isDecommission = jobClassification.toLowerCase().includes("decommission");

        const dueDate = new Date();
        dueDate.setMonth(dueDate.getMonth() + 1);
        const formattedDate = String(dueDate.getDate()).padStart(2, "0") + "/" + String(dueDate.getMonth() + 1).padStart(2, "0") + "/" + dueDate.getFullYear();

        //Formatted output
        const output =
        `
        <div>${workOrderNumber} ${subject}-${siteAddress}</div>
        <div>4100000589</div>
        <div>${formattedDate}</div>

        <div style="text-align:center;">
            <span style="font-weight:bold; text-decoration: underline; font-size:10pt;">
                ${workOrderNumber} - ${siteAddress || legalDescription} - New/BTS/Modify Connection
            </span>
        </div>
        <div><br></div>
        <div><strong>${jobClassification} ${icpNumber}</strong></div>
        
        ${!isDecommission ? `
        <div><strong>${({
            one: "Single phase",
            two: "Two phase",
            three: "Three phase"
        }[phasesRequired.toLowerCase()] || phasesRequired)} ${loadDemand}A</strong></div>
        <div><strong>Connect [size]mm ${({
            one: "1",
            two: "2",
            three: "3"
        }[phasesRequired.toLowerCase()] || phasesRequired)}C NS service cable to ${
            assetType === "Pillar"
                ? "Pillar Box # " + assetNumber
                : assetType + " # " + assetNumber
        }</strong></div>
        <div><strong>COC, ROI?, & lock off photo attached</strong></div>
        <div><strong>Permanent/Temporary: ${permanent}</strong></div>
        <div><strong>J A Russell PO# 45XXXX</strong></div>
        ` : ``}
        ${isDecommission ? `<strong>
        <div>${assetType} ${assetNumber}</div>
        <div>Transformer Site ID ${transformerSite}</div>
        <div>Site address: ${siteAddress}</div>
        <div>${addLine("Additional Details", additionalDetails)}</div>
        <div>High level job scope ${jobScope}</div>
        <br>
        <div>ELECTRICIAN DETAILS</strong></div>
        ` : `
        <div><br></div>
        <div><strong>SITE DETAILS</strong></div>
        <div>${addLine("Site Address", siteAddress)}</div>
        <div>${addLine("Legal Description", legalDescription)}</div>
        <div>${addLine("Additional Details", additionalDetails)}</div>
        <div><br></div>
        <div><strong>CONNECTION DETAILS - NEW CONNECTION</strong></div>
        <div>${addLine("Phases Required", phasesRequired)}</div>
        <div>${addLine("Load Demand", loadDemand)}</div>
        <div>${assetType === "Transformer" ? "" : addLine(
            assetType === "Pillar"
                ? "Pillar Box#"
                : assetType + "#",
            assetNumber)}</div>
        <div>${addLine("Transformer Site ID", transformerSite)}</div>
        <div>${addLine("High Level Job Scope", jobScope)}</div>
        <div>${addLine("Land Description", landDescription)}</div>
        <div>${addLine("Comments", comments)}</div>
        <div><br></div>
        <div><strong>ELECTRICIAN DETAILS</strong></div>
        `}
        <div>${addLine("Company", electricianCompany)}</div>
        <div>${addLine("Name", electricianName)}</div>
        <div>${addLine("Phone", electricianPhone)}</div>
        <div>${addLine("Email", electricianEmail)}</div>
        <div>${addLine("Nominated Inspector/Meter Installer", inspector)}</div>
        
        ${isDecommission ? `
            <div style="text-align:center;">
                <span style="font-weight:bold; font-size:10pt;">
                    Carry out decommission to PowerCo standard. Fill in isolation/disconnection tag attached and leave in meter box at site so that third parties can clearly see the status of the connection
                </span>
            </div>
            <div style="text-align:center;">
                <span style="font-weight:bold; font-size:10pt;">
                    This decommission was carried out by a third party. PowerCo have requested that we go to site and check it was carried out to PowerCo standard and to provide a completed As Built
                </span>
            </div>
        ` : `
            <div style="text-align:center;">
                <span style="font-weight:bold; font-size:10pt;">
                    Connect & Liven (Do not liven if unsafe)
                </span>
            </div>
            <div style="text-align:center;">
                <span style="font-weight:bold; font-size:10pt;">
                    Connect Only
                </span>
            </div>
            <div style="text-align:center;">
                <span style="font-weight:bold; font-size:10pt;">
                    Contact electrician ${electricianPhone} or Kate/Chisora if any issues
                </span>
            </div>
        `}
        <br>
        <strong>ORIGINAL SAP TEXT</strong><br>
        <div>${originalHTML}</div>
        `;

        setOutputHtml(output);
    }

    async function copyOutput() {
        const temp = document.createElement("div");
        temp.innerHTML = outputHtml;
        await navigator.clipboard.write([
            new ClipboardItem({
                "text/html": new Blob([outputHtml], {type: "text/html"}),
                "text/plain": new Blob([temp.innerText], {type: "text/plain"})
            })
        ]);
    }

    return (
        <>
            <h1>Network Ready Formatter</h1>

            <div className="inputBoxes">
                <div ref={sapInputRef} className="GW-input" contentEditable suppressContentEditableWarning/>

                <textarea placeholder= "WO Email Text" value={emailText}
                    onChange={(e) =>
                        setEmailText(
                            e.target.value
                        )
                    }
                />
            </div>

            <div className= "centered-buttons-div">
                <button onClick={convertSAPText}>Convert</button>
                <button onClick={copyOutput}>Copy Output</button>
            </div>

            <div className="output" dangerouslySetInnerHTML={{__html:outputHtml}}/>
        </>
    );
}

export default NRFormatter;