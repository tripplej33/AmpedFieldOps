import { useState, useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import Header from '@/components/layout/Header';
import { Card } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { api } from '@/lib/api';
import { TimesheetEntry, Client, Project, ActivityType, CostCenter, User } from '@/types';
import { Plus, Calendar, Clock, Wrench, Pencil, Trash2, Loader2, Camera, Image, X, ChevronLeft, ChevronRight, Users } from 'lucide-react';
import ImageViewer from '@/components/modals/ImageViewer';
import { Pagination } from '@/components/ui/pagination';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { useNotifications } from '@/contexts/NotificationContext';

// Activity type entry interface (moved outside component for type accessibility)
interface ActivityTypeEntry {
  id: string; // temporary ID for the entry
  activity_type_id: string;
  cost_center_id: string;
  hours: string;
  user_ids: string[]; // Multiple users can be assigned to one activity type
  user_hours: Record<string, string>; // Hours per user for this activity type
  notes: string;
}

export default function Timesheets() {
  const location = useLocation();
  const navigate = useNavigate();
  const { notifySuccess, logError } = useNotifications();
  const [entries, setEntries] = useState<TimesheetEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editingEntry, setEditingEntry] = useState<TimesheetEntry | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // View controls
  const [viewDate, setViewDate] = useState(new Date());
  const [selectedUserId, setSelectedUserId] = useState<string>('all');

  // Image viewer state
  const [imageViewerOpen, setImageViewerOpen] = useState(false);
  const [viewingImages, setViewingImages] = useState<string[]>([]);
  const [viewingImageIndex, setViewingImageIndex] = useState(0);
  const [viewingEntryId, setViewingEntryId] = useState<string | null>(null);

  // Form data
  const [clients, setClients] = useState<Client[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [activityTypes, setActivityTypes] = useState<ActivityType[]>([]);
  const [costCenters, setCostCenters] = useState<CostCenter[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [imageFiles, setImageFiles] = useState<File[]>([]);
  const [imagePreviews, setImagePreviews] = useState<string[]>([]);
  const [uploadProgress, setUploadProgress] = useState<Record<number, number>>({});
  const [isDragging, setIsDragging] = useState(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const cameraInputRef = useRef<HTMLInputElement | null>(null);
  const dropZoneRef = useRef<HTMLDivElement | null>(null);

  const [formData, setFormData] = useState({
    client_id: '',
    project_id: '',
    date: new Date().toISOString().split('T')[0],
    notes: '', // General notes
    activity_entries: [] as ActivityTypeEntry[],
  });

  // Pagination state
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [pagination, setPagination] = useState<{
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  } | null>(null);

  useEffect(() => {
    loadTimesheets();
  }, [page, limit, selectedUserId]);

  useEffect(() => {
    loadFormData();
    loadUsers();
  }, []);

  // Handle URL parameters for opening specific timesheet
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const entryId = params.get('id');
    if (entryId && entries.length > 0) {
      const entry = entries.find(e => e.id === entryId);
      if (entry) {
        handleEdit(entry);
        // Clear the URL param
        navigate('/timesheets', { replace: true });
      }
    }
  }, [location.search, entries, navigate]);

  const loadTimesheets = async () => {
    setIsLoading(true);
    try {
      const data = await api.getTimesheets();
      setEntries(Array.isArray(data) ? data : []);
    } catch (error: any) {
      console.error('Failed to load timesheets:', error);
      if (error?.message !== 'Failed to fetch') {
        toast.error('Failed to load timesheets');
      }
      setEntries([]);
    } finally {
      setIsLoading(false);
    }
  };

  const loadUsers = async () => {
    try {
      const data = await api.getUsers();
      const usersList = data.data || (Array.isArray(data) ? data : []);
      setUsers(Array.isArray(usersList) ? usersList.filter(u => u.id) : []);
    } catch (error) {
      console.error('Failed to load users:', error);
      toast.error('Failed to load users');
      setUsers([]);
    }
  };

  const loadFormData = async () => {
    try {
      const [clientsResponse, activityData] = await Promise.all([
        api.getClients({ limit: 100 }).catch(() => ({ data: [] })),
        api.getActivityTypes(true).catch(() => []),
      ]);
      
      // Handle paginated clients response
      const clientsData = clientsResponse.data || (Array.isArray(clientsResponse) ? clientsResponse : []);
      setClients(Array.isArray(clientsData) ? clientsData.filter(c => c.id) : []);
      setActivityTypes(Array.isArray(activityData) ? activityData.filter(a => a.id) : []);
      setCostCenters([]); // Cost centers are now loaded per-project
    } catch (error) {
      console.error('Failed to load form data:', error);
      toast.error('Failed to load form data');
      setClients([]);
      setActivityTypes([]);
      setCostCenters([]);
    }
  };

  const handleClientChange = async (clientId: string) => {
    setFormData({ ...formData, client_id: clientId, project_id: '' });
    setCostCenters([]); // Reset cost centers when client changes
    if (clientId) {
      try {
        const projectsResponse = await api.getProjects({ client_id: clientId, limit: 100 });
        const projectsData = projectsResponse.data || (Array.isArray(projectsResponse) ? projectsResponse : []);
        setProjects(Array.isArray(projectsData) ? projectsData.filter(p => p.id) : []);
      } catch (error) {
        setProjects([]);
      }
    } else {
      setProjects([]);
    }
  };

  const handleProjectChange = async (projectId: string) => {
    // Reset cost centers in all activity entries when project changes
    setFormData(prev => ({
      ...prev,
      project_id: projectId,
      activity_entries: prev.activity_entries.map(entry => ({
        ...entry,
        cost_center_id: '' // Reset cost center when project changes
      }))
    }));
    if (projectId) {
      try {
        const costCenterData = await api.getCostCenters(true, projectId);
        setCostCenters(Array.isArray(costCenterData) ? costCenterData.filter(cc => cc.id) : []);
      } catch (error) {
        setCostCenters([]);
      }
    } else {
      setCostCenters([]);
    }
  };

  const resetForm = () => {
    setFormData({
      client_id: '',
      project_id: '',
      date: new Date().toISOString().split('T')[0],
      notes: '',
      activity_entries: [],
    });
    setEditingEntry(null);
    setImageFiles([]);
    setImagePreviews([]);
    setUploadProgress({});
    setIsDragging(false);
    setCostCenters([]); // Reset cost centers
  };

  // Image handling with validation
  const validateAndAddFiles = (files: File[]) => {
    const validFiles: File[] = [];
    const errors: string[] = [];

    files.forEach((file, index) => {
      // Check file count
      if (imageFiles.length + validFiles.length >= 5) {
        errors.push(`Maximum 5 images allowed. Skipping remaining files.`);
        return;
      }

      // Check file size (10MB limit)
      if (file.size > 10 * 1024 * 1024) {
        errors.push(`${file.name} is too large (max 10MB)`);
        return;
      }

      // Check file type
      if (!file.type.startsWith('image/')) {
        errors.push(`${file.name} is not an image file`);
        return;
      }

      validFiles.push(file);
    });

    // Show errors if any
    if (errors.length > 0) {
      errors.forEach(error => toast.error(error));
    }

    // Add valid files
    if (validFiles.length > 0) {
      validFiles.forEach(file => {
        const reader = new FileReader();
        reader.onloadend = () => {
          setImagePreviews(prev => [...prev, reader.result as string]);
        };
        reader.readAsDataURL(file);
      });
      
      setImageFiles(prev => [...prev, ...validFiles]);
    }

    return validFiles.length;
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    validateAndAddFiles(files);
    if (e.target) e.target.value = '';
  };

  // Drag and drop handlers
  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.currentTarget === dropZoneRef.current) {
      setIsDragging(false);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const files = Array.from(e.dataTransfer.files);
    validateAndAddFiles(files);
  };

  const removeImage = (index: number) => {
    setImageFiles(prev => prev.filter((_, i) => i !== index));
    setImagePreviews(prev => prev.filter((_, i) => i !== index));
  };

  // Week navigation
  const getWeekStart = (date: Date) => {
    const d = new Date(date);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    d.setDate(diff);
    return d;
  };

  const navigateWeek = (direction: 'prev' | 'next') => {
    setViewDate(prev => {
      const newDate = new Date(prev);
      newDate.setDate(newDate.getDate() + (direction === 'next' ? 7 : -7));
      return newDate;
    });
  };

  const goToToday = () => {
    setViewDate(new Date());
  };

  // Activity entry management functions
  const addActivityEntry = () => {
    const newEntry: ActivityTypeEntry = {
      id: `entry-${Date.now()}-${Math.random()}`,
      activity_type_id: '',
      cost_center_id: '',
      hours: '',
      user_ids: [],
      user_hours: {},
      notes: '',
    };
    setFormData(prev => ({
      ...prev,
      activity_entries: [...prev.activity_entries, newEntry]
    }));
  };

  const removeActivityEntry = (entryId: string) => {
    setFormData(prev => ({
      ...prev,
      activity_entries: prev.activity_entries.filter(e => e.id !== entryId)
    }));
  };

  const updateActivityEntry = (entryId: string, updates: Partial<ActivityTypeEntry>) => {
    setFormData(prev => ({
      ...prev,
      activity_entries: prev.activity_entries.map(e => 
        e.id === entryId ? { ...e, ...updates } : e
      )
    }));
  };

  const toggleUserForActivity = (entryId: string, userId: string) => {
    setFormData(prev => ({
      ...prev,
      activity_entries: prev.activity_entries.map(e => {
        if (e.id !== entryId) return e;
        const isSelected = e.user_ids.includes(userId);
        const newUserIds = isSelected 
          ? e.user_ids.filter(id => id !== userId)
          : [...e.user_ids, userId];
        const newUserHours = { ...e.user_hours };
        if (isSelected) {
          delete newUserHours[userId];
        } else {
          newUserHours[userId] = e.hours || '';
        }
        return { ...e, user_ids: newUserIds, user_hours: newUserHours };
      })
    }));
  };

  const updateUserHoursForActivity = (entryId: string, userId: string, hours: string) => {
    setFormData(prev => ({
      ...prev,
      activity_entries: prev.activity_entries.map(e => 
        e.id === entryId 
          ? { ...e, user_hours: { ...e.user_hours, [userId]: hours } }
          : e
      )
    }));
  };

  const handleCreate = async () => {
    // Validate base required fields
    if (!formData.project_id) {
      toast.error('Please select a project');
      return;
    }

    if (formData.activity_entries.length === 0) {
      toast.error('Please add at least one activity type');
      return;
    }

    // Validate each activity entry
    for (const entry of formData.activity_entries) {
      if (!entry.activity_type_id) {
        toast.error('Please select an activity type for all entries');
        return;
      }
      if (!entry.cost_center_id) {
        toast.error('Please select a cost center for all entries');
        return;
      }

      // If users are assigned, validate hours for each user
      if (entry.user_ids.length > 0) {
        const missingHours = entry.user_ids.filter(
          userId => !entry.user_hours[userId] || parseFloat(entry.user_hours[userId]) <= 0
        );
        if (missingHours.length > 0) {
          toast.error('Please enter hours for all assigned users');
          return;
        }
      } else if (!entry.hours || parseFloat(entry.hours) <= 0) {
        toast.error('Please enter hours for all activity types');
        return;
      }
    }

    setIsSubmitting(true);
    try {
      let createdCount = 0;

      // Create timesheet entries for each activity type
      for (const entry of formData.activity_entries) {
        // If users are assigned, create an entry for each user
        if (entry.user_ids.length > 0) {
          for (const userId of entry.user_ids) {
            const hours = parseFloat(entry.user_hours[userId]);
            await api.createTimesheet({
              project_id: formData.project_id,
              activity_type_id: entry.activity_type_id,
              cost_center_id: entry.cost_center_id,
              date: formData.date,
              hours: hours,
              notes: entry.notes || formData.notes,
              user_id: userId,
              image_files: imageFiles,
            });
            createdCount++;
          }
        } else {
          // No users assigned, create entry for current user
          await api.createTimesheet({
            project_id: formData.project_id,
            activity_type_id: entry.activity_type_id,
            cost_center_id: entry.cost_center_id,
            date: formData.date,
            hours: parseFloat(entry.hours),
            notes: entry.notes || formData.notes,
            image_files: imageFiles,
          });
          createdCount++;
        }
      }

      toast.success(`Created ${createdCount} timesheet entr${createdCount !== 1 ? 'ies' : 'y'}`);
      setCreateModalOpen(false);
      resetForm();
      loadTimesheets();
    } catch (error: any) {
      toast.error(error.message || 'Failed to create entries');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEdit = async (entry: TimesheetEntry) => {
    // Check if timesheet is billed or paid - cannot edit
    const billingStatus = entry.billing_status || 'unbilled';
    if (billingStatus === 'billed' || billingStatus === 'paid') {
      toast.error(`Cannot edit timesheet that has been ${billingStatus}`);
      return;
    }
    setEditingEntry(entry);
    
    // Load projects for the client
    if (entry.client_id) {
      try {
        const projectsData = await api.getProjects({ client_id: entry.client_id });
        setProjects(Array.isArray(projectsData) ? projectsData : []);
      } catch (error) {
        setProjects([]);
      }
    }
    
    // Load cost centers for the project
    if (entry.project_id) {
      try {
        const costCenterData = await api.getCostCenters(true, entry.project_id);
        setCostCenters(Array.isArray(costCenterData) ? costCenterData : []);
      } catch (error) {
        setCostCenters([]);
      }
    }
    
    // Load image previews from existing image URLs
    const existingImageUrls = entry.image_urls || [];
    setImagePreviews(existingImageUrls);
    setImageFiles([]); // Clear any new files, we'll handle existing images separately
    
    // Populate user_ids and user_hours if the entry has a user_id
    const user_ids = entry.user_id ? [entry.user_id] : [];
    const user_hours = entry.user_id ? { [entry.user_id]: entry.hours.toString() } : {};
    
    setFormData({
      client_id: entry.client_id || '',
      project_id: entry.project_id,
      date: entry.date,
      notes: entry.notes || '',
      activity_entries: [{
        id: `entry-${Date.now()}`,
        activity_type_id: entry.activity_type_id,
        cost_center_id: entry.cost_center_id,
        hours: entry.hours.toString(),
        user_ids: user_ids,
        user_hours: user_hours,
        notes: entry.notes || '',
      }],
    });
    
    setEditModalOpen(true);
  };

  const handleUpdate = async () => {
    if (!editingEntry) return;
    if (formData.activity_entries.length === 0) {
      toast.error('Please fill in all required fields');
      return;
    }
    const entry = formData.activity_entries[0];
    if (!formData.project_id || !entry.activity_type_id || !entry.cost_center_id) {
      toast.error('Please fill in all required fields');
      return;
    }

    // Validate hours - either entry.hours or user_hours must be provided
    if (entry.user_ids.length > 0) {
      const missingHours = entry.user_ids.filter(
        userId => !entry.user_hours[userId] || parseFloat(entry.user_hours[userId]) <= 0
      );
      if (missingHours.length > 0) {
        toast.error('Please enter hours for all assigned users');
        return;
      }
    } else if (!entry.hours || parseFloat(entry.hours) <= 0) {
      toast.error('Please enter hours for the activity');
      return;
    }

    setIsSubmitting(true);
    try {
      // For updates, we only update the first activity entry (single timesheet entry)
      // If users are assigned, use the first user's hours
      const hours = entry.user_ids.length > 0 
        ? parseFloat(entry.user_hours[entry.user_ids[0]]) 
        : parseFloat(entry.hours);
      
      const userId = entry.user_ids.length > 0 ? entry.user_ids[0] : editingEntry.user_id;
      
      // If there are new image files, use FormData
      if (imageFiles.length > 0) {
        const formDataToSend = new FormData();
        formDataToSend.append('project_id', formData.project_id);
        formDataToSend.append('activity_type_id', entry.activity_type_id);
        formDataToSend.append('cost_center_id', entry.cost_center_id);
        formDataToSend.append('date', formData.date);
        formDataToSend.append('hours', hours.toString());
        if (userId) formDataToSend.append('user_id', userId);
        if (entry.notes || formData.notes) {
          formDataToSend.append('notes', entry.notes || formData.notes);
        }
        // Include all required fields in FormData
        formDataToSend.append('project_id', formData.project_id);
        formDataToSend.append('activity_type_id', entry.activity_type_id);
        formDataToSend.append('cost_center_id', entry.cost_center_id);
        formDataToSend.append('date', formData.date);
        formDataToSend.append('hours', hours.toString());
        if (entry.notes || formData.notes) {
          formDataToSend.append('notes', entry.notes || formData.notes);
        }
        if (userId) {
          formDataToSend.append('user_id', userId);
        }
        
        // Include existing image URLs
        if (imagePreviews.length > 0) {
          formDataToSend.append('image_urls', JSON.stringify(imagePreviews));
        }
        
        imageFiles.forEach((file) => {
          formDataToSend.append('images', file);
        });
        
        await api.updateTimesheet(editingEntry.id, formDataToSend);
      } else {
        // No new images, just update the data
        await api.updateTimesheet(editingEntry.id, {
          project_id: formData.project_id,
          activity_type_id: entry.activity_type_id,
          cost_center_id: entry.cost_center_id,
          date: formData.date,
          hours: hours,
          user_id: userId,
          notes: entry.notes || formData.notes,
          image_urls: imagePreviews, // Keep existing images
        });
      }
      
      toast.success('Timesheet entry updated');
      setEditModalOpen(false);
      resetForm();
      loadTimesheets();
    } catch (error: any) {
      toast.error(error.message || 'Failed to update entry');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (entry: TimesheetEntry) => {
    // Check if timesheet is billed or paid - cannot delete
    const billingStatus = entry.billing_status || 'unbilled';
    if (billingStatus === 'billed' || billingStatus === 'paid') {
      toast.error(`Cannot delete timesheet that has been ${billingStatus}`);
      return;
    }

    if (!confirm('Are you sure you want to delete this entry?')) return;

    try {
      await api.deleteTimesheet(entry.id);
      toast.success('Timesheet entry deleted');
      loadTimesheets();
    } catch (error: any) {
      toast.error(error.message || 'Failed to delete entry');
    }
  };

  // Filter entries by selected user
  const filteredEntries = selectedUserId === 'all' 
    ? entries 
    : entries.filter(e => e.user_id === selectedUserId);

  // Group entries by date
  const groupedEntries = filteredEntries.reduce((acc, entry) => {
    const date = entry.date;
    if (!acc[date]) acc[date] = [];
    acc[date].push(entry);
    return acc;
  }, {} as Record<string, TimesheetEntry[]>);

  // Filter dates to current view week
  const weekStart = getWeekStart(viewDate);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 6);
  
  const weekDates: string[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + i);
    weekDates.push(d.toISOString().split('T')[0]);
  }

  const dates = Object.keys(groupedEntries)
    .filter(date => date >= weekDates[0] && date <= weekDates[6])
    .sort((a, b) => new Date(b).getTime() - new Date(a).getTime());
  
  const totalHoursThisWeek = filteredEntries
    .filter(e => e.date >= weekDates[0] && e.date <= weekDates[6])
    .reduce((sum, e) => sum + parseFloat(String(e.hours)), 0);

  if (isLoading) {
    return (
      <>
        <Header title="Timesheet Management" subtitle="Track and manage team hours and activities" />
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-8 h-8 animate-spin text-electric" />
        </div>
      </>
    );
  }

  return (
    <>
      <Header title="Timesheet Management" subtitle="Track and manage team hours and activities" />

      <div className="p-4 sm:p-6 lg:p-8 max-w-[1400px] mx-auto">
        {/* Actions Bar */}
        <div className="mb-6 flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-4 flex-wrap">
            {/* Week Navigation */}
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => navigateWeek('prev')}>
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <Button variant="outline" size="sm" onClick={goToToday}>
                <Calendar className="w-4 h-4 mr-2" />
                Today
              </Button>
              <Button variant="outline" size="sm" onClick={() => navigateWeek('next')}>
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
            
            {/* User Filter */}
            <Select value={selectedUserId} onValueChange={setSelectedUserId}>
              <SelectTrigger className="w-[180px]">
                <Users className="w-4 h-4 mr-2" />
                <SelectValue placeholder="All Technicians" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Technicians</SelectItem>
                {users.map((user) => (
                  <SelectItem key={user.id} value={user.id}>
                    {user.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <div className="text-sm font-mono text-muted-foreground">
              Total Hours: <span className="text-foreground font-bold">{totalHoursThisWeek.toFixed(1)}</span>
            </div>
          </div>
          <Button 
            className="bg-electric text-background hover:bg-electric/90 glow-primary"
            onClick={() => setCreateModalOpen(true)}
          >
            <Plus className="w-4 h-4 mr-2" />
            New Entry
          </Button>
        </div>

        {/* Week Display Header */}
        <div className="mb-4">
          <h3 className="text-lg font-bold">
            Week of {weekStart.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
          </h3>
        </div>

        {/* Weekly Calendar View */}
        <Card className="p-6 bg-card border-border mb-6">
          <div className="grid grid-cols-7 gap-2 mb-4">
            {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((day) => (
              <div key={day} className="text-center">
                <p className="text-xs font-mono text-muted-foreground uppercase tracking-wider">{day}</p>
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-2">
            {weekDates.map((dateStr, i) => {
              const date = new Date(dateStr);
              const dayEntries = groupedEntries[dateStr] || [];
              const totalHours = dayEntries.reduce((sum, e) => sum + parseFloat(String(e.hours)), 0);
              const isToday = dateStr === new Date().toISOString().split('T')[0];

              return (
                <div
                  key={i}
                  className={cn(
                    'p-3 rounded-lg border transition-all cursor-pointer',
                    isToday
                      ? 'bg-electric/10 border-electric'
                      : dayEntries.length > 0
                      ? 'bg-muted/30 border-border hover:border-electric'
                      : 'bg-muted/10 border-border hover:border-muted'
                  )}
                  onClick={() => {
                    setFormData(prev => ({ ...prev, date: dateStr }));
                    setCreateModalOpen(true);
                  }}
                >
                  <p className="text-lg font-bold font-mono text-center mb-1">{date.getDate()}</p>
                  {totalHours > 0 && (
                    <p className="text-xs font-mono text-center text-electric">{totalHours}h</p>
                  )}
                </div>
              );
            })}
          </div>
        </Card>

        {/* Technician Summary (when viewing all) */}
        {selectedUserId === 'all' && users.length > 0 && (
          <Card className="p-6 bg-card border-border mb-6">
            <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
              <Users className="w-5 h-5 text-electric" />
              Technician Hours This Week
            </h3>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {users.map((user) => {
                const userHours = filteredEntries
                  .filter(e => e.user_id === user.id && e.date >= weekDates[0] && e.date <= weekDates[6])
                  .reduce((sum, e) => sum + parseFloat(String(e.hours)), 0);
                
                return (
                  <div 
                    key={user.id} 
                    className={cn(
                      "p-4 rounded-lg border cursor-pointer transition-all hover:border-electric",
                      selectedUserId === user.id ? "border-electric bg-electric/10" : "border-border"
                    )}
                    onClick={() => setSelectedUserId(user.id)}
                  >
                    <p className="font-semibold text-sm truncate">{user.name}</p>
                    <p className="text-2xl font-bold font-mono text-electric">{userHours.toFixed(1)}h</p>
                  </div>
                );
              })}
            </div>
          </Card>
        )}

        {/* Timesheet Entries */}
        <div className="space-y-6">
          {dates.length === 0 && (
            <Card className="p-8 bg-card border-border">
              <p className="text-center text-muted-foreground">No timesheet entries found</p>
            </Card>
          )}
          {dates.map((date) => {
            const dateEntries = groupedEntries[date];
            const totalHours = dateEntries.reduce((sum, e) => sum + parseFloat(String(e.hours)), 0);

            return (
              <div key={date}>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-lg font-bold">
                    {new Date(date).toLocaleDateString('en-US', {
                      weekday: 'long',
                      month: 'long',
                      day: 'numeric',
                      year: 'numeric',
                    })}
                  </h3>
                  <div className="flex items-center gap-2">
                    <Clock className="w-4 h-4 text-electric" />
                    <span className="font-mono font-bold text-electric">{totalHours}h total</span>
                  </div>
                </div>

                <div className="space-y-3">
                  {dateEntries.map((entry) => (
                    <Card
                      key={entry.id}
                      className="p-4 bg-card border-border hover:border-electric transition-all group"
                    >
                      <div className="flex items-start gap-4">
                        <div className="w-10 h-10 rounded-lg border-2 flex items-center justify-center bg-electric/20 border-electric text-electric">
                          <Wrench className="w-5 h-5" />
                        </div>

                        <div className="flex-1">
                          <div className="flex items-start justify-between mb-2">
                            <div>
                              <h4 className="font-semibold text-foreground group-hover:text-electric transition-colors">
                                {entry.project_name}
                              </h4>
                              <p className="text-sm text-muted-foreground">
                                {entry.client_name} • {entry.user_name}
                              </p>
                            </div>
                            <div className="flex items-center gap-2">
                              <Badge variant="outline" className="font-mono">
                                {entry.cost_center_code}
                              </Badge>
                              <span className="text-lg font-bold font-mono text-electric">{entry.hours}h</span>
                            </div>
                          </div>

                          <p className="text-sm text-muted-foreground mb-3">{entry.notes}</p>

                          {/* Show images if any */}
                          {entry.image_urls && entry.image_urls.length > 0 && (
                            <div className="flex gap-2 mb-3 flex-wrap">
                              {entry.image_urls.map((url, idx) => (
                                <button
                                  key={idx}
                                  onClick={() => {
                                    setViewingImages(entry.image_urls);
                                    setViewingImageIndex(idx);
                                    setViewingEntryId(entry.id);
                                    setImageViewerOpen(true);
                                  }}
                                  className="w-16 h-16 rounded border border-border overflow-hidden hover:border-electric transition-colors group relative"
                                >
                                  <img 
                                    src={url} 
                                    alt={`Photo ${idx + 1}`} 
                                    className="w-full h-full object-cover" 
                                  />
                                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center">
                                    <Image className="w-4 h-4 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                                  </div>
                                </button>
                              ))}
                            </div>
                          )}

                          <div className="flex items-center justify-between">
                            <Badge className="capitalize bg-electric/20 text-electric border-electric/30">
                              {entry.activity_type_name}
                            </Badge>

                            <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                              <Button 
                                variant="ghost" 
                                size="sm" 
                                className="h-8"
                                onClick={() => handleEdit(entry)}
                              >
                                <Pencil className="w-3 h-3" />
                              </Button>
                              <Button 
                                variant="ghost" 
                                size="sm" 
                                className="h-8 text-destructive hover:text-destructive"
                                onClick={() => handleDelete(entry)}
                              >
                                <Trash2 className="w-3 h-3" />
                              </Button>
                            </div>
                          </div>
                        </div>
                      </div>
                    </Card>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Create Timesheet Modal */}
      <Dialog open={createModalOpen} onOpenChange={setCreateModalOpen}>
        <DialogContent className="max-w-[95vw] sm:max-w-[600px] bg-card border-border">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold">New Timesheet Entry</DialogTitle>
            <DialogDescription>Log hours for a project</DialogDescription>
          </DialogHeader>

          <TimesheetForm
            formData={formData}
            setFormData={setFormData}
            clients={clients}
            projects={projects}
            activityTypes={activityTypes}
            costCenters={costCenters}
            users={users}
            imagePreviews={imagePreviews}
            removeImage={removeImage}
            fileInputRef={fileInputRef}
            cameraInputRef={cameraInputRef}
            dropZoneRef={dropZoneRef}
            handleFileSelect={handleFileSelect}
            handleClientChange={handleClientChange}
            handleProjectChange={handleProjectChange}
            onSubmit={handleCreate}
            onCancel={() => { setCreateModalOpen(false); resetForm(); }}
            isSubmitting={isSubmitting}
            submitLabel="Create Entry"
            addActivityEntry={addActivityEntry}
            removeActivityEntry={removeActivityEntry}
            updateActivityEntry={updateActivityEntry}
            toggleUserForActivity={toggleUserForActivity}
            updateUserHoursForActivity={updateUserHoursForActivity}
            isDragging={isDragging}
            uploadProgress={uploadProgress}
            imageFiles={imageFiles}
            handleDragEnter={handleDragEnter}
            handleDragLeave={handleDragLeave}
            handleDragOver={handleDragOver}
            handleDrop={handleDrop}
          />
        </DialogContent>
      </Dialog>

      {/* Edit Timesheet Modal */}
      <Dialog open={editModalOpen} onOpenChange={setEditModalOpen}>
        <DialogContent className="max-w-[95vw] sm:max-w-[600px] bg-card border-border">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold">Edit Timesheet Entry</DialogTitle>
            <DialogDescription>Update timesheet details</DialogDescription>
          </DialogHeader>

          <TimesheetForm
            formData={formData}
            setFormData={setFormData}
            clients={clients}
            projects={projects}
            activityTypes={activityTypes}
            costCenters={costCenters}
            users={users}
            imagePreviews={imagePreviews}
            removeImage={removeImage}
            fileInputRef={fileInputRef}
            cameraInputRef={cameraInputRef}
            dropZoneRef={dropZoneRef}
            handleFileSelect={handleFileSelect}
            handleClientChange={handleClientChange}
            handleProjectChange={handleProjectChange}
            onSubmit={handleUpdate}
            onCancel={() => { setEditModalOpen(false); resetForm(); }}
            isSubmitting={isSubmitting}
            submitLabel="Save Changes"
            addActivityEntry={addActivityEntry}
            removeActivityEntry={removeActivityEntry}
            updateActivityEntry={updateActivityEntry}
            toggleUserForActivity={toggleUserForActivity}
            updateUserHoursForActivity={updateUserHoursForActivity}
            isDragging={isDragging}
            uploadProgress={uploadProgress}
            imageFiles={imageFiles}
            handleDragEnter={handleDragEnter}
            handleDragLeave={handleDragLeave}
            handleDragOver={handleDragOver}
            handleDrop={handleDrop}
          />
        </DialogContent>
      </Dialog>

      {/* Image Viewer Modal */}
      <ImageViewer
        images={viewingImages}
        currentIndex={viewingImageIndex}
        open={imageViewerOpen}
        onOpenChange={setImageViewerOpen}
        onDelete={viewingEntryId ? async (index) => {
          try {
            await api.deleteTimesheetImage(viewingEntryId, index);
            toast.success('Image deleted');
            // Update local state
            const updatedImages = [...viewingImages];
            updatedImages.splice(index, 1);
            setViewingImages(updatedImages);
            // Update entry in list
            setEntries(prev => prev.map(e => 
              e.id === viewingEntryId 
                ? { ...e, image_urls: updatedImages }
                : e
            ));
            // If no images left, close viewer
            if (updatedImages.length === 0) {
              setImageViewerOpen(false);
            } else if (index >= updatedImages.length) {
              setViewingImageIndex(updatedImages.length - 1);
            }
          } catch (error: any) {
            toast.error(error.message || 'Failed to delete image');
          }
        } : undefined}
        showDelete={!!viewingEntryId}
      />
    </>
  );
}

// Reusable form component
function TimesheetForm({
  formData,
  setFormData,
  clients,
  projects,
  activityTypes,
  costCenters,
  users,
  imagePreviews,
  removeImage,
  fileInputRef,
  cameraInputRef,
  dropZoneRef,
  handleFileSelect,
  handleClientChange,
  handleProjectChange,
  onSubmit,
  onCancel,
  isSubmitting,
  submitLabel,
  addActivityEntry,
  removeActivityEntry,
  updateActivityEntry,
  toggleUserForActivity,
  updateUserHoursForActivity,
  isDragging,
  uploadProgress,
  imageFiles,
  handleDragEnter,
  handleDragLeave,
  handleDragOver,
  handleDrop,
}: {
  formData: any;
  setFormData: (data: any) => void;
  clients: Client[];
  projects: Project[];
  activityTypes: ActivityType[];
  costCenters: CostCenter[];
  users: User[];
  imagePreviews: string[];
  removeImage: (index: number) => void;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  cameraInputRef: React.RefObject<HTMLInputElement | null>;
  dropZoneRef: React.RefObject<HTMLDivElement | null>;
  handleFileSelect: (e: React.ChangeEvent<HTMLInputElement>) => void;
  handleClientChange: (id: string) => void;
  handleProjectChange: (id: string) => void;
  onSubmit: () => void;
  onCancel: () => void;
  isSubmitting: boolean;
  submitLabel: string;
  addActivityEntry: () => void;
  removeActivityEntry: (entryId: string) => void;
  updateActivityEntry: (entryId: string, updates: any) => void;
  toggleUserForActivity: (entryId: string, userId: string) => void;
  updateUserHoursForActivity: (entryId: string, userId: string, hours: string) => void;
  isDragging: boolean;
  uploadProgress: Record<number, number>;
  imageFiles: File[];
  handleDragEnter: (e: React.DragEvent) => void;
  handleDragLeave: (e: React.DragEvent) => void;
  handleDragOver: (e: React.DragEvent) => void;
  handleDrop: (e: React.DragEvent) => void;
}) {
  return (
    <div className="space-y-6 py-4 max-h-[70vh] overflow-y-auto">
      {/* Project Information Section */}
      <div className="space-y-4 p-4 rounded-lg border border-border bg-muted/20">
        <h3 className="font-semibold text-base flex items-center gap-2">
          <Calendar className="w-4 h-4 text-electric" />
          Project Information
        </h3>
        
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <Label className="font-mono text-xs uppercase tracking-wider mb-2 block">Client</Label>
            <Select value={formData.client_id} onValueChange={handleClientChange}>
              <SelectTrigger>
                <SelectValue placeholder="Select client" />
              </SelectTrigger>
              <SelectContent>
                {clients.length === 0 ? (
                  <SelectItem value="__empty__" disabled>No clients available</SelectItem>
                ) : (
                  clients.map((client) => (
                    <SelectItem key={client.id} value={client.id.toString()}>
                      {client.name}
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label className="font-mono text-xs uppercase tracking-wider mb-2 block">Project *</Label>
            <Select
              value={formData.project_id}
              onValueChange={handleProjectChange}
              disabled={!formData.client_id}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select project" />
              </SelectTrigger>
              <SelectContent>
                {projects.length === 0 ? (
                  <SelectItem value="__empty__" disabled>No projects for this client</SelectItem>
                ) : (
                  projects.filter(project => project.id).map((project) => (
                    <SelectItem key={project.id} value={project.id.toString()}>
                      {project.name}
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div>
          <Label className="font-mono text-xs uppercase tracking-wider mb-2 block">Date *</Label>
          <Input
            type="date"
            value={formData.date}
            onChange={(e) => setFormData({ ...formData, date: e.target.value })}
            className="max-w-xs"
          />
        </div>
      </div>

      {/* Activity Entries Section */}
      <div className="space-y-4">
        <div className="flex items-center justify-between pb-2 border-b border-border">
          <h3 className="font-semibold text-base flex items-center gap-2">
            <Wrench className="w-4 h-4 text-electric" />
            Activity Types *
          </h3>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={addActivityEntry}
            className="h-8 border-electric/30 hover:border-electric hover:bg-electric/10"
          >
            <Plus className="w-3 h-3 mr-1" />
            Add Activity
          </Button>
        </div>

        {formData.activity_entries.length === 0 ? (
          <div className="p-8 border-2 border-dashed border-muted rounded-lg text-center bg-muted/10">
            <Wrench className="w-8 h-8 mx-auto mb-3 text-muted-foreground opacity-50" />
            <p className="text-sm text-muted-foreground font-medium">No activities added</p>
            <p className="text-xs text-muted-foreground mt-1">Click "Add Activity" to get started</p>
          </div>
        ) : (
          formData.activity_entries.map((entry: ActivityTypeEntry, index: number) => (
            <Card key={entry.id} className="p-5 border-2 border-border hover:border-electric/50 transition-colors bg-card">
              <div className="flex items-center justify-between mb-4 pb-3 border-b border-border">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-electric/20 border-2 border-electric flex items-center justify-center">
                    <span className="text-sm font-bold font-mono text-electric">{index + 1}</span>
                  </div>
                  <Label className="font-semibold text-base">
                    Activity {index + 1}
                  </Label>
                </div>
                {formData.activity_entries.length > 1 && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => removeActivityEntry(entry.id)}
                    className="h-8 w-8 p-0 text-destructive hover:text-destructive hover:bg-destructive/10"
                  >
                    <X className="w-4 h-4" />
                  </Button>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <Label className="font-mono text-xs uppercase tracking-wider mb-2 block">Activity Type *</Label>
                  <Select
                    value={entry.activity_type_id}
                    onValueChange={(value) => updateActivityEntry(entry.id, { activity_type_id: value })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select activity" />
                    </SelectTrigger>
                    <SelectContent>
                      {activityTypes.length === 0 ? (
                        <SelectItem value="__empty__" disabled>No activity types available</SelectItem>
                      ) : (
                        activityTypes.filter(type => type.id).map((type) => (
                          <SelectItem key={type.id} value={type.id.toString()}>
                            {type.name}
                          </SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label className="font-mono text-xs uppercase tracking-wider mb-2 block">Cost Center *</Label>
                  <Select
                    value={entry.cost_center_id}
                    onValueChange={(value) => updateActivityEntry(entry.id, { cost_center_id: value })}
                    disabled={!formData.project_id || costCenters.length === 0}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={costCenters.length === 0 ? "Select project first" : "Select cost center"} />
                    </SelectTrigger>
                    <SelectContent>
                      {costCenters.length === 0 ? (
                        <SelectItem value="__none__" disabled>No cost centers for this project</SelectItem>
                      ) : (
                        costCenters.filter(cc => cc.id).map((cc) => (
                          <SelectItem key={cc.id} value={cc.id.toString()}>
                            {cc.code} - {cc.name}
                          </SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Users and Hours Section */}
              <div className="space-y-3 pt-3 border-t border-border">
                <Label className="font-mono text-xs uppercase tracking-wider flex items-center gap-2 mb-3 block">
                  <Users className="w-4 h-4 text-electric" />
                  Assign Users & Hours
                </Label>
                
                <div className="space-y-2">
                  {users.map((user) => {
                    const isSelected = entry.user_ids.includes(user.id);
                    return (
                      <div key={user.id} className={cn(
                        "flex items-center gap-3 p-3 rounded-lg border-2 transition-all",
                        isSelected 
                          ? "border-electric bg-electric/10" 
                          : "border-border hover:border-electric/30 bg-card"
                      )}>
                        <Checkbox
                          checked={isSelected}
                          onCheckedChange={() => toggleUserForActivity(entry.id, user.id)}
                          className="border-2"
                        />
                        <div className="flex-1">
                          <Label className="text-sm font-medium cursor-pointer" onClick={() => toggleUserForActivity(entry.id, user.id)}>
                            {user.name}
                          </Label>
                        </div>
                        {isSelected && (
                          <div className="flex items-center gap-2">
                            <Input
                              type="number"
                              step="0.25"
                              min="0.25"
                              max="24"
                              value={entry.user_hours[user.id] || ''}
                              onChange={(e) => updateUserHoursForActivity(entry.id, user.id, e.target.value)}
                              placeholder="0.00"
                              className="w-24 h-9 text-sm font-mono text-center border-electric/30 focus:border-electric"
                            />
                            <span className="text-xs text-muted-foreground font-medium">hrs</span>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                {entry.user_ids.length === 0 && (
                  <div className="p-4 text-xs text-muted-foreground text-center border-2 border-dashed border-muted rounded-lg bg-muted/10">
                    <Users className="w-5 h-5 mx-auto mb-2 opacity-50" />
                    <p>No users assigned. Check users above to assign hours.</p>
                  </div>
                )}
              </div>

              {/* Activity-specific notes */}
              <div>
                <Label className="font-mono text-xs uppercase tracking-wider mb-2 block">Activity Notes</Label>
                <Textarea
                  value={entry.notes}
                  onChange={(e) => updateActivityEntry(entry.id, { notes: e.target.value })}
                  placeholder="Notes for this activity..."
                  className="mt-2 min-h-[60px] text-sm"
                />
              </div>
            </Card>
          ))
        )}
      </div>

      {/* General Notes */}
      <div className="p-4 rounded-lg border border-border bg-muted/20">
        <Label className="font-mono text-xs uppercase tracking-wider mb-2 block">General Notes</Label>
        <Textarea
          value={formData.notes}
          onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
          placeholder="General work description..."
          className="min-h-[100px] resize-none"
        />
      </div>

      {/* Photo/Image Upload Section */}
      <div className="p-4 rounded-lg border border-border bg-muted/20">
        <Label className="font-mono text-xs uppercase tracking-wider mb-3 block flex items-center gap-2">
          <Camera className="w-4 h-4 text-electric" />
          Photos / Media
        </Label>
        
        {/* Drag and Drop Zone */}
        {imagePreviews.length < 5 && (
          <div
            ref={dropZoneRef as React.LegacyRef<HTMLDivElement>}
            onDragEnter={handleDragEnter}
            onDragLeave={handleDragLeave}
            onDragOver={handleDragOver}
            onDrop={handleDrop}
            className={cn(
              "border-2 border-dashed rounded-lg p-8 transition-all duration-200",
              isDragging 
                ? "border-electric bg-electric/20 scale-[1.02] shadow-lg shadow-electric/20" 
                : "border-muted hover:border-electric/50 bg-muted/10"
            )}
          >
            <div className="flex flex-col items-center justify-center gap-3 text-center">
              <div className={cn(
                "w-16 h-16 rounded-full flex items-center justify-center transition-colors",
                isDragging ? "bg-electric/20" : "bg-muted"
              )}>
                <Image className={cn(
                  "w-8 h-8 transition-colors",
                  isDragging ? "text-electric" : "text-muted-foreground"
                )} />
              </div>
              <div>
                <p className={cn(
                  "text-sm font-semibold transition-colors",
                  isDragging ? "text-electric" : "text-foreground"
                )}>
                  {isDragging ? "Drop images here" : "Drag & drop images here"}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  or click buttons below to select
                </p>
              </div>
            </div>
          </div>
        )}

        <div className="mt-4 flex flex-wrap gap-3">
          {/* Image Previews */}
          {imagePreviews.map((preview, index) => (
            <div key={index} className="relative w-24 h-24 rounded-lg overflow-hidden border-2 border-border group hover:border-electric transition-all shadow-sm hover:shadow-md">
              <img src={preview} alt={`Preview ${index + 1}`} className="w-full h-full object-cover" />
              {/* Upload Progress */}
              {uploadProgress[index] !== undefined && uploadProgress[index] < 100 && (
                <div className="absolute inset-0 bg-black/70 flex flex-col items-center justify-center gap-2">
                  <div className="w-8 h-8 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  <span className="text-xs text-white font-medium">{uploadProgress[index]}%</span>
                </div>
              )}
              {/* Remove Button */}
              <button
                type="button"
                onClick={() => removeImage(index)}
                className="absolute top-1 right-1 w-6 h-6 bg-destructive rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow-lg hover:scale-110"
              >
                <X className="w-3.5 h-3.5 text-white" />
              </button>
              {/* File Info */}
              <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent text-white text-xs p-2 truncate opacity-0 group-hover:opacity-100 transition-opacity">
                {imageFiles[index]?.name || `Image ${index + 1}`}
              </div>
            </div>
          ))}

          {/* Upload Buttons */}
          {imagePreviews.length < 5 && (
            <>
              {/* Take Photo Button */}
              <button
                type="button"
                onClick={() => cameraInputRef.current?.click()}
                className="w-24 h-24 rounded-lg border-2 border-dashed border-muted hover:border-electric hover:bg-electric/5 flex flex-col items-center justify-center gap-2 transition-all group"
              >
                <div className="w-10 h-10 rounded-full bg-muted group-hover:bg-electric/20 flex items-center justify-center transition-colors">
                  <Camera className="w-5 h-5 text-muted-foreground group-hover:text-electric transition-colors" />
                </div>
                <span className="text-xs text-muted-foreground group-hover:text-electric font-medium transition-colors">Camera</span>
              </button>

              {/* Select from Gallery */}
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="w-24 h-24 rounded-lg border-2 border-dashed border-muted hover:border-electric hover:bg-electric/5 flex flex-col items-center justify-center gap-2 transition-all group"
              >
                <div className="w-10 h-10 rounded-full bg-muted group-hover:bg-electric/20 flex items-center justify-center transition-colors">
                  <Image className="w-5 h-5 text-muted-foreground group-hover:text-electric transition-colors" />
                </div>
                <span className="text-xs text-muted-foreground group-hover:text-electric font-medium transition-colors">Gallery</span>
              </button>
            </>
          )}
        </div>

        {/* Hidden file inputs */}
        <input
          ref={fileInputRef as React.LegacyRef<HTMLInputElement>}
          type="file"
          accept="image/*"
          multiple
          onChange={handleFileSelect}
          className="hidden"
        />
        <input
          ref={cameraInputRef as React.LegacyRef<HTMLInputElement>}
          type="file"
          accept="image/*"
          capture="environment"
          onChange={handleFileSelect}
          className="hidden"
        />
        
        <p className="text-xs text-muted-foreground mt-3 flex items-center gap-1">
          <span className="w-1.5 h-1.5 rounded-full bg-electric"></span>
          Add up to 5 photos (max 10MB each). Drag & drop or click to select.
        </p>
      </div>

      <div className="flex justify-end gap-3 pt-6 border-t border-border sticky bottom-0 bg-card -mx-4 px-4 pb-2">
        <Button variant="outline" onClick={onCancel} disabled={isSubmitting} className="min-w-[100px]">
          Cancel
        </Button>
        <Button
          onClick={onSubmit}
          disabled={isSubmitting}
          className="bg-electric text-background hover:bg-electric/90 min-w-[120px] shadow-lg shadow-electric/20"
        >
          {isSubmitting ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin mr-2" />
              Saving...
            </>
          ) : (
            submitLabel
          )}
        </Button>
      </div>
    </div>
  );
}
