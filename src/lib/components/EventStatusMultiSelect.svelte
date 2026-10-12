<script>
	import { Check, ChevronDown } from 'lucide-svelte';
	import { EVENT_STATUS_FILTER_OPTIONS } from '$lib/utils/events.js';

	export let selected = [];
	export let id = 'event-status-filter';

	let open = false;
	let root;

	$: summary =
		selected.length === 0 || selected.length === EVENT_STATUS_FILTER_OPTIONS.length
			? 'Todos los estatus'
			: EVENT_STATUS_FILTER_OPTIONS.filter((option) => selected.includes(option.value))
					.map((option) => option.label)
					.join(', ');

	function toggle(value) {
		selected = selected.includes(value) ? selected.filter((item) => item !== value) : [...selected, value];
	}

	function closeOnOutsideClick(event) {
		if (open && root && !root.contains(event.target)) open = false;
	}
</script>

<svelte:window onclick={closeOnOutsideClick} onkeydown={(event) => event.key === 'Escape' && (open = false)} />

<div class="relative w-full min-w-0" bind:this={root}>
	<button
		type="button"
		{id}
		class="flex h-11 w-full items-center justify-between gap-2 rounded-2xl border bg-background px-3 text-left text-sm"
		aria-haspopup="true"
		aria-expanded={open}
		aria-label={`Filtrar por estatus: ${summary}`}
		onclick={() => (open = !open)}
	>
		<span class="truncate">{summary}</span>
		<ChevronDown class="h-4 w-4 shrink-0 opacity-60" />
	</button>
	{#if open}
		<div class="absolute left-0 right-0 z-30 mt-1 rounded-xl border bg-white p-1 shadow-lg" role="group" aria-label="Estatus">
			{#each EVENT_STATUS_FILTER_OPTIONS as option (option.value)}
				<label class="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-2 text-sm hover:bg-slate-100">
					<input
						type="checkbox"
						class="peer sr-only"
						checked={selected.includes(option.value)}
						onchange={() => toggle(option.value)}
					/>
					<span
						class="grid h-4 w-4 place-items-center rounded border border-slate-300 text-white peer-checked:border-blue-600 peer-checked:bg-blue-600 peer-focus-visible:ring-2 peer-focus-visible:ring-ring"
					>
						{#if selected.includes(option.value)}<Check class="h-3 w-3" />{/if}
					</span>
					{option.label}
				</label>
			{/each}
		</div>
	{/if}
</div>
