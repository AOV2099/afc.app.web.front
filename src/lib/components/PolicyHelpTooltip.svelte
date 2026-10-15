<script>
	import { onMount } from 'svelte';
	import { Info } from 'lucide-svelte';

	export let title = '';
	export let intro = '';
	/** @type {{ value: string, label: string, description?: string }[]} */
	export let options = [];

	const PANEL_WIDTH = 288;
	let open = false;
	// Abierto con clic o toque: se queda visible hasta tocar fuera o presionar Escape.
	let pinned = false;
	let buttonEl;
	let panelEl;
	let panelStyle = '';
	let portalTarget = null;

	// Fuera de un diálogo se monta en <body>; dentro, en el diálogo para no cerrarlo al tocar el panel.
	function portal(node, target) {
		(target || document.body).appendChild(node);
		return { destroy: () => node.remove() };
	}

	function show() {
		placePanel();
		open = true;
	}

	function placePanel() {
		if (!buttonEl) return;
		const rect = buttonEl.getBoundingClientRect();
		const host = buttonEl.closest('[role="dialog"]');
		const origin = host ? host.getBoundingClientRect() : { top: 0, left: 0, width: window.innerWidth };
		const left = Math.max(12, Math.min(rect.left - origin.left, origin.width - PANEL_WIDTH - 12));
		const top = rect.bottom - origin.top + (host ? host.scrollTop : 0) + 6;
		portalTarget = host;
		panelStyle = `position:${host ? 'absolute' : 'fixed'};top:${top}px;left:${left}px;width:${PANEL_WIDTH}px`;
	}

	function onScroll() {
		if (open) placePanel();
	}

	function hide() {
		open = false;
		pinned = false;
	}

	function onDocumentPointerDown(event) {
		if (open && !buttonEl?.contains(event.target) && !panelEl?.contains(event.target)) hide();
	}

	onMount(() => {
		document.addEventListener('scroll', onScroll, true);
		return () => document.removeEventListener('scroll', onScroll, true);
	});
</script>

<svelte:document onpointerdown={onDocumentPointerDown} onkeydown={(event) => event.key === 'Escape' && hide()} />

<button
	bind:this={buttonEl}
	type="button"
	class="inline-flex h-5 w-5 items-center justify-center rounded-full text-slate-500 hover:text-blue-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
	aria-label={`¿Qué significa ${title}?`}
	aria-expanded={open}
	onclick={() => {
		show();
		pinned = true;
	}}
	onmouseenter={show}
	onmouseleave={() => !pinned && hide()}
>
	<Info class="h-4 w-4" />
</button>

{#if open}
	<div
		bind:this={panelEl}
		use:portal={portalTarget}
		role="tooltip"
		class="z-[100] rounded-xl border bg-white px-3 py-2 text-xs text-slate-700 shadow-lg"
		style={panelStyle}
	>
		<div class="font-semibold text-slate-900">{title}</div>
		{#if intro}<div class="mt-1">{intro}</div>{/if}
		<ul class="mt-2 space-y-1.5">
			{#each options.filter((option) => option.description) as option (option.value)}
				<li><span class="font-semibold">{option.label}:</span> {option.description}</li>
			{/each}
		</ul>
	</div>
{/if}
