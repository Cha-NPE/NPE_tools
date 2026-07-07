from fastapi import FastAPI, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
import os
import tempfile

from python.test_OCR import extract_filename

app = FastAPI()

HOST = os.getenv("OCR_HOST", "0.0.0.0")
PORT = int(os.getenv("OCR_PORT", "8000"))

app.add_middleware(
    CORSMiddleware,
    # Allow the frontend origin(s). For quick testing from GitHub Pages or other hosts,
    # use "*" or add specific origins like "https://cha252.github.io".
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.post("/ocr")
async def ocr(pdf: UploadFile = File(...)):

    with tempfile.NamedTemporaryFile(
        delete=False,
        suffix=".pdf"
    ) as tmp:

        tmp.write(await pdf.read())
        temp_path = tmp.name

    try:
        filename = extract_filename(temp_path)

        return {
            "filename": filename
        }

    finally:
        os.remove(temp_path)