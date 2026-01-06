"""
Pydantic models for request/response validation
"""
from pydantic import BaseModel
from typing import Optional, List, Dict, Any

class ProcessRequest(BaseModel):
    """Request model for OCR processing"""
    # File will be sent as multipart/form-data, not in JSON body
    pass

class ExtractedData(BaseModel):
    """Extracted data from document"""
    document_number: Optional[str] = None
    date: Optional[str] = None
    amount: Optional[float] = None
    total_amount: Optional[float] = None
    tax_amount: Optional[float] = None
    vendor_name: Optional[str] = None
    vendor_address: Optional[str] = None
    line_items: List[Dict[str, Any]] = []

class ProcessResponse(BaseModel):
    """Response model for OCR processing"""
    success: bool
    confidence: float
    document_type: str  # invoice, receipt, purchase_order, bill, unknown
    extracted_data: ExtractedData
    raw_text: str
    error: Optional[str] = None

class HealthResponse(BaseModel):
    """Health check response"""
    status: str
    version: str
    tesseract_available: bool
