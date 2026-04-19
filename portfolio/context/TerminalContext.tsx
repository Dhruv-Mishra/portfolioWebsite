"use client";

import React, { createContext, useContext, useState, ReactNode, useCallback, useMemo } from 'react';
import { LAYOUT_TOKENS } from '@/lib/designTokens';
import { createInitialTerminalOutput } from '@/lib/terminalCommands';

export interface TerminalLine {
    id: number;
    command: string;
    output: React.ReactNode;
    /**
     * When true, the rendered transcript omits the `➜ ~ <command>` header
     * line and shows only `output` (un-indented, no left border). Used by
     * inline-prompt submissions (decrypt/admin password, admin username)
     * to keep sensitive input completely out of the transcript while still
     * appending the result block (decrypt bar, auth failure note, etc.).
     */
    hideCommandHeader?: boolean;
}

/**
 * Options for `addCommand`. `skipHistory` exists so inline-prompt submissions
 * (password / username entries from `sudo cat adminTerminal.txt` + `sudo admin`)
 * render in the transcript WITHOUT leaking into the ↑/↓ command-history ring.
 * The main terminal input keeps the default behavior (history captures it).
 *
 * `hideCommandHeader` suppresses the rendered `➜ ~ <echo>` header line for
 * this entry — the output block alone appears in the transcript. Paired with
 * `skipHistory: true` for the three sensitive prompts (decrypt password,
 * admin username, admin password).
 */
export interface AddCommandOptions {
    /** When true, the command is NOT appended to commandHistory. Default false. */
    skipHistory?: boolean;
    /** When true, the rendered output omits the command header line. Default false. */
    hideCommandHeader?: boolean;
}

interface TerminalContextType {
    outputLines: TerminalLine[];
    commandHistory: string[];
    addCommand: (command: string, output: React.ReactNode, options?: AddCommandOptions) => void;
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

/**
 * Pure helper: decide what the NEXT history ring should be given the
 * current ring, an incoming command, and whether history capture is
 * being skipped (e.g. inline-prompt password submissions).
 *
 * Exported so unit tests can exercise the decision logic without
 * mounting the full provider. The reducer above delegates to the same
 * rules inline — kept as an exact duplicate so production keeps a tiny
 * hot-path and tests can hit the pure function.
 *
 * Rules:
 *   - If `skipHistory` is true, return `current` unchanged.
 *   - If `command` is empty/whitespace, return `current` unchanged.
 *   - Otherwise append and clamp to MAX_HISTORY.
 */
export function computeNextHistory(
    current: readonly string[],
    command: string,
    options?: AddCommandOptions,
): string[] {
    if (options?.skipHistory) return [...current];
    if (!command.trim()) return [...current];
    const next = [...current, command];
    return next.length > MAX_HISTORY ? next.slice(-MAX_HISTORY) : next;
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

    const addCommand = useCallback((command: string, output: React.ReactNode, options?: AddCommandOptions) => {
        setLines(prev => {
            const entry: TerminalLine = {
                id: nextLineId++,
                command,
                output,
                ...(options?.hideCommandHeader ? { hideCommandHeader: true } : {}),
            };
            const next = capTerminalLines([...prev, entry]);
            setNextLineId(next);
            return next;
        });

        // Skip history capture when the caller explicitly opts out (e.g.
        // inline-prompt password/username submissions). Otherwise fall back
        // to the default behavior: any non-empty command goes into the ring.
        if (!options?.skipHistory && command.trim()) {
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
