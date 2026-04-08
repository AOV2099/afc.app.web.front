<script>
	import { onMount } from 'svelte';
	import { toast } from 'svelte-sonner';
	import { alertsApi, adminAlertsApi } from '$lib/services/api';
	import {
		EVENT_CATEGORY_OPTIONS,
		normalizeEventCategory,
		getEventCategoryMeta
	} from '$lib/catalogs/eventCategories';
	import { getEventCategoryIcon } from '$lib/catalogs/eventCategoryIcons';
	import { getEventCategoryStyleClasses } from '$lib/stores/eventCategoryStyles';
	import { Card, CardContent } from '$lib/components/ui/card';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { Badge } from '$lib/components/ui/badge';
	import { Switch } from '$lib/components/ui/switch';
	import { Textarea } from '$lib/components/ui/textarea';
	import * as Dialog from '$lib/components/ui/dialog';

	let loading = false;
	let submitting = false;
	let error = '';
	let includeExpired = false;
	let searchTerm = '';
	let searchDebounceId;
	let alerts = [];
	let page = 1;
	const pageSize = 10;
	let totalPages = 1;
	let total = 0;

	let editorOpen = false;
	let deleteOpen = false;
	let editingAlert = null;
	let deletingAlert = null;

	let form = {
		title: '',
		description: '',
		category: 'general',
		expiresAt: '',
		autoDelete: false
	};

	let selectedCategoryMeta = getEventCategoryMeta(form.category, 'general');
	let selectedCategoryIcon = getEventCategoryIcon(selectedCategoryMeta.iconKey);

	function toLocalDateTime(iso) {
		if (!iso) return '';
		const d = new Date(iso);
		if (Number.isNaN(d.getTime())) return '';
		const y = d.getFullYear();
		const m = String(d.getMonth() + 1).padStart(2, '0');
		const day = String(d.getDate()).padStart(2, '0');
		const hh = String(d.getHours()).padStart(2, '0');
		const mm = String(d.getMinutes()).padStart(2, '0');
		return `${y}-${m}-${day}T${hh}:${mm}`;
	}

	function toIso(value) {
		if (!value) return null;
		const d = new Date(value);
		if (Number.isNaN(d.getTime())) return null;
		return d.toISOString();
	}

	function formatDate(iso) {
		if (!iso) return 'Sin fecha';
		const d = new Date(iso);
		if (Number.isNaN(d.getTime())) return 'Sin fecha';
		return d.toLocaleString('es-MX');
	}

	function resetForm() {
		form = {
			title: '',
			description: '',
			category: 'general',
			expiresAt: '',
			autoDelete: false
		};
	}

	function openCreate() {
		editingAlert = null;
		resetForm();
		editorOpen = true;
	}

	function openEdit(alert) {
		editingAlert = alert;
		form = {
			title: alert?.title || '',
			description: alert?.description || '',
			category: normalizeEventCategory(alert?.category, 'general'),
			expiresAt: toLocalDateTime(alert?.expires_at),
			autoDelete: Boolean(alert?.auto_delete)
		};
		editorOpen = true;
	}

	function openDelete(alert) {
		deletingAlert = alert;
		deleteOpen = true;
	}

	function normalizeSearchText(value) {
		return String(value || '')
			.trim()
			.toLowerCase()
			.normalize('NFD')
			.replace(/[\u0300-\u036f]/g, '');
	}

	function alertMatchesSearch(alert, term) {
		const normalizedTerm = normalizeSearchText(term);
		if (!normalizedTerm) return true;

		const haystack = [alert?.title, alert?.description, alert?.category]
			.map((v) => normalizeSearchText(v))
			.join(' ');

		return haystack.includes(normalizedTerm);
	}

	async function fetchAllAlerts(includeExpiredValue) {
		let currentPage = 1;
		let lastPage = 1;
		const acc = [];

		do {
			const res = await alertsApi.list({
				page: currentPage,
				pageSize: 100,
				includeExpired: includeExpiredValue
			});

			const rows = Array.isArray(res?.alerts) ? res.alerts : [];
			acc.push(...rows);
			lastPage = Number(res?.pagination?.totalPages || 1) || 1;
			currentPage += 1;
		} while (currentPage <= lastPage);

		return acc;
	}

	async function loadAlerts(nextPage = page) {
		loading = true;
		error = '';
		try {
			const term = String(searchTerm || '').trim();

			if (term) {
				const allAlerts = await fetchAllAlerts(includeExpired);
				const filtered = allAlerts.filter((alert) => alertMatchesSearch(alert, term));

				total = filtered.length;
				totalPages = Math.max(1, Math.ceil(total / pageSize));
				page = Math.min(Math.max(1, Number(nextPage) || 1), totalPages);

				const start = (page - 1) * pageSize;
				alerts = filtered.slice(start, start + pageSize);
			} else {
				const res = await alertsApi.list({
					page: nextPage,
					pageSize,
					includeExpired
				});

				alerts = Array.isArray(res?.alerts) ? res.alerts : [];
				page = Number(res?.pagination?.page || nextPage);
				total = Number(res?.pagination?.total || 0);
				totalPages = Number(res?.pagination?.totalPages || 1);
			}
		} catch (e) {
			error = e?.message || 'No se pudieron cargar las alertas.';
			alerts = [];
			total = 0;
			totalPages = 1;
		} finally {
			loading = false;
		}
	}

	async function saveAlert() {
		if (submitting) return;
		if (!String(form.title || '').trim()) {
			toast.error('El título es obligatorio.');
			return;
		}
		if (!String(form.description || '').trim()) {
			toast.error('La descripción es obligatoria.');
			return;
		}
		if (!String(form.category || '').trim()) {
			toast.error('La categoría es obligatoria.');
			return;
		}
		const expiresIso = toIso(form.expiresAt);
		if (!expiresIso) {
			toast.error('La fecha de expiración debe ser válida.');
			return;
		}

		submitting = true;
		try {
			const normalizedCategory = normalizeEventCategory(form.category, 'general');
			const payload = {
				title: String(form.title || '').trim(),
				description: String(form.description || '').trim(),
				category: normalizedCategory,
				expires_at: expiresIso,
				auto_delete: Boolean(form.autoDelete)
			};

			const res = editingAlert?.id
				? await adminAlertsApi.update(editingAlert.id, payload)
				: await adminAlertsApi.create(payload);

			toast.success(res?.message || 'Alerta guardada correctamente.');
			editorOpen = false;
			await loadAlerts(page);
		} catch (e) {
			toast.error(e?.message || 'No se pudo guardar la alerta.');
		} finally {
			submitting = false;
		}
	}

	async function confirmDelete() {
		if (!deletingAlert?.id || submitting) return;
		submitting = true;
		try {
			const res = await adminAlertsApi.remove(deletingAlert.id);
			toast.success(res?.message || 'Alerta eliminada correctamente.');
			deleteOpen = false;
			deletingAlert = null;
			await loadAlerts(page);
		} catch (e) {
			toast.error(e?.message || 'No se pudo eliminar la alerta.');
		} finally {
			submitting = false;
		}
	}

	function goToPage(nextPage) {
		if (nextPage < 1 || nextPage > totalPages || nextPage === page) return;
		loadAlerts(nextPage);
	}

	function getAlertCategoryMeta(value) {
		return getEventCategoryMeta(value, 'general');
	}

	function getAlertCategoryPalette(value) {
		const key = normalizeEventCategory(value, 'general');
		const style = getEventCategoryStyleClasses(key);
		return `${style.bgClass} ${style.colorClass}`;
	}

	function onSearchInput(event) {
		searchTerm = event?.currentTarget?.value || '';
		if (searchDebounceId) clearTimeout(searchDebounceId);
		searchDebounceId = setTimeout(() => {
			loadAlerts(1);
		}, 220);
	}

	$: if (includeExpired !== undefined) {
		page = 1;
	}

	$: selectedCategoryMeta = getEventCategoryMeta(form.category, 'general');
	$: selectedCategoryIcon = getEventCategoryIcon(selectedCategoryMeta.iconKey);

	onMount(() => {
		loadAlerts(1);
	});
