<script>
	import { buildCalendarMonth } from '$lib/utils/eventSessions.js';

	export let selected = [];
	export let minDate = '';
	export let disabled = false;
	export let canAdd = true;
	export let onToggle = () => {};

	const WEEKDAY_HEADERS = ['L', 'M', 'Mi', 'J', 'V', 'S', 'D'];
	const todayKey = new Date().toLocaleDateString('en-CA');
	const [initialYear, initialMonth] = ([...selected].sort()[0] || minDate || todayKey).split('-').map(Number);
	let year = initialYear;
	let month = initialMonth - 1;

	$: weeks = buildCalendarMonth(year, month);
	$: selectedSet = new Set(selected);
	$: title = new Date(Date.UTC(year, month, 15)).toLocaleDateString('es-MX', {
		month: 'long',
		year: 'numeric',
		timeZone: 'UTC'
	});
	$: monthKey = `${year}-${String(month + 1).padStart(2, '0')}`;
	$: canGoBack = !minDate || monthKey > minDate.slice(0, 7);

	function shift(delta) {
		const next = month + delta;
		year += Math.floor(next / 12);
		month = ((next % 12) + 12) % 12;
	}

	function fullLabel(date) {
		return new Date(`${date}T12:00:00`).toLocaleDateString('es-MX', {
			weekday: 'long',
			day: 'numeric',
			month: 'long',
			year: 'numeric'
		});
	}

	function dayClass(day, isSelected) {
		if (isSelected) return 'bg-blue-600 font-semibold text-white hover:bg-blue-700';
		const base = day.inMonth ? 'text-slate-800' : 'text-slate-300';
		return `${base} hover:bg-blue-50 ${day.date === todayKey ? 'ring-1 ring-blue-300' : ''}`;
	}
</script>

<div class="w-full max-w-sm rounded-2xl border bg-white p-3" data-testid="session-calendar">
	<div class="mb-2 flex items-center justify-between">
		<button
			type="button"
			class="h-8 w-8 rounded-lg text-lg text-slate-600 hover:bg-slate-100 disabled:opacity-30"
			aria-label="Mes anterior"
			onclick={() => shift(-1)}
			disabled={!canGoBack}
		>
			‹
		</button>
		<div class="text-sm font-semibold first-letter:uppercase" aria-live="polite">{title}</div>
		<button
			type="button"
			class="h-8 w-8 rounded-lg text-lg text-slate-600 hover:bg-slate-100"
			aria-label="Mes siguiente"
			onclick={() => shift(1)}
		>
			›
		</button>
	</div>
	<div class="grid grid-cols-7 gap-1 text-center">
		{#each WEEKDAY_HEADERS as header}
			<div class="py-1 text-[11px] font-semibold text-muted-foreground" aria-hidden="true">{header}</div>
		{/each}
		{#each weeks as week}
			{#each week as day (day.date)}
				{@const isSelected = selectedSet.has(day.date)}
				<button
					type="button"
					class={`h-9 rounded-lg text-sm transition disabled:cursor-not-allowed disabled:opacity-30 ${dayClass(day, isSelected)}`}
					aria-label={fullLabel(day.date)}
					aria-pressed={isSelected}
					data-date={day.date}
					disabled={disabled || (minDate && day.date < minDate) || (!isSelected && !canAdd)}
					onclick={() => onToggle(day.date)}
				>
					{day.day}
				</button>
			{/each}
		{/each}
	</div>
</div>
