import React from "react";
import { APP_VERSION } from "@/lib/constants";

export function createInitialTerminalOutput(): React.ReactNode {
    return (
        <div className="text-gray-400 text-sm font-mono leading-relaxed">
            <p>
                <span className="text-emerald-400">[✓]</span>{' '}
                <span className="text-white">Portfolio {APP_VERSION} ready.</span>{' '}
                <span className="text-gray-400">Type</span>{' '}
                <span className="text-emerald-400 font-bold">&apos;help&apos;</span>{' '}
                <span className="text-gray-400">to explore.</span>
            </p>
        </div>
    );
}