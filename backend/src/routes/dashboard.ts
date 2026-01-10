import { Router, Response } from 'express';
import { query } from '../db';
import { authenticate, AuthRequest } from '../middleware/auth';
import { log } from '../lib/logger';

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
    // Total and active projects
    const projectsResult = await query(`
      SELECT 
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE status IN ('quoted', 'in-progress')) as active
      FROM projects
    `);

    // Total hours (all time and this month)
    const hoursResult = await query(`
      SELECT 
        COALESCE(SUM(hours), 0) as total,
        COALESCE(SUM(hours) FILTER (WHERE date >= date_trunc('month', CURRENT_DATE)), 0) as this_month,
        COALESCE(SUM(hours) FILTER (WHERE date >= date_trunc('month', CURRENT_DATE - INTERVAL '1 month') AND date < date_trunc('month', CURRENT_DATE)), 0) as last_month
      FROM timesheets
    `);

    // Total revenue (from projects)
    const revenueResult = await query(`
      SELECT 
        COALESCE(SUM(actual_cost), 0) as total,
        COALESCE(SUM(actual_cost) FILTER (WHERE updated_at >= date_trunc('month', CURRENT_DATE)), 0) as this_month,
        COALESCE(SUM(actual_cost) FILTER (WHERE updated_at >= date_trunc('month', CURRENT_DATE - INTERVAL '1 month') AND updated_at < date_trunc('month', CURRENT_DATE)), 0) as last_month
      FROM projects
    `);

    // Active technicians (users with timesheets this week)
    const techsResult = await query(`
      SELECT COUNT(DISTINCT user_id) as active
      FROM timesheets
      WHERE date >= date_trunc('week', CURRENT_DATE)
    `);

    // Calculate trends
    const hours = hoursResult.rows[0];
    const revenue = revenueResult.rows[0];
    
    const hoursTrend = hours.last_month > 0 
      ? ((hours.this_month - hours.last_month) / hours.last_month * 100) 
      : 0;
    
    const revenueTrend = revenue.last_month > 0 
      ? ((revenue.this_month - revenue.last_month) / revenue.last_month * 100) 
      : 0;

    // Recent activity (last 7 days)
    const recentActivity = await query(`
      SELECT 
        date,
        COALESCE(SUM(hours), 0) as hours
      FROM timesheets
      WHERE date >= CURRENT_DATE - INTERVAL '7 days'
      GROUP BY date
      ORDER BY date ASC
    `);

    res.json({
      totalProjects: parseInt(projectsResult.rows[0].total),
      activeProjects: parseInt(projectsResult.rows[0].active),
      totalHours: parseFloat(hours.total),
      totalRevenue: parseFloat(revenue.total),
      projectsTrend: 0, // Could calculate from projects created this month vs last
      hoursTrend: Math.round(hoursTrend * 10) / 10,
      revenueTrend: Math.round(revenueTrend * 10) / 10,
      activeTeam: parseInt(techsResult.rows[0].active),
      recentActivity: recentActivity.rows.map(r => ({
        date: r.date,
        hours: parseFloat(r.hours)
      }))
    });
  } catch (error) {
    log.error('Dashboard metrics error', error);
    res.status(500).json({ error: 'Failed to fetch dashboard metrics' });
  }
});

// Get recent timesheets
router.get('/recent-timesheets', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { limit = 5 } = req.query;

    const result = await query(`
      SELECT t.*, 
        u.name as user_name,
        p.name as project_name,
        c.name as client_name,
        at.name as activity_type_name
      FROM timesheets t
      LEFT JOIN users u ON t.user_id = u.id
      LEFT JOIN projects p ON t.project_id = p.id
      LEFT JOIN clients c ON t.client_id = c.id
      LEFT JOIN activity_types at ON t.activity_type_id = at.id
      ORDER BY t.date DESC, t.created_at DESC
      LIMIT $1
    `, [parseInt(limit as string)]);

    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch recent timesheets' });
  }
});

// Get active projects with progress
router.get('/active-projects', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { limit = 5 } = req.query;

    const result = await query(`
      SELECT p.*, 
        c.name as client_name,
        COALESCE(SUM(t.hours), 0) as hours_logged
      FROM projects p
      LEFT JOIN clients c ON p.client_id = c.id
      LEFT JOIN timesheets t ON t.project_id = p.id
      WHERE p.status = 'in-progress'
      GROUP BY p.id, c.name
      ORDER BY p.updated_at DESC
      LIMIT $1
    `, [parseInt(limit as string)]);

    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch active projects' });
  }
});

// Get quick stats (budget utilization, projects on track, overdue)
router.get('/quick-stats', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    // Budget utilization
    const budgetResult = await query(`
      SELECT 
        COALESCE(SUM(budget), 0) as total_budget,
        COALESCE(SUM(actual_cost), 0) as total_actual
      FROM projects
      WHERE status IN ('in-progress', 'completed')
    `);

    const budget = budgetResult.rows[0];
    const budgetUtilization = budget.total_budget > 0 
      ? (budget.total_actual / budget.total_budget * 100) 
      : 0;

    // Projects on track (under budget)
    const onTrackResult = await query(`
      SELECT 
        COUNT(*) FILTER (WHERE actual_cost <= budget OR budget = 0) as on_track,
        COUNT(*) as total
      FROM projects
      WHERE status IN ('in-progress')
    `);

    const onTrack = onTrackResult.rows[0];
    const onTrackPercent = onTrack.total > 0 
      ? (onTrack.on_track / onTrack.total * 100) 
      : 100;

    // Overdue projects (past end_date but not completed)
    const overdueResult = await query(`
      SELECT COUNT(*) as count
      FROM projects
      WHERE status = 'in-progress'
      AND end_date < CURRENT_DATE
    `);

    const totalActive = await query(`
      SELECT COUNT(*) as count FROM projects WHERE status IN ('quoted', 'in-progress')
    `);

    const overduePercent = parseInt(totalActive.rows[0].count) > 0
      ? (parseInt(overdueResult.rows[0].count) / parseInt(totalActive.rows[0].count) * 100)
      : 0;

    res.json({
      budgetUtilization: Math.round(budgetUtilization),
      projectsOnTrack: Math.round(onTrackPercent),
      overdueProjects: Math.round(overduePercent)
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch quick stats' });
  }
});

export default router;
