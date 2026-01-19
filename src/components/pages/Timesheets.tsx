import { useState, useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
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
import { getTimesheets, createTimesheet, updateTimesheet, deleteTimesheet, getProjects as getProjectsSupabase, getClients, getActivityTypes, getCostCenters, getUsers } from '@/lib/supabaseQueries';
import { TimesheetEntry, Client, Project, ActivityType, CostCenter, User } from '@/types';
import { Plus, Calendar, Clock, Wrench, Pencil, Trash2, Loader2, Camera, Image, X, ChevronLeft, ChevronRight, Users, CheckCircle2, AlertCircle, CheckCircle, Search, MessageSquare, Settings2 } from 'lucide-react';
import ImageViewer from '@/components/modals/ImageViewer';
import { Pagination } from '@/components/ui/pagination';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
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

// Grouped timesheets structure
interface GroupedTimesheets {
  [userId: string]: {
    [date: string]: TimesheetEntry[];
  };
}

// Utility functions for date calculations and grouping
const getWeekStart = (date: Date): Date => {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d;
};

const getWeekEnd = (date: Date): Date => {
  const weekStart = getWeekStart(date);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 6);
  weekEnd.setHours(23, 59, 59, 999);
  return weekEnd;
};

const getWeekDateRange = (date: Date): { from: string; to: string } => {
  const weekStart = getWeekStart(date);
  const weekEnd = getWeekEnd(date);
  return {
    from: weekStart.toISOString().split('T')[0],
    to: weekEnd.toISOString().split('T')[0],
  };
};

const getMonthDateRange = (year: number, month: number): { from: string; to: string } => {
  const monthStart = new Date(year, month, 1);
  const monthEnd = new Date(year, month + 1, 0);
  return {
    from: monthStart.toISOString().split('T')[0],
    to: monthEnd.toISOString().split('T')[0],
  };
};

const getWeekDates = (startDate: Date): string[] => {
  const weekStart = getWeekStart(startDate);
  const dates: string[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + i);
    dates.push(d.toISOString().split('T')[0]);
  }
  return dates;
};

const getMonthDates = (year: number, month: number): string[] => {
  const dates: string[] = [];
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  for (let i = 1; i <= daysInMonth; i++) {
    const d = new Date(year, month, i);
    dates.push(d.toISOString().split('T')[0]);
  }
  return dates;
};

const groupTimesheetsByUserAndDate = (entries: TimesheetEntry[]): GroupedTimesheets => {
  const grouped: GroupedTimesheets = {};
  entries.forEach(entry => {
    // Normalize user_id to string for consistent comparison
    const userId = entry.user_id ? String(entry.user_id) : 'unassigned';
    // Normalize date to YYYY-MM-DD format (remove time component if present)
    const date = entry.date ? entry.date.split('T')[0] : '';
    if (!date) return; // Skip entries without valid dates
    
    if (!grouped[userId]) {
      grouped[userId] = {};
    }
    if (!grouped[userId][date]) {
      grouped[userId][date] = [];
    }
    grouped[userId][date].push(entry);
  });
  return grouped;
};

