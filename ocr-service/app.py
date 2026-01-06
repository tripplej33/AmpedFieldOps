"""
FastAPI application for OCR service
"""
from fastapi import FastAPI, File, UploadFile, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from PIL import Image
import io
import logging

from config import config
from models.schemas import ProcessResponse, HealthResponse, ExtractedData
from services.image_processor import preprocess_image
from services.ocr_engine import OCREngine
from services.document_classifier import DocumentClassifier
from services.document_parser import DocumentParser
from utils.image_utils import correct_orientation, resize_image

# Configure logging
logging.basicConfig(
    level=getattr(logging, config.LOG_LEVEL),
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

app = FastAPI(title="OCR Service", version="1.0.0")

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, restrict to specific origins
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize services
ocr_engine = OCREngine(
    tesseract_cmd=config.TESSERACT_CMD,
    lang=config.TESSERACT_LANG
)
classifier = DocumentClassifier()
parser = DocumentParser()

@app.get("/health", response_model=HealthResponse)
async def health_check():
    """Health check endpoint"""
    try:
        # Test Tesseract availability
        test_image = Image.new('RGB', (100, 100), color='white')
        ocr_engine.extract_text(test_image)
        tesseract_available = True
    except Exception as e:
        logger.warning(f"Tesseract test failed: {e}")
        tesseract_available = False
    
    return HealthResponse(
        status="healthy",
        version="1.0.0",
        tesseract_available=tesseract_available
    )

@app.post("/process", response_model=ProcessResponse)
async def process_document(file: UploadFile = File(...)):
    """
    Process uploaded document image and extract data
    """
    try:
        # Validate file type
        if file.content_type not in config.SUPPORTED_FORMATS:
            raise HTTPException(
                status_code=400,
                detail=f"Unsupported file type: {file.content_type}. Supported: {config.SUPPORTED_FORMATS}"
            )
        
        # Read file
        file_bytes = await file.read()
        
        # Validate file size
        if len(file_bytes) > config.MAX_IMAGE_SIZE:
            raise HTTPException(
                status_code=400,
                detail=f"File too large. Maximum size: {config.MAX_IMAGE_SIZE} bytes"
            )
        
        # Correct orientation
        image = correct_orientation(file_bytes)
        
        # Resize if too large
        image = resize_image(image, max_dimension=2000)
        
        # Preprocess image for better OCR
        processed_image = preprocess_image(image)
        
        # Extract text with confidence
        ocr_result = ocr_engine.extract_with_confidence(processed_image)
        
        if not ocr_result['text'] or ocr_result['confidence'] < 0.1:
            return ProcessResponse(
                success=False,
                confidence=ocr_result['confidence'],
                document_type='unknown',
                extracted_data=ExtractedData(),
                raw_text=ocr_result['text'],
                error="No text detected in image or confidence too low"
            )
        
        # Classify document type
        document_type = classifier.classify(ocr_result['text'])
        
        # Parse extracted data
        extracted_data_dict = parser.parse(ocr_result['text'], document_type)
        extracted_data = ExtractedData(**extracted_data_dict)
        
        return ProcessResponse(
            success=True,
            confidence=ocr_result['confidence'],
            document_type=document_type,
            extracted_data=extracted_data,
            raw_text=ocr_result['text']
        )
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error processing document: {e}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail=f"Error processing document: {str(e)}"
        )

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host=config.HOST, port=config.PORT)
