"use client";

/**
 * Async-loaded `framer-motion` feature bundle for `<LazyMotion>`.
 *
 * Importing `domAnimation` in the same module as `<LazyMotion>` defeats the
 * whole point — the features end up in the initial render-blocking chunk
 * (~70KB raw / ~25KB gzip on this site). Re-exporting from a separate
 * client module lets the framer-motion loader-function pattern split the
 * features into their own chunk that's only fetched after first paint.
 *
 * See: https://www.framer.com/motion/guide-reduce-bundle-size/
 */
export { domAnimation as default } from "framer-motion";
