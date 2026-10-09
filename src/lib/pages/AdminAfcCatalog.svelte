<script>
	import { onMount } from 'svelte';
	import { page } from '$app/stores';
	import { toast } from 'svelte-sonner';

	import { afcCatalogApi } from '$lib/services/api';
	import { ensureAfcCatalog } from '$lib/stores/afcCatalog.js';
	import {
		AFC_ORIGIN,
		AFC_ORIGIN_OPTIONS,
		AFC_SCENARIO_KIND,
		AFC_SCENARIO_KIND_OPTIONS,
		AFC_VALUATION_MODE,
		AFC_VALUATION_MODE_OPTIONS,
		calculateAfcHours,
		checkScenarioFitsType,
		normalizeAfcScenarioInput,
		normalizeAfcTypeInput
	} from '$lib/catalogs/afcHoursCalc.js';
	import { formatAfcHours, formatAfcRange } from '$lib/utils/afcHoursForm.js';

	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import { Card, CardContent } from '$lib/components/ui/card';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { Switch } from '$lib/components/ui/switch';
	import { Textarea } from '$lib/components/ui/textarea';
	import * as Dialog from '$lib/components/ui/dialog';
	import { Plus } from 'lucide-svelte';

	const MODE_LABELS = Object.fromEntries(AFC_VALUATION_MODE_OPTIONS.map((o) => [o.value, o.label]));
	const KIND_LABELS = Object.fromEntries(AFC_SCENARIO_KIND_OPTIONS.map((o) => [o.value, o.label]));
	const selectClass = 'h-10 w-full rounded-md border bg-background px-3 text-sm disabled:opacity-60';

	let loading = false;
	let loadError = '';
	let types = [];
	let origin = AFC_ORIGIN.FES_ARAGON;
	let showInactive = false;

	let typeDialogOpen = false;
	let typeForm = emptyTypeForm();
	let typeEditingId = null;
	let typeError = '';
	let typeSaving = false;

	let scenarioDialogOpen = false;
	let scenarioForm = emptyScenarioForm();
	let scenarioType = null;
	let scenarioEditingId = null;
	let scenarioError = '';
	let scenarioSaving = false;

	$: canEdit = Number($page.data?.user?.career_id ?? $page.data?.user?.careerId) === 1;
	$: visibleTypes = types.filter((type) => type.origin === origin && (showInactive || type.is_active));
	$: scenarioPreview = scenarioType ? previewScenario(scenarioType, scenarioForm) : '';

	function emptyTypeForm() {
		return {
			origin: AFC_ORIGIN.FES_ARAGON,
			key: '',
			name: '',
			description: '',
			requirements: '',
			valuation_mode: AFC_VALUATION_MODE.SCENARIOS,
			min_hours: '',
			max_hours: '',
			sort_order: 0,
			is_active: true
		};
	}

	function emptyScenarioForm() {
		return {
			key: '',
			label: '',
			kind: AFC_SCENARIO_KIND.PERCENT,
			percent: '',
			fixed_hours: '',
			sort_order: 0,
			is_active: true
		};
	}

	async function loadCatalog() {
		loading = true;
		loadError = '';
		try {
			const response = await afcCatalogApi.list({ includeInactive: true });
			types = Array.isArray(response?.types) ? response.types : [];
		} catch (e) {
			loadError = e?.message || 'No se pudo cargar el catálogo AFC.';
		} finally {
			loading = false;
		}
	}

	async function afterChange() {
		await loadCatalog();
		ensureAfcCatalog({ force: true });
	}

	function hoursText(value) {
		return value === null || value === undefined || value === '' ? '' : formatAfcHours(value);
	}

	function scenarioValue(scenario) {
		if (scenario.kind === AFC_SCENARIO_KIND.PERCENT) return `${formatAfcHours(scenario.percent)} %`;
		if (scenario.kind === AFC_SCENARIO_KIND.FIXED_HOURS) return `${formatAfcHours(scenario.fixed_hours)} h`;
		return 'Horas efectivas × 2';
	}

	function scenarioHours(type, scenario) {
		if (scenario.kind === AFC_SCENARIO_KIND.COURSE_DURATION) return 'Según duración';
		const result = calculateAfcHours({ type, scenario });
		return result.ok ? `${formatAfcHours(result.valuation.final_hours)} h` : 'Fuera de rango';
	}

	function previewScenario(type, form) {
		const normalized = normalizeAfcScenarioInput({ ...form, key: form.key || 'preview' });
		if (normalized.error) return normalized.error;
		const problem = checkScenarioFitsType(type, normalized.value);
		if (problem) return problem;
		if (normalized.value.kind === AFC_SCENARIO_KIND.COURSE_DURATION) {
			return 'Se calcula con las horas efectivas capturadas en el evento (× 2, máx. 20 h por jornada).';
		}
		const result = calculateAfcHours({ type, scenario: normalized.value });
		return result.ok ? `Horas AFC resultantes: ${formatAfcHours(result.valuation.final_hours)}` : result.message;
	}

	function openNewType() {
		typeForm = { ...emptyTypeForm(), origin };
		typeEditingId = null;
		typeError = '';
		typeDialogOpen = true;
	}

	function openEditType(type) {
		typeForm = {
			origin: type.origin,
			key: type.key,
			name: type.name,
			description: type.description || '',
			requirements: type.requirements || '',
			valuation_mode: type.valuation_mode,
			min_hours: hoursText(type.min_hours),
			max_hours: hoursText(type.max_hours),
			sort_order: type.sort_order,
			is_active: type.is_active
		};
		typeEditingId = type.id;
		typeError = '';
		typeDialogOpen = true;
	}

	async function saveType() {
		const normalized = normalizeAfcTypeInput(typeForm, { partial: Boolean(typeEditingId) });
		if (normalized.error) {
			typeError = normalized.error;
			return;
		}
		typeSaving = true;
		typeError = '';
		try {
			const response = typeEditingId
				? await afcCatalogApi.updateType(typeEditingId, normalized.value)
				: await afcCatalogApi.createType(normalized.value);
			toast.success(response?.message || 'Actividad guardada.');
			typeDialogOpen = false;
			await afterChange();
		} catch (e) {
			typeError = e?.message || 'No se pudo guardar la actividad.';
		} finally {
			typeSaving = false;
		}
	}

	function openNewScenario(type) {
		scenarioType = type;
		scenarioForm = emptyScenarioForm();
		scenarioEditingId = null;
		scenarioError = '';
		scenarioDialogOpen = true;
	}

	function openEditScenario(type, scenario) {
		scenarioType = type;
		scenarioForm = {
			key: scenario.key,
			label: scenario.label,
			kind: scenario.kind,
			percent: hoursText(scenario.percent),
			fixed_hours: hoursText(scenario.fixed_hours),
			sort_order: scenario.sort_order,
			is_active: scenario.is_active
		};
		scenarioEditingId = scenario.id;
		scenarioError = '';
		scenarioDialogOpen = true;
	}

	async function saveScenario() {
		const normalized = normalizeAfcScenarioInput(scenarioForm, { partial: Boolean(scenarioEditingId) });
		if (normalized.error) {
			scenarioError = normalized.error;
			return;
		}
		scenarioSaving = true;
		scenarioError = '';
		try {
			const response = scenarioEditingId
				? await afcCatalogApi.updateScenario(scenarioEditingId, normalized.value)
				: await afcCatalogApi.createScenario(scenarioType.id, normalized.value);
			toast.success(response?.message || 'Supuesto guardado.');
			scenarioDialogOpen = false;
			await afterChange();
		} catch (e) {
			scenarioError = e?.message || 'No se pudo guardar el supuesto.';
		} finally {
			scenarioSaving = false;
		}
	}

	onMount(loadCatalog);
