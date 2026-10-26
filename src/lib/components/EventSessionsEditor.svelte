<script>
	import { Button } from '$lib/components/ui/button';
	import SessionCalendar from '$lib/components/SessionCalendar.svelte';
	import {
		ATTENDANCE_PERCENT_RANGE,
		MAX_EVENT_SESSIONS,
		WEEKDAY_OPTIONS,
		buildPeriodSessions,
		createSessionPeriod,
		describeAttendanceRule,
		sortSessionRows,
		toggleSessionDate
	} from '$lib/utils/eventSessions.js';

	// La modalidad la decide el tipo de actividad AFC; aquí solo se muestra.
	export let mode = 'single';
	export let rows = [];
	export let attendancePercent = ATTENDANCE_PERCENT_RANGE.default;
	export let disabled = false;
	export let error = '';
	export let idPrefix = 'event-sessions';
	export let minDate = '';
	export let modeHint = 'Se define automáticamente según el tipo de actividad AFC.';

	let captureMode = 'period';
	let period = createSessionPeriod();
	const initialPeriodKey = JSON.stringify(period);
	let lastPeriodKey = initialPeriodKey;
	let periodError = '';
	let pointTimes = { startTime: '', endTime: '' };
	let periodTimes = { startTime: '', endTime: '' };

	const fieldClass =
		'mt-1 h-11 w-full rounded-2xl border bg-background px-3 text-sm disabled:cursor-not-allowed disabled:opacity-60';
	const tabClass = (active) =>
		`flex-1 rounded-xl px-3 py-2 text-sm font-semibold ${active ? 'bg-blue-600 text-white' : 'text-slate-600'}`;

	$: periodKey = JSON.stringify(period);
	$: if (mode === 'multi' && captureMode === 'period' && !disabled && periodKey !== lastPeriodKey) {
		applyPeriod(periodKey);
	}
	$: sortedRows = sortSessionRows(rows);
	// Con asistencias solo se reprograman las sesiones sin check-ins y se conserva el total.
	$: rescheduleOnly = rows.some((row) => row.locked);

	function updateRow(index, field, value) {
		rows = rows.map((row, i) => (i === index ? { ...row, [field]: value } : row));
	}

	// Solo regenera cuando cambia el periodo, para no borrar ajustes hechos en "Fechas individuales".
	function applyPeriod(key) {
		lastPeriodKey = key;
		const result = buildPeriodSessions(period);
		periodError = result.error;
		if (!result.error) rows = result.rows;
	}

	function togglePointDate(date) {
		const last = sortedRows[sortedRows.length - 1];
		const times = pointTimes.startTime && pointTimes.endTime ? pointTimes : last || pointTimes;
		rows = toggleSessionDate(rows, date, { startTime: times.startTime, endTime: times.endTime });
	}

	function applyPointTimesToAll() {
		if (!pointTimes.startTime || !pointTimes.endTime) return;
		rows = rows.map((row) => ({ ...row, startTime: pointTimes.startTime, endTime: pointTimes.endTime }));
	}

	function updateRowByDate(date, field, value) {
		rows = rows.map((row) => (row.date === date ? { ...row, [field]: value } : row));
	}

	function applyPeriodTimesToAll() {
		if (!periodTimes.startTime || !periodTimes.endTime) return;
		period = {
			...period,
			days: period.days.map((day) =>
				day.enabled ? { ...day, startTime: periodTimes.startTime, endTime: periodTimes.endTime } : day
			)
		};
	}

	function dayLabel(date) {
		if (!date) return '';
		const value = new Date(`${date}T12:00:00`);
		if (Number.isNaN(value.getTime())) return '';
		return value.toLocaleDateString('es-MX', { weekday: 'short', day: '2-digit', month: 'short' });
	}
</script>

