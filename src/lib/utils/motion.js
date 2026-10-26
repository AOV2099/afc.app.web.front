import { fly } from 'svelte/transition';
import { cubicOut } from 'svelte/easing';

// Misma entrada que las pestañas del login.
export const PANEL_IN = Object.freeze({ y: 10, duration: 1000, easing: cubicOut });

function prefersReducedMotion() {
	return typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}

/** Entrada suave (desplazamiento + opacidad); sin animación si el sistema pide reducir movimiento. */
export function panelIn(node, params = {}) {
	if (prefersReducedMotion()) return { duration: 0 };
	return fly(node, { ...PANEL_IN, ...params });
}

/** Retraso escalonado para listas: cada elemento entra un poco después del anterior, con tope. */
export function staggerDelay(index, step = 40, max = 320) {
	return Math.min(Math.max(0, Number(index) || 0) * step, max);
}
