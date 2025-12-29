"use client";

import React, { createContext, useContext, useState, ReactNode } from 'react';

export interface TerminalLine {
    command: string;
    output: React.ReactNode;
}

interface TerminalContextType {
    outputLines: TerminalLine[];
    commandHistory: string[];
    addCommand: (command: string, output: React.ReactNode) => void;
    addToHistory: (command: string) => void;
    clearOutput: () => void;
    // We don't expose clearHistory because user wants it persistent until refresh
}

const TerminalContext = createContext<TerminalContextType | undefined>(undefined);

export function TerminalProvider({ children }: { children: ReactNode }) {
    const [outputLines, setLines] = useState<TerminalLine[]>([
        /* Initial "Init" message will be handled by the Terminal component on mount if empty, 
           or we can preload it here. Let's preload it here to keep it simple and consistent. */
        {
            command: "init",
            output: (
                <div className="text-gray-400 text-sm font-mono leading-relaxed">
                    <p className="text-emerald-400 mb-2">Initializing Portfolio v1.0.0...</p>
                    <p className="mb-1">[✓] Loading Graphics Engine....... <span className="text-emerald-500">Done</span></p>
                    <p className="mb-1">[✓] Connecting to Creativity DB... <span className="text-emerald-500">Done</span></p>
                    <p className="mb-1">[✓] Fetching Coffee............... <span className="text-emerald-500">Done</span></p>
                    <p className="mt-4 text-white">System Ready. <span className="text-gray-500">Type <span className="text-emerald-400 font-bold">&apos;help&apos;</span> to see available commands.</span></p>
                </div>
            )
        }
    ]);

    // Separate state for command history (Up/Down arrows)
    const [commandHistory, setCommandHistory] = useState<string[]>([]);

    const addCommand = (command: string, output: React.ReactNode) => {
        // Add to display lines
        setLines(prev => [...prev, { command, output }]);

        // Add to history if it's a real command (not empty)
        // We only persist the command string for navigation
        if (command.trim()) {
            setCommandHistory(prev => [...prev, command]);
        }
    };

    const addToHistory = (command: string) => {
        if (command.trim()) {
            setCommandHistory(prev => [...prev, command]);
        }
    };

    const clearOutput = () => {
        setLines([]);
    };

    const value = React.useMemo(() => ({
        outputLines,
        commandHistory,
        addCommand,
        addToHistory,
        clearOutput
    }), [outputLines, commandHistory]);

    return (
        <TerminalContext.Provider value={value}>
            {children}
        </TerminalContext.Provider>
    );
}

export function useTerminal() {
    const context = useContext(TerminalContext);
    if (context === undefined) {
        throw new Error('useTerminal must be used within a TerminalProvider');
    }
    return context;
}
