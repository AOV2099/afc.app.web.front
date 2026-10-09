<script>
	import { Button } from '$lib/components/ui/button';
	import { Badge } from '$lib/components/ui/badge';
	import { filesApi } from '$lib/services/api';
	import { AFC_COURSE_RULES, AFC_ORIGIN_OPTIONS } from '$lib/catalogs/afcHoursCalc.js';
	import {
		AFC_EVIDENCE_ACCEPT,
		AFC_EVIDENCE_MAX_BYTES,
		AFC_EVIDENCE_PURPOSE,
		AFC_FORMULA_HELP,
		changeAfcScenario,
		changeAfcType,
		computeAfcPreview,
		formatAfcHours,
		formatAfcRange,
		formatAfcScenarioOption,
		getAfcTypesForOrigin
	} from '$lib/utils/afcHoursForm.js';
	import { FileText, Upload } from 'lucide-svelte';

	export let state;
	export let catalog = [];
	export let catalogStatus = 'ready';
	export let catalogError = '';
	export let idPrefix = 'afc';
	export let defaultDate = '';
	export let eventId = null;
	export let legacyHours = null;
	export let error = '';
	export let disabled = false;

	let fileInputEl;
	let uploadStatus = 'idle';
	let uploadError = '';

	$: types = getAfcTypesForOrigin(catalog, state.origin);
	$: preview = computeAfcPreview(state, { catalog, defaultDate });
	$: selectedType = preview.type;
	$: effectiveTotal = state.courseDays.reduce((sum, day) => {
		const value = Number(day?.effective_hours);
		return Number.isFinite(value) && value >= 0 ? sum + value : sum;
	}, 0);

	const fieldClass =
		'mt-2 h-11 w-full rounded-2xl border bg-background px-3 text-sm disabled:cursor-not-allowed disabled:opacity-60';

	function onTypeChange(event) {
		state = changeAfcType(state, event.currentTarget.value);
		resetUpload();
	}

	function onScenarioChange(event) {
		state = changeAfcScenario(state, event.currentTarget.value);
	}

	function resetUpload() {
		uploadStatus = 'idle';
		uploadError = '';
		if (fileInputEl) fileInputEl.value = '';
	}

	function setDayMode(mode) {
		const first = state.courseDays[0] || { date: '', effective_hours: '' };
		state = {
			...state,
			courseDayMode: mode,
			courseDays:
				mode === 'multiple'
					? [{ date: first.date || defaultDate || '', effective_hours: first.effective_hours }]
					: [{ date: '', effective_hours: first.effective_hours }]
		};
	}

	function updateDay(index, field, value) {
		state = {
			...state,
			courseDays: state.courseDays.map((day, i) => (i === index ? { ...day, [field]: value } : day))
		};
	}

	function addDay() {
		if (state.courseDays.length >= AFC_COURSE_RULES.maxDays) return;
		state = { ...state, courseDays: [...state.courseDays, { date: '', effective_hours: '' }] };
	}

	function removeDay(index) {
		if (state.courseDays.length <= 1) return;
		state = { ...state, courseDays: state.courseDays.filter((_, i) => i !== index) };
	}

	function preventInvalidNumberKey(event) {
		if (['e', 'E', '+', '-'].includes(event.key)) event.preventDefault();
	}

	async function onPickEvidence(event) {
		const file = event.currentTarget.files?.[0];
		if (!file) return;
		uploadError = '';
		if (file.size > AFC_EVIDENCE_MAX_BYTES) {
			uploadStatus = 'error';
			uploadError = 'El archivo supera el límite de 5 MB.';
			event.currentTarget.value = '';
			return;
		}
		uploadStatus = 'uploading';
		try {
			const response = await filesApi.upload(file, { purpose: AFC_EVIDENCE_PURPOSE, eventId });
			if (!response?.file?.id) throw new Error('El servidor no confirmó la carga del archivo.');
			state = { ...state, evidence: response.file };
			uploadStatus = 'uploaded';
		} catch (e) {
			uploadStatus = 'error';
			uploadError = e?.message || 'No se pudo subir el archivo.';
		} finally {
			if (fileInputEl) fileInputEl.value = '';
		}
	}

	function removeEvidence() {
		state = { ...state, evidence: null };
		resetUpload();
	}

	function formatBytes(bytes) {
		const value = Number(bytes) || 0;
		if (value >= 1024 * 1024) return `${(value / (1024 * 1024)).toFixed(1)} MB`;
		return `${Math.max(1, Math.round(value / 1024))} KB`;
	}
