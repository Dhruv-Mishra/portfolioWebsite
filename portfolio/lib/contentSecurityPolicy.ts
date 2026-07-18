export const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval' blob: https://www.googletagmanager.com https://www.google-analytics.com https://v2.jokeapi.dev https://static.cloudflareinsights.com",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: https:",
  "font-src 'self' data:",
  "connect-src 'self' https://www.google-analytics.com https://v2.jokeapi.dev https://analytics.google.com https://region1.google-analytics.com https://cloudflareinsights.com https://huggingface.co https://us.aws.cdn.hf.co https://cdn.jsdelivr.net",
  "worker-src 'self'",
  "frame-ancestors 'self'",
  "base-uri 'self'",
  "form-action 'self'",
].join('; ') + ';';

export const DEVELOPMENT_CONTENT_SECURITY_POLICY = CONTENT_SECURITY_POLICY
  .split(';')
  .map((directive) => directive.trim())
  .filter(Boolean)
  .map((directive) => {
    if (!directive.startsWith('script-src ')) return directive;

    const sources = directive.split(/\s+/);
    return sources.includes("'unsafe-eval'")
      ? directive
      : `${directive} 'unsafe-eval'`;
  })
  .join('; ') + ';';