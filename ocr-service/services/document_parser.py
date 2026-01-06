"""
Parse OCR text into structured data
Extracts key information like amounts, dates, vendor names, document numbers
"""
import re
from typing import Dict, Any, Optional, List
from datetime import datetime
from dateutil import parser as date_parser

class DocumentParser:
    """Parse extracted OCR text into structured data"""
    
    def __init__(self):
        self.amount_patterns = [
            r'total[:\s]*\$?([\d,]+\.?\d*)',
            r'amount[:\s]*\$?([\d,]+\.?\d*)',
            r'subtotal[:\s]*\$?([\d,]+\.?\d*)',
            r'balance[:\s]*\$?([\d,]+\.?\d*)',
            r'\$([\d,]+\.\d{2})',  # $123.45
            r'([\d,]+\.\d{2})',    # 123.45
        ]
        
        self.date_patterns = [
            r'date[:\s]*(\d{1,2}[/-]\d{1,2}[/-]\d{2,4})',
            r'(\d{1,2}[/-]\d{1,2}[/-]\d{2,4})',
            r'(\d{4}[/-]\d{1,2}[/-]\d{1,2})',
        ]
        
        self.document_number_patterns = [
            r'invoice[#\s]*[:]?\s*([A-Z0-9\-]+)',
            r'inv[#\s]*[:]?\s*([A-Z0-9\-]+)',
            r'po[#\s]*[:]?\s*([A-Z0-9\-]+)',
            r'purchase\s+order[#\s]*[:]?\s*([A-Z0-9\-]+)',
            r'bill[#\s]*[:]?\s*([A-Z0-9\-]+)',
            r'receipt[#\s]*[:]?\s*([A-Z0-9\-]+)',
            r'number[:\s]*([A-Z0-9\-]+)',
        ]
    
    def parse(self, text: str, document_type: str = 'unknown') -> Dict[str, Any]:
        """
        Parse OCR text and extract structured data
        """
        text_upper = text.upper()
        text_lower = text.lower()
        
        extracted = {
            'document_number': self._extract_document_number(text_upper),
            'date': self._extract_date(text),
            'amount': self._extract_amount(text),
            'total_amount': self._extract_total_amount(text),
            'tax_amount': self._extract_tax_amount(text),
            'vendor_name': self._extract_vendor_name(text),
            'vendor_address': self._extract_address(text),
            'line_items': self._extract_line_items(text),
            'raw_text': text
        }
        
        return extracted
    
    def _extract_document_number(self, text: str) -> Optional[str]:
        """Extract document number (invoice #, PO #, etc.)"""
        for pattern in self.document_number_patterns:
            match = re.search(pattern, text, re.IGNORECASE)
            if match:
                return match.group(1).strip()
        return None
    
    def _extract_date(self, text: str) -> Optional[str]:
        """Extract date from document"""
        for pattern in self.date_patterns:
            matches = re.findall(pattern, text)
            if matches:
                # Try to parse the first valid date
                for match in matches:
                    try:
                        # Try different date formats
                        date_str = match.replace('/', '-')
                        parsed_date = date_parser.parse(date_str, fuzzy=True)
                        return parsed_date.strftime('%Y-%m-%d')
                    except:
                        continue
        return None
    
    def _extract_amount(self, text: str) -> Optional[float]:
        """Extract main amount"""
        amounts = self._extract_all_amounts(text)
        if amounts:
            # Return the largest amount (likely the total)
            return max(amounts)
        return None
    
    def _extract_total_amount(self, text: str) -> Optional[float]:
        """Extract total amount"""
        # Look for "total" keyword
        total_patterns = [
            r'total[:\s]*\$?([\d,]+\.?\d*)',
            r'grand\s+total[:\s]*\$?([\d,]+\.?\d*)',
            r'amount\s+due[:\s]*\$?([\d,]+\.?\d*)',
        ]
        
        for pattern in total_patterns:
            match = re.search(pattern, text, re.IGNORECASE)
            if match:
                try:
                    amount_str = match.group(1).replace(',', '')
                    return float(amount_str)
                except ValueError:
                    continue
        
        # Fallback to largest amount
        return self._extract_amount(text)
    
    def _extract_tax_amount(self, text: str) -> Optional[float]:
        """Extract tax amount"""
        tax_patterns = [
            r'tax[:\s]*\$?([\d,]+\.?\d*)',
            r'gst[:\s]*\$?([\d,]+\.?\d*)',
            r'vat[:\s]*\$?([\d,]+\.?\d*)',
        ]
        
        for pattern in tax_patterns:
            match = re.search(pattern, text, re.IGNORECASE)
            if match:
                try:
                    amount_str = match.group(1).replace(',', '')
                    return float(amount_str)
                except ValueError:
                    continue
        
        return None
    
    def _extract_all_amounts(self, text: str) -> List[float]:
        """Extract all monetary amounts from text"""
        amounts = []
        # Pattern for currency amounts
        pattern = r'\$?([\d,]+\.\d{2})'
        matches = re.findall(pattern, text)
        
        for match in matches:
            try:
                amount = float(match.replace(',', ''))
                if amount > 0:
                    amounts.append(amount)
            except ValueError:
                continue
        
        return sorted(list(set(amounts)), reverse=True)
    
    def _extract_vendor_name(self, text: str) -> Optional[str]:
        """Extract vendor/supplier name"""
        # Look for common vendor name indicators
        # Usually appears at the top of the document
        lines = text.split('\n')[:10]  # Check first 10 lines
        
        # Look for lines that might be vendor names
        # Usually all caps, or company indicators
        for line in lines:
            line = line.strip()
            if len(line) > 3 and len(line) < 100:
                # Check if it looks like a company name
                if not re.match(r'^[\d\s\$\.,:]+$', line):  # Not just numbers/symbols
                    # Check for company indicators
                    if any(indicator in line.lower() for indicator in ['inc', 'ltd', 'llc', 'corp', 'company']):
                        return line
                    # Or if it's in all caps and reasonable length
                    if line.isupper() and 5 <= len(line) <= 50:
                        return line
        
        return None
    
    def _extract_address(self, text: str) -> Optional[str]:
        """Extract address information"""
        # Look for address patterns
        address_patterns = [
            r'(\d+\s+[A-Za-z\s]+(?:Street|St|Avenue|Ave|Road|Rd|Drive|Dr|Lane|Ln|Boulevard|Blvd)[\s,]+[A-Za-z\s,]+(?:\d{5})?)',
        ]
        
        for pattern in address_patterns:
            match = re.search(pattern, text, re.IGNORECASE)
            if match:
                return match.group(1).strip()
        
        return None
    
    def _extract_line_items(self, text: str) -> List[Dict[str, Any]]:
        """Extract line items from document"""
        # This is a simplified extraction
        # More sophisticated parsing would use table detection
        line_items = []
        
        # Look for patterns like: description quantity price amount
        # This is complex and would benefit from ML-based table extraction
        # For now, return empty list - can be enhanced later
        
        return line_items
