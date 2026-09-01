function ScopingPackCreator() {
    return (
        <>
            <meta charSet="UTF-8" />
            <title>Scoping Pack Creator</title>
            <style
                dangerouslySetInnerHTML={{
                __html:
                    '\n        body { font-family: sans-serif; padding: 20px; max-width: border-box; width: 100%; }\n        .control { margin-bottom: 15px; }\n        label { display: block; margin-bottom: 4px; font-size: 14px; color: #333; }\n        input[type="number"], input[type="text"] { padding: 4px; }\n        input[type="number"] { width: 90px; }\n        input[type="text"] { width: 100%; box-sizing: border-box; }\n        textarea { width: 100%; padding: 6px; font-family: inherit; font-size: 14px; box-sizing: border-box; }\n        .row { display: flex; gap: 16px; flex-wrap: wrap; }\n        .row > div { flex: 0 0 auto; }\n        button { padding: 8px 16px; cursor: pointer; }\n        button:disabled { cursor: not-allowed; opacity: 0.5; }\n        #status { margin-top: 10px; font-size: 14px; color: #555; }\n        canvas { border: 1px solid #ccc; max-width: 100%; }\n        fieldset { margin-top: 14px; }\n        legend { font-weight: bold; }\n        .hint { font-size: 12px; color: #777; margin-top: -6px; margin-bottom: 10px; }\n        .file-status { font-size: 12px; color: #777; margin-top: 4px; }\n\n        .layout { display: flex; gap: 30px; align-items: flex-start; }\n        .left-panel { flex: 1 1 420px; min-width: 320px; }\n        .middle-panel { flex: 1 1 410px; min-width: 320px; }\n        .right-panel {\n            flex: 1 1 400px;\n            min-width: 300px;\n            position: sticky;\n            top: 20px;\n        }\n        .right-panel h3 { margin-top: 0; }\n        .preview-wrap {\n            border: 1px solid #ddd;\n            padding: 10px;\n            background: #fafafa;\n            overflow: auto;\n            max-height: 90vh;\n        }\n        .preview-controls { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; }\n\n        @media (max-width: 850px) {\n            .layout { flex-direction: column; }\n            .right-panel { position: static; width: 100%; }\n        }\n    '
                }}
            />
            <div>
                <h2>Scoping Pack Creator</h2>
            </div>
            <div className="layout">
                <div className="left-panel">
                <fieldset>
                    <legend>Front page</legend>
                    <div className="control">
                    <input type="file" id="upload" accept="application/pdf" />
                    <div className="file-status" id="uploadStatus">
                        No file loaded.
                    </div>
                    </div>
                    <div className="row">
                    <div>
                        <label htmlFor="pageNum">Page number</label>
                        <input type="number" id="pageNum" defaultValue={1} min={1} />
                    </div>
                    <div>
                        <label htmlFor="x">X (from left, pt)</label>
                        <input type="number" id="x" defaultValue={25} />
                    </div>
                    <div>
                        <label htmlFor="y">Y (from TOP, pt)</label>
                        <input type="number" id="y" defaultValue={490} />
                    </div>
                    <div>
                        <label htmlFor="w">Width (pt)</label>
                        <input type="number" id="w" defaultValue={540} />
                    </div>
                    <div>
                        <label htmlFor="h">Height (pt)</label>
                        <input type="number" id="h" defaultValue={90} />
                    </div>
                    </div>
                    <div className="control">
                    <label htmlFor="customScope">
                        Custom scope text (fills the [custom text] section):
                    </label>
                    <textarea
                        id="customScope"
                        rows={4}
                        defaultValue={
                        "Replace this with the scope details specific to this document."
                        }
                    />
                    </div>
                    <div className="row">
                    <div>
                        <label htmlFor="fontSize">Font size (pt)</label>
                        <input
                        type="number"
                        id="fontSize"
                        defaultValue={9}
                        min={6}
                        max={24}
                        />
                    </div>
                    <div>
                        <label htmlFor="padding">Box padding (pt)</label>
                        <input
                        type="number"
                        id="padding"
                        defaultValue={10}
                        min={0}
                        max={40}
                        />
                    </div>
                    </div>
                </fieldset>
                <div id="status" />
                </div>
                <div className="middle-panel">
                <fieldset>
                    <legend>Repeated page — one per Pole ID</legend>
                    <div className="hint">
                    Upload the page with the Project Address / Pole ID / Designer table.
                    It gets appended once per Pole ID listed below, with the fields
                    stamped in.
                    </div>
                    <div className="control">
                    <input type="file" id="repeatUpload" accept="application/pdf" />
                    <div className="file-status" id="repeatUploadStatus">
                        No file loaded.
                    </div>
                    </div>
                    <div className="row">
                    <div>
                        <label htmlFor="repeatPageNum">Page number in this file</label>
                        <input type="number" id="repeatPageNum" defaultValue={1} min={1} />
                    </div>
                    <div>
                        <label htmlFor="repeatFontSize">Font size (pt)</label>
                        <input
                        type="number"
                        id="repeatFontSize"
                        defaultValue={10}
                        min={6}
                        max={24}
                        />
                    </div>
                    </div>
                    <div className="control">
                    <label htmlFor="repeatAddress">
                        Project Address (same on every repeated page)
                    </label>
                    <input type="text" id="repeatAddress" defaultValue="" />
                    </div>
                    <div className="control">
                    <label htmlFor="repeatDesigner">
                        Designer (same on every repeated page)
                    </label>
                    <input type="text" id="repeatDesigner" defaultValue="" />
                    </div>
                    <div className="control">
                    <label htmlFor="poleIds">
                        Pole IDs (one per line — one repeated page is created per line)
                    </label>
                    <textarea
                        id="poleIds"
                        rows={5}
                        placeholder="P-101
            P-102
            P-103"
                        defaultValue={""}
                    />
                    </div>
                    <div className="hint">
                    Field positions on the repeated page (from top-left of the page, in
                    points).
                    </div>
                    <div className="row">
                    <div>
                        <label htmlFor="addrX">Address X</label>
                        <input type="number" id="addrX" defaultValue={130} />
                    </div>
                    <div>
                        <label htmlFor="addrY">Address Y (top)</label>
                        <input type="number" id="addrY" defaultValue={110} />
                    </div>
                    <div>
                        <label htmlFor="addrW">Address W</label>
                        <input type="number" id="addrW" defaultValue={200} />
                    </div>
                    <div>
                        <label htmlFor="addrH">Address H</label>
                        <input type="number" id="addrH" defaultValue={11} />
                    </div>
                    </div>
                    <div className="row">
                    <div>
                        <label htmlFor="poleX">Pole ID X</label>
                        <input type="number" id="poleX" defaultValue={130} />
                    </div>
                    <div>
                        <label htmlFor="poleY">Pole ID Y (top)</label>
                        <input type="number" id="poleY" defaultValue={125} />
                    </div>
                    <div>
                        <label htmlFor="poleW">Pole ID W</label>
                        <input type="number" id="poleW" defaultValue={200} />
                    </div>
                    <div>
                        <label htmlFor="poleH">Pole ID H</label>
                        <input type="number" id="poleH" defaultValue={11} />
                    </div>
                    </div>
                    <div className="row">
                    <div>
                        <label htmlFor="desX">Designer X</label>
                        <input type="number" id="desX" defaultValue={130} />
                    </div>
                    <div>
                        <label htmlFor="desY">Designer Y (top)</label>
                        <input type="number" id="desY" defaultValue={155} />
                    </div>
                    <div>
                        <label htmlFor="desW">Designer W</label>
                        <input type="number" id="desW" defaultValue={200} />
                    </div>
                    <div>
                        <label htmlFor="desH">Designer H</label>
                        <input type="number" id="desH" defaultValue={11} />
                    </div>
                    </div>
                </fieldset>
                </div>
                <div className="middle-panel">
                <fieldset>
                    <legend>Closing page</legend>
                    <div className="hint">
                    Uploaded as-is and appended once, right at the very end of the pack.
                    </div>
                    <div className="control">
                    <input type="file" id="closingUpload" accept="application/pdf" />
                    <div className="file-status" id="closingUploadStatus">
                        No file loaded.
                    </div>
                    </div>
                    <div className="row">
                    <div>
                        <label htmlFor="closingPageNum">Page number in this file</label>
                        <input type="number" id="closingPageNum" defaultValue={1} min={1} />
                    </div>
                    </div>
                </fieldset>
                </div>
                <div className="right-panel">
                <h3>Preview</h3>
                <div className="preview-controls">
                    <label htmlFor="previewPage" style={{ margin: 0 }}>
                    Preview page
                    </label>
                    <input
                    type="number"
                    id="previewPage"
                    defaultValue={1}
                    min={1}
                    style={{ width: 70 }}
                    />
                    <span id="pageCount" style={{ fontSize: 13, color: "#777" }} />
                </div>
                <div className="preview-wrap">
                    <canvas id="preview" />
                </div>
                <div className="control">
                    <button id="downloadBtn" disabled="">
                    Download Modified PDF
                    </button>
                </div>
                </div>
            </div>
            </>
    );
}

export default ScopingPackCreator;