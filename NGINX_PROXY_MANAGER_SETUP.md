# Nginx Proxy Manager Setup for admin.ampedlogix.com

## Current Infrastructure
- **Nginx Proxy Manager**: `http://192.168.1.134:81/nginx/proxy`
- **AmpedFieldOps Server**: `192.168.1.124`
- **Domain**: `admin.ampedlogix.com`

## ⚠️ REQUIRED: Firewall/Port Configuration

**On 192.168.1.124 (AmpedFieldOps Server), the following ports MUST be open:**

| Port | Service | Required For | Accessible From |
|------|---------|--------------|-----------------|
| **3000** | Frontend (Nginx) | Main app access | Nginx Proxy Manager (192.168.1.134) |
| **3001** | Backend API | API endpoints (/api/*) | Nginx Proxy Manager (192.168.1.134) |
| **54321** | Supabase Kong | Auth, DB, Storage, Realtime | Nginx Proxy Manager (192.168.1.134) |
| 54323 | Supabase Studio | Admin UI (optional) | Internal only (or VPN) |
| 6379 | Redis | Caching | Internal only |
| 8000 | OCR Service | Document processing | Internal only |

**If using UFW (Ubuntu Firewall):**
```bash
# Allow from Nginx Proxy Manager
sudo ufw allow from 192.168.1.134 to any port 3000 proto tcp
sudo ufw allow from 192.168.1.134 to any port 3001 proto tcp
sudo ufw allow from 192.168.1.134 to any port 54321 proto tcp

# Or allow from entire local network (less secure but simpler)
sudo ufw allow from 192.168.1.0/24 to any port 3000 proto tcp
sudo ufw allow from 192.168.1.0/24 to any port 3001 proto tcp
sudo ufw allow from 192.168.1.0/24 to any port 54321 proto tcp

# Verify
sudo ufw status numbered
```

**If using firewalld (CentOS/RHEL):**
```bash
sudo firewall-cmd --permanent --add-port=3000/tcp
sudo firewall-cmd --permanent --add-port=3001/tcp
sudo firewall-cmd --permanent --add-port=54321/tcp
sudo firewall-cmd --reload
```

**If using iptables directly:**
```bash
sudo iptables -A INPUT -p tcp -s 192.168.1.134 --dport 3000 -j ACCEPT
sudo iptables -A INPUT -p tcp -s 192.168.1.134 --dport 3001 -j ACCEPT
sudo iptables -A INPUT -p tcp -s 192.168.1.134 --dport 54321 -j ACCEPT
sudo iptables-save | sudo tee /etc/iptables/rules.v4
```

## Required Proxy Hosts

### Pre-Setup Checklist
- [ ] Port 3000 accessible from Nginx Proxy Manager (192.168.1.134)
- [ ] Port 3001 accessible from Nginx Proxy Manager (192.168.1.134)
- [ ] Port 54321 accessible from Nginx Proxy Manager (192.168.1.134) **← NEW REQUIREMENT**
- [ ] DNS for admin.ampedlogix.com points to 192.168.1.134
- [ ] DNS for supabase.ampedlogix.com points to 192.168.1.134 (or use wildcard *.ampedlogix.com)

### 1. Main Application (Already configured)
- **Domain Names**: `admin.ampedlogix.com`
- **Scheme**: `http`
- **Forward Hostname/IP**: `192.168.1.124`
- **Forward Port**: `3000`
- **Enable**: Block Common Exploits, Websockets Support
- **SSL**: Force SSL, HTTP/2 Support, HSTS Enabled

### 2. Supabase Backend (REQUIRED - Add this!)
- **Domain Names**: `supabase.ampedlogix.com`
- **Scheme**: `http`
- **Forward Hostname/IP**: `192.168.1.124`
- **Forward Port**: `54321`
- **Enable**: Block Common Exploits, Websockets Support
- **SSL**: Force SSL, HTTP/2 Support, HSTS Enabled

**Important Notes:**
- Supabase needs ALL subpaths proxied: `/auth/*`, `/rest/*`, `/storage/*`, `/realtime/*`
- No URL rewrites or path modifications
- Keep original request paths intact

## After Adding Supabase Proxy

### 1. Verify DNS
Ensure `supabase.ampedlogix.com` points to your Nginx Proxy Manager IP (192.168.1.134)

```bash
nslookup supabase.ampedlogix.com
# Should return 192.168.1.134 or the same IP as admin.ampedlogix.com
```

### 2. Test Supabase Connectivity
```bash
curl -I https://supabase.ampedlogix.com/rest/v1/
# Should return HTTP 200 with PostgREST headers
```

### 3. Rebuild Frontend
On the AmpedFieldOps server (192.168.1.124):

```bash
cd /root/AmpedFieldOps
docker compose build frontend
docker compose up -d frontend
```

### 4. Test Login
1. Go to https://admin.ampedlogix.com
2. Should see the AdminSetupModal (first-time setup)
3. Create admin account
4. Login should work

## Troubleshooting

### Browser shows "Network Error" or CORS issues
**Check:**
1. Supabase proxy host is created in NPM
2. SSL certificate is valid for supabase.ampedlogix.com
3. Browser console shows requests to `https://supabase.ampedlogix.com` (not http://127.0.0.1)

### "Failed to fetch" from Supabase
**Check:**
```bash
# From the AmpedFieldOps server
curl http://localhost:54321/rest/v1/
# Should return PostgREST welcome message

# From outside (through NPM)
curl https://supabase.ampedlogix.com/rest/v1/
# Should return same result with HTTPS
```

### Login works but data doesn't load
**Check:**
1. Backend can still reach Supabase: `curl http://localhost:54321/rest/v1/` from server
2. Backend environment has `SUPABASE_URL=http://127.0.0.1:54321` (local access)
3. RLS policies are applied (check Supabase Studio: http://192.168.1.124:54323)

## Alternative: Use Supabase Cloud (Recommended for Production)

Instead of self-hosting, use Supabase managed service:

1. **Sign up**: https://supabase.com
2. **Create project**: Get your Project URL and API keys
3. **Update `.env`**:
   ```bash
   VITE_SUPABASE_URL=https://your-project.supabase.co
   VITE_SUPABASE_ANON_KEY=your-anon-key
   SUPABASE_URL=https://your-project.supabase.co
   SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
   ```
4. **Run migrations**: `supabase db push --db-url "postgresql://postgres:[password]@db.your-project.supabase.co:5432/postgres"`
5. **Rebuild**: `docker compose build && docker compose up -d`

Benefits:
- Automatic SSL/HTTPS
- Better reliability and backups
- No need for supabase subdomain proxy
- Easier scaling
- Built-in monitoring

## Quick Reference

| Service | Local URL | Public URL (via NPM) |
|---------|-----------|----------------------|
| Frontend | http://192.168.1.124:3000 | https://admin.ampedlogix.com |
| Backend API | http://192.168.1.124:3001 | https://admin.ampedlogix.com/api |
| Supabase | http://192.168.1.124:54321 | https://supabase.ampedlogix.com |
| Supabase Studio | http://192.168.1.124:54323 | (internal only) |

---

**Last Updated**: January 17, 2026
