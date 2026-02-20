"use client";

import * as React from "react";
import { useTheme } from "next-themes";
import {
  type SizeScale,
  type StylePreset,
  applySizeTokens,
  removeSizeTokens,
} from "@/lib/designTokens";

const STORAGE_KEY = "dhruv-size-scale";
const DEFAULT_SIZE: SizeScale = "medium";

interface StyleContextValue {
  /** Current size scale */
  sizeScale: SizeScale;
  /** Update size scale — persists to localStorage and applies CSS vars */
  setSizeScale: (size: SizeScale) => void;
  /** Combined style preset string (e.g. 'dark-medium', 'light-small') */
  stylePreset: StylePreset;
}

const StyleContext = React.createContext<StyleContextValue | undefined>(
  undefined
);

function getStoredSize(): SizeScale {
  if (typeof window === "undefined") return DEFAULT_SIZE;
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === "small" || stored === "medium" || stored === "large") {
      return stored;
    }
  } catch {
    // localStorage unavailable
  }
  return DEFAULT_SIZE;
}

export function StyleProvider({ children }: { children: React.ReactNode }) {
  const { resolvedTheme } = useTheme();
  const [sizeScale, setSizeScaleState] = React.useState<SizeScale>(DEFAULT_SIZE);
  const [mounted, setMounted] = React.useState(false);

  // On mount, read persisted preference and apply tokens
  React.useEffect(() => {
    const stored = getStoredSize();
    setSizeScaleState(stored);
    applySizeTokens(stored);
    setMounted(true);
    return () => {
      removeSizeTokens();
    };
  }, []);

  const setSizeScale = React.useCallback((size: SizeScale) => {
    setSizeScaleState(size);
    applySizeTokens(size);
    try {
      localStorage.setItem(STORAGE_KEY, size);
    } catch {
      // localStorage unavailable
    }
  }, []);

  const theme = (mounted ? resolvedTheme : "dark") as "light" | "dark";
  const stylePreset: StylePreset = `${theme ?? "dark"}-${sizeScale}`;

  const value = React.useMemo<StyleContextValue>(
    () => ({ sizeScale, setSizeScale, stylePreset }),
    [sizeScale, setSizeScale, stylePreset]
  );

  return (
    <StyleContext.Provider value={value}>{children}</StyleContext.Provider>
  );
}

/**
 * Hook to access the style context.
 * Must be used within a StyleProvider.
 */
export function useStyle(): StyleContextValue {
  const ctx = React.useContext(StyleContext);
  if (!ctx) {
    throw new Error("useStyle must be used within a StyleProvider");
  }
  return ctx;
}
