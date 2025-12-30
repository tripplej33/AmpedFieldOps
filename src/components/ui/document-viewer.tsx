import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from './dialog';
import { Button } from './button';
import { Download, X, FileText, Image as ImageIcon, Loader2 } from 'lucide-react';
import { api } from '@/lib/api';

interface DocumentViewerProps {
  file: {
    id: string;
    file_name: string;
    file_type: 'image' | 'pdf' | 'document';
    file_path?: string;
    mime_type?: string;
  } | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDownload?: () => void;
}

export function DocumentViewer({ file, open, onOpenChange, onDownload }: DocumentViewerProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!file || !open) {
      setImageUrl(null);
      setPdfUrl(null);
      setError(null);
      return;
    }

    const loadFile = async () => {
      setLoading(true);
      setError(null);

      try {
        if (file.file_type === 'image') {
          // For images, use the file path directly
          const url = file.file_path ? `/uploads${file.file_path.startsWith('/') ? '' : '/'}${file.file_path}` : null;
          if (url) {
            setImageUrl(url);
          } else {
            // Fallback: try to download via API
            const blob = await api.downloadFile(file.id);
            const objectUrl = URL.createObjectURL(blob);
            setImageUrl(objectUrl);
          }
        } else if (file.file_type === 'pdf') {
          // For PDFs, try to get via API endpoint
          try {
            const blob = await api.downloadFile(file.id);
            const objectUrl = URL.createObjectURL(blob);
            setPdfUrl(objectUrl);
          } catch (err) {
            // Fallback to direct URL
            const url = file.file_path ? `/uploads${file.file_path.startsWith('/') ? '' : '/'}${file.file_path}` : null;
            if (url) {
              setPdfUrl(url);
            } else {
              throw new Error('Unable to load PDF');
            }
          }
        }
      } catch (err: any) {
        setError(err.message || 'Failed to load file');
      } finally {
        setLoading(false);
      }
    };

    loadFile();

    // Cleanup object URLs on unmount
    return () => {
      if (imageUrl && imageUrl.startsWith('blob:')) {
        URL.revokeObjectURL(imageUrl);
      }
      if (pdfUrl && pdfUrl.startsWith('blob:')) {
        URL.revokeObjectURL(pdfUrl);
      }
    };
  }, [file, open]);

  const handleDownload = async () => {
    if (!file) return;

    try {
      const blob = await api.downloadFile(file.id);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = file.file_name;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      if (onDownload) {
        onDownload();
      }
    } catch (err: any) {
      setError(err.message || 'Failed to download file');
    }
  };

  if (!file) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <DialogTitle className="flex items-center gap-2">
              {file.file_type === 'image' && <ImageIcon className="w-5 h-5" />}
              {file.file_type === 'pdf' && <FileText className="w-5 h-5" />}
              {file.file_name}
            </DialogTitle>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={handleDownload}>
                <Download className="w-4 h-4 mr-2" />
                Download
              </Button>
              <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
                <X className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-auto p-4 bg-muted/30 rounded-lg">
          {loading && (
            <div className="flex items-center justify-center h-full">
              <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
            </div>
          )}

          {error && (
            <div className="flex flex-col items-center justify-center h-full text-center">
              <p className="text-destructive font-medium">Error loading file</p>
              <p className="text-sm text-muted-foreground mt-2">{error}</p>
            </div>
          )}

          {!loading && !error && imageUrl && (
            <div className="flex items-center justify-center h-full">
              <img
                src={imageUrl}
                alt={file.file_name}
                className="max-w-full max-h-full object-contain rounded-lg"
              />
            </div>
          )}

          {!loading && !error && pdfUrl && (
            <div className="flex items-center justify-center h-full">
              <iframe
                src={pdfUrl}
                className="w-full h-full min-h-[600px] border-0 rounded-lg"
                title={file.file_name}
              />
            </div>
          )}

          {!loading && !error && !imageUrl && !pdfUrl && file.file_type === 'document' && (
            <div className="flex flex-col items-center justify-center h-full text-center">
              <FileText className="w-16 h-16 text-muted-foreground mb-4" />
              <p className="text-muted-foreground">Preview not available for this file type</p>
              <p className="text-sm text-muted-foreground mt-2">Please download to view</p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

