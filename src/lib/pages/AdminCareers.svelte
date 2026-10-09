<script>
	import { onMount } from 'svelte';
	import { toast } from 'svelte-sonner';

	import { adminCareersApi } from '$lib/services/api';
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import { Card, CardContent } from '$lib/components/ui/card';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import * as Dialog from '$lib/components/ui/dialog';
	import { Plus } from 'lucide-svelte';

	let loading = false;
	let loadError = '';
	let careers = [];
	let search = '';

	let dialogOpen = false;
	let editingId = null;
	let form = emptyForm();
	let formError = '';
	let saving = false;

	$: normalizedSearch = normalize(search);
	$: visibleCareers = careers.filter(
		(career) =>
			!normalizedSearch ||
			normalize(`${career.name} ${career.clave_carrera || ''} ${career.faculty || ''}`).includes(normalizedSearch)
	);

	function emptyForm() {
		return { name: '', faculty: 'FES Aragón', clave_carrera: '', afc_hours: 480 };
	}

	function normalize(value) {
		return String(value || '')
			.toLowerCase()
			.normalize('NFD')
			.replace(/[\u0300-\u036f]/g, '');
	}

	function formatHours(value) {
		return Number(value || 0).toLocaleString('es-MX', { maximumFractionDigits: 2 });
	}

	function validateForm() {
		if (!String(form.name || '').trim()) return 'El nombre de la carrera es obligatorio.';
		const clave = String(form.clave_carrera ?? '').trim();
		if (clave && !/^\d{1,10}$/.test(clave)) return 'La clave de carrera solo admite dígitos (máximo 10).';
		const hoursText = String(form.afc_hours ?? '').trim();
		if (!/^\d{1,4}(?:\.\d{1,2})?$/.test(hoursText) || !(Number(hoursText) > 0)) {
			return 'Las horas AFC deben ser un número mayor a 0 con hasta 2 decimales.';
		}
		return '';
	}

	async function loadCareers() {
		loading = true;
		loadError = '';
		try {
			const response = await adminCareersApi.list();
			careers = Array.isArray(response?.careers) ? response.careers : [];
		} catch (e) {
			loadError = e?.message || 'No se pudieron cargar las carreras.';
		} finally {
			loading = false;
		}
	}

	function openNew() {
		editingId = null;
		form = emptyForm();
		formError = '';
		dialogOpen = true;
	}

	function openEdit(career) {
		editingId = career.id;
		form = {
			name: career.name,
			faculty: career.faculty || '',
			clave_carrera: career.clave_carrera || '',
			afc_hours: career.afc_hours
		};
		formError = '';
		dialogOpen = true;
	}

	async function save() {
		formError = validateForm();
		if (formError) return;
		saving = true;
		const payload = {
			name: String(form.name).trim(),
			faculty: String(form.faculty || '').trim(),
			clave_carrera: String(form.clave_carrera ?? '').trim(),
			afc_hours: String(form.afc_hours).trim()
		};
		try {
			const response = editingId
				? await adminCareersApi.update(editingId, payload)
				: await adminCareersApi.create(payload);
			toast.success(response?.message || 'Carrera guardada.');
			dialogOpen = false;
			await loadCareers();
		} catch (e) {
			formError = e?.message || 'No se pudo guardar la carrera.';
		} finally {
			saving = false;
		}
	}

	onMount(loadCareers);
</script>

