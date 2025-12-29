import fs from 'fs';
import path from 'path';
import { DiscoveredRoute } from './types';

/**
 * Scan route files to discover API endpoints
 */
export async function scanRoutes(): Promise<DiscoveredRoute[]> {
  const routesDir = path.join(__dirname, '../../routes');
  const routes: DiscoveredRoute[] = [];

  try {
    const files = fs.readdirSync(routesDir);
    
    for (const file of files) {
      if (file.endsWith('.ts') && file !== 'troubleshooter.ts') {
        const filePath = path.join(routesDir, file);
        const content = fs.readFileSync(filePath, 'utf-8');
        
        // Extract route definitions
        const routeMatches = content.matchAll(
          /router\.(get|post|put|delete|patch)\s*\(\s*['"`]([^'"`]+)['"`]/g
        );

        for (const match of routeMatches) {
          const method = match[1].toUpperCase();
          const routePath = match[2];
          
          // Extract middleware (simplified - looks for authenticate, requireRole, requirePermission)
          const middleware: string[] = [];
          const lines = content.split('\n');
          const routeIndex = content.indexOf(match[0]);
          const routeLineNumber = content.substring(0, routeIndex).split('\n').length - 1;
          
          // Check a few lines before the route for middleware
          for (let i = Math.max(0, routeLineNumber - 10); i < routeLineNumber; i++) {
            const line = lines[i];
            if (line.includes('authenticate')) middleware.push('authenticate');
            if (line.includes('requireRole')) {
              const roleMatch = line.match(/requireRole\(([^)]+)\)/);
              if (roleMatch) middleware.push(`requireRole(${roleMatch[1]})`);
            }
            if (line.includes('requirePermission')) {
              const permMatch = line.match(/requirePermission\(([^)]+)\)/);
              if (permMatch) middleware.push(`requirePermission(${permMatch[1]})`);
            }
          }

          // Determine base path from file name (matches server.ts route registration)
          let basePath = '';
          const filename = file.replace('.ts', '');
          
          // Map file names to their API paths
          const routeMap: Record<string, string> = {
            'auth': '/api/auth',
            'users': '/api/users',
            'clients': '/api/clients',
            'projects': '/api/projects',
            'timesheets': '/api/timesheets',
            'costCenters': '/api/cost-centers',
            'activityTypes': '/api/activity-types',
            'search': '/api/search',
            'setup': '/api/setup',
            'xero': '/api/xero',
            'settings': '/api/settings',
            'permissions': '/api/permissions',
            'role-permissions': '/api/role-permissions',
            'dashboard': '/api/dashboard',
            'health': '/api/health',
          };
          
          basePath = routeMap[filename] || `/api/${filename}`;
          
          routes.push({
            method,
            path: routePath.startsWith('/') ? `${basePath}${routePath}` : `${basePath}/${routePath}`,
            file,
            middleware: [...new Set(middleware)], // Remove duplicates
          });
        }
      }
    }
  } catch (error) {
    console.error('Error scanning routes:', error);
  }

  return routes;
}

/**
 * Get route file path
 */
export function getRouteFilePath(filename: string): string {
  return path.join(__dirname, '../../routes', filename);
}

