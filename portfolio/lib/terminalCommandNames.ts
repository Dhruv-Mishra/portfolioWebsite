export const TERMINAL_COMMAND_NAMES = [
    'help',
    'joke',
    'about',
    'contact',
    'projects',
    'guestbook',
    'sign',
    'stickers',
    'settings',
    'init',
    'resume',
    'cv',
    'chat',
    'socials',
    'github',
    'linkedin',
    'skills',
    'ls',
    'cat',
    'open',
    'whoami',
    'date',
    'cheatsheet',
    'sudo',
    'disco',
    'feedback',
    'unlockstickers',
    'hesoyam',
    'matrix',
    '/hint',
    'hint',
    'clear',
] as const;

export const TERMINAL_COMMAND_NAME_SET: ReadonlySet<string> = new Set(TERMINAL_COMMAND_NAMES);

export type TerminalCommandName = (typeof TERMINAL_COMMAND_NAMES)[number];

export interface TerminalCommandCompletionSession {
    readonly source: string;
    readonly matches: readonly TerminalCommandName[];
    readonly index: number;
}

export interface TerminalCommandCompletionResult {
    readonly value: string;
    readonly session: TerminalCommandCompletionSession | null;
    readonly completed: boolean;
}

function longestCommonPrefix(values: readonly string[]): string {
    if (values.length === 0) return '';
    let prefix = values[0];
    for (const value of values.slice(1)) {
        let i = 0;
        while (i < prefix.length && i < value.length && prefix[i] === value[i]) i++;
        prefix = prefix.slice(0, i);
        if (!prefix) break;
    }
    return prefix;
}

function matchesForPrefix(prefix: string): TerminalCommandName[] {
    const needle = prefix.toLowerCase();
    return TERMINAL_COMMAND_NAMES.filter((command) => command.startsWith(needle));
}

function canContinueSession(
    input: string,
    session: TerminalCommandCompletionSession,
): boolean {
    const value = input.toLowerCase();
    return (
        value.startsWith(session.source) &&
        session.matches.length > 1 &&
        session.matches.every((command) => command.startsWith(value) || command === value)
    ) || session.matches.some((command) => command === value);
}

export function completeTerminalCommandInput(
    input: string,
    previousSession: TerminalCommandCompletionSession | null = null,
): TerminalCommandCompletionResult {
    if (!input || /\s/.test(input)) {
        return { value: input, session: null, completed: false };
    }

    if (previousSession && canContinueSession(input, previousSession)) {
        const index = (previousSession.index + 1) % previousSession.matches.length;
        return {
            value: previousSession.matches[index],
            session: { ...previousSession, index },
            completed: true,
        };
    }

    const source = input.toLowerCase();
    const matches = matchesForPrefix(source);
    if (matches.length === 0) {
        return { value: input, session: null, completed: false };
    }

    if (matches.length === 1) {
        return {
            value: matches[0],
            session: { source, matches, index: 0 },
            completed: matches[0] !== input,
        };
    }

    const commonPrefix = longestCommonPrefix(matches);
    if (commonPrefix.length > source.length) {
        return {
            value: commonPrefix,
            session: { source, matches, index: -1 },
            completed: true,
        };
    }

    return {
        value: matches[0],
        session: { source, matches, index: 0 },
        completed: true,
    };
}