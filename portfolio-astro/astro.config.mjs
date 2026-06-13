// @ts-check
import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import sitemap from '@astrojs/sitemap';
import node from '@astrojs/node';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath } from 'node:url';

// https://astro.build/config
export default defineConfig({
	site: 'https://whoisdhruv.com',
	output: 'server',
	adapter: node({ mode: 'standalone' }),
	integrations: [react(), sitemap()],
	vite: {
		plugins: [tailwindcss()],
		worker: {
			format: 'es',
		},
		resolve: {
			alias: {
				'@': fileURLToPath(new URL('./src', import.meta.url)),
				'next/link': fileURLToPath(new URL('./src/shims/next-link.tsx', import.meta.url)),
				'next/navigation': fileURLToPath(new URL('./src/shims/next-navigation.ts', import.meta.url)),
				'next/dist/shared/lib/app-router-context.shared-runtime': fileURLToPath(new URL('./src/shims/next-navigation.ts', import.meta.url)),
				'next/dynamic': fileURLToPath(new URL('./src/shims/next-dynamic.tsx', import.meta.url)),
				'next/image': fileURLToPath(new URL('./src/shims/next-image.tsx', import.meta.url)),
				'next/script': fileURLToPath(new URL('./src/shims/next-script.tsx', import.meta.url)),
				'next-themes': fileURLToPath(new URL('./src/shims/next-themes.tsx', import.meta.url)),
				'server-only': fileURLToPath(new URL('./src/shims/server-only.ts', import.meta.url)),
			},
		},
	},
});
