// lib/rateLimit.ts - Simple client-side rate limiting
import { RATE_LIMIT_CONFIG } from '@/lib/llmConfig';

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

// Predefined rate limit configurations — single source of truth in llmConfig.ts
export const RATE_LIMITS = {
  JOKE_API: RATE_LIMIT_CONFIG.jokeApi,
  CHAT_API: RATE_LIMIT_CONFIG.chat,
  FEEDBACK: RATE_LIMIT_CONFIG.feedback,
} as const;
