# Production Deployment Checklist

**Last Updated:** January 17, 2026  
**Target Domain:** admin.ampedlogix.com  
**Server IP:** 192.168.1.124  
**Proxy Manager:** 192.168.1.134

---

## Phase 1: Network & Firewall ✅ CRITICAL

### Firewall Ports (on 192.168.1.124)
- [x] **Port 3000** - Frontend container accessible from Nginx Proxy Manager
- [x] **Port 3001** - Backend API accessible from Nginx Proxy Manager  
- [x] **Port 54321** - Supabase Kong accessible from Nginx Proxy Manager ⚠️ **YOU JUST OPENED THIS**

### Verify Accessibility
```bash
# Run from ANY machine that can reach 192.168.1.124
curl -I http://192.168.1.124:3000/      # Should return 200
curl -I http://192.168.1.124:3001/api/health  # Should return 200
curl -I http://192.168.1.124:54321/rest/v1/   # Should return 200

# All three MUST work or the app won't function
```

### DNS Configuration
- [ ] `admin.ampedlogix.com` → Points to **192.168.1.134** (Nginx Proxy Manager)
- [ ] `supabase.ampedlogix.com` → Points to **192.168.1.134** (or use wildcard *.ampedlogix.com)

```bash
# Verify DNS
nslookup admin.ampedlogix.com
nslookup supabase.ampedlogix.com
```

---

## Phase 2: Nginx Proxy Manager Configuration

### Proxy Host 1: Main Application
**Status:** ✅ Should already be configured

- **Domain:** admin.ampedlogix.com
- **Forward to:** 192.168.1.124:3000
- **Scheme:** http
- **SSL:** Force SSL, HTTP/2, HSTS
- **Advanced:**
  ```nginx
  # Optional: Add custom headers
  proxy_set_header X-Real-IP $remote_addr;
  proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
  ```

### Proxy Host 2: Supabase Backend
**Status:** ⚠️ **MUST BE CREATED NOW**

- **Domain:** supabase.ampedlogix.com
- **Forward to:** 192.168.1.124:54321
- **Scheme:** http
- **Cache Assets:** NO (important!)
- **Block Common Exploits:** YES
- **Websockets Support:** YES (required for realtime)
- **SSL:** Force SSL, HTTP/2, HSTS

**Advanced Configuration (Optional but recommended):**
```nginx
# Increase timeouts for long-running operations
proxy_read_timeout 600s;
proxy_connect_timeout 600s;
proxy_send_timeout 600s;

# Forward original host
proxy_set_header Host $host;
proxy_set_header X-Real-IP $remote_addr;
proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
proxy_set_header X-Forwarded-Proto $scheme;
```

### Test Proxy Configuration
```bash
# After creating both proxy hosts in NPM:
curl -I https://admin.ampedlogix.com           # Should return 200
curl -I https://supabase.ampedlogix.com/rest/v1/  # Should return 200
```

---

## Phase 3: Application Configuration

### Environment Variables (Already Set ✅)
```bash
# Frontend (builds into static files)
VITE_SUPABASE_URL=https://supabase.ampedlogix.com
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
VITE_API_URL=

# Backend (runtime)
SUPABASE_URL=http://127.0.0.1:54321  # Local access, no need for proxy
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

### Docker Containers (Running ✅)
```bash
docker compose ps
# Should show all services healthy
```

---

## Phase 4: Database & Migrations

### Supabase Migrations
```bash
# Check applied migrations
docker exec supabase_db_AmpedFieldOps psql -U postgres -c \
  "SELECT version FROM supabase_migrations.schema_migrations ORDER BY version;"

# Should show migrations applied (or apply them if needed)
cd /root/AmpedFieldOps
supabase db reset  # Only if starting fresh
```

### Create First Admin User
```bash
# Via setup endpoint (after frontend is accessible)
curl -X POST https://admin.ampedlogix.com/api/setup/admin \
  -H "Content-Type: application/json" \
  -d '{
    "email": "your-email@example.com",
    "password": "YourSecurePassword123!",
    "name": "Admin User",
    "company_name": "Your Company",
    "timezone": "America/Los_Angeles"
  }'