<div class="space-y-4" data-testid="event-sessions-editor">
	<div>
		<div class="flex w-full rounded-2xl border bg-slate-50 p-1" role="tablist" aria-label="Número de sesiones">
			<button type="button" role="tab" aria-selected={mode === 'single'} class={tabClass(mode === 'single')} disabled>
				Una sesión
			</button>
			<button type="button" role="tab" aria-selected={mode === 'multi'} class={tabClass(mode === 'multi')} disabled>
				Varias sesiones
			</button>
		</div>
		<div class="mt-1 text-xs text-muted-foreground">{modeHint}</div>
	</div>

	{#if mode === 'single'}
		<slot />
	{:else if rescheduleOnly}
		<div class="space-y-2" data-testid="reschedule-sessions">
			<div class="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800">
				El evento ya tiene asistencias: se conservan sus {rows.length} sesiones y las que tienen asistencias no se pueden
				cambiar. Puedes reprogramar la fecha u horario de las demás.
			</div>
			{#each rows as row, index (index)}
				<div class="grid grid-cols-2 items-end gap-2 rounded-2xl border bg-white p-3 sm:grid-cols-[1.4fr_1fr_1fr]">
					<label class="col-span-2 text-xs font-semibold text-slate-600 sm:col-span-1">
						Sesión {index + 1}
						{#if row.locked}<span class="ml-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] text-emerald-700">Con asistencias</span>{/if}
						<input
							class={fieldClass}
							type="date"
							value={row.date}
							onchange={(e) => updateRow(index, 'date', e.currentTarget.value)}
							disabled={disabled || row.locked}
						/>
					</label>
					<label class="text-xs font-semibold text-slate-600">
						Inicio
						<input class={fieldClass} type="time" value={row.startTime} oninput={(e) => updateRow(index, 'startTime', e.currentTarget.value)} disabled={disabled || row.locked} />
					</label>
					<label class="text-xs font-semibold text-slate-600">
						Fin
						<input class={fieldClass} type="time" value={row.endTime} oninput={(e) => updateRow(index, 'endTime', e.currentTarget.value)} disabled={disabled || row.locked} />
					</label>
				</div>
			{/each}
			<div class="rounded-2xl border bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-900" data-testid="attendance-rule">
				Asistencia mínima: {describeAttendanceRule(Number(attendancePercent), rows.length)}
			</div>
		</div>
	{:else}
		<div class="flex w-full rounded-2xl border bg-white p-1" role="tablist" aria-label="Forma de capturar las sesiones">
			<button
				type="button"
				role="tab"
				aria-selected={captureMode === 'period'}
				class={`${tabClass(captureMode === 'period')} ${captureMode === 'period' ? '' : 'hover:bg-slate-100'}`}
				onclick={() => (captureMode = 'period')}
				{disabled}
			>
				Por periodo
			</button>
			<button
				type="button"
				role="tab"
				aria-selected={captureMode === 'individual'}
				class={`${tabClass(captureMode === 'individual')} ${captureMode === 'individual' ? '' : 'hover:bg-slate-100'}`}
				onclick={() => (captureMode = 'individual')}
				{disabled}
			>
				Fechas individuales
			</button>
		</div>

		{#if captureMode === 'period'}
			<div class="space-y-4 rounded-2xl border border-blue-100 bg-blue-50/40 p-4">
				<div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
					<label class="text-xs font-semibold text-slate-600">
						Fecha inicial
						<input id={`${idPrefix}-from`} class={fieldClass} type="date" min={minDate} bind:value={period.startDate} {disabled} />
					</label>
					<label class="text-xs font-semibold text-slate-600">
						Fecha final
						<input id={`${idPrefix}-to`} class={fieldClass} type="date" min={period.startDate || minDate} bind:value={period.endDate} {disabled} />
					</label>
				</div>

				<div class="space-y-2">
					<div class="text-xs font-semibold text-slate-600">Días y horario de cada día</div>
					<div class="grid grid-cols-[2fr_2fr_1fr] items-end gap-2">
						<label class="text-xs font-semibold text-slate-600">
							Hora de inicio
							<input id={`${idPrefix}-period-start`} class={fieldClass} type="time" bind:value={periodTimes.startTime} {disabled} />
						</label>
						<label class="text-xs font-semibold text-slate-600">
							Hora de fin
							<input id={`${idPrefix}-period-end`} class={fieldClass} type="time" bind:value={periodTimes.endTime} {disabled} />
						</label>
						<Button
							variant="outline"
							class="h-11 whitespace-normal rounded-xl px-2 text-xs leading-tight"
							onclick={applyPeriodTimesToAll}
							disabled={disabled || !periodTimes.startTime || !periodTimes.endTime || !period.days.some((day) => day.enabled)}
						>
							Aplicar a todas las fechas
						</Button>
					</div>
					{#each period.days as day, index (day.weekday)}
						<div class="grid grid-cols-[8rem_1fr_1fr] items-center gap-2 rounded-xl bg-white px-3 py-2">
							<label class="flex items-center gap-2 text-sm font-semibold">
								<input
									id={`${idPrefix}-day-${day.weekday}`}
									type="checkbox"
									class="h-4 w-4 accent-blue-600"
									bind:checked={period.days[index].enabled}
									{disabled}
								/>
								{WEEKDAY_OPTIONS.find((option) => option.value === day.weekday)?.name}
							</label>
							<input
								id={`${idPrefix}-day-${day.weekday}-start`}
								aria-label={`Hora de inicio ${WEEKDAY_OPTIONS.find((option) => option.value === day.weekday)?.name}`}
								class={fieldClass}
								type="time"
								bind:value={period.days[index].startTime}
								disabled={disabled || !day.enabled}
							/>
							<input
								id={`${idPrefix}-day-${day.weekday}-end`}
								aria-label={`Hora de fin ${WEEKDAY_OPTIONS.find((option) => option.value === day.weekday)?.name}`}
								class={fieldClass}
								type="time"
								bind:value={period.days[index].endTime}
								disabled={disabled || !day.enabled}
							/>
						</div>
					{/each}
				</div>

				{#if periodError && periodKey !== initialPeriodKey}
					<div class="text-xs font-semibold text-amber-700" data-testid="period-error">{periodError}</div>
				{/if}
				<div class="text-xs text-muted-foreground">
					Las sesiones se generan automáticamente; para ajustar una fecha en particular usa "Fechas individuales".
				</div>
			</div>

			<div class="space-y-2">
				<div class="text-sm font-semibold text-blue-600">Sesiones generadas ({rows.length})</div>
				{#if sortedRows.length}
					<div class="flex flex-wrap gap-2" data-testid="generated-sessions">
						{#each sortedRows as row, index (`${row.date}-${index}`)}
							<span class="rounded-xl border bg-white px-2.5 py-1 text-xs">
								<span class="font-semibold">{dayLabel(row.date) || 'Sin fecha'}</span> · {row.startTime || '--:--'}–{row.endTime || '--:--'}
							</span>
						{/each}
					</div>
				{:else}
					<div class="rounded-2xl border border-dashed px-4 py-3 text-xs text-muted-foreground">
						Captura el periodo, los días y su horario para generar las sesiones.
					</div>
				{/if}
			</div>
		{:else}
			<div class="space-y-4 rounded-2xl border border-blue-100 bg-blue-50/40 p-4">
				<div class="flex flex-col gap-4 md:flex-row md:items-start">
					<SessionCalendar
						selected={rows.map((row) => row.date)}
						{minDate}
						{disabled}
						canAdd={rows.length < MAX_EVENT_SESSIONS}
						onToggle={togglePointDate}
					/>
					<div class="flex-1 space-y-3">
						<label class="block text-xs font-semibold text-slate-600">
							Hora de inicio
							<input id={`${idPrefix}-point-start`} class={fieldClass} type="time" bind:value={pointTimes.startTime} {disabled} />
						</label>
						<label class="block text-xs font-semibold text-slate-600">
							Hora de fin
							<input id={`${idPrefix}-point-end`} class={fieldClass} type="time" bind:value={pointTimes.endTime} {disabled} />
						</label>
						<Button
							variant="outline"
							class="h-10 w-full rounded-xl"
							onclick={applyPointTimesToAll}
							disabled={disabled || !rows.length || !pointTimes.startTime || !pointTimes.endTime}
						>
							Aplicar a todas las fechas
						</Button>
					</div>
				</div>
			</div>

				<div class="space-y-2">
					<div class="text-sm font-semibold text-blue-600" data-testid="selected-sessions-count">
						Sesiones seleccionadas ({rows.length})
					</div>
					{#if sortedRows.length}
						{#each sortedRows as row (row.date)}
							<div class="grid grid-cols-[1fr_1fr_auto] items-end gap-2 rounded-2xl border bg-white p-3 sm:grid-cols-[1.4fr_1fr_1fr_auto]">
								<div class="col-span-3 text-sm font-semibold capitalize sm:col-span-1 sm:self-center">
									{dayLabel(row.date) || 'Sin fecha'}
								</div>
								<label class="text-xs font-semibold text-slate-600">
									Inicio
									<input class={fieldClass} type="time" value={row.startTime} oninput={(e) => updateRowByDate(row.date, 'startTime', e.currentTarget.value)} {disabled} />
								</label>
								<label class="text-xs font-semibold text-slate-600">
									Fin
									<input class={fieldClass} type="time" value={row.endTime} oninput={(e) => updateRowByDate(row.date, 'endTime', e.currentTarget.value)} {disabled} />
								</label>
								{#if !disabled}
									<Button variant="outline" class="h-11 rounded-2xl" aria-label={`Quitar ${dayLabel(row.date)}`} onclick={() => togglePointDate(row.date)}>
										Quitar
									</Button>
								{/if}
							</div>
						{/each}
					{:else}
						<div class="rounded-2xl border border-dashed px-4 py-3 text-xs text-muted-foreground">
							Selecciona en el calendario los días en que habrá sesión. Solo puede haber una sesión por día.
						</div>
					{/if}
				</div>
		{/if}

		{#if rows.length > 1}
			<div class="space-y-2 rounded-2xl border bg-slate-50 p-4">
				<label for={`${idPrefix}-attendance`} class="text-sm font-semibold text-blue-600">
					Asistencia mínima para acreditar horas AFC
				</label>
				<input
					id={`${idPrefix}-attendance`}
					name="min_attendance_percent"
					type="range"
					class="w-full accent-blue-600"
					min={ATTENDANCE_PERCENT_RANGE.min}
					max={ATTENDANCE_PERCENT_RANGE.max}
					step={ATTENDANCE_PERCENT_RANGE.step}
					bind:value={attendancePercent}
					{disabled}
				/>
				<div class="flex justify-between text-[11px] text-muted-foreground">
					<span>{ATTENDANCE_PERCENT_RANGE.min} %</span>
					<span>{ATTENDANCE_PERCENT_RANGE.max} %</span>
				</div>
				<div class="text-sm font-semibold text-slate-900" data-testid="attendance-rule">
					{describeAttendanceRule(Number(attendancePercent), rows.length)}
				</div>
				<div class="text-xs text-muted-foreground">
					Quien no alcance el mínimo no recibe horas AFC. Las horas se acreditan completas una sola vez.
				</div>
			</div>
		{/if}
	{/if}

	{#if error}
		<div class="text-xs font-semibold text-red-600">{error}</div>
	{/if}
</div>
