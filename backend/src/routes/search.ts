import { Router, Response } from 'express';
import { query } from '../db';
import { supabase as supabaseClient } from '../db/supabase';
import { authenticate, AuthRequest } from '../middleware/auth';
import { log } from '../lib/logger';

const router = Router();
const supabase = supabaseClient!;

// Global search
router.get('/', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { q, type, limit = 20 } = req.query;
    
    if (!q || (q as string).length < 2) {
      return res.json({ clients: [], projects: [], timesheets: [] });
    }

    const searchTerm = `%${q}%`;
    const searchLimit = Math.min(parseInt(limit as string) || 20, 50);

    const results: any = {};

    // Search based on type or search all
    if (!type || type === 'clients') {
      const { data: clients } = await supabase
        .from('clients')
        .select('id, name, contact_name, email, location, status')
        .or(`name.ilike.${searchTerm},contact_name.ilike.${searchTerm},address.ilike.${searchTerm},email.ilike.${searchTerm}`)
        .order('name', { ascending: true })
        .limit(searchLimit);
      
      results.clients = clients || [];
    }

    if (!type || type === 'projects') {
      const { data: projects } = await supabase
        .from('projects')
        .select('id, code, name, status, clients(name)')
        .or(`name.ilike.${searchTerm},code.ilike.${searchTerm},description.ilike.${searchTerm}`)
        .order('created_at', { ascending: false })
        .limit(searchLimit);
      
      results.projects = (projects || []).map((p: any) => ({
        ...p,
        client_name: Array.isArray(p.clients) ? p.clients[0]?.name : p.clients?.name
      }));
    }

    if (!type || type === 'timesheets') {
      const canViewAll = req.user!.role === 'admin' || 
                         req.user!.role === 'manager' || 
                         req.user!.permissions.includes('can_view_all_timesheets');

      let query_builder = supabase
        .from('timesheets')
        .select('id, date, hours, notes, projects(name), clients(name), users(name)')
        .or(`notes.ilike.${searchTerm}`);

      if (!canViewAll) {
        query_builder = query_builder.eq('user_id', req.user!.id);
      }

      const { data: timesheets } = await query_builder
        .order('date', { ascending: false })
        .limit(searchLimit);

      results.timesheets = (timesheets || []).map((t: any) => ({
        ...t,
        project_name: Array.isArray(t.projects) ? t.projects[0]?.name : t.projects?.name,
        client_name: Array.isArray(t.clients) ? t.clients[0]?.name : t.clients?.name,
        user_name: Array.isArray(t.users) ? t.users[0]?.name : t.users?.name
      }));
    }

    res.json(results);
  } catch (error) {
    log.error('Search error', error, { userId: req.user?.id });
    res.status(500).json({ error: 'Search failed' });
  }
});

// Save recent search (optional feature)
router.post('/recent', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { query: searchQuery, type } = req.body;
    
    // Store in settings as JSON
    const { data: existing } = await supabase
      .from('settings')
      .select('value')
      .eq('key', 'recent_searches')
      .eq('user_id', req.user!.id)
      .single();

    let searches = [];
    if (existing && existing.value) {
      searches = JSON.parse(existing.value);
    }

    // Add new search to front, limit to 10
    searches = [{ query: searchQuery, type, timestamp: new Date() }, ...searches].slice(0, 10);

    await supabase
      .from('settings')
      .upsert({ 
        key: 'recent_searches', 
        value: JSON.stringify(searches), 
        user_id: req.user!.id 
      }, { onConflict: 'key,user_id' });

    res.json({ message: 'Search saved' });
  } catch (error) {
    log.error('Save recent search error', error, { userId: req.user?.id });
    res.status(500).json({ error: 'Failed to save search' });
  }
});

// Get recent searches
router.get('/recent', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { data: result } = await supabase
      .from('settings')
      .select('value')
      .eq('key', 'recent_searches')
      .eq('user_id', req.user!.id)
      .single();

    if (!result || !result.value) {
      return res.json([]);
    }

    res.json(JSON.parse(result.value));
  } catch (error) {
    log.error('Get recent searches error', error, { userId: req.user?.id });
    res.status(500).json({ error: 'Failed to fetch recent searches' });
  }
});

// Clear recent searches
router.delete('/recent', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    await supabase
      .from('settings')
      .delete()
      .eq('key', 'recent_searches')
      .eq('user_id', req.user!.id);

    res.json({ message: 'Recent searches cleared' });
  } catch (error) {
    log.error('Clear recent searches error', error, { userId: req.user?.id });
    res.status(500).json({ error: 'Failed to clear recent searches' });
  }
});

export default router;
