import { TERMINAL_HOST, TERMINAL_USER } from "@/lib/constants";
import { TERMINAL_COLORS } from "@/lib/designTokens";

/** Bash-style `guest@dhruv:~$` label shared by the live input and the transcript echo lines. */
export default function TerminalPrompt() {
    return (
        <span className="shrink-0 whitespace-nowrap">
            <span className={TERMINAL_COLORS.prompt}>{TERMINAL_USER}@{TERMINAL_HOST}</span>
            <span className={TERMINAL_COLORS.punctuation}>:</span>
            <span className={TERMINAL_COLORS.directory}>~</span>
            <span className={TERMINAL_COLORS.punctuation}>$</span>
        </span>
    );
}
