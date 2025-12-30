// lib/env.ts - Environment variable validation and type safety
import { z } from 'zod';

// Define the schema for environment variables
const envSchema = z.object({
  // Public environment variables (accessible in browser)
  NEXT_PUBLIC_GA_ID: z.string().optional(),
  NEXT_PUBLIC_SITE_URL: z.string().url().default('https://whoisdhruv.com'),
  NEXT_PUBLIC_ENABLE_ANALYTICS: z.string().optional().transform((val) => val === 'true'),
  NEXT_PUBLIC_ENABLE_ERROR_TRACKING: z.string().optional().transform((val) => val === 'true'),
  
  // Server-side only variables (add as needed)
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
});

// Parse and validate environment variables
function validateEnv() {
  try {
    return envSchema.parse({
      NEXT_PUBLIC_GA_ID: process.env.NEXT_PUBLIC_GA_ID,
      NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
      NEXT_PUBLIC_ENABLE_ANALYTICS: process.env.NEXT_PUBLIC_ENABLE_ANALYTICS,
      NEXT_PUBLIC_ENABLE_ERROR_TRACKING: process.env.NEXT_PUBLIC_ENABLE_ERROR_TRACKING,
      NODE_ENV: process.env.NODE_ENV,
    });
  } catch (error) {
    console.error('❌ Invalid environment variables:', error);
    throw new Error('Invalid environment variables');
  }
}

// Export validated environment variables
export const env = validateEnv();

// Type-safe environment variables
export type Env = z.infer<typeof envSchema>;
