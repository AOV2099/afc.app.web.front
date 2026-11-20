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

/** Desplazamiento horizontal entre pantallas (como el cambio de vista en una app móvil). */
export function screenSlide(node, { x = 0, duration = 320 } = {}) {
	if (prefersReducedMotion()) return { duration: 0 };
	return fly(node, { x, duration, easing: cubicOut, opacity: 0 });
}

/** Retraso escalonado para listas: cada elemento entra un poco después del anterior, con tope. */
export function staggerDelay(index, step = 40, max = 320) {
	return Math.min(Math.max(0, Number(index) || 0) * step, max);
}
