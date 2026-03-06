"use client";

import React, { createContext, useContext, useState, ReactNode, useCallback, useMemo } from 'react';
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
    addCommand: (command: string, output: React.ReactNode) => void;
    addToHistory: (command: string) => void;
    clearOutput: () => void;
}

const TerminalContext = createContext<TerminalContextType | undefined>(undefined);

const MAX_OUTPUT_LINES = LAYOUT_TOKENS.maxOutputLines;
const MAX_HISTORY = LAYOUT_TOKENS.maxHistory;
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
    const [outputLines, setLines] = useState<TerminalLine[]>(() => {
        const initialLines = [createInitialTerminalLine()];
        setNextLineId(initialLines);
        return initialLines;
    });
    const [commandHistory, setCommandHistory] = useState<string[]>([]);

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
    }, []);

    const value = useMemo(() => ({
        outputLines,
        commandHistory,
        addCommand,
        addToHistory,
        clearOutput,
    }), [outputLines, commandHistory, addCommand, addToHistory, clearOutput]);

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
