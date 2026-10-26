import { defineConfig, devices } from '@playwright/test';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.e2e', quiet: true });

// Requiere el front (npm run dev) y el back corriendo; no levanta servidores.
export default defineConfig({
	testDir: 'tests/e2e',
	workers: 1,
	fullyParallel: false,
	timeout: 60_000,
	expect: { timeout: 10_000 },
	reporter: [['list'], ['html', { open: 'never' }]],
	use: {
		baseURL: process.env.AFC_E2E_BASE_URL || 'https://localhost:5173',
		ignoreHTTPSErrors: true,
		trace: 'retain-on-failure',
		launchOptions: { slowMo: Number(process.env.AFC_E2E_SLOW_MO || 0) }
	},
	projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }]
});
