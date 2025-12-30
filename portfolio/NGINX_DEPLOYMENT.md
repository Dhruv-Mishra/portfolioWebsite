# Deployment Guide for whoisdhruv.com (Nginx + SSL)

## Your Current Setup ✅
- **Domain**: whoisdhruv.com
- **SSL**: Enabled with HTTP → HTTPS redirection
- **WWW**: Redirected to root domain
- **Server**: Nginx serving static files
- **Build Output**: `/out` directory (Next.js static export)

---

## Quick Deployment Steps

### 1. Build Your Site
```bash
cd C:\portfolioWebsite\portfolio
npm run build
```
This creates the `out/` directory with all static files.

### 2. Transfer Files to Server

**Option A: Using SCP/SFTP**
```bash
# From Windows (using PowerShell or WSL)
scp -r out/* user@your-server:/var/www/whoisdhruv.com/out/

# Or using rsync (if available)
rsync -avz --delete out/ user@your-server:/var/www/whoisdhruv.com/out/
```

**Option B: Using Git**
```bash
# On your server
cd /var/www/whoisdhruv.com
git pull origin master
npm install
npm run build
# The out/ directory is now ready
```

### 3. Configure Nginx

Copy the provided `nginx.conf` to your server:

```bash
# On your server
sudo nano /etc/nginx/sites-available/whoisdhruv.com
```

**Update these paths in the config:**
- `ssl_certificate` - Path to your SSL certificate
- `ssl_certificate_key` - Path to your SSL private key  
- `root` - Path to your `out/` directory (e.g., `/var/www/whoisdhruv.com/out`)
- `access_log` - Log file path
- `error_log` - Error log path

### 4. Enable Site & Test

```bash
# Create symlink to enable site
sudo ln -s /etc/nginx/sites-available/whoisdhruv.com /etc/nginx/sites-enabled/

# Test configuration
sudo nginx -t

# If test passes, reload nginx
sudo systemctl reload nginx
```

---

## SSL Certificate Setup

If you haven't set up SSL yet, use Let's Encrypt (free):

```bash
# Install certbot
sudo apt-get update
sudo apt-get install certbot python3-certbot-nginx

# Get certificate
sudo certbot --nginx -d whoisdhruv.com -d www.whoisdhruv.com

# Auto-renewal is usually set up automatically
# Test renewal:
sudo certbot renew --dry-run
```

---

## File Permissions

Ensure proper permissions on your server:

```bash
# Set ownership
sudo chown -R www-data:www-data /var/www/whoisdhruv.com/out

# Set permissions
sudo find /var/www/whoisdhruv.com/out -type d -exec chmod 755 {} \;
sudo find /var/www/whoisdhruv.com/out -type f -exec chmod 644 {} \;
```

---

## Nginx Optimizations (Already Included)

The provided config includes:

✅ **HTTP/2** - Faster page loads
✅ **Gzip Compression** - Reduced file sizes
✅ **Cache Headers** - Optimal caching for assets
✅ **Security Headers** - XSS, clickjacking protection
✅ **SSL/TLS** - Secure connections
✅ **www → non-www** - Clean URLs
✅ **HTTP → HTTPS** - Force secure connections

---

## Deployment Automation Script

Create this on your server for easy updates:

```bash
#!/bin/bash
# File: /var/www/whoisdhruv.com/deploy.sh

echo "🚀 Deploying whoisdhruv.com..."

# Navigate to project
cd /var/www/whoisdhruv.com

# Pull latest code
echo "📦 Pulling latest changes..."
git pull origin master

# Install dependencies
echo "📚 Installing dependencies..."
npm install

# Build site
echo "🔨 Building site..."
npm run build

# Set permissions
echo "🔒 Setting permissions..."
sudo chown -R www-data:www-data out/
sudo find out -type d -exec chmod 755 {} \;
sudo find out -type f -exec chmod 644 {} \;

# Test nginx config
echo "✅ Testing nginx configuration..."
sudo nginx -t

# Reload nginx
if [ $? -eq 0 ]; then
    echo "♻️  Reloading nginx..."
    sudo systemctl reload nginx
    echo "✨ Deployment complete!"
else
    echo "❌ Nginx configuration test failed!"
    exit 1
fi
```

Make it executable:
```bash
chmod +x /var/www/whoisdhruv.com/deploy.sh
```

Then deploy with:
```bash
./deploy.sh
```

---

## Testing Your Deployment

### 1. Check SSL
```bash
# Test SSL configuration
curl -I https://whoisdhruv.com

# Check SSL rating
# Visit: https://www.ssllabs.com/ssltest/analyze.html?d=whoisdhruv.com
```

### 2. Check Redirects
```bash
# Test HTTP → HTTPS
curl -I http://whoisdhruv.com
# Should return 301 to https://whoisdhruv.com

# Test www → non-www
curl -I https://www.whoisdhruv.com
# Should return 301 to https://whoisdhruv.com
```