# Should return user object and token
```

---

## Phase 5: Testing & Verification

### Frontend Tests
1. **Load homepage:** https://admin.ampedlogix.com
   - [ ] Page loads without errors
   - [ ] No console errors (F12 > Console)
   - [ ] AdminSetupModal appears (first-time setup)

2. **Browser Network Tab (F12 > Network):**
   - [ ] Requests to `https://supabase.ampedlogix.com` succeed (not http://127.0.0.1)
   - [ ] No CORS errors
   - [ ] No mixed content warnings

### Backend Tests
```bash
# Health check
curl https://admin.ampedlogix.com/api/health
# Should return: {"status":"ok","database":"connected"}

# Setup status
curl https://admin.ampedlogix.com/api/setup/default-admin-status
# Should return: {"hasDefaultAdmin":false}
```

### Authentication Flow
1. [ ] Admin setup form submits successfully
2. [ ] User can login after setup
3. [ ] Dashboard loads with user data
4. [ ] API calls work (check Network tab)

---

## Phase 6: Troubleshooting

### Issue: "Failed to fetch" or Network Errors

**Check:**
```bash
# 1. Is Supabase proxy configured?
curl -I https://supabase.ampedlogix.com/rest/v1/

# 2. Is frontend using correct URL? (check browser console)
# Should see: https://supabase.ampedlogix.com NOT http://127.0.0.1:54321

# 3. Are all ports open?
ss -tlnp | grep -E ':(3000|3001|54321)'
```

### Issue: CORS Errors

**Solution:** Add to Nginx Proxy Manager advanced config:
```nginx
add_header 'Access-Control-Allow-Origin' '$http_origin' always;
add_header 'Access-Control-Allow-Methods' 'GET, POST, PUT, DELETE, OPTIONS' always;
add_header 'Access-Control-Allow-Headers' 'Authorization, Content-Type, apikey' always;
add_header 'Access-Control-Allow-Credentials' 'true' always;

if ($request_method = 'OPTIONS') {
    return 204;
}
```

### Issue: Supabase Returns 404

**Check:**
```bash
# Is Supabase running?
docker ps | grep supabase

# Can backend reach it?
docker exec ampedfieldops-api curl http://host.docker.internal:54321/rest/v1/

# Is port 54321 open?
ss -tlnp | grep 54321
```

### Issue: Login Works But No Data

**Check RLS Policies:**
```bash
# Open Supabase Studio
open http://192.168.1.124:54323

# Go to Authentication > Users
# Verify user exists in auth.users

# Go to Table Editor > users
# Verify user exists in public.users with same ID
```

---

## Phase 7: Post-Deployment

### Security Hardening
- [ ] Change default Supabase JWT secret (if using production)
- [ ] Enable rate limiting in Nginx Proxy Manager
- [ ] Set up SSL certificate auto-renewal
- [ ] Configure backup strategy
- [ ] Enable log rotation

### Monitoring
- [ ] Set up uptime monitoring (UptimeRobot, Pingdom, etc.)
- [ ] Monitor disk space: `df -h`
- [ ] Monitor Docker logs: `docker compose logs -f --tail=100`
- [ ] Check Supabase Studio for errors: http://192.168.1.124:54323

### Backup Strategy
```bash
# Database backup (run daily via cron)
docker exec supabase_db_AmpedFieldOps pg_dump -U postgres postgres > \
  /root/backups/supabase_$(date +%Y%m%d).sql

# Upload volumes backup
tar -czf /root/backups/uploads_$(date +%Y%m%d).tar.gz \
  /root/AmpedFieldOps/backend/uploads/
```

---

## Quick Reference Commands

```bash
# Restart all services
cd /root/AmpedFieldOps && docker compose restart

# View logs
docker compose logs -f backend frontend

# Check Supabase status
supabase status

# Rebuild after code changes
docker compose build backend frontend
docker compose up -d

# Check port accessibility
ss -tlnp | grep -E ':(3000|3001|54321)'
```

---

## Emergency Rollback

If deployment fails:

```bash
# 1. Stop new containers
cd /root/AmpedFieldOps
docker compose down

# 2. Check git history
git log --oneline -10

# 3. Revert to last working commit
git checkout <commit-hash>

# 4. Rebuild and restart
docker compose build --no-cache
docker compose up -d

# 5. Check logs
docker compose logs -f
```

---

**Remember:** Always test in a staging environment first when possible!

