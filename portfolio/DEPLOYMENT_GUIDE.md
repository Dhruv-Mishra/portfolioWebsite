# 🚀 Deployment Guide

## Quick Start for Popular Platforms

### Option 1: Vercel (Recommended) ⭐

Vercel is built by the creators of Next.js and offers the best integration.

```bash
# Install Vercel CLI
npm i -g vercel

# Deploy
vercel

# Deploy to production
vercel --prod
```

**Environment Variables in Vercel:**
1. Go to your project settings
2. Navigate to "Environment Variables"
3. Add: `NEXT_PUBLIC_GA_ID` (if using analytics)
4. Add: `NEXT_PUBLIC_SITE_URL`

### Option 2: Netlify

```bash
# Install Netlify CLI
npm install -g netlify-cli

# Build
npm run build

# Deploy
netlify deploy --prod --dir=out
```

**netlify.toml** (create this file):
```toml
[build]
  command = "npm run build"
  publish = "out"

[[redirects]]
  from = "/*"
  to = "/404.html"
  status = 404
```

### Option 3: GitHub Pages

1. Update `next.config.ts`:
```typescript
const nextConfig: NextConfig = {
  output: "export",
  basePath: "/your-repo-name", // Add this if deploying to repo
  images: {
    unoptimized: true,
  },
  // ... rest of config
};
```

2. Create `.github/workflows/deploy.yml`:
```yaml
name: Deploy to GitHub Pages

on:
  push:
    branches: ["main"]
  workflow_dispatch:

permissions:
  contents: read
  pages: write
  id-token: write

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: "20"
      - run: npm ci
      - run: npm run build
      - uses: actions/upload-pages-artifact@v3
        with:
          path: ./out

  deploy:
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    runs-on: ubuntu-latest
    needs: build
    steps:
      - uses: actions/deploy-pages@v4
        id: deployment
```

3. Enable GitHub Pages in repository settings

### Option 4: Azure Static Web Apps

```bash
# Install Azure SWA CLI
npm install -g @azure/static-web-apps-cli

# Deploy
swa deploy --app-location . --output-location out
```

### Option 5: AWS Amplify

1. Connect your GitHub repository
2. Build settings:
```yaml
version: 1
frontend:
  phases:
    preBuild:
      commands:
        - npm ci
    build:
      commands:
        - npm run build
  artifacts:
    baseDirectory: out
    files:
      - '**/*'
  cache:
    paths:
      - node_modules/**/*
```

---

## Pre-Deployment Checklist

### 1. Icons & Assets
- [ ] Generate `favicon.ico`
- [ ] Generate `apple-touch-icon.png` (180x180)
- [ ] Generate `icon-192.png` (192x192)
- [ ] Generate `icon-512.png` (512x512)
- [ ] Generate `og-image.png` (1200x630)
- [ ] Add resume PDF to `public/resources/resume.pdf`
- [ ] Add all project images to `public/resources/`

### 2. Configuration
- [ ] Update `NEXT_PUBLIC_SITE_URL` everywhere
- [ ] Update domain in `robots.txt`
- [ ] Update domain in `app/sitemap.ts`
- [ ] Update domain in `app/layout.tsx` (metadataBase)
- [ ] Create `.env.local` from `.env.example`
- [ ] Add Google Analytics ID (optional)

### 3. Content Review
- [ ] Update About page with current info
- [ ] Update Projects with latest work
- [ ] Update Resume PDF
- [ ] Check all external links work
- [ ] Verify contact information

### 4. Testing
```bash
# Build and test locally
npm run build
npm run start

# Test on http://localhost:3000
# - Navigate all pages
# - Test terminal commands
# - Test theme toggle
# - Test on mobile view
# - Test all links
```

### 5. Performance Testing
- [ ] Run Lighthouse audit (Chrome DevTools)
- [ ] Test on slow 3G network
- [ ] Test on mobile device
- [ ] Check bundle size: `npm run build` (look at output)

### 6. SEO Testing
- [ ] Test Open Graph: https://www.opengraph.xyz/
- [ ] Test Twitter Card: https://cards-dev.twitter.com/validator
- [ ] Test robots.txt: `yoursite.com/robots.txt`
- [ ] Test sitemap: `yoursite.com/sitemap.xml`
- [ ] Submit sitemap to Google Search Console

### 7. Security Testing
- [ ] Test security headers: https://securityheaders.com/
- [ ] Test SSL: https://www.ssllabs.com/ssltest/
- [ ] Verify CSP is working (check browser console)

