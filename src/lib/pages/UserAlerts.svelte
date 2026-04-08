<script>
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { alertsApi } from '$lib/services/api';
	import { Card, CardContent } from '$lib/components/ui/card';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import AlertPreviewCard from '$lib/components/alerts/AlertPreviewCard.svelte';
	import { getEventCategoryMeta } from '$lib/catalogs/eventCategories';
	import { getEventCategoryIcon } from '$lib/catalogs/eventCategoryIcons';

	let loading = false;
	let error = '';
	let searchTerm = '';
	let searchDebounceId;
	let alerts = [];
	let page = 1;
	const pageSize = 15;
	let totalPages = 1;
	let total = 0;

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

	async function fetchAllAlerts() {
		let currentPage = 1;
		let lastPage = 1;
		const acc = [];

		do {
			const res = await alertsApi.list({ page: currentPage, pageSize: 100 });
			const rows = Array.isArray(res?.alerts) ? res.alerts : [];
			acc.push(...rows);
			lastPage = Number(res?.pagination?.totalPages || 1) || 1;
			currentPage += 1;
		} while (currentPage <= lastPage);

		return acc;
	}

	function toRelativeFromIso(value) {
		const date = value ? new Date(value) : null;
		if (!date || Number.isNaN(date.getTime())) return 'Reciente';

		const diffMs = Date.now() - date.getTime();
		const diffMinutes = Math.floor(diffMs / (1000 * 60));
		const diffHours = Math.floor(diffMinutes / 60);
		const diffDays = Math.floor(diffHours / 24);

		if (diffMinutes < 1) return 'Ahora';
		if (diffMinutes < 60) return `Hace ${diffMinutes} min`;
		if (diffHours < 24) return `Hace ${diffHours} h`;
		if (diffDays < 7) return `Hace ${diffDays} día${diffDays > 1 ? 's' : ''}`;

		return date.toLocaleDateString('es-MX', { day: '2-digit', month: 'short' });
	}

	function getAlertCategoryMeta(value) {
		return getEventCategoryMeta(value, 'general');
	}

	function getNewsToneByAlertCategory(category) {
		const normalized = String(category || '').trim().toLowerCase();
		if (
			normalized.includes('urgent') ||
			normalized.includes('urgente') ||
			normalized.includes('error') ||
			normalized.includes('crit')
		) {
			return 'danger';
		}
		if (normalized.includes('success') || normalized.includes('ok') || normalized.includes('info')) {
			return 'success';
		}
		return 'info';
	}

	function mapAlertToPreviewItem(alert) {
		const categoryMeta = getAlertCategoryMeta(alert?.category);
		return {
			id: `alert-${alert?.id || Math.random()}`,
			icon: 'alert',
			categoryKey: categoryMeta.value || 'general',
			categoryIcon: getEventCategoryIcon(categoryMeta.iconKey),
			categoryLabel: categoryMeta.label,
			categoryClass: categoryMeta.tagClass,
			title: alert?.title || 'Alerta',
			time: toRelativeFromIso(alert?.created_at || alert?.updated_at || alert?.expires_at),
			description: alert?.description || 'Sin descripción',
			tone: getNewsToneByAlertCategory(alert?.category)
		};
	}

	async function loadAlerts(nextPage = page) {
		loading = true;
		error = '';
		try {
			const term = String(searchTerm || '').trim();

			if (term) {
				const allAlerts = await fetchAllAlerts();
				const filtered = allAlerts.filter((alert) => alertMatchesSearch(alert, term));

				total = filtered.length;
				totalPages = Math.max(1, Math.ceil(total / pageSize));
				page = Math.min(Math.max(1, Number(nextPage) || 1), totalPages);

				const start = (page - 1) * pageSize;
				alerts = filtered.slice(start, start + pageSize);
			} else {
				const res = await alertsApi.list({ page: nextPage, pageSize });
				alerts = Array.isArray(res?.alerts) ? res.alerts : [];
				page = Number(res?.pagination?.page || nextPage);
				total = Number(res?.pagination?.total || alerts.length || 0);
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

	function onSearchInput(event) {
		searchTerm = event?.currentTarget?.value || '';
		if (searchDebounceId) clearTimeout(searchDebounceId);
		searchDebounceId = setTimeout(() => {
			loadAlerts(1);
		}, 220);
	}

	function goToPage(nextPage) {
		if (nextPage < 1 || nextPage > totalPages || nextPage === page) return;
		loadAlerts(nextPage);
	}

	onMount(() => {
		loadAlerts(1);
	});
</script>

<div class="mx-auto w-full max-w-screen-xl px-4 pb-16 pt-6 sm:px-6 lg:px-8">
	<div class="mb-4 flex flex-wrap items-center justify-between gap-3">
		<div>
			<h1 class="text-2xl font-semibold tracking-tight sm:text-3xl">Alertas</h1>
			<p class="mt-1 text-sm text-muted-foreground">Últimos avisos y noticias publicadas.</p>
		</div>
		<Button variant="outline" class="rounded-xl" onclick={() => goto('/app/home')}>
			Volver
		</Button>
	</div>

	<div class="mb-4">
		<Input
			placeholder="Buscar alertas por título, descripción o categoría"
			value={searchTerm}
			oninput={onSearchInput}
		/>
	</div>

	{#if error}
		<div class="mb-3 text-sm font-semibold text-red-600">{error}</div>
	{/if}

	{#if loading}
		<div class="text-sm text-muted-foreground">Cargando alertas...</div>
	{:else if !alerts.length}
		<Card class="rounded-2xl border">
			<CardContent class="p-4 text-sm text-muted-foreground sm:p-5">
				Por ahora no tenemos alertas publicadas.
			</CardContent>
		</Card>
	{:else}
		<div class="space-y-3">
			{#each alerts as alert (alert.id)}
				{@const previewItem = mapAlertToPreviewItem(alert)}
				<AlertPreviewCard item={previewItem} />
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
</div>
