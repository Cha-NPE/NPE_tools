import { useState } from "react";
import { FaBars } from "react-icons/fa";

import DGFormatter from "./src/components/DGFormatter";
import PdfSplitter from "./src/components/PdfSplitter";
import GWFormatter from "./src/components/GWFormatter";
import NRFormatter from "./src/components/NRFormatter";

import "./App.css";

function App() {
    const [selectedTool, setSelectedTool] = useState("dg");
    const [sidebarOpen, setSidebarOpen] = useState(true);

    function renderTool() {
        switch (selectedTool) {
            case "gw":
                return <GWFormatter />;
            case "nr":
                return <NRFormatter />;
            case "pdf":
                return <PdfSplitter />;
            case "dg":
            default:
                return <DGFormatter />;
        }
    }

    return (
        <div className="layout">
            <aside className={`sidebar ${sidebarOpen ? "open" : "closed"}`}>

                <button
                    className="toggle-btn"
                    onClick={() => setSidebarOpen(!sidebarOpen)}
                >
                    <FaBars />
                </button>
                {sidebarOpen && (
                    <>
                    <button onClick={() => setSelectedTool("dg")}>
                        {sidebarOpen ? "DG Formatter" : "DG"}
                    </button>

                    <button onClick={() => setSelectedTool("gw")}>
                        {sidebarOpen ? "GW Formatter" : "GW"}
                    </button>

                    <button onClick={() => setSelectedTool("nr")}>
                        {sidebarOpen ? "NR Formatter" : "NR"}
                    </button>
                    
                    <button onClick={() => setSelectedTool("pdf")}>
                        {sidebarOpen ? "PDF Tools" : "PDF"}
                    </button>  
                    </>
                )}
            </aside>

            <main className="content">
                {renderTool()}
            </main>
        </div>
    );
}

export default App;