# TLS / HTTPS Setup

## Prerequisites
```bash
apt install nginx certbot python3-certbot-nginx
```

## Deploy
```bash
# 1. Copy config
cp nginx.conf /etc/nginx/sites-available/pixcompliance

# 2. Edit domain
sed -i 's/your-domain.com/api.yourcompany.com/g' /etc/nginx/sites-available/pixcompliance

# 3. Enable site
ln -s /etc/nginx/sites-available/pixcompliance /etc/nginx/sites-enabled/

# 4. Test config
nginx -t

# 5. Issue TLS certificate (Let's Encrypt)
certbot --nginx -d api.yourcompany.com

# 6. Auto-renewal (add to crontab)
# 0 12 * * * /usr/bin/certbot renew --quiet
```

## After TLS is active

Update `.env` in the backend:
```
COOKIE_SECURE=true
```

This enables:
- `Secure` flag on httpOnly cookies (only sent over HTTPS)
- HSTS headers in helmet.js
