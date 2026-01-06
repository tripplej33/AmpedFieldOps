"""
Configuration for OCR service
"""
import os
from typing import Optional

class Config:
    """Application configuration"""
    
    # Server settings
    HOST: str = os.getenv('OCR_HOST', '0.0.0.0')
    PORT: int = int(os.getenv('OCR_PORT', '8000'))
    
    # Tesseract settings
    TESSERACT_CMD: Optional[str] = os.getenv('TESSERACT_CMD', '/usr/bin/tesseract')
    TESSERACT_LANG: str = os.getenv('TESSERACT_LANG', 'eng')
    
    # Image processing settings
    MAX_IMAGE_SIZE: int = int(os.getenv('MAX_IMAGE_SIZE', '10485760'))  # 10MB
    SUPPORTED_FORMATS: list = ['image/jpeg', 'image/png', 'image/webp', 'image/tiff']
    
    # Processing settings
    PROCESSING_TIMEOUT: int = int(os.getenv('PROCESSING_TIMEOUT', '300'))  # 5 minutes
    
    # Logging
    LOG_LEVEL: str = os.getenv('LOG_LEVEL', 'INFO')

config = Config()
