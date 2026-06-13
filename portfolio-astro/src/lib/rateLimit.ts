// lib/rateLimit.ts - Simple client-side rate limiting
import { RATE_LIMIT_CONFIG } from '@/lib/llmConfig';

interface RateLimitConfig {
  maxRequests: number;
  windowMs: number;
}

class RateLimiter {
  private static MAX_KEYS = 50;
  private requests: Map<string, number[]> = new Map();

  private pruneRequests(key: string, windowMs: number): number[] {
    const windowStart = Date.now() - windowMs;
    const requestTimes = (this.requests.get(key) || []).filter(time => time > windowStart);

    if (requestTimes.length === 0) {
      this.requests.delete(key);
      return [];
    }

    this.requests.set(key, requestTimes);
    return requestTimes;
  }

  check(key: string, config: RateLimitConfig): boolean {
    const now = Date.now();
    const requestTimes = this.pruneRequests(key, config.windowMs);

    // Check if we're at the limit
    if (requestTimes.length >= config.maxRequests) {
      return false;
    }

    // Defensive LRU eviction — cap Map size to prevent unbounded growth
    if (this.requests.size > RateLimiter.MAX_KEYS && !this.requests.has(key)) {
      const oldest = this.requests.keys().next().value;
      if (oldest) this.requests.delete(oldest);
    }

    // Add current request
    requestTimes.push(now);
    this.requests.set(key, requestTimes);

    return true;
  }

  getRemainingTime(key: string, config: RateLimitConfig): number {
    const requestTimes = this.pruneRequests(key, config.windowMs);
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