</script>

<div class="mx-auto w-full max-w-screen-xl px-4 pb-16 pt-6 sm:px-6 lg:px-8">
	<div class="flex flex-wrap items-center justify-between gap-3">
		<div>
			<h1 class="text-2xl font-semibold tracking-tight sm:text-3xl">Catálogo AFC</h1>
			<p class="mt-1 text-sm text-muted-foreground">
				Actividades de los Criterios Internos y supuestos del Tabulador indicativo. Los cambios aplican a eventos
				nuevos o a eventos cuya selección de horas se modifique; las horas ya asignadas se conservan.
			</p>
		</div>
		{#if canEdit}
			<Button class="gap-2 rounded-xl bg-blue-600 text-white hover:bg-blue-700" onclick={openNewType}>
				<Plus class="h-4 w-4" /> Nueva actividad
			</Button>
		{/if}
	</div>

	<div class="mt-4 flex flex-wrap items-center justify-between gap-3">
		<div class="flex flex-wrap gap-2" role="tablist" aria-label="Origen de las actividades">
			{#each AFC_ORIGIN_OPTIONS as option (option.value)}
				<button
					type="button"
					role="tab"
					aria-selected={origin === option.value}
					class={`rounded-2xl px-3 py-1.5 text-sm font-semibold ${origin === option.value ? 'bg-blue-600 text-white' : 'border bg-white text-slate-700'}`}
					onclick={() => (origin = option.value)}
				>
					{option.label}
				</button>
			{/each}
		</div>
		<label class="flex items-center gap-2 text-sm">
			<Switch aria-label="Mostrar inactivos" bind:checked={showInactive} />
			Mostrar inactivos
		</label>
	</div>

	{#if loading}
		<div class="mt-6 text-sm text-muted-foreground">Cargando catálogo…</div>
	{:else if loadError}
		<div class="mt-6 text-sm font-semibold text-red-600">{loadError}</div>
	{:else if visibleTypes.length === 0}
		<div class="mt-6 text-sm text-muted-foreground">No hay actividades registradas para este origen.</div>
	{/if}

	<div class="mt-6 space-y-4">
		{#each visibleTypes as type (type.id)}
			<Card class={`rounded-3xl border ${type.is_active ? '' : 'opacity-60'}`}>
				<CardContent class="space-y-3 p-5">
					<div class="flex flex-wrap items-start justify-between gap-3">
						<div class="min-w-0">
							<div class="flex flex-wrap items-center gap-2">
								<h2 class="text-lg font-semibold">{type.name}</h2>
								<Badge class="rounded-full bg-slate-100 text-slate-700 hover:bg-slate-100">{type.key}</Badge>
								<Badge class="rounded-full bg-blue-50 text-blue-700 hover:bg-blue-50">{formatAfcRange(type)}</Badge>
								{#if !type.is_active}
									<Badge class="rounded-full bg-red-50 text-red-700 hover:bg-red-50">Inactiva</Badge>
								{/if}
							</div>
							<div class="mt-1 text-xs text-muted-foreground">{MODE_LABELS[type.valuation_mode] || type.valuation_mode}</div>
							{#if type.description}<div class="mt-2 text-sm text-slate-700">{type.description}</div>{/if}
							{#if type.requirements}
								<div class="mt-1 text-xs text-slate-600"><span class="font-semibold">Requisitos:</span> {type.requirements}</div>
							{/if}
						</div>
						<div class="flex gap-2">
							{#if canEdit && type.valuation_mode === AFC_VALUATION_MODE.SCENARIOS}
								<Button variant="outline" class="h-9 rounded-xl" onclick={() => openNewScenario(type)}>Agregar supuesto</Button>
							{/if}
							{#if canEdit}
								<Button variant="outline" class="h-9 rounded-xl" onclick={() => openEditType(type)}>Editar</Button>
							{/if}
						</div>
					</div>

					{#if type.valuation_mode === AFC_VALUATION_MODE.SCENARIOS}
						<div class="overflow-x-auto rounded-2xl border">
							<table class="w-full text-sm">
								<thead class="bg-slate-50 text-left text-xs text-slate-600">
									<tr>
										<th class="px-3 py-2">Supuesto</th>
										<th class="px-3 py-2">Cálculo</th>
										<th class="px-3 py-2">Valor</th>
										<th class="px-3 py-2">Horas AFC</th>
										<th class="px-3 py-2">Estado</th>
										<th class="px-3 py-2"></th>
									</tr>
								</thead>
								<tbody>
									{#each type.scenarios.filter((s) => showInactive || s.is_active) as scenario (scenario.id)}
										<tr class={`border-t ${scenario.is_active ? '' : 'opacity-60'}`}>
											<td class="px-3 py-2">
												<div>{scenario.label}</div>
												<div class="text-xs text-muted-foreground">{scenario.key}</div>
											</td>
											<td class="px-3 py-2">{KIND_LABELS[scenario.kind] || scenario.kind}</td>
											<td class="px-3 py-2">{scenarioValue(scenario)}</td>
											<td class="px-3 py-2 font-semibold">{scenarioHours(type, scenario)}</td>
											<td class="px-3 py-2">{scenario.is_active ? 'Activo' : 'Inactivo'}</td>
											<td class="px-3 py-2 text-right">
												{#if canEdit}
													<Button variant="ghost" class="h-8 rounded-lg" onclick={() => openEditScenario(type, scenario)}>Editar</Button>
												{/if}
											</td>
										</tr>
									{:else}
										<tr><td colspan="6" class="px-3 py-3 text-xs text-muted-foreground">Sin supuestos registrados.</td></tr>
									{/each}
								</tbody>
							</table>
						</div>
					{/if}
				</CardContent>
			</Card>
		{/each}
	</div>
</div>

<Dialog.Root bind:open={typeDialogOpen}>
	<Dialog.Content class="max-h-[90vh] overflow-y-auto sm:max-w-xl">
		<Dialog.Header>
			<Dialog.Title>{typeEditingId ? 'Editar actividad' : 'Nueva actividad'}</Dialog.Title>
			<Dialog.Description>Tipo de actividad AFC según los Criterios Internos.</Dialog.Description>
		</Dialog.Header>

		<div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
			<div class="space-y-2">
				<Label for="afc-type-origin">Origen</Label>
				<select id="afc-type-origin" class={selectClass} bind:value={typeForm.origin} disabled={Boolean(typeEditingId)}>
					{#each AFC_ORIGIN_OPTIONS as option (option.value)}
						<option value={option.value}>{option.label}</option>
					{/each}
				</select>
			</div>
			<div class="space-y-2">
				<Label for="afc-type-key">Clave</Label>
				<Input id="afc-type-key" placeholder="ej. conferences" bind:value={typeForm.key} disabled={Boolean(typeEditingId)} />
			</div>
			<div class="space-y-2 sm:col-span-2">
				<Label for="afc-type-name">Nombre</Label>
				<Input id="afc-type-name" bind:value={typeForm.name} />
			</div>
			<div class="space-y-2 sm:col-span-2">
				<Label for="afc-type-description">Descripción</Label>
				<Textarea id="afc-type-description" rows="2" bind:value={typeForm.description} />
			</div>
			<div class="space-y-2 sm:col-span-2">
				<Label for="afc-type-requirements">Requisitos mínimos</Label>
				<Textarea id="afc-type-requirements" rows="2" bind:value={typeForm.requirements} />
			</div>
			<div class="space-y-2 sm:col-span-2">
				<Label for="afc-type-mode">Modo de valoración</Label>
				<select id="afc-type-mode" class={selectClass} bind:value={typeForm.valuation_mode}>
					{#each AFC_VALUATION_MODE_OPTIONS as option (option.value)}
						<option value={option.value}>{option.label}</option>
					{/each}
				</select>
			</div>
			{#if typeForm.valuation_mode !== AFC_VALUATION_MODE.COMMITTEE}
				<div class="space-y-2">
					<Label for="afc-type-min">Mínimo de horas</Label>
					<Input id="afc-type-min" type="number" min="0" step="0.5" bind:value={typeForm.min_hours} />
				</div>
				<div class="space-y-2">
					<Label for="afc-type-max">Máximo de horas</Label>
					<Input id="afc-type-max" type="number" min="0" max="200" step="0.5" bind:value={typeForm.max_hours} />
				</div>
			{/if}
			<div class="space-y-2">
				<Label for="afc-type-order">Orden</Label>
				<Input id="afc-type-order" type="number" min="0" step="1" bind:value={typeForm.sort_order} />
			</div>
			<label class="flex items-center gap-2 self-end pb-2 text-sm">
				<Switch aria-label="Actividad activa" bind:checked={typeForm.is_active} />
				Activa
			</label>
		</div>

		{#if typeError}<div class="text-sm font-semibold text-red-600">{typeError}</div>{/if}

		<Dialog.Footer>
			<Button variant="outline" onclick={() => (typeDialogOpen = false)} disabled={typeSaving}>Cancelar</Button>
			<Button class="bg-blue-600 text-white hover:bg-blue-700" onclick={saveType} disabled={typeSaving}>
				{typeSaving ? 'Guardando...' : 'Guardar'}
			</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>

<Dialog.Root bind:open={scenarioDialogOpen}>
	<Dialog.Content class="max-h-[90vh] overflow-y-auto sm:max-w-xl">
		<Dialog.Header>
			<Dialog.Title>{scenarioEditingId ? 'Editar supuesto' : 'Nuevo supuesto'}</Dialog.Title>
			<Dialog.Description>
				{scenarioType?.name} · {formatAfcRange(scenarioType)}
			</Dialog.Description>
		</Dialog.Header>

		<div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
			<div class="space-y-2">
				<Label for="afc-scenario-key">Clave</Label>
				<Input id="afc-scenario-key" placeholder="ej. conf_internal_attendance" bind:value={scenarioForm.key} disabled={Boolean(scenarioEditingId)} />
			</div>
			<div class="space-y-2">
				<Label for="afc-scenario-kind">Tipo de cálculo</Label>
				<select id="afc-scenario-kind" class={selectClass} bind:value={scenarioForm.kind}>
					{#each AFC_SCENARIO_KIND_OPTIONS as option (option.value)}
						<option value={option.value}>{option.label}</option>
					{/each}
				</select>
			</div>
			<div class="space-y-2 sm:col-span-2">
				<Label for="afc-scenario-label">Supuesto</Label>
				<Input id="afc-scenario-label" bind:value={scenarioForm.label} />
			</div>
			{#if scenarioForm.kind === AFC_SCENARIO_KIND.PERCENT}
				<div class="space-y-2">
					<Label for="afc-scenario-percent">Porcentaje del rango</Label>
					<Input id="afc-scenario-percent" type="number" min="0" max="100" step="0.5" bind:value={scenarioForm.percent} />
				</div>
			{:else if scenarioForm.kind === AFC_SCENARIO_KIND.FIXED_HOURS}
				<div class="space-y-2">
					<Label for="afc-scenario-hours">Horas fijas</Label>
					<Input id="afc-scenario-hours" type="number" min="0" step="0.5" bind:value={scenarioForm.fixed_hours} />
				</div>
			{/if}
			<div class="space-y-2">
				<Label for="afc-scenario-order">Orden</Label>
				<Input id="afc-scenario-order" type="number" min="0" step="1" bind:value={scenarioForm.sort_order} />
			</div>
			<label class="flex items-center gap-2 self-end pb-2 text-sm">
				<Switch aria-label="Supuesto activo" bind:checked={scenarioForm.is_active} />
				Activo
			</label>
		</div>

		{#if scenarioPreview}
			<div class="rounded-xl bg-slate-50 px-3 py-2 text-sm text-slate-700">{scenarioPreview}</div>
		{/if}
		{#if scenarioError}<div class="text-sm font-semibold text-red-600">{scenarioError}</div>{/if}

		<Dialog.Footer>
			<Button variant="outline" onclick={() => (scenarioDialogOpen = false)} disabled={scenarioSaving}>Cancelar</Button>
			<Button class="bg-blue-600 text-white hover:bg-blue-700" onclick={saveScenario} disabled={scenarioSaving}>
				{scenarioSaving ? 'Guardando...' : 'Guardar'}
			</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>
