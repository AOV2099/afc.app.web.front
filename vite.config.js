import fs from 'node:fs';
import path from 'node:path';
import tailwindcss from '@tailwindcss/vite';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

const defaultCertKeyPath = path.resolve('certs/dev-key.pem');
const defaultCertPath = path.resolve('certs/dev-cert.pem');

function normalizePemContent(value) {
	if (!value) return '';
	return String(value).replace(/\\n/g, '\n').trim();
}

function resolveHttpsConfigFromEnv() {
	const keyPath = process.env.VITE_DEV_HTTPS_KEY_PATH;
	const certPath = process.env.VITE_DEV_HTTPS_CERT_PATH;

	if (keyPath && certPath && fs.existsSync(keyPath) && fs.existsSync(certPath)) {
		return {
			key: fs.readFileSync(keyPath),
			cert: fs.readFileSync(certPath)
		};
	}

	const keyPem = normalizePemContent(process.env.VITE_DEV_HTTPS_KEY);
	const certPem = normalizePemContent(process.env.VITE_DEV_HTTPS_CERT);

	if (keyPem && certPem) {
		return {
			key: keyPem,
			cert: certPem
		};
	}

	const keyBase64 = process.env.VITE_DEV_HTTPS_KEY_BASE64;
	const certBase64 = process.env.VITE_DEV_HTTPS_CERT_BASE64;

	if (keyBase64 && certBase64) {
		return {
			key: Buffer.from(String(keyBase64), 'base64').toString('utf8'),
			cert: Buffer.from(String(certBase64), 'base64').toString('utf8')
		};
	}

	return undefined;
}

const httpsConfig =
	resolveHttpsConfigFromEnv() ||
	(fs.existsSync(defaultCertKeyPath) && fs.existsSync(defaultCertPath)
		? {
			key: fs.readFileSync(defaultCertKeyPath),
			cert: fs.readFileSync(defaultCertPath)
		}
		: undefined);

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
