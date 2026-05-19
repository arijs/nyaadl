import { defineConfig } from 'vite'
import solid from 'vite-plugin-solid'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
	plugins: [solid(), tailwindcss()],
	server: {
		port: 5173,
		watch: {
			ignored: [
				'**/torrents/**',
				'**/data/**',
				'**/page-*.html',
				'**/page-*.json',
				'**/*.tmp',
			],
		},
		proxy: {
			'/api': 'http://127.0.0.1:8787',
		},
	},
	build: {
		outDir: 'dist/client',
		emptyOutDir: true,
	},
})