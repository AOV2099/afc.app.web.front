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
		getAfcSelection,
		getAfcTypesForOrigin,
		syncCourseDaysWithSessions
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
	export let enabled = true;
	// Eventos de varias sesiones (los define la actividad elegida).
	export let multiSession = false;
	/** Horario del evento (fecha y duración de cada sesión): de aquí salen las horas efectivas de los cursos. */
	/** @type {{ date: string, hours: number }[]} */
	export let sessionDays = [];
	// En la edición masiva cada evento usa su propio horario, así que no hay sesiones que sincronizar.
	export let syncSessions = true;
	export let courseHoursSource = 'se calculan con el horario de las sesiones capturado en Fecha y Lugar.';
	export let attendanceRule = '';

	let fileInputEl;
	let uploadStatus = 'idle';
	let uploadError = '';

	$: types = getAfcTypesForOrigin(catalog, state.origin);
	// Va antes de `preview` para que el resumen use el estado ya ajustado en la misma actualización.
	$: syncSessionCourseDays(state.typeKey, state.scenarioKey, catalog, sessionDays, syncSessions, disabled);
	$: preview = computeAfcPreview(state, { catalog, defaultDate });

	function syncSessionCourseDays(_typeKey, _scenarioKey, currentCatalog, days, shouldSync, isDisabled) {
		if (!shouldSync || isDisabled || !getAfcSelection(state, currentCatalog).isCourseDuration) return;
		const synced = syncCourseDaysWithSessions(state, days);
		if (synced !== state) state = synced;
	}
	$: selectedType = preview.type;

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
	<label for={`${idPrefix}-enabled`} class="flex cursor-pointer items-start gap-3 rounded-2xl border bg-slate-50 px-4 py-3">
		<input
			id={`${idPrefix}-enabled`}
			name="afc_hours_enabled"
			type="checkbox"
			class="mt-0.5 h-4 w-4 accent-blue-600"
			bind:checked={enabled}
			{disabled}
		/>
		<span>
			<span class="block text-sm font-semibold">Se consideran horas AFC</span>
			<span class="block text-xs text-muted-foreground">Desmárcalo si el evento no otorga horas AFC; se registrará con 0 hrs.</span>
		</span>
	</label>

	{#if enabled}
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
			{#if multiSession}
				<div class="mt-1 text-xs font-semibold text-violet-700" data-testid="afc-multi-session-hint">
					Esta actividad se realiza en varias sesiones; captúralas en la sección de fechas.
				</div>
			{/if}
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
		<div class="rounded-2xl border border-blue-100 bg-blue-50/40 px-4 py-3 text-xs text-slate-700" data-testid="afc-course-hours-source">
			<div class="font-semibold">Horas efectivas del curso o taller: {courseHoursSource}</div>
			<div class="mt-1">
				Se acreditan al doble, con tope de {AFC_COURSE_RULES.maxAfcHoursPerDay} h AFC por sesión y {AFC_COURSE_RULES.maxAfcHoursTotal} h AFC en total.
			</div>
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
			{#if preview.status === 'incomplete' && preview.isCourseDuration && !syncSessions}
				<div class="mt-1 text-sm font-semibold">Horas AFC asignadas: se calculan con el horario de cada evento</div>
			{:else if preview.status === 'incomplete' && preview.isCourseDuration}
				<div class="mt-1 text-sm font-semibold text-amber-800">Horas AFC asignadas: pendientes del horario</div>
				<div class="mt-1 text-xs text-muted-foreground">Captura la fecha y el horario en Fecha y Lugar; mientras tanto, solo puede guardarse como borrador.</div>
			{:else if preview.status === 'incomplete'}
				<div class="mt-1 text-sm font-semibold text-amber-800">Horas AFC asignadas: pendientes de captura</div>
				<div class="mt-1 text-xs text-muted-foreground">Mientras no se capturen, el evento solo puede guardarse como borrador.</div>
			{:else}
				<div class="text-sm font-semibold">Horas AFC asignadas: {formatAfcHours(preview.valuation.final_hours)}</div>
			{/if}
			{#if preview.valuation.method === 'percent_range'}
				<div class="mt-2 text-xs text-muted-foreground">{AFC_FORMULA_HELP}</div>
			{/if}
		{/if}
		{#if multiSession && attendanceRule}
			<div class="mt-2 rounded-xl bg-blue-50 px-3 py-2 text-xs font-semibold text-blue-800" data-testid="afc-attendance-rule">
				Solo se acreditan a quien cumpla la asistencia mínima: {attendanceRule}.
			</div>
		{/if}
	</div>
	{:else}
		<div class="rounded-2xl border bg-white px-4 py-3 text-sm" data-testid="afc-hours-summary">
			Horas AFC asignadas: <span class="font-semibold">0</span> (el evento no otorga horas AFC)
		</div>
	{/if}

	{#if error}
		<div class="text-xs font-semibold text-red-600">{error}</div>
	{/if}
</div>