<div class="mx-auto w-full max-w-screen-xl px-4 pb-16 pt-6 sm:px-6 lg:px-8">
	<div class="flex flex-wrap items-center justify-between gap-3">
		<div>
			<h1 class="text-2xl font-semibold tracking-tight sm:text-3xl">Carreras</h1>
			<p class="mt-1 text-sm text-muted-foreground">
				Clave oficial y meta de horas AFC por carrera. Al alcanzar la meta, las asistencias se registran pero ya no suman horas.
			</p>
		</div>
		<Button class="gap-2 rounded-xl bg-blue-600 text-white hover:bg-blue-700" onclick={openNew}>
			<Plus class="h-4 w-4" /> Nueva carrera
		</Button>
	</div>

	<div class="mt-4 max-w-sm">
		<Input placeholder="Buscar por nombre, clave o facultad" bind:value={search} aria-label="Buscar carreras" />
	</div>

	{#if loading}
		<div class="mt-6 text-sm text-muted-foreground">Cargando carreras…</div>
	{:else if loadError}
		<div class="mt-6 text-sm font-semibold text-red-600">{loadError}</div>
	{:else}
		<Card class="mt-6 rounded-3xl border">
			<CardContent class="overflow-x-auto p-0">
				<table class="w-full text-sm">
					<thead class="bg-slate-50 text-left text-xs text-slate-600">
						<tr>
							<th class="px-4 py-3">Carrera</th>
							<th class="px-4 py-3">Clave</th>
							<th class="px-4 py-3">Facultad</th>
							<th class="px-4 py-3 text-right">Meta AFC</th>
							<th class="px-4 py-3 text-right">Usuarios</th>
							<th class="px-4 py-3"></th>
						</tr>
					</thead>
					<tbody>
						{#each visibleCareers as career (career.id)}
							<tr class="border-t">
								<td class="px-4 py-3 font-medium">{career.name}</td>
								<td class="px-4 py-3">
									{#if career.clave_carrera}
										{career.clave_carrera}
									{:else}
										<Badge class="rounded-full bg-amber-50 text-amber-800 hover:bg-amber-50">Sin clave</Badge>
									{/if}
								</td>
								<td class="px-4 py-3 text-muted-foreground">{career.faculty || '—'}</td>
								<td class="px-4 py-3 text-right font-semibold">{formatHours(career.afc_hours)} h</td>
								<td class="px-4 py-3 text-right">{career.users_count ?? 0}</td>
								<td class="px-4 py-3 text-right">
									<Button variant="ghost" class="h-8 rounded-lg" onclick={() => openEdit(career)}>Editar</Button>
								</td>
							</tr>
						{:else}
							<tr><td colspan="6" class="px-4 py-6 text-center text-sm text-muted-foreground">No hay carreras que coincidan.</td></tr>
						{/each}
					</tbody>
				</table>
			</CardContent>
		</Card>
	{/if}
</div>

<Dialog.Root bind:open={dialogOpen}>
	<Dialog.Content class="sm:max-w-lg">
		<Dialog.Header>
			<Dialog.Title>{editingId ? 'Editar carrera' : 'Nueva carrera'}</Dialog.Title>
			<Dialog.Description>
				Cambiar la meta aplica a las siguientes acreditaciones; no modifica horas ya registradas.
			</Dialog.Description>
		</Dialog.Header>

		<div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
			<div class="space-y-2 sm:col-span-2">
				<Label for="career-name">Nombre</Label>
				<Input id="career-name" bind:value={form.name} maxlength="160" />
			</div>
			<div class="space-y-2">
				<Label for="career-clave">Clave de carrera</Label>
				<Input id="career-clave" inputmode="numeric" maxlength="10" placeholder="Ej. 2236" bind:value={form.clave_carrera} />
			</div>
			<div class="space-y-2">
				<Label for="career-hours">Meta de horas AFC</Label>
				<Input id="career-hours" type="number" min="0.5" step="0.5" bind:value={form.afc_hours} />
			</div>
			<div class="space-y-2 sm:col-span-2">
				<Label for="career-faculty">Facultad</Label>
				<Input id="career-faculty" bind:value={form.faculty} maxlength="160" />
			</div>
		</div>

		{#if formError}<div class="text-sm font-semibold text-red-600">{formError}</div>{/if}

		<Dialog.Footer>
			<Button variant="outline" onclick={() => (dialogOpen = false)} disabled={saving}>Cancelar</Button>
			<Button class="bg-blue-600 text-white hover:bg-blue-700" onclick={save} disabled={saving}>
				{saving ? 'Guardando...' : 'Guardar'}
			</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>
