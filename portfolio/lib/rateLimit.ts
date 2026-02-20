// lib/rateLimit.ts - Simple client-side rate limiting
interface RateLimitConfig {
  maxRequests: number;
  windowMs: number;
}

class RateLimiter {
  private requests: Map<string, number[]> = new Map();

  check(key: string, config: RateLimitConfig): boolean {
    const now = Date.now();
    const windowStart = now - config.windowMs;
    
    // Get existing requests for this key
    let requestTimes = this.requests.get(key) || [];
    
    // Filter out old requests outside the time window
    requestTimes = requestTimes.filter(time => time > windowStart);
    
    // Check if we're at the limit
    if (requestTimes.length >= config.maxRequests) {
      return false;
    }
    
    // Add current request
    requestTimes.push(now);
    this.requests.set(key, requestTimes);
    
    return true;
  }

  getRemainingTime(key: string, config: RateLimitConfig): number {
    const requestTimes = this.requests.get(key) || [];
    if (requestTimes.length === 0) return 0;
    
    const oldestRequest = requestTimes[0];
    const resetTime = oldestRequest + config.windowMs;
    const remaining = Math.max(0, resetTime - Date.now());
    
    return Math.ceil(remaining / 1000); // Convert to seconds
  }
}

export const rateLimiter = new RateLimiter();

// Predefined rate limit configurations
export const RATE_LIMITS = {
  JOKE_API: {
    maxRequests: 5,
    windowMs: 60000, // 5 requests per minute
  },
  CHAT_API: {
    maxRequests: 20,
    windowMs: 300000, // 20 messages per 5 minutes
  },
  FEEDBACK: {
    maxRequests: 3,
    windowMs: 3600000, // 3 submissions per hour
  },
} as const;
