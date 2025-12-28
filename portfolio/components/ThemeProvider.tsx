"use client";
import React, { createContext, useContext, useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

type Theme = 'light' | 'dark';

interface ThemeContextType {
    theme: Theme;
    toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
    const [theme, setTheme] = useState<Theme>('light');
    const [isTransitioning, setIsTransitioning] = useState(false);

    // Initialize theme from localStorage or system preference
    useEffect(() => {
        const savedTheme = localStorage.getItem('theme') as Theme;
        if (savedTheme) {
            setTheme(savedTheme);
            document.documentElement.setAttribute('data-theme', savedTheme);
        } else if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
            setTheme('dark');
            document.documentElement.setAttribute('data-theme', 'dark');
        }
    }, []);

    const toggleTheme = () => {
        if (isTransitioning) return; // Prevent double clicks

        setIsTransitioning(true);
        const newTheme = theme === 'light' ? 'dark' : 'light';

        // Wait for wave animation to cover screen before switching logic
        setTimeout(() => {
            setTheme(newTheme);
            document.documentElement.setAttribute('data-theme', newTheme);
            localStorage.setItem('theme', newTheme);
            setIsTransitioning(false);
        }, 1000); // Sync with animation duration
    };

    return (
        <ThemeContext.Provider value={{ theme, toggleTheme }}>
            {children}

            {/* Dark Wave Transition Overlay */}
            {/* We always render it but animate positions */}
            <AnimatePresence>
                {isTransitioning && (
                    <motion.div
                        initial={{ y: "100%" }}
                        animate={{ y: "0%" }}
                        exit={{ y: "100%" }} // Wait, actually we need it to fill UP, change theme, then slide DOWN? 
                    // Or fill UP (darkness comes), stay, theme changes, then... wait.
                    // If going Light -> Dark: Wave comes UP from bottom. Fills screen. Theme changes. Wave stays? No, background changes.
                    // Actually:
                    // Light -> Dark: Dark wave rises. Covers screen. Theme switches to Dark behind it. Wave fades out or slides away?
                    // Let's try: Wave rises, stays for a moment, then "dissolves" or slides up away.

                    // Revised Plan:
                    // Wave is just a visualizer. 
                    // If becoming Dark: Wave (Dark Color) rises from bottom to top. 
                    // If becoming Light: Wave (Light Color) rises from bottom? Or falls?
                    // Let's simple: Dark Wave rises.
                    />
                )}
            </AnimatePresence>

            {/* 
                Better Transition Logic:
                We need a persistent overlay that animating based on 'isTransitioning'.
                Actually let's keep it simple:
                Just a full screen div that moves.
            */}
            <motion.div
                className="fixed inset-0 z-[9999] pointer-events-none bg-[#1a1a1a]" // Dark color
                initial={{ y: "100%" }}
                animate={isTransitioning && theme === 'light' ? { y: "0%" } : { y: "100%" }}
                transition={{ duration: 1.0, ease: "easeInOut" }}
            />

            <motion.div
                className="fixed inset-0 z-[9999] pointer-events-none bg-[#fdfbf7]" // Light color
                initial={{ y: "100%" }}
                animate={isTransitioning && theme === 'dark' ? { y: "0%" } : { y: "100%" }}
                transition={{ duration: 1.0, ease: "easeInOut" }}
            />

        </ThemeContext.Provider>
    );
}

export function useTheme() {
    const context = useContext(ThemeContext);
    if (context === undefined) {
        throw new Error('useTheme must be used within a ThemeProvider');
    }
    return context;
}
