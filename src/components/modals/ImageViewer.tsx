import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { X, ChevronLeft, ChevronRight, Download, Trash2, AlertCircle, Loader2 } from 'lucide-react';
import { useState, useEffect, useMemo } from 'react';
import { cn } from '@/lib/utils';
import { api } from '@/lib/api';

interface ImageViewerProps {
  images: string[];
  currentIndex: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDelete?: (index: number) => void;
  showDelete?: boolean;
}

export default function ImageViewer({
  images,
  currentIndex: initialIndex,
  open,
  onOpenChange,
  onDelete,
  showDelete = false,
}: ImageViewerProps) {
  // Normalize images to always be an array - memoize to prevent unnecessary re-renders
  const normalizedImages = useMemo(() => images || [], [images]);
  const imageCount = normalizedImages.length;
  
  // All hooks must be called before any conditional returns
  const [currentIndex, setCurrentIndex] = useState(() => {
    const count = (images || []).length;
    return Math.max(0, Math.min(initialIndex, Math.max(0, count - 1)));
  });
  const [imageError, setImageError] = useState<string | null>(null);
  const [imageLoading, setImageLoading] = useState(true);
  const [imageObjectUrl, setImageObjectUrl] = useState<string | null>(null);
  const [retryKey, setRetryKey] = useState(0);

  // Update currentIndex when initialIndex or images change
  useEffect(() => {
    if (imageCount > 0) {
      const validIndex = Math.max(0, Math.min(initialIndex, imageCount - 1));
      setCurrentIndex(prev => {
        // Only update if it's actually different to avoid unnecessary re-renders
        return prev !== validIndex ? validIndex : prev;
      });
    }
  }, [initialIndex, imageCount]);

  // Reset states when dialog closes
  useEffect(() => {
    if (!open) {
      setImageError(null);
      setImageLoading(false);
    }
  }, [open]);

  // Cleanup object URL on unmount or when changing
  useEffect(() => {
    return () => {
      if (imageObjectUrl) {
        URL.revokeObjectURL(imageObjectUrl);
      }
    };
  }, [imageObjectUrl]);

  // Keyboard navigation - must be called before any early returns
  useEffect(() => {
    if (!open || imageCount === 0) return;
    
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft' && currentIndex > 0) {
        setCurrentIndex(currentIndex - 1);
      } else if (e.key === 'ArrowRight' && currentIndex < imageCount - 1) {
        setCurrentIndex(currentIndex + 1);
      } else if (e.key === 'Escape') {
        onOpenChange(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [open, currentIndex, imageCount, onOpenChange]);

  // Ensure image URL is properly formatted
  const getImageUrl = (url: string | undefined | null): string => {
    if (!url) return '';
    // If it's already a full URL (http/https), use it as-is (S3 signed URL or external)
    if (url.startsWith('http://') || url.startsWith('https://')) {
      return url;
    }
    // If it's a relative path starting with /uploads, ensure it's properly formatted
    if (url.startsWith('/uploads')) {
      return url;
    }
    // If it doesn't start with /, add /uploads prefix
    if (!url.startsWith('/')) {
      return `/uploads/${url}`;
    }
    return url;
  };

  // Get current image - safely handle empty arrays - memoize to stabilize reference
  const currentImage = useMemo(() => {
    if (imageCount === 0 || currentIndex < 0 || currentIndex >= imageCount) {
      return null;
    }
    return normalizedImages[currentIndex] || null;
  }, [normalizedImages, currentIndex, imageCount]);

  // Load image when currentImage or currentIndex changes, or on retry
  useEffect(() => {
    if (!currentImage || !open || imageCount === 0) {
      setImageLoading(false);
      return;
    }

    setImageLoading(true);
    setImageError(null);

    // Cleanup previous object URL
    setImageObjectUrl((prevUrl) => {
      if (prevUrl) {
        URL.revokeObjectURL(prevUrl);
      }
      return null;
    });

    const loadImage = async () => {
      try {
        // If it's already a full URL (S3 signed URL), use it directly
        if (currentImage.startsWith('http://') || currentImage.startsWith('https://')) {
          setImageObjectUrl(null); // Use direct URL, no blob needed
          setImageLoading(false);
          return;
        }

        // For relative paths, fetch with authentication
        const formattedUrl = getImageUrl(currentImage);
        const token = api.getToken();
        
        const response = await fetch(formattedUrl, {
          headers: token ? {
            'Authorization': `Bearer ${token}`,
          } : {},
        });

        if (!response.ok) {
          if (response.status === 401) {
            throw new Error('Unauthorized - please log in again');
          } else if (response.status === 404) {
            throw new Error('Image not found');
          } else {
            throw new Error(`Failed to load image: ${response.status} ${response.statusText}`);
          }
        }

        const blob = await response.blob();
        const objectUrl = URL.createObjectURL(blob);
        setImageObjectUrl(objectUrl);
        setImageLoading(false);
      } catch (error: any) {
        console.error('Failed to load image:', error, { url: currentImage });
        setImageError(error.message || 'Failed to load image');
        setImageLoading(false);
      }
    };

    loadImage();
  }, [currentImage, open, retryKey]);

  // Early return AFTER all hooks - but use normalizedImages to avoid hook count issues
  if (!open || imageCount === 0 || !currentImage) {
    return null;
  }

  const hasPrevious = currentIndex > 0;
  const hasNext = currentIndex < imageCount - 1;

  const imageUrl = imageObjectUrl 
    ? imageObjectUrl 
    : (currentImage.startsWith('http://') || currentImage.startsWith('https://')
      ? currentImage
      : getImageUrl(currentImage));

  const handleImageLoad = () => {
    setImageLoading(false);
    setImageError(null);
  };

  const handleImageError = (e: React.SyntheticEvent<HTMLImageElement, Event>) => {
    setImageLoading(false);
    const img = e.currentTarget;
    setImageError(`Failed to display image. URL: ${currentImage || 'undefined'}`);
    console.error('Image display error:', {
      src: img.src,
      naturalWidth: img.naturalWidth,
      naturalHeight: img.naturalHeight,
      currentImage,
      imageUrl,
      objectUrl: imageObjectUrl
    });
  };

  const handlePrevious = () => {
    if (hasPrevious) {
      setCurrentIndex(currentIndex - 1);
    }
  };

  const handleNext = () => {
    if (hasNext) {
      setCurrentIndex(currentIndex + 1);
    }
  };

  const handleDelete = () => {
    if (onDelete) {
      onDelete(currentIndex);
      if (imageCount === 1) {
        onOpenChange(false);
      } else if (currentIndex === imageCount - 1) {
        setCurrentIndex(currentIndex - 1);
      }
    }
  };

  const handleDownload = () => {
    if (!currentImage) return;
    const link = document.createElement('a');
    link.href = imageUrl || currentImage;
    link.download = `image-${currentIndex + 1}.jpg`;
    link.target = '_blank';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-7xl w-full h-[90vh] p-0 bg-black/95 border-none">
        <div className="relative w-full h-full flex items-center justify-center">
          {/* Close Button */}
          <Button
            variant="ghost"
            size="icon"
            className="absolute top-4 right-4 z-50 text-white hover:bg-white/20"
            onClick={() => onOpenChange(false)}
          >
            <X className="w-6 h-6" />
          </Button>

          {/* Image Counter */}
          <div className="absolute top-4 left-4 z-50 bg-black/50 text-white px-3 py-1 rounded-md text-sm">
            {currentIndex + 1} / {imageCount}
          </div>

          {/* Action Buttons */}
          <div className="absolute top-4 right-20 z-50 flex gap-2">
            {showDelete && onDelete && (
              <Button
                variant="ghost"
                size="icon"
                className="text-white hover:bg-red-500/20 hover:text-red-400"
                onClick={handleDelete}
              >
                <Trash2 className="w-5 h-5" />
              </Button>
            )}
            <Button
              variant="ghost"
              size="icon"
              className="text-white hover:bg-white/20"
              onClick={handleDownload}
            >
              <Download className="w-5 h-5" />
            </Button>
          </div>

          {/* Previous Button */}
          {hasPrevious && (
            <Button
              variant="ghost"
              size="icon"
              className="absolute left-4 z-50 text-white hover:bg-white/20 h-12 w-12"
              onClick={handlePrevious}
            >
              <ChevronLeft className="w-8 h-8" />
            </Button>
          )}

          {/* Image */}
          <div className="w-full h-full flex items-center justify-center p-4">
            {imageLoading && (
              <div className="flex flex-col items-center justify-center gap-4">
                <Loader2 className="w-12 h-12 text-white/60 animate-spin" />
                <p className="text-white/60 text-sm">Loading image...</p>
              </div>
            )}
            {imageError && (
              <div className="flex flex-col items-center justify-center gap-4 max-w-md text-center p-6">
                <AlertCircle className="w-12 h-12 text-red-400" />
                <p className="text-white/90 font-medium">Failed to load image</p>
                <p className="text-white/60 text-sm">{imageError}</p>
                <p className="text-white/40 text-xs break-all">{currentImage}</p>
                <Button
                  variant="outline"
                  onClick={() => {
                    // Trigger reload by incrementing retry key
                    setRetryKey(prev => prev + 1);
                  }}
                  className="mt-2"
                >
                  Retry
                </Button>
              </div>
            )}
            {!imageError && imageUrl && currentImage && (
              <img
                data-image-viewer
                src={imageUrl}
                alt={`Image ${currentIndex + 1}`}
                className={cn(
                  "max-w-full max-h-full object-contain",
                  imageLoading ? "opacity-0" : "opacity-100 transition-opacity"
                )}
                onClick={handleNext}
                onLoad={handleImageLoad}
                onError={handleImageError}
                style={{ cursor: hasNext ? 'pointer' : 'default' }}
              />
            )}
          </div>

          {/* Next Button */}
          {hasNext && (
            <Button
              variant="ghost"
              size="icon"
              className="absolute right-4 z-50 text-white hover:bg-white/20 h-12 w-12"
              onClick={handleNext}
            >
              <ChevronRight className="w-8 h-8" />
            </Button>
          )}

          {/* Thumbnail Strip */}
          {imageCount > 1 && (
            <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 z-50">
              <div className="flex gap-2 bg-black/50 px-4 py-2 rounded-lg overflow-x-auto max-w-[90vw]">
                {normalizedImages.map((img, idx) => (
                  <button
                    key={idx}
                    onClick={() => setCurrentIndex(idx)}
                    className={cn(
                      "w-16 h-16 rounded border-2 overflow-hidden flex-shrink-0 transition-all",
                      idx === currentIndex
                        ? "border-white scale-110"
                        : "border-white/30 opacity-60 hover:opacity-100"
                    )}
                  >
                    <img
                      src={getImageUrl(img)}
                      alt={`Thumbnail ${idx + 1}`}
                      className="w-full h-full object-cover"
                      onError={(e) => {
                        // Fallback for thumbnail errors - show placeholder
                        e.currentTarget.src = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjQiIGhlaWdodD0iNjQiIHZpZXdCb3g9IjAgMCA2NCA2NCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPHJlY3Qgd2lkdGg9IjY0IiBoZWlnaHQ9IjY0IiBmaWxsPSIjMzMzMzMzIi8+CjxwYXRoIGQ9Ik0zMiAyMEMzMC4zNCAyMCAyOSAyMS4zNCAyOSAyM1YzM0MyOSAzNC42NiAzMC4zNCAzNiAzMiAzNkgzNkMzNy42NiAzNiAzOSAzNC42NiAzOSAzM1YyM0MzOSAyMS4zNCAzNy42NiAyMCAzNiAyMEgzMloiIGZpbGw9IiM2NjY2NjYiLz4KPC9zdmc+';
                      }}
                    />
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

