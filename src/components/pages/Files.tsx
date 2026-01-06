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
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';
import Header from '@/components/layout/Header';
import ImageViewer from '@/components/modals/ImageViewer';
import { useAuth } from '@/contexts/AuthContext';
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
  Download,
  Cloud,
  Loader2
} from 'lucide-react';
import { toast } from 'sonner';

interface ProjectWithFiles extends Omit<Project, 'files'> {
  files?: ProjectFile[];
  timesheetImages?: Array<{
    url: string;
    filename: string;
    timesheet_id: string;
    timesheet_date: string;
    upload_date: string;
    user_name: string;
    image_index: number;
  }>;
}

interface ClientWithProjects extends Client {
  projects?: ProjectWithFiles[];
}

interface LogoFile {
  url: string;
  filename: string;
  upload_date: string;
  file_size: number;
}

export default function Files() {
  const { hasPermission } = useAuth();
  const [clients, setClients] = useState<ClientWithProjects[]>([]);
  const [logos, setLogos] = useState<LogoFile[]>([]);
  const [expandedClients, setExpandedClients] = useState<Set<string>>(new Set());
  const [expandedProjects, setExpandedProjects] = useState<Set<string>>(new Set());
  const [expandedTimesheetImages, setExpandedTimesheetImages] = useState<Set<string>>(new Set());
  const [expandedLogos, setExpandedLogos] = useState(false);
  const [selectedProject, setSelectedProject] = useState<ProjectWithFiles | null>(null);
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [selectedFile, setSelectedFile] = useState<ProjectFile | null>(null);
  const [uploadFiles, setUploadFiles] = useState<File[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState<string>('all');
  const [loading, setLoading] = useState(true);
  const [viewingImages, setViewingImages] = useState<string[]>([]);
  const [viewingImageIndex, setViewingImageIndex] = useState(0);
  const [isImageViewerOpen, setIsImageViewerOpen] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<Record<number, number>>({});
  const [cloudStorageProvider, setCloudStorageProvider] = useState<string>('local');

  useEffect(() => {
    loadData();
    loadCloudStorageInfo();
  }, []);

  const loadCloudStorageInfo = async () => {
    try {
      const settings = await api.getSettings();
      setCloudStorageProvider(settings.cloud_storage_provider || 'local');
    } catch (error) {
      console.error('Failed to load cloud storage info:', error);
    }
  };

  const loadData = async () => {
    try {
      setLoading(true);
      const [clientsResponse, projectsResponse, filesData] = await Promise.all([
        api.getClients({ limit: 100 }),
        api.getProjects({ limit: 100 }),
        api.getFiles()
      ]);
      
      // Handle paginated responses
      const clientsData = clientsResponse.data || (Array.isArray(clientsResponse) ? clientsResponse : []);
      const projectsData = projectsResponse.data || (Array.isArray(projectsResponse) ? projectsResponse : []);

      // Load logos if user has permission
      let logosData: LogoFile[] = [];
      if (hasPermission('can_manage_settings')) {
        try {
          logosData = await api.getLogos();
        } catch (error) {
          console.error('Failed to load logos:', error);
        }
      }
      setLogos(logosData);

      // Organize files by project
      const filesByProject = new Map<string, ProjectFile[]>();
      filesData.forEach((file: ProjectFile) => {
        if (!filesByProject.has(file.project_id)) {
          filesByProject.set(file.project_id, []);
        }
        filesByProject.get(file.project_id)!.push(file);
      });

      // Load timesheet images for each project
      const timesheetImagesByProject = new Map<string, any[]>();
      try {
        const projectsWithImages = await api.getTimesheetImages();
        // Load detailed images for each project
        for (const project of projectsData) {
          try {
            const images = await api.getTimesheetImages(project.id);
            if (images && images.length > 0) {
              timesheetImagesByProject.set(project.id, images);
            }
          } catch (error) {
            console.error(`Failed to load timesheet images for project ${project.id}:`, error);
          }
        }
      } catch (error) {
        console.error('Failed to load timesheet images summary:', error);
      }

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
          timesheetImages: timesheetImagesByProject.get(project.id) || [],
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

  const toggleTimesheetImages = (projectId: string) => {
    const newExpanded = new Set(expandedTimesheetImages);
    if (newExpanded.has(projectId)) {
      newExpanded.delete(projectId);
    } else {
      newExpanded.add(projectId);
    }
    setExpandedTimesheetImages(newExpanded);
  };

  const handleViewImage = (imageUrl: string, allImages: string[], index: number) => {
    setViewingImages(allImages);
    setViewingImageIndex(index);
    setIsImageViewerOpen(true);
  };

  const handleDeleteTimesheetImage = async (timesheetId: string, imageIndex: number, projectId: string) => {
    if (!confirm('Delete this image?')) return;

    try {
      await api.deleteTimesheetImage(timesheetId, imageIndex);
      toast.success('Image deleted');
      loadData();
    } catch (error: any) {
      toast.error('Failed to delete image');
      console.error(error);
    }
  };

  const handleDeleteLogo = async (filename: string) => {
    if (!confirm(`Delete ${filename}?`)) return;

    try {
      await api.deleteLogo(filename);
      toast.success('Logo deleted');
      loadData();
    } catch (error: any) {
      toast.error('Failed to delete logo');
      console.error(error);
    }
  };

  const handleUploadLogo = async (file: File) => {
    try {
      await api.uploadCompanyLogo(file);
      toast.success('Logo uploaded');
      loadData();
    } catch (error: any) {
      toast.error('Failed to upload logo');
      console.error(error);
    }
  };

  const handleUpload = async () => {
    if (!selectedProject || uploadFiles.length === 0) {
      toast.error('Please select a project and files');
      return;
    }

    setIsUploading(true);
    setUploadProgress({});
    try {
      // Upload files one by one with progress tracking
      for (let i = 0; i < uploadFiles.length; i++) {
        const file = uploadFiles[i];
        setUploadProgress(prev => ({ ...prev, [i]: 0 }));
        
        // Simulate progress (actual implementation would track real upload progress)
        const progressInterval = setInterval(() => {
          setUploadProgress(prev => {
            const current = prev[i] || 0;
            if (current < 90) {
              return { ...prev, [i]: current + 10 };
            }
            return prev;
          });
        }, 200);

        try {
          await api.uploadProjectFile(file, selectedProject.id);
          setUploadProgress(prev => ({ ...prev, [i]: 100 }));
          clearInterval(progressInterval);
        } catch (error) {
          clearInterval(progressInterval);
          throw error;
        }
      }
      toast.success(`Successfully uploaded ${uploadFiles.length} file${uploadFiles.length !== 1 ? 's' : ''}`);
      setIsUploadModalOpen(false);
      setUploadFiles([]);
      setSelectedProject(null);
      setUploadProgress({});
      loadData();
    } catch (error: any) {
      toast.error(error.message || 'Failed to upload files');
      setUploadProgress({});
      console.error(error);
    } finally {
      setIsUploading(false);
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
      const matchesTimesheetImages = client.projects?.some((p) =>
        p.timesheetImages?.some((img) => img.filename.toLowerCase().includes(searchTerm.toLowerCase()))
      );
      if (!matchesClient && !matchesProjects && !matchesFiles && !matchesTimesheetImages) return false;
    }

    if (filterType !== 'all') {
      const hasMatchingFiles = client.projects?.some((p) =>
        p.files?.some((f) => f.file_type === filterType)
      );
      if (!hasMatchingFiles) return false;
    }

    return true;
  });

  const filteredLogos = logos.filter((logo) => {
    if (searchTerm) {
      return logo.filename.toLowerCase().includes(searchTerm.toLowerCase());
    }
    return true;
  });

  return (
    <div className="flex flex-col h-screen">
      <Header title="Files" />
      <div className="flex-1 overflow-auto p-4 sm:p-6">
        <div className="max-w-7xl mx-auto space-y-4 sm:space-y-6">
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
              <div className="flex items-center gap-2">
                {cloudStorageProvider !== 'local' && (
                  <Badge variant="outline" className="flex items-center gap-1">
                    <Cloud className="w-3 h-3" />
                    {cloudStorageProvider === 's3' ? 'AWS S3' : cloudStorageProvider === 'google-drive' ? 'Google Drive' : 'Cloud Storage'}
                  </Badge>
                )}
                <Button onClick={() => setIsUploadModalOpen(true)} disabled={isUploading}>
                  {isUploading ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Uploading...
                    </>
                  ) : (
                    <>
                      <Upload className="w-4 h-4 mr-2" />
                      Upload Files
                    </>
                  )}
                </Button>
              </div>
            </div>
          </Card>

          {/* File Tree */}
          <Card className="p-6">
            <h2 className="text-lg font-bold mb-4 font-mono uppercase">File Hierarchy</h2>
            {loading ? (
              <p className="text-muted-foreground">Loading...</p>
            ) : (
              <div className="space-y-2">
                {/* Logos Section */}
                {hasPermission('can_manage_settings') && (
                  <div className="border border-border rounded-lg mb-4">
                    <button
                      onClick={() => setExpandedLogos(!expandedLogos)}
                      className="w-full flex items-center gap-2 p-3 hover:bg-muted/50 transition-colors text-left"
                    >
                      {expandedLogos ? (
                        <ChevronDown className="w-4 h-4" />
                      ) : (
                        <ChevronRight className="w-4 h-4" />
                      )}
                      <FolderOpen className="w-4 h-4 text-electric" />
                      <span className="font-medium">Logos</span>
                      <Badge variant="outline" className="ml-auto">
                        {filteredLogos.length} files
                      </Badge>
                    </button>

                        {expandedLogos && (
                      <div className="pl-6 border-t border-border">
                        {filteredLogos.length > 0 ? (
                          <div className="divide-y divide-border">
                            {filteredLogos.map((logo) => (
                              <div
                                key={logo.filename}
                                className="flex items-center gap-3 p-3 hover:bg-muted/50 transition-colors"
                              >
                                <ImageIcon className="w-4 h-4" />
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm font-medium truncate">{logo.filename}</p>
                                  <p className="text-xs text-muted-foreground">
                                    {formatFileSize(logo.file_size)} • {new Date(logo.upload_date).toLocaleDateString()}
                                  </p>
                                </div>
                                <div className="flex items-center gap-2">
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => handleViewImage(logo.url, [logo.url], 0)}
                                  >
                                    <Eye className="w-4 h-4" />
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => handleDeleteLogo(logo.filename)}
                                  >
                                    <Trash2 className="w-4 h-4 text-destructive" />
                                  </Button>
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p className="p-3 text-sm text-muted-foreground">
                            {searchTerm ? 'No logos match your search' : 'No logos'}
                          </p>
                        )}
                        <div className="p-3 border-t border-border">
                          <FileUpload
                            onFileSelect={(files) => {
                              if (files.length > 0) {
                                handleUploadLogo(files[0]);
                              }
                            }}
                            accept="image/*"
                          />
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {filteredClients.length === 0 ? (
                  <p className="text-muted-foreground">No files found</p>
                ) : (
                  filteredClients.map((client) => (
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
                              <div className="pl-6 bg-muted/20 space-y-2">
                                {/* Project Files */}
                                <div>
                                  <p className="text-xs font-medium text-muted-foreground px-3 py-2 uppercase">Files</p>
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

                                {/* Timesheet Images */}
                                {project.timesheetImages && project.timesheetImages.length > 0 && (
                                  <div className="border-t border-border pt-2">
                                    <button
                                      onClick={() => toggleTimesheetImages(project.id)}
                                      className="w-full flex items-center gap-2 p-2 hover:bg-muted/30 transition-colors text-left"
                                    >
                                      {expandedTimesheetImages.has(project.id) ? (
                                        <ChevronDown className="w-3 h-3" />
                                      ) : (
                                        <ChevronRight className="w-3 h-3" />
                                      )}
                                      <ImageIcon className="w-3 h-3 text-voltage" />
                                      <span className="text-xs font-medium">Timesheet Images</span>
                                      <Badge variant="outline" className="ml-auto text-xs">
                                        {project.timesheetImages.length}
                                      </Badge>
                                    </button>

                                    {expandedTimesheetImages.has(project.id) && (
                                      <div className="pl-6 mt-2">
                                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                                          {project.timesheetImages.map((image, idx) => {
                                            const allImageUrls = project.timesheetImages!.map(img => img.url);
                                            return (
                                              <div
                                                key={`${image.timesheet_id}-${image.image_index}`}
                                                className="relative group border border-border rounded-lg overflow-hidden hover:border-electric transition-colors"
                                              >
                                                <img
                                                  src={image.url}
                                                  alt={image.filename}
                                                  className="w-full h-24 object-cover cursor-pointer"
                                                  onClick={() => handleViewImage(image.url, allImageUrls, idx)}
                                                />
                                                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/50 transition-colors flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100">
                                                  <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    className="h-8 text-white hover:bg-white/20"
                                                    onClick={(e) => {
                                                      e.stopPropagation();
                                                      handleViewImage(image.url, allImageUrls, idx);
                                                    }}
                                                  >
                                                    <Eye className="w-3 h-3" />
                                                  </Button>
                                                  <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    className="h-8 text-white hover:bg-red-500/20"
                                                    onClick={(e) => {
                                                      e.stopPropagation();
                                                      handleDeleteTimesheetImage(image.timesheet_id, image.image_index, project.id);
                                                    }}
                                                  >
                                                    <Trash2 className="w-3 h-3" />
                                                  </Button>
                                                </div>
                                                <div className="absolute bottom-0 left-0 right-0 bg-black/70 text-white text-xs p-1 truncate">
                                                  {image.filename}
                                                </div>
                                              </div>
                                            );
                                          })}
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))
                )}
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
              disabled={isUploading}
            />
            
            {/* Upload Progress */}
            {isUploading && uploadFiles.length > 0 && (
              <div className="space-y-2 pt-2">
                <p className="text-sm font-medium">Upload Progress</p>
                {uploadFiles.map((file, index) => (
                  <div key={index} className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="truncate flex-1 mr-2">{file.name}</span>
                      <span className="text-muted-foreground">
                        {uploadProgress[index] || 0}%
                      </span>
                    </div>
                    <Progress value={uploadProgress[index] || 0} className="h-2" />
                  </div>
                ))}
              </div>
            )}
            
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setIsUploadModalOpen(false)} disabled={isUploading}>
                Cancel
              </Button>
              <Button 
                onClick={handleUpload} 
                disabled={!selectedProject || uploadFiles.length === 0 || isUploading}
                className="bg-electric text-background hover:bg-electric/90"
              >
                {isUploading ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Uploading...
                  </>
                ) : (
                  <>
                    <Upload className="w-4 h-4 mr-2" />
                    Upload {uploadFiles.length > 0 && `(${uploadFiles.length})`}
                  </>
                )}
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

      {/* Image Viewer */}
      <ImageViewer
        images={viewingImages}
        currentIndex={viewingImageIndex}
        open={isImageViewerOpen}
        onOpenChange={setIsImageViewerOpen}
        showDelete={false}
      />
    </div>
  );
}

