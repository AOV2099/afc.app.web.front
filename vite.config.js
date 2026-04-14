import fs from 'node:fs';
import path from 'node:path';
import tailwindcss from '@tailwindcss/vite';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

const certKeyPath = path.resolve('certs/dev-key.pem');
const certPath = path.resolve('certs/dev-cert.pem');

const httpsConfig =
	fs.existsSync(certKeyPath) && fs.existsSync(certPath)
		? {
			key: fs.readFileSync(certKeyPath),
			cert: fs.readFileSync(certPath)
		}
		: undefined;

export default defineConfig({
	plugins: [tailwindcss(), sveltekit()],
	server: {
		host: true,
		https: httpsConfig,
		proxy: {
			'/api': {
				target: 'http://localhost:3000',
				changeOrigin: true,
				secure: false
			},
			'/health': {
				target: 'http://localhost:3000',
				changeOrigin: true,
				secure: false
			}
		}
	}
});
