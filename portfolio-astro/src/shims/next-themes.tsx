import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

type Theme = 'light' | 'dark' | 'system';

interface ThemeProviderProps {
  children: ReactNode;
  attribute?: 'class' | `data-${string}`;
  defaultTheme?: Theme;
  enableSystem?: boolean;
}

interface ThemeContextValue {
  theme?: Theme;
  resolvedTheme?: 'light' | 'dark';
  systemTheme?: 'light' | 'dark';
  setTheme(theme: Theme): void;
}

const STORAGE_KEY = 'theme';
const ThemeContext = createContext<ThemeContextValue>({ setTheme: () => undefined });

function getSystemTheme(): 'light' | 'dark' {
  if (typeof window === 'undefined') return 'light';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function getInitialTheme(defaultTheme: Theme): Theme {
  if (typeof window === 'undefined') return defaultTheme;
  const stored = window.localStorage.getItem(STORAGE_KEY);
  return stored === 'light' || stored === 'dark' || stored === 'system' ? stored : defaultTheme;
}

export function ThemeProvider({ children, attribute = 'class', defaultTheme = 'system', enableSystem = true }: ThemeProviderProps) {
  const [theme, setThemeState] = useState<Theme>(() => getInitialTheme(defaultTheme));
  const [systemTheme, setSystemTheme] = useState<'light' | 'dark'>(() => getSystemTheme());
  const resolvedTheme = theme === 'system' && enableSystem ? systemTheme : theme === 'dark' ? 'dark' : 'light';

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const sync = () => setSystemTheme(mediaQuery.matches ? 'dark' : 'light');
    sync();
    mediaQuery.addEventListener('change', sync);
    return () => mediaQuery.removeEventListener('change', sync);
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    if (attribute === 'class') {
      root.classList.toggle('dark', resolvedTheme === 'dark');
    } else {
      root.setAttribute(attribute, resolvedTheme);
    }
  }, [attribute, resolvedTheme]);

  const setTheme = (nextTheme: Theme) => {
    setThemeState(nextTheme);
    window.localStorage.setItem(STORAGE_KEY, nextTheme);
  };

  const value = useMemo(() => ({ theme, resolvedTheme, systemTheme, setTheme }), [theme, resolvedTheme, systemTheme]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  return useContext(ThemeContext);
}