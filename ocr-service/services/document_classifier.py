"""
Document type classification
Determines if document is invoice, receipt, PO, bill, etc.
"""
import re
from typing import Optional

class DocumentClassifier:
    """Classify document type based on extracted text"""
    
    # Keywords for different document types
    INVOICE_KEYWORDS = [
        'invoice', 'inv#', 'invoice number', 'invoice no', 'bill to', 
        'invoice date', 'due date', 'amount due', 'total due'
    ]
    
    RECEIPT_KEYWORDS = [
        'receipt', 'thank you', 'payment received', 'transaction', 
        'card ending', 'change', 'cash', 'subtotal', 'tax'
    ]
    
    PO_KEYWORDS = [
        'purchase order', 'po number', 'po#', 'p.o.', 'order number',
        'delivery date', 'ship to', 'billing address'
    ]
    
    BILL_KEYWORDS = [
        'bill', 'statement', 'account number', 'previous balance',
        'current charges', 'amount owed'
    ]
    
    def classify(self, text: str) -> str:
        """
        Classify document type based on text content
        Returns: 'invoice', 'receipt', 'purchase_order', 'bill', or 'unknown'
        """
        text_lower = text.lower()
        
        # Count keyword matches for each type
        invoice_score = sum(1 for keyword in self.INVOICE_KEYWORDS if keyword in text_lower)
        receipt_score = sum(1 for keyword in self.RECEIPT_KEYWORDS if keyword in text_lower)
        po_score = sum(1 for keyword in self.PO_KEYWORDS if keyword in text_lower)
        bill_score = sum(1 for keyword in self.BILL_KEYWORDS if keyword in text_lower)
        
        # Also check for document number patterns
        if re.search(r'inv[#\s]*[\d-]+', text_lower):
            invoice_score += 2
        if re.search(r'po[#\s]*[\d-]+', text_lower) or re.search(r'p\.o\.\s*[\d-]+', text_lower):
            po_score += 2
        if re.search(r'receipt[#\s]*[\d-]+', text_lower):
            receipt_score += 2
        if re.search(r'bill[#\s]*[\d-]+', text_lower):
            bill_score += 2
        
        # Return type with highest score
        scores = {
            'invoice': invoice_score,
            'receipt': receipt_score,
            'purchase_order': po_score,
            'bill': bill_score
        }
        
        max_score = max(scores.values())
        if max_score > 0:
            return max(scores, key=scores.get)
        
        return 'unknown'
