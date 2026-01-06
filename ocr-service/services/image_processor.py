"""
Image preprocessing for OCR
Improves OCR accuracy by enhancing image quality
"""
import cv2
import numpy as np
from PIL import Image

def preprocess_image(image: Image.Image) -> Image.Image:
    """
    Preprocess image for better OCR results
    Steps:
    1. Convert to grayscale
    2. Denoise
    3. Enhance contrast
    4. Deskew (if needed)
    5. Binarize (threshold)
    """
    # Convert PIL to OpenCV format
    img_array = np.array(image)
    
    # Convert to grayscale if color
    if len(img_array.shape) == 3:
        gray = cv2.cvtColor(img_array, cv2.COLOR_RGB2GRAY)
    else:
        gray = img_array
    
    # Denoise
    denoised = cv2.fastNlMeansDenoising(gray, None, 10, 7, 21)
    
    # Enhance contrast using CLAHE (Contrast Limited Adaptive Histogram Equalization)
    clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
    enhanced = clahe.apply(denoised)
    
    # Apply adaptive thresholding for better text recognition
    # Use adaptive threshold instead of simple threshold for varying lighting
    binary = cv2.adaptiveThreshold(
        enhanced, 
        255, 
        cv2.ADAPTIVE_THRESH_GAUSSIAN_C, 
        cv2.THRESH_BINARY, 
        11, 
        2
    )
    
    # Convert back to PIL Image
    processed_image = Image.fromarray(binary)
    
    return processed_image

def deskew_image(image: np.ndarray) -> np.ndarray:
    """
    Deskew (straighten) an image
    Useful for scanned documents that are slightly rotated
    """
    # Convert to grayscale if needed
    if len(image.shape) == 3:
        gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    else:
        gray = image.copy()
    
    # Create binary image
    _, binary = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)
    
    # Find all non-zero points
    coords = np.column_stack(np.where(binary > 0))
    
    if len(coords) == 0:
        return image
    
    # Find minimum area rectangle
    angle = cv2.minAreaRect(coords)[-1]
    
    # Correct angle
    if angle < -45:
        angle = -(90 + angle)
    else:
        angle = -angle
    
    # Only rotate if angle is significant (> 0.5 degrees)
    if abs(angle) > 0.5:
        (h, w) = image.shape[:2]
        center = (w // 2, h // 2)
        M = cv2.getRotationMatrix2D(center, angle, 1.0)
        rotated = cv2.warpAffine(
            image, M, (w, h),
            flags=cv2.INTER_CUBIC,
            borderMode=cv2.BORDER_REPLICATE
        )
        return rotated
    
    return image
