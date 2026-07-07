import os
import uvicorn
from ocr_api import HOST, PORT

if __name__ == "__main__":
    uvicorn.run("ocr_api:app", host=HOST, port=PORT, reload=False)
