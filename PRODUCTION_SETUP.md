# Production Deployment Guide

## HTTPS/Mixed Content Issue

If you're deploying with HTTPS frontend (e.g., https://admin.ampedlogix.com), you **must** use HTTPS for all API endpoints.

### ✅ Recommended: Supabase Cloud

The easiest path to production:

1. **Create Supabase Cloud account** at https://supabase.com/dashboard
2. **Create a new project** (free tier available)
3. **Copy credentials:**
   - Project URL (https://xxx.supabase.co)
   - Anon key (public key)
   - Service role key (secret key)
   - Database connection string

4. **Run installer:**
   ```bash
   ./install.sh
   ```
   - Choose: **2) Production**
   - Enter your domain: **admin.ampedlogix.com** (or IP if HTTP)
   - When prompted about HTTPS: **Choose Supabase Cloud**
   - Paste your Supabase Cloud credentials when prompted

5. **Done!** Everything is HTTPS, no mixed content issues.

---

### 🔧 Advanced: Local Deployment with HTTPS (Reverse Proxy)

If you want to use local Supabase with HTTPS frontend, you need a reverse proxy that:
- Accepts HTTPS requests
- Proxies to local HTTP services

#### Option 1: Nginx (Recommended)

**1. Generate self-signed certificate:**
```bash
mkdir -p /etc/nginx/certs
openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
  -keyout /etc/nginx/certs/private.key \
  -out /etc/nginx/certs/certificate.crt \
  -subj "/CN=admin.ampedlogix.com"
```

**2. Create nginx config** (`/etc/nginx/sites-available/ampedlogix`):
```nginx
upstream frontend {
    server localhost:3000;
}

upstream backend_api {
    server 127.0.0.1:3001;
}

upstream supabase_kong {
    server 127.0.0.1:54321;
}

server {
    listen 443 ssl http2;
    server_name admin.ampedlogix.com;

    ssl_certificate /etc/nginx/certs/certificate.crt;
    ssl_certificate_key /etc/nginx/certs/private.key;

    # SSL Configuration
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;

    # Frontend
    location / {
        proxy_pass http://frontend;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # Backend API
    location /api/ {
        proxy_pass http://backend_api;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # Supabase Auth & API
    location /auth/ {
        proxy_pass http://supabase_kong/auth/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location /rest/ {
        proxy_pass http://supabase_kong/rest/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location /realtime/ {
        proxy_pass http://supabase_kong/realtime/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}

# Redirect HTTP to HTTPS
server {
    listen 80;
    server_name admin.ampedlogix.com;
    return 301 https://$server_name$request_uri;
}
```

**3. Enable and test:**
```bash
sudo ln -s /etc/nginx/sites-available/ampedlogix /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

**4. Update .env for reverse proxy:**
```bash
VITE_SUPABASE_URL=https://admin.ampedlogix.com
VITE_API_URL=https://admin.ampedlogix.com/api
FRONTEND_URL=https://admin.ampedlogix.com
```

#### Option 2: Caddy (Simpler)

**1. Create Caddyfile** (`/etc/caddy/Caddyfile`):
```caddy
admin.ampedlogix.com {
    # Frontend
    handle / {
        reverse_proxy localhost:3000
    }

    # Backend API
    handle /api/* {
        reverse_proxy 127.0.0.1:3001
    }

    # Supabase endpoints
    handle /auth/* {
        reverse_proxy 127.0.0.1:54321
    }

    handle /rest/* {
        reverse_proxy 127.0.0.1:54321
    }

    handle /realtime/* {
        reverse_proxy 127.0.0.1:54321 {
            header_uri -x-forwarded-*
        }
    }

    # Let's Encrypt SSL (automatic)
    tls internal {
        on_demand
    }
}
```

**2. Start Caddy:**
```bash
caddy start --config /etc/caddy/Caddyfile
```

Caddy automatically handles SSL certificates!

---

## Deployment Comparison

| Feature | Supabase Cloud | Local Supabase + Nginx | Local Supabase + Caddy |
|---------|----------------|----------------------|----------------------|
| Setup Time | 5 minutes | 30 minutes | 10 minutes |
| SSL/HTTPS | ✅ Automatic | ✅ Manual certs | ✅ Automatic (Let's Encrypt) |
| Mixed Content | ✅ No | ✅ No | ✅ No |
| Maintenance | ✅ None | ⚠️ Manual | ⚠️ Manual |
| Scaling | ✅ Auto | ❌ Manual | ❌ Manual |
| Cost | ✅ Free tier | ✅ Free | ✅ Free |
| Recommended | ✅ YES | 🔧 Advanced | 🔧 Advanced |

---

## Quick Start

**For most users, just use Supabase Cloud:**

```bash
./install.sh
# Choose: 2 (Production)
# Enter domain: admin.ampedlogix.com
# Choose: Y (Use Supabase Cloud)
# Paste your Cloud credentials
```

Done! Everything works with HTTPS, no mixed content, no configuration headaches.