</script>

<div class="space-y-4" data-testid="afc-hours-section">
	{#if catalogStatus === 'loading'}
		<div class="text-xs text-muted-foreground">Cargando catálogo AFC…</div>
	{:else if catalogStatus === 'error'}
		<div class="text-xs font-semibold text-red-600">{catalogError || 'No se pudo cargar el catálogo AFC.'}</div>
	{/if}

	<div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
		<div class="sm:col-span-2">
			<label for={`${idPrefix}-origin`} class="text-sm font-semibold text-blue-600">Origen de la actividad</label>
			<!-- Por ahora todos los eventos son de la FES Aragón; habilitar cuando se registren actividades externas. -->
			<select id={`${idPrefix}-origin`} name="afc_origin" class={fieldClass} value={state.origin} disabled>
				{#each AFC_ORIGIN_OPTIONS as option (option.value)}
					<option value={option.value}>{option.label}</option>
				{/each}
			</select>
		</div>

		<div class={preview.isManual ? 'sm:col-span-2' : ''}>
			<label for={`${idPrefix}-type`} class="text-sm font-semibold text-blue-600">Tipo de actividad</label>
			<select
				id={`${idPrefix}-type`}
				name="afc_type"
				class={fieldClass}
				value={state.typeKey}
				onchange={onTypeChange}
				disabled={disabled || catalogStatus !== 'ready'}
			>
				<option value="">Selecciona el tipo de actividad</option>
				{#each types as type (type.id)}
					<option value={type.key}>{type.name} ({formatAfcRange(type)})</option>
				{/each}
			</select>
		</div>

		{#if !preview.isManual}
			<div>
				<label for={`${idPrefix}-scenario`} class="text-sm font-semibold text-blue-600">Actividad realizada</label>
				<select
					id={`${idPrefix}-scenario`}
					name="afc_scenario"
					class={fieldClass}
					value={state.scenarioKey}
					onchange={onScenarioChange}
					disabled={disabled || !selectedType}
				>
					<option value="">{selectedType ? 'Selecciona la actividad realizada' : 'Primero selecciona el tipo de actividad'}</option>
					{#if selectedType}
						{#each preview.scenarios as scenario (scenario.id)}
							<option value={scenario.key}>{formatAfcScenarioOption(selectedType, scenario)}</option>
						{/each}
					{/if}
				</select>
			</div>
		{/if}
	</div>

	{#if selectedType && (selectedType.description || selectedType.requirements)}
		<div class="rounded-2xl border bg-slate-50/70 px-4 py-3 text-xs text-slate-700">
			{#if selectedType.description}<div>{selectedType.description}</div>{/if}
			{#if selectedType.requirements}
				<div class="mt-1"><span class="font-semibold">Requisitos:</span> {selectedType.requirements}</div>
			{/if}
		</div>
	{/if}

	{#if preview.isCourseDuration}
		<div class="space-y-4 rounded-2xl border border-blue-100 bg-blue-50/40 p-4">
			<p class="text-xs text-slate-700">
				Captura las horas efectivas del curso o taller. Se acreditan al doble, con tope de {AFC_COURSE_RULES.maxAfcHoursPerDay} h AFC por jornada y {AFC_COURSE_RULES.maxAfcHoursTotal} h AFC en total.
			</p>
			<div role="radiogroup" aria-label="Número de jornadas" class="flex flex-wrap gap-2">
				<button
					type="button"
					role="radio"
					aria-checked={state.courseDayMode === 'single'}
					class={`rounded-2xl px-3 py-1.5 text-sm font-semibold ${state.courseDayMode === 'single' ? 'bg-blue-600 text-white' : 'bg-white text-slate-700 border'}`}
					onclick={() => setDayMode('single')}
					{disabled}
				>
					Una jornada
				</button>
				<button
					type="button"
					role="radio"
					aria-checked={state.courseDayMode === 'multiple'}
					class={`rounded-2xl px-3 py-1.5 text-sm font-semibold ${state.courseDayMode === 'multiple' ? 'bg-blue-600 text-white' : 'bg-white text-slate-700 border'}`}
					onclick={() => setDayMode('multiple')}
					{disabled}
				>
					Varias jornadas
				</button>
			</div>

			{#if state.courseDayMode === 'single'}
				<div>
					<label for={`${idPrefix}-course-hours`} class="text-sm font-semibold text-blue-600">Horas de duración del curso/taller</label>
					<input
						id={`${idPrefix}-course-hours`}
						name="afc_course_effective_hours"
						class={fieldClass}
						type="number"
						min="0"
						max={AFC_COURSE_RULES.maxEffectiveHoursPerDay}
						step="0.01"
						inputmode="decimal"
						autocomplete="off"
						value={state.courseDays[0]?.effective_hours ?? ''}
						oninput={(e) => updateDay(0, 'effective_hours', e.currentTarget.value)}
						onkeydown={preventInvalidNumberKey}
						{disabled}
					/>
					<div class="mt-1 text-xs text-muted-foreground">
						Horas efectivas de formación documentadas, sin pausas. No son horas AFC.
					</div>
				</div>
			{:else}
				<div class="space-y-2">
					<div class="text-sm font-semibold text-blue-600">Horas de duración del curso/taller por jornada</div>
					{#each state.courseDays as day, index (index)}
						<div class="grid grid-cols-[1fr_1fr_auto] items-end gap-2">
							<div>
								<label for={`${idPrefix}-day-date-${index}`} class="text-xs font-semibold text-slate-600">Jornada {index + 1}</label>
								<input
									id={`${idPrefix}-day-date-${index}`}
									class={fieldClass}
									type="date"
									value={day.date}
									oninput={(e) => updateDay(index, 'date', e.currentTarget.value)}
									{disabled}
								/>
							</div>
							<div>
								<label for={`${idPrefix}-day-hours-${index}`} class="text-xs font-semibold text-slate-600">Horas efectivas</label>
								<input
									id={`${idPrefix}-day-hours-${index}`}
									class={fieldClass}
									type="number"
									min="0"
									max={AFC_COURSE_RULES.maxEffectiveHoursPerDay}
									step="0.01"
									inputmode="decimal"
									autocomplete="off"
									value={day.effective_hours}
									oninput={(e) => updateDay(index, 'effective_hours', e.currentTarget.value)}
									onkeydown={preventInvalidNumberKey}
									{disabled}
								/>
							</div>
							<Button
								variant="outline"
								class="h-11 rounded-2xl"
								aria-label={`Quitar jornada ${index + 1}`}
								onclick={() => removeDay(index)}
								disabled={disabled || state.courseDays.length <= 1}
							>
								Quitar
							</Button>
						</div>
					{/each}
					<div class="flex items-center justify-between gap-2">
						<Button variant="outline" class="h-9 rounded-xl" onclick={addDay} disabled={disabled || state.courseDays.length >= AFC_COURSE_RULES.maxDays}>
							Agregar jornada
						</Button>
						<div class="text-xs text-slate-700">Total de horas efectivas: <span class="font-semibold">{formatAfcHours(effectiveTotal)}</span></div>
					</div>
				</div>
			{/if}
		</div>
	{/if}

	{#if preview.isManual}
		<div class="space-y-4 rounded-2xl border border-blue-100 bg-blue-50/40 p-4">
			<div>
				<label for={`${idPrefix}-manual-hours`} class="text-sm font-semibold text-blue-600">Horas AFC</label>
				<input
					id={`${idPrefix}-manual-hours`}
					name="afc_manual_hours"
					class={fieldClass}
					type="number"
					min="0"
					step="0.5"
					inputmode="decimal"
					autocomplete="off"
					value={state.manualHours}
					oninput={(e) => (state = { ...state, manualHours: e.currentTarget.value })}
					onkeydown={preventInvalidNumberKey}
					{disabled}
				/>
				<div class="mt-1 text-xs text-muted-foreground">
					{#if preview.isCommittee}
						Horas indicadas en el dictamen del Comité de Carrera (máximo 200).
					{:else}
						Rango permitido: {formatAfcRange(selectedType)}. Se redondea hacia arriba en medias horas.
					{/if}
				</div>
			</div>

			<div class="space-y-2">
				<div class="text-sm font-semibold text-blue-600">
					{preview.isCommittee ? 'Dictamen del Comité de Carrera (obligatorio)' : 'Evidencia de las horas (opcional)'}
				</div>
				<input
					bind:this={fileInputEl}
					id={`${idPrefix}-evidence-file`}
					class="hidden"
					type="file"
					accept={AFC_EVIDENCE_ACCEPT}
					onchange={onPickEvidence}
					{disabled}
				/>
				<Button
					variant="outline"
					class="h-10 gap-2 rounded-xl"
					onclick={() => fileInputEl?.click()}
					disabled={disabled || uploadStatus === 'uploading'}
				>
					<Upload class="h-4 w-4" />
					{state.evidence ? 'Reemplazar archivo' : 'Subir archivo'}
				</Button>
				<div class="text-xs text-muted-foreground">PDF, PNG o JPEG de hasta 5 MB.</div>
				<div aria-live="polite" class="text-xs">
					{#if uploadStatus === 'uploading'}
						<span class="text-slate-700">Subiendo archivo…</span>
					{:else if uploadStatus === 'error'}
						<span class="font-semibold text-red-600">{uploadError}</span>
					{/if}
				</div>
				{#if state.evidence}
					<div class="flex flex-wrap items-center justify-between gap-2 rounded-xl border bg-white px-3 py-2">
						<div class="flex min-w-0 items-center gap-2 text-sm">
							<FileText class="h-4 w-4 shrink-0 text-blue-600" />
							<span class="truncate font-semibold">{state.evidence.original_name}</span>
							{#if state.evidence.size_bytes}<span class="text-xs text-muted-foreground">{formatBytes(state.evidence.size_bytes)}</span>{/if}
						</div>
						<div class="flex items-center gap-3">
							<Badge class="rounded-full bg-emerald-50 text-emerald-700 hover:bg-emerald-50">Cargado</Badge>
							<a class="text-sm font-semibold text-blue-600 hover:text-blue-700" href={filesApi.url(state.evidence.id)} target="_blank" rel="noopener noreferrer">
								Ver archivo
							</a>
							<button type="button" class="text-sm font-semibold text-slate-600 hover:text-red-600" onclick={removeEvidence} {disabled}>
								Quitar
							</button>
						</div>
					</div>
				{/if}
			</div>
		</div>
	{/if}

	<div class="rounded-2xl border bg-white px-4 py-3" aria-live="polite" data-testid="afc-hours-summary">
		{#if preview.status === 'unselected'}
			{#if legacyHours !== null && legacyHours !== undefined && !state.typeKey}
				<div class="text-sm">Horas registradas antes del tabulador: <span class="font-semibold">{formatAfcHours(legacyHours)}</span></div>
				<div class="mt-1 text-xs text-muted-foreground">Se conservan mientras no selecciones un tipo de actividad.</div>
			{:else}
				<div class="text-sm">Horas AFC asignadas: <span class="font-semibold">Pendiente de selección</span></div>
			{/if}
		{:else if preview.status === 'invalid'}
			<div class="text-sm font-semibold text-red-600">{preview.message}</div>
		{:else}
			<div class="text-sm">Rango de la actividad: {formatAfcRange(selectedType)}</div>
			{#if preview.valuation.method === 'percent_range'}
				<div class="text-sm">Porcentaje aplicado: {preview.valuation.percent} %</div>
				<div class="text-sm">Horas calculadas: {preview.valuation.hours_before_rounding}</div>
			{:else if preview.valuation.method === 'course_duration' && preview.status === 'calculated'}
				<div class="text-sm">Horas efectivas de formación: {preview.valuation.input_value}</div>
				<div class="text-sm">Horas calculadas (× {AFC_COURSE_RULES.multiplier}, con topes): {preview.valuation.hours_before_rounding}</div>
			{/if}
			{#if preview.status === 'incomplete'}
				<div class="mt-1 text-sm font-semibold text-amber-800">Horas AFC asignadas: pendientes de captura</div>
				<div class="mt-1 text-xs text-muted-foreground">Mientras no se capturen, el evento solo puede guardarse como borrador.</div>
			{:else}
				<div class="text-sm font-semibold">Horas AFC asignadas: {formatAfcHours(preview.valuation.final_hours)}</div>
			{/if}
			{#if preview.valuation.method === 'percent_range'}
				<div class="mt-2 text-xs text-muted-foreground">{AFC_FORMULA_HELP}</div>
			{/if}
		{/if}
	</div>

	{#if error}
		<div class="text-xs font-semibold text-red-600">{error}</div>
	{/if}
</div>
