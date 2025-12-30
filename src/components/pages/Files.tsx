import { useState, useEffect } from 'react';
import { Client, Project, ProjectFile } from '@/types';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { FileUpload } from '@/components/ui/file-upload';
import { DocumentViewer } from '@/components/ui/document-viewer';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Header } from '@/components/layout/Header';
import { 
  FolderOpen, 
  ChevronRight, 
  ChevronDown, 
  File, 
  Image as ImageIcon, 
  FileText, 
  Upload, 
  Search,
  Trash2,
  Eye,
  Download
} from 'lucide-react';
import { toast } from 'sonner';

interface ProjectWithFiles extends Project {
  files?: ProjectFile[];
}

interface ClientWithProjects extends Client {
  projects?: ProjectWithFiles[];
}

export default function Files() {
  const [clients, setClients] = useState<ClientWithProjects[]>([]);
  const [expandedClients, setExpandedClients] = useState<Set<string>>(new Set());
  const [expandedProjects, setExpandedProjects] = useState<Set<string>>(new Set());
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [selectedFile, setSelectedFile] = useState<ProjectFile | null>(null);
  const [uploadFiles, setUploadFiles] = useState<File[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState<string>('all');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const [clientsData, projectsData, filesData] = await Promise.all([
        api.getClients(),
        api.getProjects(),
        api.getFiles()
      ]);

      // Organize files by project
      const filesByProject = new Map<string, ProjectFile[]>();
      filesData.forEach((file: ProjectFile) => {
        if (!filesByProject.has(file.project_id)) {
          filesByProject.set(file.project_id, []);
        }
        filesByProject.get(file.project_id)!.push(file);
      });

      // Organize projects by client
      const projectsByClient = new Map<string, Project[]>();
      projectsData.forEach((project: Project) => {
        if (!project.client_id) return;
        if (!projectsByClient.has(project.client_id)) {
          projectsByClient.set(project.client_id, []);
        }
        projectsByClient.get(project.client_id)!.push(project);
      });

      // Build hierarchical structure
      const clientsWithProjects: ClientWithProjects[] = clientsData.map((client: Client) => ({
        ...client,
        projects: (projectsByClient.get(client.id) || []).map((project: Project) => ({
          ...project,
          files: filesByProject.get(project.id) || [],
        })),
      }));

      setClients(clientsWithProjects);
    } catch (error: any) {
      toast.error('Failed to load files');
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const toggleClient = (clientId: string) => {
    const newExpanded = new Set(expandedClients);
    if (newExpanded.has(clientId)) {
      newExpanded.delete(clientId);
    } else {
      newExpanded.add(clientId);
    }
    setExpandedClients(newExpanded);
  };

  const toggleProject = (projectId: string) => {
    const newExpanded = new Set(expandedProjects);
    if (newExpanded.has(projectId)) {
      newExpanded.delete(projectId);
    } else {
      newExpanded.add(projectId);
    }
    setExpandedProjects(newExpanded);
  };

  const handleUpload = async () => {
    if (!selectedProject || uploadFiles.length === 0) {
      toast.error('Please select a project and files');
      return;
    }

    try {
      for (const file of uploadFiles) {
        await api.uploadProjectFile(file, selectedProject.id);
      }
      toast.success(`Uploaded ${uploadFiles.length} file(s)`);
      setIsUploadModalOpen(false);
      setUploadFiles([]);
      setSelectedProject(null);
      loadData();
    } catch (error: any) {
      toast.error('Failed to upload files');
      console.error(error);
    }
  };

  const handleDelete = async (file: ProjectFile) => {
    if (!confirm(`Delete ${file.file_name}?`)) return;

    try {
      await api.deleteFile(file.id);
      toast.success('File deleted');
      loadData();
    } catch (error: any) {
      toast.error('Failed to delete file');
      console.error(error);
    }
  };

  const handleDownload = async (file: ProjectFile) => {
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
      toast.error('Failed to download file');
      console.error(error);
    }
  };

  const getFileIcon = (fileType: string) => {
    switch (fileType) {
      case 'image':
        return <ImageIcon className="w-4 h-4" />;
      case 'pdf':
        return <FileText className="w-4 h-4" />;
      default:
        return <File className="w-4 h-4" />;
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
  };

  const filteredClients = clients.filter((client) => {
    if (searchTerm) {
      const matchesClient = client.name.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesProjects = client.projects?.some((p) =>
        p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        p.code.toLowerCase().includes(searchTerm.toLowerCase())
      );
      const matchesFiles = client.projects?.some((p) =>
        p.files?.some((f) => f.file_name.toLowerCase().includes(searchTerm.toLowerCase()))
      );
      if (!matchesClient && !matchesProjects && !matchesFiles) return false;
    }

    if (filterType !== 'all') {
      const hasMatchingFiles = client.projects?.some((p) =>
        p.files?.some((f) => f.file_type === filterType)
      );
      if (!hasMatchingFiles) return false;
    }

    return true;
  });

  return (
    <div className="flex flex-col h-screen">
      <Header title="Files" />
      <div className="flex-1 overflow-auto p-6">
        <div className="max-w-7xl mx-auto space-y-6">
          {/* Filters */}
          <Card className="p-4">
            <div className="flex flex-col sm:flex-row gap-4">
              <div className="flex-1">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    placeholder="Search files, projects, clients..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10"
                  />
                </div>
              </div>
              <div className="w-full sm:w-48">
                <Select value={filterType} onValueChange={setFilterType}>
                  <SelectTrigger>
                    <SelectValue placeholder="Filter by type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Types</SelectItem>
                    <SelectItem value="image">Images</SelectItem>
                    <SelectItem value="pdf">PDFs</SelectItem>
                    <SelectItem value="document">Documents</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button onClick={() => setIsUploadModalOpen(true)}>
                <Upload className="w-4 h-4 mr-2" />
                Upload Files
              </Button>
            </div>
          </Card>

          {/* File Tree */}
          <Card className="p-6">
            <h2 className="text-lg font-bold mb-4 font-mono uppercase">File Hierarchy</h2>
            {loading ? (
              <p className="text-muted-foreground">Loading...</p>
            ) : filteredClients.length === 0 ? (
              <p className="text-muted-foreground">No files found</p>
            ) : (
              <div className="space-y-2">
                {filteredClients.map((client) => (
                  <div key={client.id} className="border border-border rounded-lg">
                    <button
                      onClick={() => toggleClient(client.id)}
                      className="w-full flex items-center gap-2 p-3 hover:bg-muted/50 transition-colors text-left"
                    >
                      {expandedClients.has(client.id) ? (
                        <ChevronDown className="w-4 h-4" />
                      ) : (
                        <ChevronRight className="w-4 h-4" />
                      )}
                      <FolderOpen className="w-4 h-4 text-electric" />
                      <span className="font-medium">{client.name}</span>
                      <Badge variant="outline" className="ml-auto">
                        {client.projects?.reduce((sum, p) => sum + (p.files?.length || 0), 0)} files
                      </Badge>
                    </button>

                    {expandedClients.has(client.id) && (
                      <div className="pl-6 border-t border-border">
                        {client.projects?.map((project) => (
                          <div key={project.id} className="border-b border-border last:border-b-0">
                            <button
                              onClick={() => toggleProject(project.id)}
                              className="w-full flex items-center gap-2 p-3 hover:bg-muted/30 transition-colors text-left"
                            >
                              {expandedProjects.has(project.id) ? (
                                <ChevronDown className="w-4 h-4" />
                              ) : (
                                <ChevronRight className="w-4 h-4" />
                              )}
                              <FolderOpen className="w-4 h-4 text-voltage" />
                              <span className="text-sm">{project.code} - {project.name}</span>
                              <Badge variant="outline" className="ml-auto text-xs">
                                {project.files?.length || 0} files
                              </Badge>
                            </button>

                            {expandedProjects.has(project.id) && (
                              <div className="pl-6 bg-muted/20">
                                {project.files && project.files.length > 0 ? (
                                  <div className="divide-y divide-border">
                                    {project.files.map((file) => (
                                      <div
                                        key={file.id}
                                        className="flex items-center gap-3 p-3 hover:bg-muted/50 transition-colors"
                                      >
                                        {getFileIcon(file.file_type)}
                                        <div className="flex-1 min-w-0">
                                          <p className="text-sm font-medium truncate">{file.file_name}</p>
                                          <p className="text-xs text-muted-foreground">
                                            {formatFileSize(file.file_size)} • {new Date(file.created_at).toLocaleDateString()}
                                          </p>
                                        </div>
                                        <div className="flex items-center gap-2">
                                          <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => setSelectedFile(file)}
                                          >
                                            <Eye className="w-4 h-4" />
                                          </Button>
                                          <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => handleDownload(file)}
                                          >
                                            <Download className="w-4 h-4" />
                                          </Button>
                                          <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => handleDelete(file)}
                                          >
                                            <Trash2 className="w-4 h-4 text-destructive" />
                                          </Button>
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                ) : (
                                  <p className="p-3 text-sm text-muted-foreground">No files</p>
                                )}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      </div>

      {/* Upload Modal */}
      <Dialog open={isUploadModalOpen} onOpenChange={setIsUploadModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Upload Files</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Select Project</Label>
              <Select
                value={selectedProject?.id || ''}
                onValueChange={(value) => {
                  const project = clients
                    .flatMap((c) => c.projects || [])
                    .find((p) => p.id === value);
                  setSelectedProject(project || null);
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select project" />
                </SelectTrigger>
                <SelectContent>
                  {clients.flatMap((client) =>
                    (client.projects || []).map((project) => (
                      <SelectItem key={project.id} value={project.id}>
                        {project.code} - {project.name} ({client.name})
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>
            <FileUpload
              onFileSelect={setUploadFiles}
              multiple
              accept="image/*,application/pdf,.doc,.docx,.xls,.xlsx,.txt,.csv"
            />
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setIsUploadModalOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleUpload} disabled={!selectedProject || uploadFiles.length === 0}>
                Upload
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Document Viewer */}
      <DocumentViewer
        file={selectedFile}
        open={!!selectedFile}
        onOpenChange={(open) => !open && setSelectedFile(null)}
      />
    </div>
  );
}

