import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { X, ChevronLeft, ChevronRight, Download, Trash2 } from 'lucide-react';
import { useState, useEffect } from 'react';
import { cn } from '@/lib/utils';

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
  const [currentIndex, setCurrentIndex] = useState(initialIndex);

  useEffect(() => {
    setCurrentIndex(initialIndex);
  }, [initialIndex, open]);

  if (!images || images.length === 0) return null;

  const currentImage = images[currentIndex];
  const hasPrevious = currentIndex > 0;
  const hasNext = currentIndex < images.length - 1;

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
      if (images.length === 1) {
        onOpenChange(false);
      } else if (currentIndex === images.length - 1) {
        setCurrentIndex(currentIndex - 1);
      }
    }
  };

  const handleDownload = () => {
    const link = document.createElement('a');
    link.href = currentImage;
    link.download = `image-${currentIndex + 1}.jpg`;
    link.target = '_blank';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Keyboard navigation
  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft' && hasPrevious) {
        handlePrevious();
      } else if (e.key === 'ArrowRight' && hasNext) {
        handleNext();
      } else if (e.key === 'Escape') {
        onOpenChange(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, currentIndex, hasPrevious, hasNext]);

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
            {currentIndex + 1} / {images.length}
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
            <img
              src={currentImage}
              alt={`Image ${currentIndex + 1}`}
              className="max-w-full max-h-full object-contain"
              onClick={handleNext}
              style={{ cursor: hasNext ? 'pointer' : 'default' }}
            />
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
          {images.length > 1 && (
            <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 z-50">
              <div className="flex gap-2 bg-black/50 px-4 py-2 rounded-lg overflow-x-auto max-w-[90vw]">
                {images.map((img, idx) => (
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
                      src={img}
                      alt={`Thumbnail ${idx + 1}`}
                      className="w-full h-full object-cover"
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