### 3. Check Headers
```bash
# Check security headers
curl -I https://whoisdhruv.com

# Should see:
# - X-Frame-Options: SAMEORIGIN
# - X-Content-Type-Options: nosniff
# - Content-Security-Policy
# - Strict-Transport-Security (after enabling HSTS)
```

### 4. Check Compression
```bash
# Check gzip
curl -H "Accept-Encoding: gzip" -I https://whoisdhruv.com

# Should see:
# - Content-Encoding: gzip
```

### 5. Test Pages
- ✅ https://whoisdhruv.com (home)
- ✅ https://whoisdhruv.com/about
- ✅ https://whoisdhruv.com/projects
- ✅ https://whoisdhruv.com/resume
- ✅ https://whoisdhruv.com/robots.txt
- ✅ https://whoisdhruv.com/sitemap.xml
- ✅ https://whoisdhruv.com/404-test (should show custom 404)

---

## Performance Testing

After deployment, test your site:

1. **Google PageSpeed Insights**
   - https://pagespeed.web.dev/
   - Test: https://whoisdhruv.com

2. **GTmetrix**
   - https://gtmetrix.com/
   
3. **WebPageTest**
   - https://www.webpagetest.org/

**Expected Scores:**
- Performance: 95+
- Accessibility: 95+
- Best Practices: 95+
- SEO: 100

---

## Monitoring & Logs

### View Access Logs
```bash
sudo tail -f /var/log/nginx/whoisdhruv.com-access.log
```

### View Error Logs
```bash
sudo tail -f /var/log/nginx/whoisdhruv.com-error.log
```

### Monitor Nginx Status
```bash
sudo systemctl status nginx
```

---

## Troubleshooting

### Site Not Loading
```bash
# Check nginx is running
sudo systemctl status nginx

# Check for errors
sudo nginx -t

# View recent errors
sudo tail -20 /var/log/nginx/whoisdhruv.com-error.log
```

### 502 Bad Gateway
- Check nginx configuration
- Verify file permissions
- Check if files exist in root directory

### SSL Issues
```bash
# Check certificate expiry
sudo certbot certificates

# Renew certificates
sudo certbot renew
```

### Cache Issues
```bash
# Clear browser cache or test in incognito

# Force cache refresh on nginx
sudo systemctl reload nginx
```

---

## Continuous Deployment (Optional)

### Using GitHub Actions

Create `.github/workflows/deploy.yml`:

```yaml
name: Deploy to Production

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - uses: actions/setup-node@v3
        with:
          node-version: '20'
      
      - name: Install dependencies
        run: npm ci
      
      - name: Build
        run: npm run build
      
      - name: Deploy to Server
        uses: easingthemes/ssh-deploy@main
        env:
          SSH_PRIVATE_KEY: ${{ secrets.SSH_PRIVATE_KEY }}
          REMOTE_HOST: ${{ secrets.REMOTE_HOST }}
          REMOTE_USER: ${{ secrets.REMOTE_USER }}
          SOURCE: "out/"
          TARGET: "/var/www/whoisdhruv.com/out"
      
      - name: Reload Nginx
        uses: appleboy/ssh-action@master
        with:
          host: ${{ secrets.REMOTE_HOST }}
          username: ${{ secrets.REMOTE_USER }}
          key: ${{ secrets.SSH_PRIVATE_KEY }}
          script: sudo systemctl reload nginx
```

---

## Backup Strategy

### Manual Backup
```bash
# Backup current deployment
sudo tar -czf whoisdhruv-backup-$(date +%Y%m%d).tar.gz /var/www/whoisdhruv.com/out
```

### Automated Daily Backup
```bash
# Add to crontab
sudo crontab -e

# Add this line (runs daily at 2 AM)
0 2 * * * tar -czf /backups/whoisdhruv-$(date +\%Y\%m\%d).tar.gz /var/www/whoisdhruv.com/out
```

---

## Final Checklist

Before going live:
- [ ] Build completes without errors
- [ ] All files uploaded to server
- [ ] Nginx configuration updated with correct paths
- [ ] SSL certificates installed and working
- [ ] HTTP → HTTPS redirect working
- [ ] www → non-www redirect working
- [ ] All pages accessible
- [ ] Custom 404 page working
- [ ] robots.txt accessible
- [ ] sitemap.xml accessible
- [ ] Security headers present
- [ ] Compression enabled
- [ ] Performance tested (Lighthouse 95+)
- [ ] Mobile responsive
- [ ] Cross-browser tested

---

## Quick Command Reference

```bash
# Build
npm run build

# Deploy (after setting up deploy.sh)
./deploy.sh

# View logs
sudo tail -f /var/log/nginx/whoisdhruv.com-access.log

# Reload nginx
sudo systemctl reload nginx

# Test nginx config
sudo nginx -t

# Check SSL cert
sudo certbot certificates

# Renew SSL
sudo certbot renew
```

---

**Your site is now ready for production at https://whoisdhruv.com! 🚀**
