"use client";

import React, { createContext, useContext, useState, ReactNode, useCallback, useMemo, useEffect } from 'react';
import { LAYOUT_TOKENS } from '@/lib/designTokens';
import { createInitialTerminalOutput } from '@/lib/terminalCommands';

export interface TerminalLine {
    id: number;
    command: string;
    output: React.ReactNode;
}

interface TerminalContextType {
    outputLines: TerminalLine[];
    commandHistory: string[];
    sessionCommands: string[];
    isHydrated: boolean;
    addCommand: (command: string, output: React.ReactNode) => void;
    addToHistory: (command: string) => void;
    clearOutput: () => void;
    restoreOutput: (lines: TerminalLine[]) => void;
}

const TerminalContext = createContext<TerminalContextType | undefined>(undefined);

const MAX_OUTPUT_LINES = LAYOUT_TOKENS.maxOutputLines;
const MAX_HISTORY = LAYOUT_TOKENS.maxHistory;
const STORAGE_KEY = 'dhruv-terminal-session-v1';
let nextLineId = 1;

function capTerminalLines(lines: TerminalLine[]): TerminalLine[] {
    return lines.length > MAX_OUTPUT_LINES ? lines.slice(-MAX_OUTPUT_LINES) : lines;
}

function setNextLineId(lines: TerminalLine[]) {
    nextLineId = lines.reduce((maxId, line) => Math.max(maxId, line.id), 0) + 1;
}

export function createInitialTerminalLine(): TerminalLine {
    return {
        id: 1,
        command: 'init',
        output: createInitialTerminalOutput(),
    };
}

export function TerminalProvider({ children }: { children: ReactNode }) {
    const [outputLines, setLines] = useState<TerminalLine[]>([]);
    const [commandHistory, setCommandHistory] = useState<string[]>([]);
    const [sessionCommands, setSessionCommands] = useState<string[]>([]);
    const [isHydrated, setIsHydrated] = useState(false);

    useEffect(() => {
        if (typeof window === 'undefined') return;

        try {
            const stored = localStorage.getItem(STORAGE_KEY);
            if (stored) {
                const parsed = JSON.parse(stored) as { commandHistory?: string[]; sessionCommands?: string[] };
                setCommandHistory(Array.isArray(parsed.commandHistory) ? parsed.commandHistory.slice(-MAX_HISTORY) : []);
                setSessionCommands(Array.isArray(parsed.sessionCommands) ? parsed.sessionCommands : []);
            }
        } catch {
            setCommandHistory([]);
            setSessionCommands([]);
        } finally {
            setIsHydrated(true);
        }
    }, []);

    useEffect(() => {
        if (!isHydrated || typeof window === 'undefined') return;

        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify({ commandHistory, sessionCommands }));
        } catch {
            // localStorage unavailable or full
        }
    }, [commandHistory, sessionCommands, isHydrated]);

    const addCommand = useCallback((command: string, output: React.ReactNode) => {
        setLines(prev => {
            const next = capTerminalLines([...prev, { id: nextLineId++, command, output }]);
            setNextLineId(next);
            return next;
        });

        if (command.trim()) {
            setCommandHistory(prev => {
                const next = [...prev, command];
                return next.length > MAX_HISTORY ? next.slice(-MAX_HISTORY) : next;
            });
            setSessionCommands(prev => [...prev, command]);
        }
    }, []);

    const addToHistory = useCallback((command: string) => {
        if (command.trim()) {
            setCommandHistory(prev => {
                const next = [...prev, command];
                return next.length > MAX_HISTORY ? next.slice(-MAX_HISTORY) : next;
            });
        }
    }, []);

    const clearOutput = useCallback(() => {
        setLines([]);
        setNextLineId([]);
        setSessionCommands(prev => [...prev, 'clear']);
    }, []);

    const restoreOutput = useCallback((lines: TerminalLine[]) => {
        const normalized = capTerminalLines(lines);
        setLines(normalized);
        setNextLineId(normalized);
    }, []);

    const value = useMemo(() => ({
        outputLines,
        commandHistory,
        sessionCommands,
        isHydrated,
        addCommand,
        addToHistory,
        clearOutput,
        restoreOutput,
    }), [outputLines, commandHistory, sessionCommands, isHydrated, addCommand, addToHistory, clearOutput, restoreOutput]);

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
