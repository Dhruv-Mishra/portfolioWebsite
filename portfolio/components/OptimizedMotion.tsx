/**
 * Optimized Motion Components
 * 
 * This file provides optimized wrappers around framer-motion components
 * using LazyMotion and domAnimation to reduce bundle size.
 * 
 * LazyMotion loads only the animation features you need, reducing the
 * framer-motion bundle from ~30KB to ~5KB.
 */

"use client";

import { LazyMotion, domAnimation, m } from "framer-motion";
import React from "react";

/**
 * Wrapper component that provides lazy-loaded framer-motion features
 * Use this as a parent component when you need motion animations
 */
export function LazyMotionWrapper({ children }: { children: React.ReactNode }) {
  return (
    <LazyMotion features={domAnimation} strict>
      {children}
    </LazyMotion>
  );
}

/**
 * Optimized motion.div - Use 'm.div' instead of 'motion.div'
 * This uses the lazy-loaded features and is more performant
 */
export const OptimizedMotionDiv = m.div;
export const OptimizedMotionH1 = m.h1;
export const OptimizedMotionP = m.p;
export const OptimizedMotionA = m.a;

/**
 * Re-export commonly used framer-motion hooks and utilities
 * These don't add to the bundle size significantly
 */
export { useSpring, useTransform, useMotionValue, useInView } from "framer-motion";