</script>

<div class="mx-auto w-full max-w-screen-xl px-4 pb-16 pt-6 sm:px-6 lg:px-8">
	<div class="mb-4 flex flex-wrap items-center justify-between gap-3">
		<div>
			<h1 class="text-2xl font-semibold tracking-tight sm:text-3xl">Alertas</h1>
			<p class="mt-1 text-sm text-muted-foreground">Crear, editar y eliminar alertas del sistema.</p>
		</div>
		<Button class="rounded-xl bg-blue-600 text-white hover:bg-blue-700" onclick={openCreate}>
			Nueva alerta
		</Button>
	</div>

	<div class="mb-4 rounded-2xl border bg-white p-3">
		<div class="flex flex-wrap items-center justify-between gap-3">
			<div class="text-sm text-muted-foreground">Total: {total}</div>
			<div class="flex items-center gap-2">
				<span class="text-sm">Incluir expiradas</span>
				<Switch
					bind:checked={includeExpired}
					onclick={() => {
						setTimeout(() => loadAlerts(1), 0);
					}}
				/>
			</div>
		</div>
		<div class="mt-3">
			<Input
				placeholder="Buscar por título, descripción o categoría"
				value={searchTerm}
				oninput={onSearchInput}
			/>
		</div>
	</div>

	{#if error}
		<div class="mb-3 text-sm font-semibold text-red-600">{error}</div>
	{/if}

	<Card>
		<CardContent class="p-4">
			{#if loading}
				<div class="text-sm text-muted-foreground">Cargando alertas...</div>
			{:else if !alerts.length}
				<div class="text-sm text-muted-foreground">No hay alertas para mostrar.</div>
			{:else}
				<div class="space-y-3">
					{#each alerts as alert (alert.id)}
						{@const categoryMeta = getAlertCategoryMeta(alert?.category)}
						{@const categoryPalette = getAlertCategoryPalette(alert?.category)}
						{@const categoryIcon = getEventCategoryIcon(categoryMeta.iconKey)}
						<div class="rounded-xl border p-3">
							<div class="flex flex-wrap items-center justify-between gap-2">
								<div class="text-base font-semibold">{alert.title}</div>
								<div class="flex items-center gap-2">
									<Badge class={`rounded-full ${categoryPalette}`}>
										<span class="inline-flex items-center gap-1">
											<svelte:component this={categoryIcon} class="h-3.5 w-3.5" />
											<span>{categoryMeta.label}</span>
										</span>
									</Badge>
									{#if alert.is_expired}
										<Badge class="rounded-full bg-red-50 text-red-700 hover:bg-red-50">Expirada</Badge>
									{/if}
								</div>
							</div>
							<div class="mt-1 text-sm text-muted-foreground">{alert.description}</div>
							<div class="mt-2 text-xs text-muted-foreground">
								Expira: {formatDate(alert.expires_at)} · Auto delete: {alert.auto_delete ? 'Sí' : 'No'}
							</div>
							<div class="mt-3 flex items-center gap-2">
								<Button size="sm" variant="outline" onclick={() => openEdit(alert)}>Editar</Button>
								<Button size="sm" variant="destructive" onclick={() => openDelete(alert)}>Eliminar</Button>
							</div>
						</div>
					{/each}
				</div>
			{/if}

			<div class="mt-4 flex items-center justify-end gap-2">
				<Button variant="outline" size="sm" disabled={page <= 1 || loading} onclick={() => goToPage(page - 1)}>
					Anterior
				</Button>
				<div class="text-sm text-muted-foreground">Página {page} de {totalPages}</div>
				<Button variant="outline" size="sm" disabled={page >= totalPages || loading} onclick={() => goToPage(page + 1)}>
					Siguiente
				</Button>
			</div>
		</CardContent>
	</Card>
</div>

<Dialog.Root bind:open={editorOpen}>
	<Dialog.Content class="sm:max-w-xl">
		<Dialog.Header>
			<Dialog.Title>{editingAlert ? 'Editar alerta' : 'Nueva alerta'}</Dialog.Title>
			<Dialog.Description>Completa los datos de la alerta.</Dialog.Description>
		</Dialog.Header>

		<div class="grid gap-3">
			<div class="space-y-2">
				<Label>Título</Label>
				<Input bind:value={form.title} />
			</div>
			<div class="space-y-2">
				<Label>Descripción</Label>
				<Textarea class="min-h-[100px]" bind:value={form.description} />
			</div>
			<div class="grid gap-3 sm:grid-cols-2">
				<div class="space-y-2">
					<Label>Categoría</Label>
					<div class="relative">
						<span class="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
							<svelte:component this={selectedCategoryIcon} class="h-4 w-4" />
						</span>
						<select class="h-10 w-full rounded-md border bg-background pl-10 pr-3 text-sm" bind:value={form.category}>
							{#each EVENT_CATEGORY_OPTIONS as categoryOption (categoryOption.value)}
								<option value={categoryOption.value}>{categoryOption.label}</option>
							{/each}
						</select>
					</div>
				</div>
				<div class="space-y-2">
					<Label>Expira en</Label>
					<Input type="datetime-local" bind:value={form.expiresAt} />
				</div>
			</div>
			<div class="flex items-center justify-between rounded-xl border bg-slate-50 px-3 py-2">
				<span class="text-sm">Auto eliminar al expirar</span>
				<Switch bind:checked={form.autoDelete} />
			</div>
		</div>

		<Dialog.Footer>
			<Button variant="outline" onclick={() => (editorOpen = false)} disabled={submitting}>Cancelar</Button>
			<Button class="bg-blue-600 text-white hover:bg-blue-700" onclick={saveAlert} disabled={submitting}>
				{submitting ? 'Guardando...' : 'Guardar'}
			</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>

<Dialog.Root bind:open={deleteOpen}>
	<Dialog.Content class="sm:max-w-md">
		<Dialog.Header>
			<Dialog.Title>Eliminar alerta</Dialog.Title>
			<Dialog.Description>
				¿Seguro que deseas eliminar la alerta <span class="font-semibold">{deletingAlert?.title || ''}</span>?
			</Dialog.Description>
		</Dialog.Header>
		<Dialog.Footer>
			<Button variant="outline" onclick={() => (deleteOpen = false)} disabled={submitting}>Cancelar</Button>
			<Button variant="destructive" onclick={confirmDelete} disabled={submitting}>
				{submitting ? 'Eliminando...' : 'Eliminar'}
			</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>
