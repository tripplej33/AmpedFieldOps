import { useState, useEffect } from 'react';
import { CostCenter, Project, TimesheetEntry, ProjectFile } from '@/types';
import { api } from '@/lib/api';
import { getTimesheets } from '@/lib/supabaseQueries';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  Clock, 
  DollarSign, 
  FileText, 
  ShoppingCart, 
  Loader2, 
  Image as ImageIcon,
  File,
  Eye,
  Download,
  Calendar,
  User,
  Wrench
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { DocumentViewer } from '@/components/ui/document-viewer';
import ImageViewer from '@/components/modals/ImageViewer';
import PurchaseOrderDetailModal from '@/components/modals/PurchaseOrderDetailModal';

interface CostCenterDetailModalProps {
  costCenter: CostCenter | null;
  project: Project | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function CostCenterDetailModal({ 
  costCenter, 
  project, 
  open, 
  onOpenChange 
}: CostCenterDetailModalProps) {
  const [timesheets, setTimesheets] = useState<TimesheetEntry[]>([]);
  const [files, setFiles] = useState<ProjectFile[]>([]);
  const [purchaseOrders, setPurchaseOrders] = useState<any[]>([]);
  const [isLoadingTimesheets, setIsLoadingTimesheets] = useState(false);
  const [isLoadingFiles, setIsLoadingFiles] = useState(false);
  const [isLoadingPOs, setIsLoadingPOs] = useState(false);
  const [selectedFile, setSelectedFile] = useState<ProjectFile | null>(null);
  const [viewingImages, setViewingImages] = useState<string[]>([]);
  const [viewingImageIndex, setViewingImageIndex] = useState(0);
  const [selectedPO, setSelectedPO] = useState<any | null>(null);
  const [isPOModalOpen, setIsPOModalOpen] = useState(false);

  useEffect(() => {
    if (costCenter && project && open) {
      loadData();
    } else {
      // Reset data when modal closes
      setTimesheets([]);
      setFiles([]);
      setPurchaseOrders([]);
    }
  }, [costCenter, project, open]);

  const loadData = async () => {
    if (!costCenter || !project) return;
    
    // Load all data in parallel
    Promise.all([
      loadTimesheets(),
      loadFiles(),
      loadPurchaseOrders(),
    ]);
  };

  const loadTimesheets = async () => {
    if (!costCenter || !project) return;
    setIsLoadingTimesheets(true);
    try {
      const data = await getTimesheets({ 
        project_id: project.id, 
        cost_center_id: costCenter.id 
      });
      setTimesheets(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('Failed to load timesheets:', error);
      setTimesheets([]);
    } finally {
      setIsLoadingTimesheets(false);
    }
  };

  const loadFiles = async () => {
    if (!costCenter || !project) return;
    setIsLoadingFiles(true);
    try {
      const data = await api.getFiles({ 
        project_id: project.id, 
        cost_center_id: costCenter.id 
      });
      setFiles(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('Failed to load files:', error);
      setFiles([]);
    } finally {
      setIsLoadingFiles(false);
    }
  };

  const loadPurchaseOrders = async () => {
    if (!costCenter) return;
    setIsLoadingPOs(true);
    try {
      const data = await api.getPurchaseOrdersByCostCenter(costCenter.id);
      setPurchaseOrders(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('Failed to load purchase orders:', error);
      setPurchaseOrders([]);
    } finally {
      setIsLoadingPOs(false);
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
  };

  const handleViewImages = (imageUrls: string[], startIndex: number = 0) => {
    setViewingImages(imageUrls);
    setViewingImageIndex(startIndex);
  };

  const handleViewPO = (po: any) => {
    // Transform the API response to match PurchaseOrder interface
    const purchaseOrder: any = {
      id: po.id,
      xero_po_id: po.xero_po_id,
      po_number: po.po_number || 'N/A',
      supplier_id: po.supplier_id,
      supplier_name: po.supplier_name,
      project_id: po.project_id,
      project_code: po.project_code,
      project_name: po.project_name,
      status: po.status,
      date: po.date,
      delivery_date: po.delivery_date,
      total_amount: po.total_amount,
      currency: po.currency || 'USD',
      line_items: po.line_items || [],
      line_items_detail: po.cost_center_line_items || [],
      notes: po.notes,
      created_at: po.created_at,
      updated_at: po.updated_at,
    };
    setSelectedPO(purchaseOrder);
    setIsPOModalOpen(true);
  };

  if (!costCenter || !project) return null;

  const totalHours = timesheets.reduce((sum, t) => sum + parseFloat(String(t.hours)), 0);
  const totalCost = timesheets.reduce((sum, t) => {
    const hours = parseFloat(String(t.hours));
    // Estimate cost if hourly rate available, otherwise just sum hours
    return sum + hours;
  }, 0);

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-[95vw] sm:max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <div className="flex items-start justify-between">
              <div>
                <DialogTitle className="text-2xl font-bold">
                  {costCenter.code} - {costCenter.name}
                </DialogTitle>
                <DialogDescription className="font-mono text-sm mt-1">
                  {project.name} • {project.code}
                </DialogDescription>
              </div>
              <Badge variant="outline" className="font-mono text-xs">
                {costCenter.code}
              </Badge>
            </div>
          </DialogHeader>

          {/* Budget Summary */}
          <Card className="p-4 bg-card border-border">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div>
                <p className="text-xs font-mono text-muted-foreground uppercase mb-1">Budget</p>
                <p className="text-lg font-bold font-mono">${costCenter.budget.toLocaleString()}</p>
              </div>
              <div>
                <p className="text-xs font-mono text-muted-foreground uppercase mb-1">Hours</p>
                <p className="text-lg font-bold font-mono text-electric">{totalHours.toFixed(1)}h</p>
              </div>
              <div>
                <p className="text-xs font-mono text-muted-foreground uppercase mb-1">Used</p>
                <p className="text-lg font-bold font-mono text-electric">
                  ${(costCenter.actual_cost || costCenter.total_cost || 0).toLocaleString()}
                </p>
              </div>
              <div>
                <p className="text-xs font-mono text-muted-foreground uppercase mb-1">Remaining</p>
                <p className={cn(
                  'text-lg font-bold font-mono',
                  (costCenter.budget - (costCenter.actual_cost || costCenter.total_cost || 0)) < 0 
                    ? 'text-warning' 
                    : 'text-voltage'
                )}>
                  ${(costCenter.budget - (costCenter.actual_cost || costCenter.total_cost || 0)).toLocaleString()}
                </p>
              </div>
            </div>
            {costCenter.description && (
              <p className="text-sm text-muted-foreground mt-3">{costCenter.description}</p>
            )}
            {costCenter.client_po_number && (
              <div className="mt-3 pt-3 border-t border-border">
                <p className="text-xs font-mono text-muted-foreground uppercase mb-1">Client PO Number</p>
                <p className="text-sm font-mono font-semibold text-electric">{costCenter.client_po_number}</p>
              </div>
            )}
          </Card>

          {/* Tabs */}
          <Tabs defaultValue="timesheets" className="w-full">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="timesheets">
                Timesheets ({timesheets.length})
              </TabsTrigger>
              <TabsTrigger value="files">
                Files ({files.length})
              </TabsTrigger>
              <TabsTrigger value="purchase-orders">
                Purchase Orders ({purchaseOrders.length})
              </TabsTrigger>
            </TabsList>

            {/* Timesheets Tab */}
            <TabsContent value="timesheets" className="space-y-3 mt-4">
              {isLoadingTimesheets ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="w-8 h-8 animate-spin text-electric" />
                </div>
              ) : timesheets.length === 0 ? (
                <Card className="p-6 bg-card border-border text-center">
                  <Clock className="w-12 h-12 mx-auto text-muted-foreground mb-3 opacity-50" />
                  <p className="text-muted-foreground">No timesheet entries for this cost center</p>
                </Card>
              ) : (
                timesheets.map((entry) => (
                  <Card key={entry.id} className="p-4 bg-card border-border hover:border-electric transition-colors">
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <User className="w-4 h-4 text-muted-foreground" />
                          <span className="font-semibold text-foreground">{entry.user_name}</span>
                          <Badge variant="outline" className="text-xs">
                            {entry.activity_type_name}
                          </Badge>
                        </div>
                        <div className="flex items-center gap-4 text-sm text-muted-foreground mb-2">
                          <span className="flex items-center gap-1">
                            <Calendar className="w-3 h-3" />
                            {new Date(entry.date).toLocaleDateString()}
                          </span>
                          <span className="flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            {entry.hours}h
                          </span>
                        </div>
                        {entry.notes && (
                          <p className="text-sm text-foreground mb-3 whitespace-pre-wrap">{entry.notes}</p>
                        )}
                        {entry.image_urls && entry.image_urls.length > 0 && (
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-3">
                            {entry.image_urls.map((url, index) => (
                              <div
                                key={index}
                                className="relative aspect-square rounded-lg overflow-hidden border border-border cursor-pointer hover:border-electric transition-colors group"
                                onClick={() => handleViewImages(entry.image_urls, index)}
                              >
                                <img
                                  src={url}
                                  alt={`Timesheet image ${index + 1}`}
                                  className="w-full h-full object-cover"
                                />
                                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center">
                                  <Eye className="w-4 h-4 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </Card>
                ))
              )}
            </TabsContent>

            {/* Files Tab */}
            <TabsContent value="files" className="space-y-3 mt-4">
              {isLoadingFiles ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="w-8 h-8 animate-spin text-electric" />
                </div>
              ) : files.length === 0 ? (
                <Card className="p-6 bg-card border-border text-center">
                  <FileText className="w-12 h-12 mx-auto text-muted-foreground mb-3 opacity-50" />
                  <p className="text-muted-foreground">No files linked to this cost center</p>
                </Card>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {files.map((file) => {
                    const isImage = file.file_name.match(/\.(jpg|jpeg|png|gif|webp)$/i);
                    const isPDF = file.file_name.match(/\.pdf$/i);
                    return (
                      <Card key={file.id} className="p-4 hover:border-electric transition-colors group">
                        <div className="flex items-start gap-3">
                          <div className={cn(
                            "w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0",
                            isImage ? "bg-electric/20" : isPDF ? "bg-red-500/20" : "bg-muted"
                          )}>
                            {isImage ? (
                              <ImageIcon className="w-5 h-5 text-electric" />
                            ) : isPDF ? (
                              <FileText className="w-5 h-5 text-red-500" />
                            ) : (
                              <File className="w-5 h-5 text-muted-foreground" />
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-medium truncate text-sm">{file.file_name}</p>
                            <p className="text-xs text-muted-foreground mt-1">
                              {formatFileSize(file.file_size)} • {new Date(file.created_at).toLocaleDateString()}
                            </p>
                          </div>
                          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setSelectedFile(file)}
                              className="h-8 w-8 p-0"
                            >
                              <Eye className="w-4 h-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={async () => {
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
                                } catch (error: any) {
                                  console.error('Failed to download file:', error);
                                }
                              }}
                              className="h-8 w-8 p-0"
                            >
                              <Download className="w-4 h-4" />
                            </Button>
                          </div>
                        </div>
                      </Card>
                    );
                  })}
                </div>
              )}
            </TabsContent>

            {/* Purchase Orders Tab */}
            <TabsContent value="purchase-orders" className="space-y-3 mt-4">
              {isLoadingPOs ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="w-8 h-8 animate-spin text-electric" />
                </div>
              ) : purchaseOrders.length === 0 ? (
                <Card className="p-6 bg-card border-border text-center">
                  <ShoppingCart className="w-12 h-12 mx-auto text-muted-foreground mb-3 opacity-50" />
                  <p className="text-muted-foreground">No purchase orders linked to this cost center</p>
                </Card>
              ) : (
                purchaseOrders.map((po) => (
                  <Card 
                    key={po.id} 
                    className="p-4 bg-card border-border hover:border-electric transition-colors cursor-pointer"
                    onClick={() => handleViewPO(po)}
                  >
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <ShoppingCart className="w-4 h-4 text-electric" />
                          <span className="font-semibold text-foreground font-mono">{po.po_number || 'N/A'}</span>
                          <Badge 
                            variant="outline" 
                            className={cn(
                              'text-xs',
                              po.status === 'AUTHORISED' ? 'border-voltage text-voltage' :
                              po.status === 'BILLED' ? 'border-electric text-electric' :
                              po.status === 'CANCELLED' ? 'border-destructive text-destructive' :
                              ''
                            )}
                          >
                            {po.status}
                          </Badge>
                        </div>
                        <p className="text-sm text-muted-foreground mb-2">
                          {po.supplier_name} • {new Date(po.date).toLocaleDateString()}
                        </p>
                        {po.cost_center_line_items && po.cost_center_line_items.length > 0 && (
                          <div className="mt-2 p-2 bg-muted/30 rounded text-xs">
                            <p className="font-medium mb-1">Line Items for this Cost Center:</p>
                            <ul className="space-y-1">
                              {po.cost_center_line_items.map((item: any, idx: number) => (
                                <li key={idx} className="flex justify-between">
                                  <span className="text-muted-foreground">{item.description}</span>
                                  <span className="font-mono font-medium">
                                    ${(item.line_amount || 0).toLocaleString()}
                                  </span>
                                </li>
                              ))}
                            </ul>
                            <div className="mt-2 pt-2 border-t border-border flex justify-between font-semibold">
                              <span>Cost Center Total:</span>
                              <span className="font-mono text-electric">
                                ${(po.cost_center_total || 0).toLocaleString()}
                              </span>
                            </div>
                          </div>
                        )}
                      </div>
                      <div className="text-right ml-4">
                        <p className="text-lg font-bold font-mono text-foreground">
                          ${(po.total_amount || 0).toLocaleString()}
                        </p>
                        <p className="text-xs text-muted-foreground">Total PO</p>
                      </div>
                    </div>
                  </Card>
                ))
              )}
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>

      {/* File Viewer */}
      {selectedFile && (
        <DocumentViewer
          file={selectedFile}
          open={!!selectedFile}
          onOpenChange={(open) => !open && setSelectedFile(null)}
        />
      )}

      {/* Image Viewer */}
      <ImageViewer
        images={viewingImages}
        currentIndex={viewingImageIndex}
        open={viewingImages.length > 0}
        onOpenChange={(open) => {
          if (!open) {
            setViewingImages([]);
            setViewingImageIndex(0);
          }
        }}
      />

      {/* Purchase Order Detail Modal */}
      {selectedPO && (
        <PurchaseOrderDetailModal
          purchaseOrder={selectedPO}
          open={isPOModalOpen}
          onOpenChange={(open) => {
            setIsPOModalOpen(open);
            if (!open) {
              setSelectedPO(null);
            }
          }}
        />
      )}
    </>
  );
}
