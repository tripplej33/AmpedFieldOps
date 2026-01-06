"""
Image utility functions for preprocessing
"""
import cv2
import numpy as np
from PIL import Image, ExifTags
import io

def correct_orientation(image_bytes: bytes) -> Image.Image:
    """
    Correct image orientation based on EXIF data
    """
    try:
        image = Image.open(io.BytesIO(image_bytes))
        
        # Check for EXIF orientation
        if hasattr(image, '_getexif') and image._getexif() is not None:
            exif = image._getexif()
            orientation = None
            
            for tag, value in ExifTags.TAGS.items():
                if value == 'Orientation':
                    orientation = exif.get(tag)
                    break
            
            if orientation:
                # Rotate image based on orientation
                if orientation == 3:
                    image = image.rotate(180, expand=True)
                elif orientation == 6:
                    image = image.rotate(270, expand=True)
                elif orientation == 8:
                    image = image.rotate(90, expand=True)
        
        return image
    except Exception:
        # If EXIF reading fails, return original
        return Image.open(io.BytesIO(image_bytes))

def resize_image(image: Image.Image, max_dimension: int = 2000) -> Image.Image:
    """
    Resize image if it's too large, maintaining aspect ratio
    """
    width, height = image.size
    
    if width <= max_dimension and height <= max_dimension:
        return image
    
    if width > height:
        new_width = max_dimension
        new_height = int(height * (max_dimension / width))
    else:
        new_height = max_dimension
        new_width = int(width * (max_dimension / height))
    
    return image.resize((new_width, new_height), Image.Resampling.LANCZOS)

def convert_to_opencv(image: Image.Image) -> np.ndarray:
    """
    Convert PIL Image to OpenCV format
    """
    return cv2.cvtColor(np.array(image), cv2.COLOR_RGB2BGR)
