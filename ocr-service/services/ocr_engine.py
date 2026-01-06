"""
Tesseract OCR wrapper
"""
import pytesseract
from PIL import Image
from typing import Dict, Any
import re

class OCREngine:
    """Wrapper for Tesseract OCR"""
    
    def __init__(self, tesseract_cmd: str = '/usr/bin/tesseract', lang: str = 'eng'):
        """
        Initialize OCR engine
        """
        pytesseract.pytesseract.tesseract_cmd = tesseract_cmd
        self.lang = lang
    
    def extract_text(self, image: Image.Image, config: str = '') -> str:
        """
        Extract text from image using Tesseract
        """
        try:
            # Default config for better accuracy
            default_config = '--psm 6 -c tessedit_char_whitelist=0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz.,$/-:() '
            if config:
                default_config = config
            
            text = pytesseract.image_to_string(image, lang=self.lang, config=default_config)
            return text.strip()
        except Exception as e:
            raise Exception(f"OCR extraction failed: {str(e)}")
    
    def extract_with_confidence(self, image: Image.Image) -> Dict[str, Any]:
        """
        Extract text with confidence scores
        Returns both raw text and detailed data with confidence
        """
        try:
            # Get detailed data including confidence
            data = pytesseract.image_to_data(image, lang=self.lang, output_type=pytesseract.Output.DICT)
            
            # Extract text
            text = pytesseract.image_to_string(image, lang=self.lang)
            
            # Calculate average confidence (excluding -1 values which indicate non-text)
            confidences = [int(conf) for conf in data['conf'] if int(conf) > 0]
            avg_confidence = sum(confidences) / len(confidences) if confidences else 0
            
            return {
                'text': text.strip(),
                'confidence': avg_confidence / 100.0,  # Convert to 0-1 scale
                'detailed_data': data
            }
        except Exception as e:
            raise Exception(f"OCR extraction with confidence failed: {str(e)}")
    
    def extract_amounts(self, text: str) -> list:
        """
        Extract monetary amounts from text
        Returns list of found amounts
        """
        # Pattern for currency amounts: $123.45, $1,234.56, 123.45, etc.
        patterns = [
            r'\$[\d,]+\.?\d*',  # $123.45 or $1,234.56
            r'[\d,]+\.\d{2}',   # 123.45 or 1,234.56
            r'[\d]+\.\d{2}',    # 123.45
        ]
        
        amounts = []
        for pattern in patterns:
            matches = re.findall(pattern, text)
            for match in matches:
                # Clean and convert to float
                cleaned = match.replace('$', '').replace(',', '')
                try:
                    amount = float(cleaned)
                    if amount > 0:  # Only positive amounts
                        amounts.append(amount)
                except ValueError:
                    continue
        
        # Remove duplicates and sort
        return sorted(list(set(amounts)), reverse=True)
    
    def extract_dates(self, text: str) -> list:
        """
        Extract dates from text
        Returns list of found dates in various formats
        """
        # Common date patterns
        patterns = [
            r'\d{1,2}[/-]\d{1,2}[/-]\d{2,4}',  # MM/DD/YYYY or DD/MM/YYYY
            r'\d{4}[/-]\d{1,2}[/-]\d{1,2}',   # YYYY/MM/DD
            r'\d{1,2}\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{2,4}',  # DD Mon YYYY
        ]
        
        dates = []
        for pattern in patterns:
            matches = re.findall(pattern, text, re.IGNORECASE)
            dates.extend(matches)
        
        return dates
