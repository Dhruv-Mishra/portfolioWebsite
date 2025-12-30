// lib/analytics.ts - Centralized analytics configuration
// This file provides a unified interface for analytics tracking

declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void;
    dataLayer?: unknown[];
  }
}

export const GA_TRACKING_ID = process.env.NEXT_PUBLIC_GA_ID || '';

// Check if analytics is enabled
export const isAnalyticsEnabled = (): boolean => {
  return !!GA_TRACKING_ID && typeof window !== 'undefined';
};

// Log page view
export const pageview = (url: string): void => {
  if (!isAnalyticsEnabled()) return;
  
  window.gtag?.('config', GA_TRACKING_ID, {
    page_path: url,
  });
};

// Log specific events
interface EventParams {
  action: string;
  category: string;
  label?: string;
  value?: number;
}

export const event = ({ action, category, label, value }: EventParams): void => {
  if (!isAnalyticsEnabled()) return;

  window.gtag?.('event', action, {
    event_category: category,
    event_label: label,
    value: value,
  });
};

// Track terminal commands
export const trackTerminalCommand = (command: string): void => {
  event({
    action: 'terminal_command',
    category: 'engagement',
    label: command,
  });
};

// Track project views
export const trackProjectView = (projectName: string): void => {
  event({
    action: 'view_project',
    category: 'engagement',
    label: projectName,
  });
};

// Track external link clicks
export const trackExternalLink = (url: string, label: string): void => {
  event({
    action: 'click_external_link',
    category: 'engagement',
    label: `${label}: ${url}`,
  });
};

// Track theme changes
export const trackThemeChange = (theme: string): void => {
  event({
    action: 'change_theme',
    category: 'preferences',
    label: theme,
  });
};

// Performance monitoring
export const reportWebVitals = (metric: {
  id: string;
  name: string;
  label: string;
  value: number;
}): void => {
  if (!isAnalyticsEnabled()) return;

  window.gtag?.('event', metric.name, {
    event_category: metric.label === 'web-vital' ? 'Web Vitals' : 'Next.js custom metric',
    value: Math.round(metric.name === 'CLS' ? metric.value * 1000 : metric.value),
    event_label: metric.id,
    non_interaction: true,
  });
};
