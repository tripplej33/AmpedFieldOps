import { Router, Response } from 'express';
import { authenticate, AuthRequest } from '../middleware/auth';
import { log } from '../lib/logger';
import { supabase, getSupabaseClient } from '../db/supabase';

function getClient(req: AuthRequest) {
  const token = req.headers.authorization?.startsWith('Bearer ')
    ? req.headers.authorization.split(' ')[1]
    : undefined;
  return supabase || getSupabaseClient(token);
}

const router = Router();

// Root endpoint - returns available dashboard endpoints
router.get('/', authenticate, async (req: AuthRequest, res: Response) => {
  res.json({
    message: 'Dashboard API',
    availableEndpoints: [
      '/api/dashboard/metrics',
      '/api/dashboard/recent-timesheets',
      '/api/dashboard/active-projects',
      '/api/dashboard/quick-stats'
    ]
  });
});

// Get dashboard metrics
router.get('/metrics', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const client = getClient(req);
    if (!client) {
      return res.status(503).json({ error: 'Supabase not configured' });
    }

    const [projectsResult, timesheetsResult] = await Promise.all([
      client.from('projects').select('id,status,budget,updated_at,end_date'),
      client.from('timesheets').select('id,hours,entry_date,user_id,project_id,created_at'),
    ]);

    if (projectsResult.error) throw projectsResult.error;
    if (timesheetsResult.error) throw timesheetsResult.error;

    const projects = projectsResult.data || [];
    const timesheets = timesheetsResult.data || [];

    const activeStatuses = ['active', 'in-progress', 'quoted'];
    const totalProjects = projects.length;
    const activeProjects = projects.filter((p) => activeStatuses.includes(p.status)).length;

    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);

    const hoursTotal = timesheets.reduce((sum, t) => sum + (t.hours || 0), 0);
    const hoursThisMonth = timesheets
      .filter((t) => new Date(t.entry_date) >= monthStart)
      .reduce((sum, t) => sum + (t.hours || 0), 0);
    const hoursLastMonth = timesheets
      .filter((t) => {
        const d = new Date(t.entry_date);
        return d >= lastMonthStart && d < monthStart;
      })
      .reduce((sum, t) => sum + (t.hours || 0), 0);

    // Cost/revenue fields are not present in Supabase schema yet; keep zeroed to avoid errors
    const revenueTotal = 0;
    const revenueThisMonth = 0;
    const revenueLastMonth = 0;

    const hoursTrend = hoursLastMonth > 0 ? ((hoursThisMonth - hoursLastMonth) / hoursLastMonth) * 100 : 0;
    const revenueTrend = revenueLastMonth > 0 ? ((revenueThisMonth - revenueLastMonth) / revenueLastMonth) * 100 : 0;

    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - 7);
    const activeTeam = new Set(
      timesheets.filter((t) => new Date(t.entry_date) >= weekStart).map((t) => t.user_id)
    ).size;

    const recentActivityMap = new Map<string, number>();
    timesheets
      .filter((t) => new Date(t.entry_date) >= weekStart)
      .forEach((t) => {
        const key = new Date(t.entry_date).toISOString().slice(0, 10);
        recentActivityMap.set(key, (recentActivityMap.get(key) || 0) + (t.hours || 0));
      });

    const recentActivity = Array.from(recentActivityMap.entries())
      .sort((a, b) => (a[0] < b[0] ? -1 : 1))
      .map(([date, hours]) => ({ date, hours }));

    res.json({
      totalProjects,
      activeProjects,
      totalHours: hoursTotal,
      totalRevenue: revenueTotal,
      projectsTrend: 0,
      hoursTrend: Math.round(hoursTrend * 10) / 10,
      revenueTrend: Math.round(revenueTrend * 10) / 10,
      activeTeam,
      recentActivity,
    });
  } catch (error) {
    log.error('Dashboard metrics error', error);
    res.status(500).json({ error: 'Failed to fetch dashboard metrics' });
  }
});

// Get recent timesheets
router.get('/recent-timesheets', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const client = getClient(req);
    if (!client) return res.status(503).json({ error: 'Supabase not configured' });

    const { limit = 5 } = req.query;

    const { data, error } = await client
      .from('timesheets')
      .select(`
        id, entry_date, hours, user_id, project_id, activity_type_id, created_at,
        users!timesheets_user_id_fkey(name),
        projects(name),
        activity_types(name)
      `)
      .order('entry_date', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(parseInt(limit as string, 10));

    if (error) throw error;

    const mapped = (data || []).map((t: any) => ({
      ...t,
      user_name: t.users?.name || null,
      project_name: t.projects?.name || null,
      activity_type_name: t.activity_types?.name || null,
    }));

    res.json(mapped);
  } catch (error) {
    log.error('Recent timesheets error', error);
    res.status(500).json({ error: 'Failed to fetch recent timesheets' });
  }
});

// Get active projects with progress
router.get('/active-projects', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const client = getClient(req);
    if (!client) return res.status(503).json({ error: 'Supabase not configured' });

    const { limit = 5 } = req.query;

    const [{ data: projects, error: projError }, { data: timesheets, error: tsError }] = await Promise.all([
      client
        .from('projects')
        .select('id,name,client_id,status,updated_at,budget,end_date, clients(name)')
        .eq('status', 'active')
        .order('updated_at', { ascending: false })
        .limit(parseInt(limit as string, 10)),
      client.from('timesheets').select('project_id,hours'),
    ]);

    if (projError) throw projError;
    if (tsError) throw tsError;

    const hoursByProject = new Map<string, number>();
    (timesheets || []).forEach((t: any) => {
      if (!t.project_id) return;
      hoursByProject.set(t.project_id, (hoursByProject.get(t.project_id) || 0) + (t.hours || 0));
    });

    const mapped = (projects || []).map((p: any) => ({
      ...p,
      client_name: (p as any).clients?.name || null,
      hours_logged: hoursByProject.get(p.id) || 0,
    }));

    res.json(mapped);
  } catch (error) {
    log.error('Active projects error', error);
    res.status(500).json({ error: 'Failed to fetch active projects' });
  }
});

// Get quick stats (budget utilization, projects on track, overdue)
router.get('/quick-stats', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const client = getClient(req);
    if (!client) return res.status(503).json({ error: 'Supabase not configured' });

    const { data, error } = await client
      .from('projects')
      .select('status,budget,end_date');

    if (error) throw error;

    const projects = data || [];
    const activeStatuses = ['active', 'in-progress', 'quoted'];
    const inProgress = projects.filter((p: any) => activeStatuses.includes(p.status));

    const totalBudget = projects.reduce((sum, p: any) => sum + (p.budget || 0), 0);
    // Actuals not tracked yet; treat as zero to avoid missing column errors
    const totalActual = 0;
    const budgetUtilization = totalBudget > 0 ? (totalActual / totalBudget) * 100 : 0;

    const onTrack = inProgress.filter((p: any) => (p.budget || 0) === 0 || totalActual <= (p.budget || 0)).length;
    const onTrackPercent = inProgress.length > 0 ? (onTrack / inProgress.length) * 100 : 100;

    const overdue = inProgress.filter((p: any) => p.end_date && new Date(p.end_date) < new Date()).length;
    const overduePercent = inProgress.length > 0 ? (overdue / inProgress.length) * 100 : 0;

    res.json({
      budgetUtilization: Math.round(budgetUtilization),
      projectsOnTrack: Math.round(onTrackPercent),
      overdueProjects: Math.round(overduePercent),
    });
  } catch (error) {
    log.error('Quick stats error', error);
    res.status(500).json({ error: 'Failed to fetch quick stats' });
  }
});

export default router;
