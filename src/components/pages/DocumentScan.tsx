import React, { useState, useEffect, useRef } from 'react';
import Header from '@/components/layout/Header';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { api } from '@/lib/api';
import { DocumentScan, DocumentMatch, Project, Client } from '@/types';
import { 
  Upload, 
  FileText, 
  CheckCircle, 
  XCircle, 
  Loader2, 
  RefreshCw,
  Search,
  Camera,
  Image as ImageIcon,
  AlertCircle
} from 'lucide-react';
import { toast } from 'sonner';
import DocumentMatchModal from '@/components/modals/DocumentMatchModal';

export default function DocumentScan() {
  const [scans, setScans] = useState<DocumentScan[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [selectedProject, setSelectedProject] = useState<string>('');
  const [selectedClient, setSelectedClient] = useState<string>('');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterType, setFilterType] = useState<string>('all');
  const [selectedScan, setSelectedScan] = useState<DocumentScan | null>(null);
  const [showMatchModal, setShowMatchModal] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadData();
    loadProjects();
    loadClients();
  }, []);

  useEffect(() => {
    if (selectedClient) {
      loadProjects(selectedClient);
    } else {
      loadProjects();
    }
  }, [selectedClient]);

  const loadData = async () => {
    try {
      setIsLoading(true);
      const params: any = {};
      if (selectedProject) params.project_id = selectedProject;
      if (filterStatus !== 'all') params.status = filterStatus;
      if (filterType !== 'all') params.document_type = filterType;

      const data = await api.getDocumentScans(params);
      setScans(Array.isArray(data) ? data : []);
    } catch (error) {
      toast.error('Failed to load document scans');
    } finally {
      setIsLoading(false);
    }
  };

  const loadProjects = async (clientId?: string) => {
    try {
      const params: any = {};
      if (clientId) params.client_id = clientId;
      const response = await api.getProjects(params);
      // Handle paginated response: { data: [...], pagination: {...} }
      const projectsList = Array.isArray(response) 
        ? response 
        : (response?.data || response?.items || []);
      setProjects(projectsList);
    } catch (error: any) {
      console.error('Failed to load projects:', error);
      toast.error(error.message || 'Failed to load projects');
    }
  };

  const loadClients = async () => {
    try {
      const response = await api.getClients();
      // Handle paginated response: { data: [...], pagination: {...} }
      const clientsList = Array.isArray(response) 
        ? response 
        : (response?.data || response?.items || []);
      setClients(clientsList);
    } catch (error: any) {
      console.error('Failed to load clients:', error);
      toast.error(error.message || 'Failed to load clients');
    }
  };

  useEffect(() => {
    loadData();
  }, [selectedProject, filterStatus, filterType]);

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Validate project selection - check for empty string, null, or undefined
    if (!selectedProject || selectedProject.trim() === '') {
      toast.error('Please select a project first');
      return;
    }

    // Check if file is an image
    if (!file.type.startsWith('image/')) {
      toast.error('Please select an image file');
      return;
    }

    try {
      setIsUploading(true);
      const result = await api.uploadDocumentForScan(file, selectedProject.trim(), undefined, true);
      
      toast.success('Document uploaded and processing started');
      
      // Reload scans
      await loadData();
      
      // Clear file input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    } catch (error: any) {
      toast.error(error.message || 'Failed to upload document');
    } finally {
      setIsUploading(false);
    }
  };

  const handleRetry = async (scanId: string) => {
    try {
      await api.retryDocumentScan(scanId);
      toast.success('Retry initiated');
      await loadData();
    } catch (error: any) {
      toast.error(error.message || 'Failed to retry scan');
    }
  };

  const handleViewMatches = async (scan: DocumentScan) => {
    setSelectedScan(scan);
    setShowMatchModal(true);
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'completed':
        return <Badge className="bg-green-500">Completed</Badge>;
      case 'processing':
        return <Badge className="bg-blue-500">Processing</Badge>;
      case 'failed':
        return <Badge variant="destructive">Failed</Badge>;
      default:
        return <Badge variant="outline">Pending</Badge>;
    }
  };

  const getTypeBadge = (type?: string) => {
    if (!type || type === 'unknown') return null;
    
    const colors: Record<string, string> = {
      invoice: 'bg-blue-500',
      receipt: 'bg-green-500',
      purchase_order: 'bg-purple-500',
      bill: 'bg-orange-500',
      expense: 'bg-yellow-500',
    };

    return (
      <Badge className={colors[type] || 'bg-gray-500'}>
        {type.replace('_', ' ').toUpperCase()}
      </Badge>
    );
  };

  return (
    <>
      <Header 
        title="Document Scanning" 
        subtitle="Upload photos of receipts, invoices, and documents for automatic processing"
      />
      <div className="space-y-4 sm:space-y-6 p-4 sm:p-6">

      {/* Upload Section */}
      <Card className="p-6">
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <Label htmlFor="client-select">Client</Label>
              <Select value={selectedClient || "all"} onValueChange={(value) => setSelectedClient(value === "all" ? "" : value)}>
                <SelectTrigger id="client-select">
                  <SelectValue placeholder="All clients" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All clients</SelectItem>
                  {clients.map((client) => (
                    <SelectItem key={client.id} value={client.id}>
                      {client.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="project-select">Project *</Label>
              <Select value={selectedProject} onValueChange={setSelectedProject}>
                <SelectTrigger id="project-select">
                  <SelectValue placeholder="Select project" />
                </SelectTrigger>
                <SelectContent>
                  {projects.map((project) => (
                    <SelectItem key={project.id} value={project.id}>
                      {project.code} - {project.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-end">
              <Button
                onClick={() => fileInputRef.current?.click()}
                disabled={!selectedProject || isUploading}
                className="w-full"
              >
                {isUploading ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Uploading...
                  </>
                ) : (
                  <>
                    <Camera className="w-4 h-4 mr-2" />
                    Take Photo / Upload
                  </>
                )}
              </Button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                onChange={handleFileSelect}
                className="hidden"
              />
            </div>
          </div>
        </div>
      </Card>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3 sm:gap-4">
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-full sm:w-[180px]">
            <SelectValue placeholder="Filter by status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="processing">Processing</SelectItem>
            <SelectItem value="completed">Completed</SelectItem>
            <SelectItem value="failed">Failed</SelectItem>
          </SelectContent>
        </Select>

        <Select value={filterType} onValueChange={setFilterType}>
          <SelectTrigger className="w-full sm:w-[180px]">
            <SelectValue placeholder="Filter by type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            <SelectItem value="invoice">Invoice</SelectItem>
            <SelectItem value="receipt">Receipt</SelectItem>
            <SelectItem value="purchase_order">Purchase Order</SelectItem>
            <SelectItem value="bill">Bill</SelectItem>
            <SelectItem value="expense">Expense</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Scans List */}
      <div className="grid gap-4">
        {isLoading ? (
          <Card className="p-12 text-center">
            <Loader2 className="w-8 h-8 animate-spin mx-auto mb-4" />
            <p className="text-muted-foreground">Loading scans...</p>
          </Card>
        ) : scans.length === 0 ? (
          <Card className="p-12 text-center">
            <FileText className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
            <p className="text-muted-foreground">No document scans found</p>
            <p className="text-sm text-muted-foreground mt-2">
              Upload a document to get started
            </p>
          </Card>
        ) : (
          scans.map((scan) => (
            <Card key={scan.id} className="p-4">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    <ImageIcon className="w-5 h-5 text-muted-foreground" />
                    <span className="font-medium truncate">{scan.file_name || 'Document'}</span>
                    {getStatusBadge(scan.status)}
                    {getTypeBadge(scan.document_type)}
                    {scan.confidence && (
                      <Badge variant="outline">
                        {Math.round(scan.confidence * 100)}% confidence
                      </Badge>
                    )}
                  </div>

                  {scan.extracted_data && (
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-3 text-sm">
                      {scan.extracted_data.document_number && (
                        <div>
                          <span className="text-muted-foreground">Number: </span>
                          <span className="font-medium truncate">{scan.extracted_data.document_number}</span>
                        </div>
                      )}
                      {scan.extracted_data.date && (
                        <div>
                          <span className="text-muted-foreground">Date: </span>
                          <span className="font-medium">{scan.extracted_data.date}</span>
                        </div>
                      )}
                      {scan.extracted_data.total_amount && (
                        <div>
                          <span className="text-muted-foreground">Amount: </span>
                          <span className="font-medium">${scan.extracted_data.total_amount.toFixed(2)}</span>
                        </div>
                      )}
                      {scan.extracted_data.vendor_name && (
                        <div>
                          <span className="text-muted-foreground">Vendor: </span>
                          <span className="font-medium truncate">{scan.extracted_data.vendor_name}</span>
                        </div>
                      )}
                    </div>
                  )}

                  {scan.error_message && (
                    <div className="mt-2 flex items-center gap-2 text-sm text-destructive">
                      <AlertCircle className="w-4 h-4" />
                      <span>{scan.error_message}</span>
                    </div>
                  )}

                  <div className="text-xs text-muted-foreground mt-2">
                    {scan.project_code && (
                      <span>Project: {scan.project_code} - {scan.project_name}</span>
                    )}
                    {scan.processed_at && (
                      <span className="ml-4">Processed: {new Date(scan.processed_at).toLocaleString()}</span>
                    )}
                  </div>
                </div>

                <div className="flex gap-2 ml-4">
                  {scan.status === 'completed' && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleViewMatches(scan)}
                    >
                      <Search className="w-4 h-4 mr-2" />
                      View Matches
                    </Button>
                  )}
                  {scan.status === 'failed' && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleRetry(scan.id)}
                    >
                      <RefreshCw className="w-4 h-4 mr-2" />
                      Retry
                    </Button>
                  )}
                  {scan.status === 'processing' && (
                    <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                  )}
                </div>
              </div>
            </Card>
          ))
        )}
      </div>

      {showMatchModal && selectedScan && (
        <DocumentMatchModal
          scan={selectedScan}
          open={showMatchModal}
          onOpenChange={setShowMatchModal}
          onMatchConfirmed={() => {
            setShowMatchModal(false);
            loadData();
          }}
        />
      )}
      </div>
    </>
  );
}