---

## Environment Variables Reference

Create `.env.local` in root directory:

```bash
# Analytics (Optional)
NEXT_PUBLIC_GA_ID=G-XXXXXXXXXX

# Site Configuration
NEXT_PUBLIC_SITE_URL=https://your-domain.com

# Feature Flags (Optional)
NEXT_PUBLIC_ENABLE_ANALYTICS=true
NEXT_PUBLIC_ENABLE_ERROR_TRACKING=false
```

---

## Custom Domain Setup

### Vercel
1. Go to Project Settings → Domains
2. Add your domain
3. Update DNS records as instructed

### Netlify
1. Go to Domain Management
2. Add custom domain
3. Update DNS:
   - Type: A, Name: @, Value: 75.2.60.5
   - Type: CNAME, Name: www, Value: your-site.netlify.app

### Cloudflare (for any platform)
1. Add site to Cloudflare
2. Update nameservers
3. Enable:
   - Auto Minify (HTML, CSS, JS)
   - Brotli compression
   - Always Use HTTPS
   - HTTP/3 (QUIC)

---

## Post-Deployment Tasks

### 1. Analytics Setup
```bash
# After adding GA_ID to environment variables
# 1. Verify tracking in Google Analytics Real-Time
# 2. Test events in GA Debug Mode
# 3. Setup conversion goals
```

### 2. Search Engine Submission
- [ ] Google Search Console: https://search.google.com/search-console
- [ ] Bing Webmaster Tools: https://www.bing.com/webmasters
- [ ] Submit sitemap to both

### 3. Social Media
- [ ] Test Open Graph on Facebook
- [ ] Test Twitter Card on Twitter
- [ ] Test LinkedIn preview
- [ ] Share on social media

### 4. Monitoring
- [ ] Setup uptime monitoring (UptimeRobot, Pingdom)
- [ ] Setup error tracking (optional: Sentry)
- [ ] Monitor Google Analytics
- [ ] Check Google Search Console regularly

---

## Continuous Deployment

### Automatic Deployments (Recommended)

**Vercel/Netlify** - Automatic on git push:
1. Connect your GitHub repository
2. Every push to `main` branch triggers deployment
3. Pull requests get preview deployments

**GitHub Actions** - Already configured if using GitHub Pages

---

## Performance Optimization Tips

### After Deployment:

1. **Enable CDN** (most platforms do this automatically)
2. **Enable Compression** (Gzip/Brotli)
3. **Set Cache Headers** (static assets)
4. **Use HTTP/2 or HTTP/3**
5. **Enable HTTPS** (required for PWA)

### Monitor:
- Google PageSpeed Insights
- GTmetrix
- WebPageTest
- Chrome User Experience Report

---

## Troubleshooting

### Build Fails
```bash
# Clear cache and reinstall
rm -rf node_modules .next out
npm install
npm run build
```

### Images Not Loading
- Check `next.config.ts` has `unoptimized: true`
- Verify images are in `public/` directory
- Check image paths (should start with `/`)

### 404 on Direct URL Access
- Ensure platform supports SPA fallback
- Check platform-specific redirect rules

### Environment Variables Not Working
- Restart dev server after adding variables
- Variables must start with `NEXT_PUBLIC_` for client-side
- Re-deploy after changing variables in platform settings

---

## Security Considerations

### Before Going Live:
1. ✅ Security headers are enabled (middleware.ts)
2. ✅ HTTPS is enforced
3. ✅ CSP is properly configured
4. ✅ No sensitive data in client-side code
5. ✅ API keys are in environment variables (not committed)

### Regular Maintenance:
```bash
# Update dependencies regularly
npm audit
npm update

# Check for security vulnerabilities
npm audit fix
```

---

## Support & Resources

- **Next.js Docs**: https://nextjs.org/docs
- **Vercel Docs**: https://vercel.com/docs
- **Netlify Docs**: https://docs.netlify.com
- **Web.dev**: https://web.dev (performance guides)

---

## Quick Commands Summary

```bash
# Development
npm run dev              # Start dev server

# Production
npm run build           # Build for production
npm run start           # Preview production build

# Code Quality
npm run lint            # Run ESLint

# Deployment
vercel --prod           # Deploy to Vercel
netlify deploy --prod   # Deploy to Netlify
```

---

**Ready to Deploy!** 🎉

Your portfolio is production-ready. Choose your platform and follow the steps above!
