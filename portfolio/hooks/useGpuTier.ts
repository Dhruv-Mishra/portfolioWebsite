import { useEffect, useState } from 'react';

/**
 * Detects whether the browser is using software rendering (no GPU acceleration).
 *
 * When Chrome's "Use hardware acceleration when available" is OFF, it falls back
 * to SwiftShader (a software WebGL renderer). This hook detects that and other
 * software renderers so we can degrade expensive visual effects gracefully.
 *
 * Returns:
 * - `true`  → software/CPU rendering detected (should reduce effects)
 * - `false` → hardware GPU acceleration is available (full effects OK)
 * - `false` → also the default during SSR / before detection runs
 */
export function useSoftwareRenderer(): boolean {
    const [isSoftware, setIsSoftware] = useState(false);

    useEffect(() => {
        setIsSoftware(detectSoftwareRenderer());
    }, []);

    return isSoftware;
}

/**
 * One-shot detection (safe to call outside React too).
 * Cached after first call.
 */
let _cachedResult: boolean | null = null;

export function detectSoftwareRenderer(): boolean {
    if (_cachedResult !== null) return _cachedResult;
    if (typeof window === 'undefined') return false;

    try {
        const canvas = document.createElement('canvas');
        // Try WebGL2 first, fall back to WebGL1
        const gl = (canvas.getContext('webgl2') || canvas.getContext('webgl')) as WebGLRenderingContext | null;

        if (!gl) {
            // No WebGL at all → definitely software / very old GPU
            _cachedResult = true;
            return true;
        }

        const debugExt = gl.getExtension('WEBGL_debug_renderer_info');
        if (debugExt) {
            const renderer = gl.getParameter(debugExt.UNMASKED_RENDERER_WEBGL) as string;
            const vendor = gl.getParameter(debugExt.UNMASKED_VENDOR_WEBGL) as string;

            const rendererLower = renderer.toLowerCase();

            // Known software renderers
            const isSoftware =
                rendererLower.includes('swiftshader') ||        // Chrome's software fallback
                rendererLower.includes('llvmpipe') ||           // Mesa software renderer (Linux)
                rendererLower.includes('softpipe') ||           // Mesa software renderer (Linux)
                rendererLower.includes('microsoft basic') ||    // Windows fallback driver
                rendererLower.includes('software') ||           // Generic "software" mention
                (vendor.toLowerCase().includes('google') && rendererLower.includes('angle'))
                    && rendererLower.includes('swiftshader');

            _cachedResult = isSoftware;

            // Clean up WebGL context
            const loseExt = gl.getExtension('WEBGL_lose_context');
            loseExt?.loseContext();

            return isSoftware;
        }

        // If debug extension not available, assume hardware (conservative default)
        const loseExt = gl.getExtension('WEBGL_lose_context');
        loseExt?.loseContext();
        _cachedResult = false;
        return false;
    } catch {
        // If anything throws, assume software to be safe
        _cachedResult = true;
        return true;
    }
}