const isToday = (date: string): boolean => {
  return date === new Date().toISOString().split('T')[0];
};

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
  const [viewMode, setViewMode] = useState<'week' | 'month'>('week');
  const [selectedDateRange, setSelectedDateRange] = useState<{ from: Date; to: Date }>(() => {
    const today = new Date();
    const weekStart = getWeekStart(today);
    const weekEnd = getWeekEnd(today);
    return { from: weekStart, to: weekEnd };
  });
  
  // Details modal state
  const [detailsModalOpen, setDetailsModalOpen] = useState(false);
  const [selectedTimesheet, setSelectedTimesheet] = useState<TimesheetEntry | null>(null);

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

  // State for collapsible activity cards (needed in main component for addActivityEntry)
  const [expandedActivities, setExpandedActivities] = useState<Set<string>>(new Set());

  // Pagination state (removed for planner view - load all in date range)
  // const [page, setPage] = useState(1);
  // const [limit, setLimit] = useState(20);
  // const [pagination, setPagination] = useState<{
  //   page: number;
  //   limit: number;
  //   total: number;
  //   totalPages: number;
  //   hasNext: boolean;
  //   hasPrev: boolean;
  // } | null>(null);

  const { isAuthenticated, isLoading: authLoading } = useAuth();

  useEffect(() => {
    // Only load data once auth is complete and user is authenticated
    if (!authLoading && isAuthenticated) {
      loadTimesheets();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedUserId, selectedDateRange.from.toISOString(), selectedDateRange.to.toISOString(), authLoading, isAuthenticated]);

  useEffect(() => {
    // Only load data once auth is complete and user is authenticated
    if (!authLoading && isAuthenticated) {
      loadFormData();
      loadUsers();
    }
  }, [authLoading, isAuthenticated]);

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
      const dateFrom = selectedDateRange.from.toISOString().split('T')[0];
      const dateTo = selectedDateRange.to.toISOString().split('T')[0];
      
      let data = await getTimesheets();
      
      // Filter by date range
      data = data.filter((entry: any) => {
        const entryDate = entry.date ? entry.date.split('T')[0] : entry.date;
        return entryDate >= dateFrom && entryDate <= dateTo;
      });
      
      // Filter by user if not 'all'
      if (selectedUserId !== 'all') {
        data = data.filter((entry: any) => entry.user_id === selectedUserId);
      }
      
      // Normalize dates in entries (remove time components)
      const normalizedData = Array.isArray(data) ? data.map((entry: any) => ({
        ...entry,
        date: entry.date ? entry.date.split('T')[0] : entry.date
      })) : [];
      
      setEntries(normalizedData);
    } catch (error: any) {
      console.error('Failed to load timesheets:', error);
      toast.error(error.message || 'Failed to load timesheets');
      setEntries([]);
    } finally {
      setIsLoading(false);
    }
  };

  const loadUsers = async () => {
    try {
      const data = await getUsers();
      setUsers(Array.isArray(data) ? data.filter(u => u.id) : []);
    } catch (error) {
      console.error('Failed to load users:', error);
      toast.error('Failed to load users');
      setUsers([]);
    }
  };

  const loadFormData = async () => {
    try {
      const [clientsData, activityData] = await Promise.all([
        getClients().catch(() => []),
        getActivityTypes().catch(() => []),
      ]);
      
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
        const projectsData = await getProjects();
        const filtered = projectsData.filter((p: any) => p.client_id === clientId);
        setProjects(Array.isArray(filtered) ? filtered.filter(p => p.id) : []);
      } catch (error) {
        setProjects([]);
      }
    } else {
      setProjects([]);
    }
  };

  const handleProjectChange = async (projectId: string) => {
    if (projectId) {
      try {
        const costCenterData = await getCostCenters();
        const loadedCostCenters = Array.isArray(costCenterData) ? costCenterData.filter(cc => cc.id && cc.project_id === projectId) : [];
        setCostCenters(loadedCostCenters);
        
        // Update activity entries: reset cost centers and set default to first if available
        setFormData(prev => ({
          ...prev,
          project_id: projectId,
          activity_entries: prev.activity_entries.map(entry => ({
            ...entry,
            cost_center_id: loadedCostCenters.length > 0 ? loadedCostCenters[0].id : '' // Default to first cost center
          }))
        }));
      } catch (error) {
        setCostCenters([]);
        setFormData(prev => ({
          ...prev,
          project_id: projectId,
          activity_entries: prev.activity_entries.map(entry => ({
            ...entry,
            cost_center_id: '' // Reset if loading fails
          }))
        }));
      }
    } else {
      setCostCenters([]);
      setFormData(prev => ({
        ...prev,
        project_id: projectId,
        activity_entries: prev.activity_entries.map(entry => ({
          ...entry,
          cost_center_id: '' // Reset cost center when project changes
        }))
      }));
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
    setExpandedActivities(new Set()); // Reset expanded activities
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

  // Date navigation
  const navigateWeek = (direction: 'prev' | 'next') => {
    setViewDate(prev => {
      const newDate = new Date(prev);
      newDate.setDate(newDate.getDate() + (direction === 'next' ? 7 : -7));
      const weekStart = getWeekStart(newDate);
      const weekEnd = getWeekEnd(newDate);
      setSelectedDateRange({ from: weekStart, to: weekEnd });
      return newDate;
    });
  };

  const navigateMonth = (direction: 'prev' | 'next') => {
    setViewDate(prev => {
      const newDate = new Date(prev);
      if (direction === 'next') {
        newDate.setMonth(newDate.getMonth() + 1);
      } else {
        newDate.setMonth(newDate.getMonth() - 1);
      }
      const monthStart = new Date(newDate.getFullYear(), newDate.getMonth(), 1);
      const monthEnd = new Date(newDate.getFullYear(), newDate.getMonth() + 1, 0);
      setSelectedDateRange({ from: monthStart, to: monthEnd });
      return newDate;
    });
  };

  const goToToday = () => {
    const today = new Date();
    setViewDate(today);
    if (viewMode === 'week') {
      const weekStart = getWeekStart(today);
      const weekEnd = getWeekEnd(today);
      setSelectedDateRange({ from: weekStart, to: weekEnd });
    } else {
      const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
      const monthEnd = new Date(today.getFullYear(), today.getMonth() + 1, 0);
      setSelectedDateRange({ from: monthStart, to: monthEnd });
    }
  };

  const handleViewModeChange = (mode: 'week' | 'month') => {
    setViewMode(mode);
    if (mode === 'week') {
      const weekStart = getWeekStart(viewDate);
      const weekEnd = getWeekEnd(viewDate);
      setSelectedDateRange({ from: weekStart, to: weekEnd });
    } else {
      const monthStart = new Date(viewDate.getFullYear(), viewDate.getMonth(), 1);
      const monthEnd = new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 0);
      setSelectedDateRange({ from: monthStart, to: monthEnd });
    }
  };

  // Icon component helper (matching ActivityTypes page)
  const getIconComponent = (iconName: string) => {
    const iconMap: Record<string, any> = {
      'Wrench': Wrench,
      'CheckCircle': CheckCircle,
      'Search': Search,
      'MessageSquare': MessageSquare,
      'Settings2': Settings2,
    };
    const Icon = iconMap[iconName] || Wrench;
    return <Icon className="w-5 h-5" />;
  };

  // Activity entry management functions
  const addActivityEntry = (activityTypeId?: string) => {
    // If activity type ID provided, check if it already exists
    if (activityTypeId) {
      const existing = formData.activity_entries.find(
        e => e.activity_type_id === activityTypeId
      );
      if (existing) {
        // Expand existing entry instead of creating duplicate
        setExpandedActivities(prev => {
          const newSet = new Set(prev);
          newSet.add(existing.id);
          // Scroll to the expanded activity block
          setTimeout(() => {
            const element = document.getElementById(`activity-${existing.id}`);
            if (element) {
              element.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            }
          }, 100);
          return newSet;
        });
        return;
      }
    }

    // Add new entry with default cost center
    const newEntry: ActivityTypeEntry = {
      id: `entry-${Date.now()}-${Math.random()}`,
      activity_type_id: activityTypeId || '',
      cost_center_id: costCenters.length > 0 ? costCenters[0].id : '',
      hours: '',
      user_ids: [],
      user_hours: {},
      notes: '',
    };
    
    setFormData(prev => ({
      ...prev,
      activity_entries: [...prev.activity_entries, newEntry]
    }));
    
    // Auto-expand new entry immediately
    setExpandedActivities(prev => {
      const newSet = new Set(prev);
      newSet.add(newEntry.id);
      return newSet;
    });
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
            await createTimesheet({
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
          await createTimesheet({
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
        const projectsData = await getProjectsSupabase({ client_id: entry.client_id });
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
        
        await updateTimesheet(editingEntry.id, {
          project_id: formData.project_id,
          activity_type_id: entry.activity_type_id,
          cost_center_id: entry.cost_center_id,
          date: formData.date,
          hours: hours,
          user_id: userId,
          notes: entry.notes || formData.notes,
        });
      } else {
        // No new images, just update the data
        await updateTimesheet(editingEntry.id, {
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
      await deleteTimesheet(entry.id);
      toast.success('Timesheet entry deleted');
      loadTimesheets();
    } catch (error: any) {
      toast.error(error.message || 'Failed to delete entry');
    }
  };

  const handleCardClick = (entry: TimesheetEntry) => {
    setSelectedTimesheet(entry);
    setDetailsModalOpen(true);
  };

  // Filter entries by selected user
  const filteredEntries = selectedUserId === 'all' 
    ? entries 
    : entries.filter(e => e.user_id === selectedUserId);

  // Group entries by user and date for planner view
  const groupedByUserAndDate = groupTimesheetsByUserAndDate(filteredEntries);
  
  // Get unique users from entries (normalize IDs to strings for comparison)
  const uniqueUsers = Array.from(new Set(filteredEntries.map(e => e.user_id ? String(e.user_id) : null).filter(Boolean))) as string[];
  // Match users by normalizing IDs to strings
  const usersWithEntries = users.filter(u => u.id && uniqueUsers.includes(String(u.id)));
  
  // Also include any users from entries that aren't in the users list (fallback)
  const missingUserIds = uniqueUsers.filter(uid => !users.some(u => String(u.id) === uid));
  const missingUsers = missingUserIds.map(uid => {
    // Try to find user info from entries
    const entry = filteredEntries.find(e => e.user_id && String(e.user_id) === uid);
    return {
      id: uid,
      name: entry?.user_name || 'Unknown User',
      email: '',
      role: 'user' as const,
      is_active: true,
      created_at: '',
      updated_at: ''
    };
  });
  
  // Combine users from list with missing users
  const allUsersWithEntries = [...usersWithEntries, ...missingUsers];
  
  // Calculate date ranges and dates for current view
  const weekDates = viewMode === 'week' ? getWeekDates(viewDate) : [];
  const monthDates = viewMode === 'month' 
    ? getMonthDates(viewDate.getFullYear(), viewDate.getMonth())
    : [];
  
  const totalHoursInRange = filteredEntries.reduce((sum, e) => sum + parseFloat(String(e.hours)), 0);

  // Compact Timesheet Card Component
  const TimesheetCard = ({ entry, compact = true, onClick }: { entry: TimesheetEntry; compact?: boolean; onClick?: () => void }) => {
    const activityType = activityTypes.find(at => at.id === entry.activity_type_id);
    const totalHours = parseFloat(String(entry.hours));
    
    if (compact) {
      return (
        <div
          onClick={onClick}
          className={cn(
            "p-2 rounded-lg border-2 transition-all cursor-pointer hover:shadow-md",
            "bg-card border-border hover:border-electric"
          )}
        >
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded bg-electric/20 border border-electric flex items-center justify-center flex-shrink-0">
              <Wrench className="w-3 h-3 text-electric" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold truncate">{activityType?.name || 'Activity'}</p>
              <p className="text-xs text-muted-foreground truncate">{entry.cost_center_code}</p>
            </div>
            <span className="text-xs font-bold font-mono text-electric">{totalHours}h</span>
          </div>
        </div>
      );
    }
    
    return (
      <Card className="p-4 bg-card border-border hover:border-electric transition-all">
        <div className="flex items-start gap-4">
          <div className="w-10 h-10 rounded-lg border-2 flex items-center justify-center bg-electric/20 border-electric text-electric">
            <Wrench className="w-5 h-5" />
          </div>
          <div className="flex-1">
            <div className="flex items-start justify-between mb-2">
              <div>
                <h4 className="font-semibold text-foreground">{entry.project_name}</h4>
                <p className="text-sm text-muted-foreground">{entry.client_name} • {entry.user_name}</p>
              </div>
              <span className="text-lg font-bold font-mono text-electric">{totalHours}h</span>
            </div>
            <Badge className="capitalize bg-electric/20 text-electric border-electric/30 mb-2">
              {activityType?.name || entry.activity_type_name}
            </Badge>
            {entry.notes && <p className="text-sm text-muted-foreground">{entry.notes}</p>}
          </div>
        </div>
      </Card>
    );
  };

  // Week Planner View Component
  const WeekPlannerView = () => {
    const weekStartDate = getWeekStart(viewDate);
    
    return (
      <Card className="p-6 bg-card border-border mb-6 overflow-x-auto">
        <div className="min-w-[800px]">
          {/* Header Row */}
          <div className="grid grid-cols-8 gap-2 mb-4">
            <div className="text-center font-semibold text-sm">User</div>
            {weekDates.map((dateStr, i) => {
              const date = new Date(dateStr);
              const dayName = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][date.getDay()];
              return (
                <div key={i} className="text-center">
                  <p className="text-xs font-mono text-muted-foreground uppercase">{dayName}</p>
                  <p className={cn(
                    "text-sm font-bold font-mono",
                    isToday(dateStr) ? "text-electric" : "text-foreground"
                  )}>
                    {date.getDate()}
                  </p>
                </div>
              );
            })}
          </div>
          
          {/* User Rows */}
          {allUsersWithEntries.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No timesheets found for selected date range
            </div>
          ) : (
            allUsersWithEntries.map((user) => (
              <div key={user.id} className="grid grid-cols-8 gap-2 mb-2">
                <div className="flex items-center p-2 border-r border-border">
                  <p className="text-sm font-medium truncate">{user.name}</p>
                </div>
                {weekDates.map((dateStr, i) => {
                  const userId = String(user.id);
                  const userEntries = groupedByUserAndDate[userId]?.[dateStr] || [];
                  const dayTotal = userEntries.reduce((sum, e) => sum + parseFloat(String(e.hours)), 0);
                  
                  return (
                    <div
                      key={i}
                      className={cn(
                        "min-h-[60px] p-2 rounded-lg border transition-all",
                        isToday(dateStr)
                          ? "bg-electric/5 border-electric/30"
                          : "bg-muted/10 border-border"
                      )}
                    >
                      <div className="space-y-1">
                        {userEntries.map((entry) => (
                          <TimesheetCard
                            key={entry.id}
                            entry={entry}
                            compact={true}
                            onClick={() => handleCardClick(entry)}
                          />
                        ))}
                        {userEntries.length === 0 && dayTotal === 0 && (
                          <div className="text-xs text-muted-foreground/50 text-center py-1">-</div>
                        )}
                      </div>
                      {dayTotal > 0 && (
                        <p className="text-xs font-mono text-electric mt-1 text-center">{dayTotal.toFixed(1)}h</p>
                      )}
                    </div>
                  );
                })}
              </div>
            ))
          )}
        </div>
      </Card>
    );
  };

  // Month Planner View Component
  const MonthPlannerView = () => {
    const firstDayOfMonth = new Date(viewDate.getFullYear(), viewDate.getMonth(), 1);
    const lastDayOfMonth = new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 0);
    const firstDayWeekday = firstDayOfMonth.getDay();
    const daysInMonth = lastDayOfMonth.getDate();
    
    // Create calendar grid (6 weeks x 7 days)
    const calendarDays: (string | null)[] = [];
    // Add empty cells for days before month starts
    for (let i = 0; i < firstDayWeekday; i++) {
      calendarDays.push(null);
    }
    // Add days of the month
    for (let i = 1; i <= daysInMonth; i++) {
      const date = new Date(viewDate.getFullYear(), viewDate.getMonth(), i);
      calendarDays.push(date.toISOString().split('T')[0]);
    }
    // Fill remaining cells to complete 6 weeks
    while (calendarDays.length < 42) {
      calendarDays.push(null);
    }
    
    return (
      <Card className="p-6 bg-card border-border mb-6">
        {/* Month Header */}
        <div className="mb-4 text-center">
          <h3 className="text-xl font-bold">
            {viewDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
          </h3>
        </div>
        
        {/* Day Names */}
        <div className="grid grid-cols-7 gap-2 mb-2">
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => (
            <div key={day} className="text-center">
              <p className="text-xs font-mono text-muted-foreground uppercase">{day}</p>
            </div>
          ))}
        </div>
        
        {/* Calendar Grid */}
        <div className="grid grid-cols-7 gap-2">
          {calendarDays.map((dateStr, i) => {
            if (!dateStr) {
              return <div key={i} className="min-h-[100px] p-2 rounded-lg bg-muted/5 border border-transparent" />;
            }
            
            const date = new Date(dateStr);
            // Normalize date strings for comparison
            const normalizedDateStr = dateStr.split('T')[0];
            const dayEntries = filteredEntries.filter(e => {
              const entryDate = e.date ? e.date.split('T')[0] : '';
              return entryDate === normalizedDateStr;
            });
            const dayEntriesByUser = groupTimesheetsByUserAndDate(dayEntries);
            const dayTotal = dayEntries.reduce((sum, e) => sum + parseFloat(String(e.hours)), 0);
            
            return (
              <div
                key={i}
                className={cn(
                  "min-h-[100px] p-2 rounded-lg border transition-all",
                  isToday(normalizedDateStr)
                    ? "bg-electric/10 border-electric"
                    : "bg-muted/10 border-border hover:border-electric/50"
                )}
              >
                <div className="flex items-center justify-between mb-2">
                  <p className={cn(
                    "text-sm font-bold font-mono",
                    isToday(normalizedDateStr) ? "text-electric" : "text-foreground"
                  )}>
                    {date.getDate()}
                  </p>
                  {dayTotal > 0 && (
                    <span className="text-xs font-mono text-electric">{dayTotal.toFixed(1)}h</span>
                  )}
                </div>
                
                <div className="space-y-1 max-h-[60px] overflow-y-auto">
                  {Object.entries(dayEntriesByUser).map(([userId, dateEntries]) => {
                    const user = users.find(u => String(u.id) === userId) || allUsersWithEntries.find(u => String(u.id) === userId);
                    const userEntries = Object.values(dateEntries).flat();
                    const userTotal = userEntries.reduce((sum, e) => sum + parseFloat(String(e.hours)), 0);
                    
                    return (
                      <div key={userId} className="text-xs">
                        <p className="font-medium truncate">{user?.name || 'Unassigned'}</p>
                        {userEntries.slice(0, 2).map((entry) => (
                          <TimesheetCard
                            key={entry.id}
                            entry={entry}
                            compact={true}
                            onClick={() => handleCardClick(entry)}
                          />
                        ))}
                        {userEntries.length > 2 && (
                          <p className="text-xs text-muted-foreground">+{userEntries.length - 2} more</p>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </Card>
    );
  };

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
            {/* View Mode Toggle */}
            <div className="flex items-center gap-2 border border-border rounded-lg p-1">
              <Button
                variant={viewMode === 'week' ? 'default' : 'ghost'}
                size="sm"
                onClick={() => handleViewModeChange('week')}
                className={viewMode === 'week' ? 'bg-electric text-background' : ''}
              >
                Week
              </Button>
              <Button
                variant={viewMode === 'month' ? 'default' : 'ghost'}
                size="sm"
                onClick={() => handleViewModeChange('month')}
                className={viewMode === 'month' ? 'bg-electric text-background' : ''}
              >
                Month
              </Button>
            </div>
            
            {/* Date Navigation */}
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => viewMode === 'week' ? navigateWeek('prev') : navigateMonth('prev')}>
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <Button variant="outline" size="sm" onClick={goToToday}>
                <Calendar className="w-4 h-4 mr-2" />
                Today
              </Button>
              <Button variant="outline" size="sm" onClick={() => viewMode === 'week' ? navigateWeek('next') : navigateMonth('next')}>
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
              Total Hours: <span className="text-foreground font-bold">{totalHoursInRange.toFixed(1)}</span>
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

        {/* Planner View */}
        {viewMode === 'week' ? <WeekPlannerView /> : <MonthPlannerView />}
      </div>

      {/* Create Timesheet Modal */}
      <Dialog open={createModalOpen} onOpenChange={setCreateModalOpen}>
        <DialogContent className="max-w-[95vw] sm:max-w-[700px] lg:max-w-[900px] xl:max-w-[1100px] bg-card border-border">
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
            expandedActivities={expandedActivities}
            setExpandedActivities={setExpandedActivities}
          />
        </DialogContent>
      </Dialog>

      {/* Edit Timesheet Modal */}
      <Dialog open={editModalOpen} onOpenChange={setEditModalOpen}>
        <DialogContent className="max-w-[95vw] sm:max-w-[700px] lg:max-w-[900px] xl:max-w-[1100px] bg-card border-border">
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
            expandedActivities={expandedActivities}
            setExpandedActivities={setExpandedActivities}
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

      {/* Timesheet Details Modal */}
      <Dialog open={detailsModalOpen} onOpenChange={setDetailsModalOpen}>
        <DialogContent className="max-w-[95vw] sm:max-w-[700px] bg-card border-border">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold">Timesheet Details</DialogTitle>
            <DialogDescription>View full timesheet information</DialogDescription>
          </DialogHeader>
          
          {selectedTimesheet && (
            <div className="space-y-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-xs font-mono uppercase tracking-wider text-muted-foreground">Project</Label>
                  <p className="text-sm font-semibold mt-1">{selectedTimesheet.project_name}</p>
                </div>
                <div>
                  <Label className="text-xs font-mono uppercase tracking-wider text-muted-foreground">Client</Label>
                  <p className="text-sm font-semibold mt-1">{selectedTimesheet.client_name}</p>
                </div>
                <div>
                  <Label className="text-xs font-mono uppercase tracking-wider text-muted-foreground">User</Label>
                  <p className="text-sm font-semibold mt-1">{selectedTimesheet.user_name}</p>
                </div>
                <div>
                  <Label className="text-xs font-mono uppercase tracking-wider text-muted-foreground">Date</Label>
                  <p className="text-sm font-semibold mt-1">
                    {new Date(selectedTimesheet.date).toLocaleDateString('en-US', {
                      weekday: 'long',
                      month: 'long',
                      day: 'numeric',
                      year: 'numeric',
                    })}
                  </p>
                </div>
                <div>
                  <Label className="text-xs font-mono uppercase tracking-wider text-muted-foreground">Activity Type</Label>
                  <Badge className="capitalize bg-electric/20 text-electric border-electric/30 mt-1">
                    {selectedTimesheet.activity_type_name}
                  </Badge>
                </div>
                <div>
                  <Label className="text-xs font-mono uppercase tracking-wider text-muted-foreground">Cost Center</Label>
                  <Badge variant="outline" className="font-mono mt-1">
                    {selectedTimesheet.cost_center_code}
                  </Badge>
                </div>
                <div>
                  <Label className="text-xs font-mono uppercase tracking-wider text-muted-foreground">Hours</Label>
                  <p className="text-lg font-bold font-mono text-electric mt-1">{selectedTimesheet.hours}h</p>
                </div>
                <div>
                  <Label className="text-xs font-mono uppercase tracking-wider text-muted-foreground">Billing Status</Label>
                  <Badge className="capitalize mt-1">
                    {selectedTimesheet.billing_status || 'unbilled'}
                  </Badge>
                </div>
              </div>
              
              {selectedTimesheet.notes && (
                <div>
                  <Label className="text-xs font-mono uppercase tracking-wider text-muted-foreground">Notes</Label>
                  <p className="text-sm mt-1 p-3 rounded-lg bg-muted/20 border border-border">{selectedTimesheet.notes}</p>
                </div>
              )}
              
              {selectedTimesheet.image_urls && selectedTimesheet.image_urls.length > 0 && (
                <div>
                  <Label className="text-xs font-mono uppercase tracking-wider text-muted-foreground mb-2 block">Photos</Label>
                  <div className="flex gap-2 flex-wrap">
                    {selectedTimesheet.image_urls.map((url, idx) => (
                      <button
                        key={idx}
                        onClick={() => {
                          setViewingImages(selectedTimesheet.image_urls);
                          setViewingImageIndex(idx);
                          setViewingEntryId(selectedTimesheet.id);
                          setImageViewerOpen(true);
                        }}
                        className="w-20 h-20 rounded border border-border overflow-hidden hover:border-electric transition-colors"
                      >
                        <img 
                          src={url.startsWith('http') ? url : (url.startsWith('/uploads') ? url : `/uploads/${url}`)} 
                          alt={`Photo ${idx + 1}`} 
                          className="w-full h-full object-cover"
                          onError={(e) => {
                            const img = e.currentTarget;
                            if (!img.src.startsWith('data:') && !url.startsWith('http')) {
                              const formattedUrl = url.startsWith('/uploads') ? url : `/uploads/${url}`;
                              const token = api.getToken();
                              fetch(formattedUrl, {
                                headers: token ? { 'Authorization': `Bearer ${token}` } : {}
                              })
                                .then(res => res.ok ? res.blob() : Promise.reject())
                                .then(blob => {
                                  img.src = URL.createObjectURL(blob);
                                })
                                .catch(() => {
                                  img.src = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjQiIGhlaWdodD0iNjQiIHZpZXdCb3g9IjAgMCA2NCA2NCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPHJlY3Qgd2lkdGg9IjY0IiBoZWlnaHQ9IjY0IiBmaWxsPSIjMzMzMzMzIi8+CjxwYXRoIGQ9Ik0zMiAyMEMzMC4zNCAyMCAyOSAyMS4zNCAyOSAyM1YzM0MyOSAzNC42NiAzMC4zNCAzNiAzMiAzNkgzNkMzNy42NiAzNiAzOSAzNC42NiAzOSAzM1YyM0MzOSAyMS4zNCAzNy42NiAyMCAzNiAyMEgzMloiIGZpbGw9IiM2NjY2NjYiLz4KPC9zdmc+';
                                });
                            }
                          }}
                        />
                      </button>
                    ))}
                  </div>
                </div>
              )}
              
              <div className="flex justify-end gap-3 pt-4 border-t border-border">
                <Button variant="outline" onClick={() => setDetailsModalOpen(false)}>
                  Close
                </Button>
                {selectedTimesheet.billing_status !== 'billed' && selectedTimesheet.billing_status !== 'paid' && (
                  <>
                    <Button variant="outline" onClick={() => {
                      setDetailsModalOpen(false);
                      handleEdit(selectedTimesheet);
                    }}>
                      <Pencil className="w-4 h-4 mr-2" />
                      Edit
                    </Button>
                    <Button variant="destructive" onClick={() => {
                      setDetailsModalOpen(false);
                      handleDelete(selectedTimesheet);
                    }}>
                      <Trash2 className="w-4 h-4 mr-2" />
                      Delete
                    </Button>
                  </>
                )}
              </div>
            </div>
          )}
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
  expandedActivities,
  setExpandedActivities,
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
  addActivityEntry: (activityTypeId?: string) => void;
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
  expandedActivities: Set<string>;
  setExpandedActivities: React.Dispatch<React.SetStateAction<Set<string>>>;
}) {
  const [currentUser] = useState(() => {
    try {
      const stored = localStorage.getItem('current_user');
      return stored ? JSON.parse(stored) : null;
    } catch {
      return null;
    }
  });

  // Icon component helper (matching ActivityTypes page)
  const getIconComponent = (iconName: string) => {
    const iconMap: Record<string, any> = {
      'Wrench': Wrench,
      'CheckCircle': CheckCircle,
      'Search': Search,
      'MessageSquare': MessageSquare,
      'Settings2': Settings2,
    };
    const Icon = iconMap[iconName] || Wrench;
    return <Icon className="w-5 h-5" />;
  };

  // Smart defaults - remember last selections
  useEffect(() => {
    const lastClient = localStorage.getItem('timesheet_last_client');
    const lastProject = localStorage.getItem('timesheet_last_project');
    if (lastClient && !formData.client_id) {
      handleClientChange(lastClient);
    }
    if (lastProject && !formData.project_id && formData.client_id) {
      handleProjectChange(lastProject);
    }
  }, []);

  // Auto-select current user if no users assigned
  useEffect(() => {
    if (currentUser && formData.activity_entries.length > 0) {
      formData.activity_entries.forEach((entry: ActivityTypeEntry) => {
        if (entry.user_ids.length === 0 && currentUser.id) {
          toggleUserForActivity(entry.id, currentUser.id);
        }
      });
    }
  }, [formData.activity_entries.length]);

  // Set default cost center when cost centers are loaded and entries don't have one
  useEffect(() => {
    if (costCenters.length > 0 && formData.activity_entries.length > 0) {
      const firstCostCenterId = costCenters[0].id;
      setFormData((prev: typeof formData) => ({
        ...prev,
        activity_entries: prev.activity_entries.map((entry: ActivityTypeEntry) => ({
          ...entry,
          cost_center_id: entry.cost_center_id || firstCostCenterId
        }))
      }));
    }
  }, [costCenters.length, costCenters[0]?.id]);

  const toggleActivityExpanded = (entryId: string) => {
    setExpandedActivities(prev => {
      const newSet = new Set(prev);
      if (newSet.has(entryId)) {
        newSet.delete(entryId);
      } else {
        newSet.add(entryId);
        // Scroll to the expanded activity block
        setTimeout(() => {
          const element = document.getElementById(`activity-${entryId}`);
          if (element) {
            element.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
          }
        }, 100);
      }
      return newSet;
    });
  };

  // Calculate form completion progress
  const calculateProgress = () => {
    let completed = 0;
    let total = 3; // Basic info, Activities, Additional
    
    // Basic info
    if (formData.project_id && formData.date) completed++;
    
    // Activities
    if (formData.activity_entries.length > 0) {
      const allActivitiesValid = formData.activity_entries.every((e: ActivityTypeEntry) => 
        e.activity_type_id && e.cost_center_id && 
        (e.user_ids.length > 0 ? e.user_ids.every(uid => e.user_hours[uid] && parseFloat(e.user_hours[uid]) > 0) : e.hours && parseFloat(e.hours) > 0)
      );
      if (allActivitiesValid) completed++;
    }
    
    // Additional (notes/photos are optional, so always complete)
    completed++;
    
    return Math.round((completed / total) * 100);
  };

  const progress = calculateProgress();

  // Calculate total hours per activity
  const getActivityTotalHours = (entry: ActivityTypeEntry) => {
    if (entry.user_ids.length > 0) {
      return entry.user_ids.reduce((sum, uid) => sum + (parseFloat(entry.user_hours[uid] || '0')), 0);
    }
    return parseFloat(entry.hours || '0');
  };

  return (
    <div className="space-y-3 sm:space-y-4 lg:space-y-6 p-3 sm:p-4 lg:p-6 max-h-[85vh] overflow-y-auto">
      {/* Progress Indicator */}
      <div className="mb-4 p-3 rounded-lg border border-border bg-muted/20">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-mono uppercase tracking-wider text-muted-foreground">Form Progress</span>
          <span className="text-sm font-bold text-electric">{progress}%</span>
        </div>
        <div className="w-full bg-muted rounded-full h-2">
          <div 
            className="bg-electric h-2 rounded-full transition-all duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {/* Form Sections */}
      <div className="space-y-4 sm:space-y-6">
        {/* Basic Information Section */}
        <div className="border border-border rounded-lg bg-muted/20 p-4 sm:p-6">
          <div className="flex items-center gap-2 mb-4">
            <Calendar className="w-4 h-4 text-electric" />
            <span className="font-semibold text-sm sm:text-base">Basic Information</span>
            {formData.project_id && formData.date && (
              <CheckCircle2 className="w-4 h-4 text-green-500" />
            )}
          </div>
          <div className="space-y-3 sm:space-y-4">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 sm:gap-4">
                <div>
                  <Label className="font-mono text-xs uppercase tracking-wider mb-2 block">Client</Label>
                  <Select value={formData.client_id} onValueChange={(value) => {
                    localStorage.setItem('timesheet_last_client', value);
                    handleClientChange(value);
                  }}>
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
                  <Label className="font-mono text-xs uppercase tracking-wider mb-2 block flex items-center gap-1">
                    Project *
                    {!formData.project_id && <AlertCircle className="w-3 h-3 text-destructive" />}
                  </Label>
                  <Select
                    value={formData.project_id}
                    onValueChange={(value) => {
                      localStorage.setItem('timesheet_last_project', value);
                      handleProjectChange(value);
                    }}
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
                <Label className="font-mono text-xs uppercase tracking-wider mb-2 block flex items-center gap-1">
                  Date *
                  {!formData.date && <AlertCircle className="w-3 h-3 text-destructive" />}
                </Label>
                <Input
                  type="date"
                  value={formData.date}
                  onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                  className="w-full sm:max-w-xs"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Activities Section */}
        <div className="border border-border rounded-lg bg-muted/20 p-4 sm:p-6">
          <div className="flex items-center gap-2 mb-4">
            <Wrench className="w-4 h-4 text-electric" />
            <span className="font-semibold text-sm sm:text-base">Activities *</span>
            {formData.activity_entries.length > 0 && formData.activity_entries.every((e: ActivityTypeEntry) => 
              e.activity_type_id && e.cost_center_id && 
              (e.user_ids.length > 0 ? e.user_ids.every(uid => e.user_hours[uid] && parseFloat(e.user_hours[uid]) > 0) : e.hours && parseFloat(e.hours) > 0)
            ) && (
              <CheckCircle2 className="w-4 h-4 text-green-500" />
            )}
          </div>
          <div className="space-y-3 sm:space-y-4">
              <div>
                <p className="text-sm text-muted-foreground mb-3">Select activity types to add</p>
                {/* Activity Type Buttons Grid */}
                {activityTypes.filter(type => type.is_active).length === 0 ? (
                  <div className="p-8 border-2 border-dashed border-muted rounded-lg text-center bg-muted/10">
                    <Wrench className="w-8 h-8 mx-auto mb-3 text-muted-foreground opacity-50" />
                    <p className="text-sm text-muted-foreground font-medium">No activity types available</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2 sm:gap-3 lg:gap-4">
                    {activityTypes.filter(type => type.is_active).map((type) => {
                      const isAdded = formData.activity_entries.some(
                        e => e.activity_type_id === type.id
                      );
                      return (
                        <Button
                          key={type.id}
                          type="button"
                          variant="outline"
                          className={cn(
                            "h-auto p-2 sm:p-3 lg:p-4 flex flex-col items-center gap-1 sm:gap-2 transition-all",
                            isAdded && "border-electric ring-2 ring-electric/20 bg-electric/5"
                          )}
                          onClick={() => addActivityEntry(type.id)}
                        >
                          <div className={cn(
                            "w-8 h-8 sm:w-10 sm:h-10 rounded-lg border-2 flex items-center justify-center",
                            type.color
                          )}>
                            {getIconComponent(type.icon)}
                          </div>
                          <span className="text-xs sm:text-sm font-medium text-center leading-tight">
                            {type.name}
                          </span>
                          {isAdded && <CheckCircle2 className="w-3 h-3 sm:w-4 sm:h-4 text-electric" />}
                        </Button>
                      );
                    })}
                  </div>
                )}
              </div>

              {formData.activity_entries.length > 0 && (
                formData.activity_entries.map((entry: ActivityTypeEntry, index: number) => {
                  const isExpanded = expandedActivities.has(entry.id);
                  const activityType = activityTypes.find(at => at.id === entry.activity_type_id);
                  const totalHours = getActivityTotalHours(entry);
                  const userCount = entry.user_ids.length;
                  
                  return (
                    <Collapsible key={entry.id} open={isExpanded} onOpenChange={() => toggleActivityExpanded(entry.id)}>
                      <Card id={`activity-${entry.id}`} className="border-2 border-border hover:border-electric/50 transition-colors bg-card">
                        <CollapsibleTrigger asChild>
                          <div className="flex items-center justify-between p-3 sm:p-4 cursor-pointer hover:bg-muted/30 transition-colors">
                            <div className="flex items-center gap-3 flex-1">
                              {activityType ? (
                                <div className={cn(
                                  "w-8 h-8 sm:w-10 sm:h-10 rounded-lg border-2 flex items-center justify-center flex-shrink-0",
                                  activityType.color
                                )}>
                                  {getIconComponent(activityType.icon)}
                                </div>
                              ) : (
                                <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg bg-electric/20 border-2 border-electric flex items-center justify-center flex-shrink-0">
                                  <span className="text-sm font-bold font-mono text-electric">{index + 1}</span>
                                </div>
                              )}
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                  <span className="font-semibold text-sm">
                                    {activityType?.name || `Activity ${index + 1}`}
                                  </span>
                                  {entry.activity_type_id && entry.cost_center_id && (
                                    <CheckCircle2 className="w-4 h-4 text-green-500 flex-shrink-0" />
                                  )}
                                </div>
                                <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                                  <span>{totalHours > 0 ? `${totalHours.toFixed(1)}h` : 'No hours'}</span>
                                  {userCount > 0 && <span>• {userCount} user{userCount !== 1 ? 's' : ''}</span>}
                                </div>
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              {formData.activity_entries.length > 1 && (
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    removeActivityEntry(entry.id);
                                  }}
                                  className="h-8 w-8 p-0 text-destructive hover:text-destructive hover:bg-destructive/10"
                                >
                                  <X className="w-4 h-4" />
                                </Button>
                              )}
                            </div>
                          </div>
                        </CollapsibleTrigger>
                        
                        <CollapsibleContent>
                          <div className="px-3 sm:px-4 pb-4 space-y-3 sm:space-y-4 border-t border-border pt-3 sm:pt-4">

                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 sm:gap-4">
                              <div>
                                <Label className="font-mono text-xs uppercase tracking-wider mb-2 block flex items-center gap-1">
                                  Cost Center *
                                  {!entry.cost_center_id && <AlertCircle className="w-3 h-3 text-destructive" />}
                                </Label>
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

                            {/* Improved Users and Hours Section */}
                            <div className="space-y-3">
                              <div className="flex items-center justify-between">
                                <Label className="font-mono text-xs uppercase tracking-wider flex items-center gap-2">
                                  <Users className="w-4 h-4 text-electric" />
                                  Assign Users & Hours
                                </Label>
                                {users.length > 0 && (
                                  <div className="flex gap-2">
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      size="sm"
                                      className="h-7 text-xs"
                                      onClick={() => {
                                        users.forEach(user => {
                                          if (!entry.user_ids.includes(user.id)) {
                                            toggleUserForActivity(entry.id, user.id);
                                          }
                                        });
                                      }}
                                    >
                                      Select All
                                    </Button>
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      size="sm"
                                      className="h-7 text-xs"
                                      onClick={() => {
                                        entry.user_ids.forEach(userId => {
                                          toggleUserForActivity(entry.id, userId);
                                        });
                                      }}
                                    >
                                      Deselect All
                                    </Button>
                                  </div>
                                )}
                              </div>
                              
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                {users.map((user) => {
                                  const isSelected = entry.user_ids.includes(user.id);
                                  return (
                                    <div
                                      key={user.id}
                                      className={cn(
                                        "flex items-center gap-2 p-2 rounded-lg border-2 transition-all cursor-pointer",
                                        isSelected 
                                          ? "border-electric bg-electric/10" 
                                          : "border-border hover:border-electric/30 bg-card"
                                      )}
                                      onClick={() => toggleUserForActivity(entry.id, user.id)}
                                    >
                                      <div className="flex-1 min-w-0">
                                        <Label className="text-sm font-medium cursor-pointer truncate block">
                                          {user.name}
                                        </Label>
                                      </div>
                                      {isSelected ? (
                                        <div className="flex items-center gap-1">
                                          <Input
                                            type="number"
                                            step="0.25"
                                            min="0.25"
                                            max="24"
                                            value={entry.user_hours[user.id] || ''}
                                            onChange={(e) => {
                                              e.stopPropagation();
                                              updateUserHoursForActivity(entry.id, user.id, e.target.value);
                                            }}
                                            onClick={(e) => e.stopPropagation()}
                                            placeholder="0.00"
                                            className="w-20 h-8 text-xs font-mono text-center border-electric/30 focus:border-electric"
                                          />
                                          <span className="text-xs text-muted-foreground">h</span>
                                        </div>
                                      ) : (
                                        <div className="w-6 h-6 rounded border-2 border-border flex items-center justify-center">
                                          <div className="w-3 h-3 rounded bg-muted" />
                                        </div>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>

                              {entry.user_ids.length > 0 && (
                                <div className="p-2 rounded-lg bg-electric/5 border border-electric/20">
                                  <p className="text-xs font-mono text-electric text-center">
                                    Total: <span className="font-bold">{totalHours.toFixed(1)}h</span>
                                  </p>
                                </div>
                              )}

                              {entry.user_ids.length === 0 && (
                                <div className="p-4 text-xs text-muted-foreground text-center border-2 border-dashed border-muted rounded-lg bg-muted/10">
                                  <Users className="w-5 h-5 mx-auto mb-2 opacity-50" />
                                  <p>Click users above to assign hours</p>
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
                                className="min-h-[60px] text-sm"
                              />
                            </div>
                          </div>
                        </CollapsibleContent>
                      </Card>
                    </Collapsible>
                  );
                })
              )}
          </div>
        </div>

        {/* Additional Details - Inline (not in accordion) */}
        <div className="border border-border rounded-lg bg-muted/20 p-4 sm:p-6">
          <div className="space-y-4">
          {/* General Notes */}
          <div>
            <Label className="font-mono text-xs uppercase tracking-wider mb-2 block flex items-center gap-2">
              <Image className="w-4 h-4 text-electric" />
              General Notes
            </Label>
            <Textarea
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              placeholder="General work description..."
              className="min-h-[80px] resize-none"
            />
          </div>

          {/* Improved Photo/Image Upload Section */}
          <div>
            <Label className="font-mono text-xs uppercase tracking-wider mb-3 block flex items-center gap-2">
              <Camera className="w-4 h-4 text-electric" />
              Photos / Media
            </Label>
    
            {/* Enhanced Drag and Drop Zone */}
            {imagePreviews.length < 5 && (
              <div
                ref={dropZoneRef as React.LegacyRef<HTMLDivElement>}
                onDragEnter={handleDragEnter}
                onDragLeave={handleDragLeave}
                onDragOver={handleDragOver}
                onDrop={handleDrop}
                className={cn(
                  "border-2 border-dashed rounded-lg p-8 sm:p-12 transition-all duration-200 cursor-pointer",
                  isDragging 
                    ? "border-electric bg-electric/20 scale-[1.02] shadow-lg shadow-electric/20" 
                    : "border-electric/50 hover:border-electric bg-electric/5"
                )}
                onClick={() => fileInputRef.current?.click()}
              >
                <div className="flex flex-col items-center justify-center gap-4 text-center">
                  <div className={cn(
                    "w-16 h-16 sm:w-20 sm:h-20 rounded-full flex items-center justify-center transition-colors",
                    isDragging ? "bg-electric/30" : "bg-electric/10"
                  )}>
                    <Image className={cn(
                      "w-8 h-8 sm:w-10 sm:h-10 transition-colors",
                      isDragging ? "text-electric" : "text-electric"
                    )} />
                  </div>
                  <div>
                    <p className={cn(
                      "text-sm sm:text-base font-semibold transition-colors",
                      isDragging ? "text-electric" : "text-foreground"
                    )}>
                      {isDragging ? "Drop images here" : "Drag & drop images here"}
                    </p>
                    <p className="text-xs sm:text-sm text-muted-foreground mt-1">
                      or click to browse • Up to 5 photos (max 10MB each)
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Improved Image Preview Grid */}
            {imagePreviews.length > 0 && (
              <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-5 gap-2 sm:gap-3 lg:gap-4">
                    {imagePreviews.map((preview, index) => (
                      <div key={index} className="relative aspect-square rounded-lg overflow-hidden border-2 border-border group hover:border-electric transition-all shadow-sm hover:shadow-md">
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
                          onClick={(e) => {
                            e.stopPropagation();
                            removeImage(index);
                          }}
                          className="absolute top-1 right-1 w-6 h-6 bg-destructive rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow-lg hover:scale-110 z-10"
                        >
                          <X className="w-3.5 h-3.5 text-white" />
                        </button>
                        {/* File Info */}
                        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent text-white text-xs p-1.5 truncate opacity-0 group-hover:opacity-100 transition-opacity">
                          {imageFiles[index]?.name || `Image ${index + 1}`}
                        </div>
                      </div>
                    ))}
                    
                    {/* Quick Upload Buttons */}
                    {imagePreviews.length < 5 && (
                      <>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            cameraInputRef.current?.click();
                          }}
                          className="aspect-square rounded-lg border-2 border-dashed border-muted hover:border-electric hover:bg-electric/5 flex flex-col items-center justify-center gap-2 transition-all group"
                        >
                          <div className="w-8 h-8 rounded-full bg-muted group-hover:bg-electric/20 flex items-center justify-center transition-colors">
                            <Camera className="w-4 h-4 text-muted-foreground group-hover:text-electric transition-colors" />
                          </div>
                          <span className="text-xs text-muted-foreground group-hover:text-electric font-medium">Camera</span>
                        </button>
                        {imagePreviews.length < 4 && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              fileInputRef.current?.click();
                            }}
                            className="aspect-square rounded-lg border-2 border-dashed border-muted hover:border-electric hover:bg-electric/5 flex flex-col items-center justify-center gap-2 transition-all group"
                          >
                            <div className="w-8 h-8 rounded-full bg-muted group-hover:bg-electric/20 flex items-center justify-center transition-colors">
                              <Image className="w-4 h-4 text-muted-foreground group-hover:text-electric transition-colors" />
                            </div>
                            <span className="text-xs text-muted-foreground group-hover:text-electric font-medium">Gallery</span>
                          </button>
                        )}
                      </>
                    )}
                  </div>
                )}

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
          </div>
        </div>
      </div>

      {/* Sticky Action Buttons */}
      <div className="flex justify-end gap-2 sm:gap-3 pt-3 sm:pt-4 border-t border-border sticky bottom-0 bg-card -mx-3 sm:-mx-4 lg:-mx-6 px-3 sm:px-4 lg:px-6 pb-2 mt-4">
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
