import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { fileURLToPath } from 'node:url';

// The preview site: a static page that renders a draft article with the very
// components cwal.gg uses. Built into ../site/guides for GitHub Pages.
export default defineConfig({
	root: fileURLToPath(new URL('./preview', import.meta.url)),
	base: './',
	plugins: [svelte()],
	build: {
		outDir: fileURLToPath(new URL('../site/guides', import.meta.url)),
		emptyOutDir: true
	},
	server: { fs: { allow: ['.'] } }
});
