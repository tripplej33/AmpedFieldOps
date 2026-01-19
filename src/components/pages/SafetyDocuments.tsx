import { useState, useEffect } from 'react';
import { SafetyDocument, Project, Client } from '@/types';
import { api } from '@/lib/api';
import { getProjects } from '@/lib/supabaseQueries';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import Header from '@/components/layout/Header';
import { 
  FileText, 
  Plus, 
  Search,
  Filter,
  Download,
  Eye,
  Trash2,
  FileCheck,
  AlertTriangle,
  CheckCircle2,
  Loader2
} from 'lucide-react';
import { toast } from 'sonner';
import { DocumentViewer } from '@/components/ui/document-viewer';
import { ProjectFile } from '@/types';
import CreateSafetyDocumentModal from '@/components/modals/CreateSafetyDocumentModal';

export default function SafetyDocuments() {
  const [documents, setDocuments] = useState<SafetyDocument[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterProject, setFilterProject] = useState<string>('all');
  const [selectedDocument, setSelectedDocument] = useState<SafetyDocument | null>(null);
  const [viewingPDF, setViewingPDF] = useState(false);
  const [createModalOpen, setCreateModalOpen] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const [docsData, projectsData] = await Promise.all([
        api.getSafetyDocuments(),
        getProjects({ limit: 100 })
      ]);
      setDocuments(docsData);
      setProjects(Array.isArray(projectsData) ? projectsData : []);
    } catch (error: any) {
      toast.error('Failed to load safety documents');
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (doc: SafetyDocument) => {
    if (!confirm(`Delete ${doc.title}?`)) return;

    try {
      await api.deleteSafetyDocument(doc.id);
      toast.success('Document deleted');
      loadData();
    } catch (error: any) {
      toast.error('Failed to delete document');
      console.error(error);
    }
  };

  const handleGeneratePDF = async (doc: SafetyDocument) => {
    try {
      await api.generateSafetyDocumentPDF(doc.id);
      toast.success('PDF generated successfully');
      loadData();
    } catch (error: any) {
      toast.error('Failed to generate PDF');
      console.error(error);
    }
  };

  const handleDownloadPDF = async (doc: SafetyDocument) => {
    try {
      const blob = await api.downloadSafetyDocumentPDF(doc.id);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${doc.title}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error: any) {
      toast.error('Failed to download PDF');
      console.error(error);
    }
  };

  const handleViewPDF = async (doc: SafetyDocument) => {
    if (!doc.file_path) {
      toast.error('PDF not generated yet. Please generate PDF first.');
      return;
    }

    // Create a temporary file object for the viewer
    const tempFile: ProjectFile = {
      id: doc.id,
      file_name: `${doc.title}.pdf`,
      file_type: 'pdf',
      file_path: doc.file_path,
      file_size: 0,
      project_id: doc.project_id,
      created_at: doc.created_at,
      updated_at: doc.updated_at,
    };

    setSelectedDocument(doc);
    setViewingPDF(true);
  };

  const getDocumentTypeIcon = (type: string) => {
    switch (type) {
      case 'jsa':
        return <AlertTriangle className="w-4 h-4" />;
      case 'electrical_compliance':
      case 'electrical_safety_certificate':
        return <FileCheck className="w-4 h-4" />;
      default:
        return <FileText className="w-4 h-4" />;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'approved':
        return <Badge className="bg-voltage/20 text-voltage border-voltage">Approved</Badge>;
      case 'completed':
        return <Badge className="bg-electric/20 text-electric border-electric">Completed</Badge>;
      case 'draft':
      default:
        return <Badge variant="outline">Draft</Badge>;
    }
  };

  const filteredDocuments = documents.filter((doc) => {
    if (searchTerm && !doc.title.toLowerCase().includes(searchTerm.toLowerCase())) {
      return false;
    }
    if (filterType !== 'all' && doc.document_type !== filterType) {
      return false;
    }
    if (filterStatus !== 'all' && doc.status !== filterStatus) {
      return false;
    }
    if (filterProject !== 'all' && doc.project_id !== filterProject) {
      return false;
    }
    return true;
  });

  return (
    <div className="flex flex-col h-screen">
      <Header title="Safety Documents" />
      <div className="flex-1 overflow-auto p-4 sm:p-6">
        <div className="max-w-7xl mx-auto space-y-4 sm:space-y-6">
          {/* Filters */}
          <Card className="p-4">
            <div className="flex flex-col sm:flex-row gap-4">
              <div className="flex-1">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    placeholder="Search documents..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10"
                  />
                </div>
              </div>
              <div className="w-full sm:w-48">
                <Select value={filterType} onValueChange={setFilterType}>
                  <SelectTrigger>
                    <SelectValue placeholder="Document Type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Types</SelectItem>
                    <SelectItem value="jsa">JSA</SelectItem>
                    <SelectItem value="electrical_compliance">Compliance</SelectItem>
                    <SelectItem value="electrical_safety_certificate">Safety Certificate</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="w-full sm:w-48">
                <Select value={filterStatus} onValueChange={setFilterStatus}>
                  <SelectTrigger>
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Statuses</SelectItem>
                    <SelectItem value="draft">Draft</SelectItem>
                    <SelectItem value="completed">Completed</SelectItem>
                    <SelectItem value="approved">Approved</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="w-full sm:w-48">
                <Select value={filterProject} onValueChange={setFilterProject}>
                  <SelectTrigger>
                    <SelectValue placeholder="Project" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Projects</SelectItem>
                    {projects.map((project) => (
                      <SelectItem key={project.id} value={project.id}>
                        {project.code} - {project.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </Card>

          {/* Documents List */}
          <Card className="p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold font-mono uppercase">Documents ({filteredDocuments.length})</h2>
              <Button onClick={() => setCreateModalOpen(true)}>
                <Plus className="w-4 h-4 mr-2" />
                New Document
              </Button>
            </div>

            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-8 h-8 animate-spin text-electric" />
              </div>
            ) : filteredDocuments.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <FileText className="w-12 h-12 mx-auto mb-4 opacity-50" />
                <p>No documents found</p>
              </div>
            ) : (
              <div className="space-y-3">
                {filteredDocuments.map((doc) => (
                  <Card
                    key={doc.id}
                    className="p-4 hover:border-electric transition-colors"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex items-start gap-4 flex-1">
                        <div className="w-10 h-10 rounded-lg border-2 flex items-center justify-center bg-electric/20 border-electric text-electric">
                          {getDocumentTypeIcon(doc.document_type)}
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <h4 className="font-semibold">{doc.title}</h4>
                            {getStatusBadge(doc.status)}
                          </div>
                          <p className="text-sm text-muted-foreground mb-2">
                            {doc.project_name || doc.project_code} • {doc.client_name}
                            {doc.created_by_name && ` • Created by ${doc.created_by_name}`}
                          </p>
                          <div className="flex items-center gap-4 text-xs text-muted-foreground">
                            <span>Type: {doc.document_type.replace('_', ' ')}</span>
                            <span>Created: {new Date(doc.created_at).toLocaleDateString()}</span>
                            {doc.approved_by_name && (
                              <span>Approved by: {doc.approved_by_name}</span>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {doc.file_path ? (
                          <>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleViewPDF(doc)}
                            >
                              <Eye className="w-4 h-4 mr-2" />
                              View
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleDownloadPDF(doc)}
                            >
                              <Download className="w-4 h-4 mr-2" />
                              Download
                            </Button>
                          </>
                        ) : (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleGeneratePDF(doc)}
                          >
                            <FileText className="w-4 h-4 mr-2" />
                            Generate PDF
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDelete(doc)}
                        >
                          <Trash2 className="w-4 h-4 text-destructive" />
                        </Button>
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </Card>
        </div>
      </div>

      {/* PDF Viewer */}
      {selectedDocument && (
        <DocumentViewer
          file={viewingPDF ? {
            id: selectedDocument.id,
            file_name: `${selectedDocument.title}.pdf`,
            file_type: 'pdf',
            file_path: selectedDocument.file_path,
            mime_type: 'application/pdf',
          } : null}
          open={viewingPDF}
          onOpenChange={(open) => {
            setViewingPDF(open);
            if (!open) {
              setSelectedDocument(null);
            }
          }}
        />
      )}

      {/* Create Safety Document Modal */}
      <CreateSafetyDocumentModal
        open={createModalOpen}
        onOpenChange={setCreateModalOpen}
        onSuccess={() => {
          loadData();
        }}
      />
    </div>
  );
}

