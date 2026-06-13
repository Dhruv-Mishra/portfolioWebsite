"use client";

import React, { createContext, useContext, useState, type ReactNode, useCallback, useMemo, useEffect } from 'react';
import { LAYOUT_TOKENS } from '@/lib/designTokens';
import { createInitialTerminalOutput } from '@/lib/terminalInitialOutput';

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

interface TerminalSessionState {
    outputLines: TerminalLine[];
    commandHistory: string[];
}

let terminalSessionState: TerminalSessionState | null = null;

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

function createInitialTerminalSessionState(): TerminalSessionState {
    const outputLines = [createInitialTerminalLine()];
    setNextLineId(outputLines);
    return { outputLines, commandHistory: [] };
}

function readTerminalSessionState(): TerminalSessionState {
    terminalSessionState ??= createInitialTerminalSessionState();
    setNextLineId(terminalSessionState.outputLines);
    return terminalSessionState;
}

function persistTerminalOutputLines(outputLines: TerminalLine[]): void {
    const current = readTerminalSessionState();
    terminalSessionState = { ...current, outputLines };
    setNextLineId(outputLines);
}

function persistTerminalCommandHistory(commandHistory: string[]): void {
    const current = readTerminalSessionState();
    terminalSessionState = { ...current, commandHistory };
}

/** @internal test hook */
export function __resetTerminalSessionForTest(): void {
    terminalSessionState = null;
    nextLineId = 1;
}

/** @internal test hook */
export function __readTerminalSessionForTest(): TerminalSessionState {
    return readTerminalSessionState();
}

/** @internal test hook */
export function __persistTerminalSessionForTest(next: TerminalSessionState): void {
    terminalSessionState = {
        outputLines: capTerminalLines([...next.outputLines]),
        commandHistory: next.commandHistory.slice(-MAX_HISTORY),
    };
    setNextLineId(terminalSessionState.outputLines);
}

export function TerminalProvider({ children }: { children: ReactNode }) {
    const [outputLines, setLines] = useState<TerminalLine[]>(() => readTerminalSessionState().outputLines);
    const [commandHistory, setCommandHistory] = useState<string[]>(() => readTerminalSessionState().commandHistory);

    const addCommand = useCallback((command: string, output: React.ReactNode, options?: AddCommandOptions) => {
        const current = readTerminalSessionState();
        const entry: TerminalLine = {
            id: nextLineId++,
            command,
            output,
            ...(options?.hideCommandHeader ? { hideCommandHeader: true } : {}),
        };
        const nextOutputLines = capTerminalLines([...current.outputLines, entry]);
        persistTerminalOutputLines(nextOutputLines);
        setLines(nextOutputLines);

        // Skip history capture when the caller explicitly opts out (e.g.
        // inline-prompt password/username submissions). Otherwise fall back
        // to the default behavior: any non-empty command goes into the ring.
        if (!options?.skipHistory && command.trim()) {
            const nextHistory = computeNextHistory(current.commandHistory, command, options);
            persistTerminalCommandHistory(nextHistory);
            setCommandHistory(nextHistory);
        }
    }, []);

    const addToHistory = useCallback((command: string) => {
        if (command.trim()) {
            const current = readTerminalSessionState();
            const nextHistory = computeNextHistory(current.commandHistory, command);
            persistTerminalCommandHistory(nextHistory);
            setCommandHistory(nextHistory);
        }
    }, []);

    const clearOutput = useCallback(() => {
        persistTerminalOutputLines([]);
        setLines([]);
    }, []);

    // System-injected terminal lines from elsewhere in the app (e.g. matrix
    // overlay early-exit nudge). The detail carries either a string or any
    // ReactNode — rendered with hideCommandHeader so no fake `➜ ~` prompt
    // appears, and no command is captured into the ↑/↓ history ring.
    useEffect(() => {
        if (typeof window === 'undefined') return;
        const handler = (raw: Event): void => {
            const detail = (raw as CustomEvent<{ output?: ReactNode; command?: string }>).detail;
            if (!detail || detail.output === undefined || detail.output === null) return;
            addCommand(detail.command ?? 'system', detail.output, {
                skipHistory: true,
                hideCommandHeader: true,
            });
        };
        window.addEventListener('terminal:enqueue-system', handler);
        return () => window.removeEventListener('terminal:enqueue-system', handler);
    }, [addCommand]);

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
