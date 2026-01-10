import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { X, ChevronLeft, ChevronRight, Download, Trash2, AlertCircle, Loader2, Edit2, Check, X as XIcon } from 'lucide-react';
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
  displayNames?: (string | null | undefined)[]; // Optional display names for images (doesn't change filename)
}

export default function ImageViewer({
  images,
  currentIndex: initialIndex,
  open,
  onOpenChange,
  onDelete,
  showDelete = false,
  displayNames,
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
  const [thumbnailUrls, setThumbnailUrls] = useState<Map<number, string>>(new Map());
  const [editingNameIndex, setEditingNameIndex] = useState<number | null>(null);
  const [editNameValue, setEditNameValue] = useState<string>('');
  const [tempDisplayNames, setTempDisplayNames] = useState<(string | null | undefined)[]>(() => displayNames || []);
  
  // Update tempDisplayNames when displayNames prop changes
  useEffect(() => {
    if (displayNames) {
      setTempDisplayNames(displayNames);
    }
  }, [displayNames]);
  
  // Normalize display names to match image count
  const normalizedDisplayNames = useMemo(() => {
    const names = tempDisplayNames || [];
    const result = new Array(imageCount).fill(null);
    for (let i = 0; i < Math.min(names.length, imageCount); i++) {
      result[i] = names[i] || null;
    }
    return result;
  }, [tempDisplayNames, imageCount]);

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

  // Load thumbnails with authentication
  useEffect(() => {
    if (!open || imageCount === 0) return;

    const loadThumbnails = async () => {
      const newThumbnailUrls = new Map<number, string>();
      
      for (let i = 0; i < normalizedImages.length; i++) {
        const img = normalizedImages[i];
        if (!img) continue;

        try {
          // If it's already a full URL (S3 signed URL), use it directly
          if (img.startsWith('http://') || img.startsWith('https://')) {
            newThumbnailUrls.set(i, img);
            continue;
          }

          // For relative paths, fetch with authentication
          const formattedUrl = getImageUrl(img);
          const token = api.getToken();
          
          const response = await fetch(formattedUrl, {
            headers: token ? {
              'Authorization': `Bearer ${token}`,
            } : {},
          });

          if (response.ok) {
            const blob = await response.blob();
            const objectUrl = URL.createObjectURL(blob);
            newThumbnailUrls.set(i, objectUrl);
          } else {
            // Fallback to formatted URL
            newThumbnailUrls.set(i, formattedUrl);
          }
        } catch (error) {
          console.error(`Failed to load thumbnail ${i}:`, error);
          // Use formatted URL as fallback
          newThumbnailUrls.set(i, getImageUrl(img));
        }
      }

      setThumbnailUrls(prev => {
        // Cleanup old thumbnail URLs that are object URLs
        prev.forEach((url) => {
          if (url && !url.startsWith('http')) {
            URL.revokeObjectURL(url);
          }
        });
        return newThumbnailUrls;
      });
    };

    loadThumbnails();

    // Cleanup on unmount
    return () => {
      setThumbnailUrls(prev => {
        prev.forEach((url) => {
          if (url && !url.startsWith('http')) {
            URL.revokeObjectURL(url);
          }
        });
        return new Map();
      });
    };
  }, [normalizedImages, open, imageCount]);

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
                {normalizedImages.map((img, idx) => {
                  const thumbnailUrl = thumbnailUrls.get(idx) || getImageUrl(img);
                  const displayName = normalizedDisplayNames[idx];
                  const isEditing = editingNameIndex === idx;

                  return (
                    <div
                      key={idx}
                      className={cn(
                        "flex-shrink-0 transition-all",
                        idx === currentIndex ? "scale-110" : ""
                      )}
                    >
                      <button
                        onClick={() => {
                          if (!isEditing) {
                            setCurrentIndex(idx);
                          }
                        }}
                        className={cn(
                          "relative w-20 h-20 rounded border-2 overflow-hidden transition-all group",
                          idx === currentIndex
                            ? "border-white shadow-lg"
                            : "border-white/30 opacity-60 hover:opacity-100"
                        )}
                      >
                        <img
                          src={thumbnailUrl}
                          alt={displayName || `Thumbnail ${idx + 1}`}
                          className="w-full h-full object-cover"
                          onError={(e) => {
                            // Fallback for thumbnail errors - show placeholder
                            e.currentTarget.src = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjQiIGhlaWdodD0iNjQiIHZpZXdCb3g9IjAgMCA2NCA2NCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPHJlY3Qgd2lkdGg9IjY0IiBoZWlnaHQ9IjY0IiBmaWxsPSIjMzMzMzMzIi8+CjxwYXRoIGQ9Ik0zMiAyMEMzMC4zNCAyMCAyOSAyMS4zNCAyOSAyM1YzM0MyOSAzNC42NiAzMC4zNCAzNiAzMiAzNkgzNkMzNy42NiAzNiAzOSAzNC42NiAzOSAzM1YyM0MzOSAyMS4zNCAzNy42NiAyMCAzNiAyMEgzMloiIGZpbGw9IiM2NjY2NjYiLz4KPC9zdmc+';
                          }}
                        />
                        {/* Edit button on hover */}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setEditingNameIndex(idx);
                            setEditNameValue(displayName || '');
                          }}
                          className="absolute top-1 right-1 w-5 h-5 bg-black/70 rounded flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-black/90"
                        >
                          <Edit2 className="w-3 h-3 text-white" />
                        </button>
                        {/* Display name overlay - only show if not editing */}
                        {displayName && !isEditing && (
                          <div className="absolute bottom-0 left-0 right-0 bg-black/80 text-white text-xs p-1 truncate">
                            {displayName}
                          </div>
                        )}
                      </button>
                      {/* Edit input */}
                      {isEditing && (
                        <div className="mt-1 flex gap-1">
                          <Input
                            value={editNameValue}
                            onChange={(e) => setEditNameValue(e.target.value)}
                            placeholder="Display name"
                            className="h-6 text-xs px-2 bg-black/90 text-white border-white/30"
                            autoFocus
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                const newNames = [...normalizedDisplayNames];
                                newNames[idx] = editNameValue.trim() || null;
                                setTempDisplayNames(newNames);
                                setEditingNameIndex(null);
                              } else if (e.key === 'Escape') {
                                setEditingNameIndex(null);
                              }
                            }}
                          />
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-6 w-6 p-0 text-white hover:bg-white/20"
                            onClick={() => {
                              const newNames = [...normalizedDisplayNames];
                              newNames[idx] = editNameValue.trim() || null;
                              setTempDisplayNames(newNames);
                              setEditingNameIndex(null);
                            }}
                          >
                            <Check className="w-3 h-3" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-6 w-6 p-0 text-white hover:bg-white/20"
                            onClick={() => {
                              setEditingNameIndex(null);
                            }}
                          >
                            <XIcon className="w-3 h-3" />
                          </Button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

