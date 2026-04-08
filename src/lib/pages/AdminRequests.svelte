	<script>
		import { onMount } from 'svelte';
		import { toast } from 'svelte-sonner';
		import { adminRequestsApi } from '$lib/services/api';
	import { Card, CardContent } from '$lib/components/ui/card';
	import { Button } from '$lib/components/ui/button';
	import { Badge } from '$lib/components/ui/badge';
	import { Loader2 } from 'lucide-svelte';

	let loading = false;
	let submitting = '';
	let error = '';
	let page = 1;
	let pageSize = 20;
	let totalPages = 1;
	let total = 0;
	let requests = [];

	function getFullName(user = {}) {
		const full = `${user?.first_name || ''} ${user?.last_name || ''}`.trim();
		return full || user?.email || 'Usuario';
	}

	function formatDate(value) {
		if (!value) return 'Sin fecha';
		const d = new Date(value);
		if (Number.isNaN(d.getTime())) return 'Sin fecha';
		return d.toLocaleString('es-MX');
	}

	function requestTypeBadgeClass(type) {
		if (type === 'cancellation') {
			return 'rounded-full bg-orange-50 text-orange-700 hover:bg-orange-50';
		}
		return 'rounded-full bg-blue-50 text-blue-700 hover:bg-blue-50';
	}

	function requestTypeLabel(type) {
		return type === 'cancellation' ? 'Solicitud de baja' : 'Solicitud de inscripción';
	}

	async function loadRequests() {
		loading = true;
		error = '';

		try {
			const res = await adminRequestsApi.listPending({ page, pageSize });
			requests = Array.isArray(res?.requests) ? res.requests : [];
			page = Number(res?.pagination?.page || page);
			pageSize = Number(res?.pagination?.pageSize || pageSize);
			total = Number(res?.pagination?.total || 0);
			totalPages = Number(res?.pagination?.totalPages || 1);
		} catch (e) {
			error = e?.message || 'No se pudieron cargar las solicitudes pendientes.';
		} finally {
			loading = false;
		}
	}

	async function reviewRequest(registrationId, action) {
		if (!registrationId) return;
		submitting = `${registrationId}:${action}`;
		error = '';

		try {
			const res = await adminRequestsApi.review(registrationId, { action });
			toast.success(
				res?.message ||
					(action === 'approve'
						? 'Solicitud aprobada correctamente.'
						: 'Solicitud denegada correctamente.')
			);
			await loadRequests();
		} catch (e) {
			const message = e?.message || 'No se pudo procesar la solicitud.';
			error = message;
			toast.error(message);
		} finally {
			submitting = '';
		}
	}

	function goToPage(nextPage) {
		if (nextPage < 1 || nextPage > totalPages || nextPage === page) return;
		page = nextPage;
		loadRequests();
	}

	onMount(() => {
		loadRequests();
	});
</script>

<div class="mx-auto w-full max-w-screen-xl px-4 pb-16 pt-6 sm:px-6 lg:px-8">
	<div class="mb-4">
		<h1 class="text-2xl font-semibold tracking-tight sm:text-3xl">Solicitudes pendientes</h1>
		<p class="mt-1 text-sm text-muted-foreground">Revisa y decide solicitudes de inscripción o baja.</p>
	</div>

	{#if error}
		<div class="mb-3 text-sm font-semibold text-red-600">{error}</div>
	{/if}

	<Card>
		<CardContent class="p-4">
			<div class="mb-3 flex items-center justify-between">
				<div class="text-sm text-muted-foreground">Total: {total}</div>
			</div>

			{#if loading}
				<div class="flex items-center gap-2 text-sm text-muted-foreground">
					<Loader2 class="h-4 w-4 animate-spin" /> Cargando solicitudes...
				</div>
			{:else if !requests.length}
				<div class="text-sm text-muted-foreground">No hay solicitudes pendientes.</div>
			{:else}
				<div class="space-y-3">
					{#each requests as req (req.registration_id)}
						<div class="rounded-xl border p-3">
							<div class="flex flex-wrap items-center justify-between gap-2">
								<div class="text-sm font-semibold">{req?.event?.title || 'Evento'}</div>
								<Badge class={requestTypeBadgeClass(req?.request_type)}>
									{requestTypeLabel(req?.request_type)}
								</Badge>
							</div>
							<div class="mt-1 text-sm text-muted-foreground">
								{getFullName(req?.user)} · {formatDate(req?.submitted_at)}
							</div>
							{#if req?.request_type === 'cancellation' && req?.request_detail?.reason}
								<div class="mt-2 text-sm text-slate-700">
									Motivo: {req.request_detail.reason}
								</div>
							{/if}
							<div class="mt-3 flex items-center gap-2">
								<Button
									size="sm"
									class="bg-blue-600 text-white hover:bg-blue-700"
									disabled={submitting === `${req.registration_id}:approve` || submitting === `${req.registration_id}:deny`}
									onclick={() => reviewRequest(req.registration_id, 'approve')}
								>
									Aprobar
								</Button>
								<Button
									size="sm"
									variant="outline"
									disabled={submitting === `${req.registration_id}:approve` || submitting === `${req.registration_id}:deny`}
									onclick={() => reviewRequest(req.registration_id, 'deny')}
								>
									Denegar
								</Button>
							</div>
						</div>
					{/each}
				</div>
			{/if}

			<div class="mt-4 flex items-center justify-end gap-2">
				<Button variant="outline" size="sm" disabled={page <= 1} on:click={() => goToPage(page - 1)}>
					Anterior
				</Button>
				<div class="text-sm text-muted-foreground">Página {page} de {totalPages}</div>
				<Button
					variant="outline"
					size="sm"
					disabled={page >= totalPages}
					on:click={() => goToPage(page + 1)}
				>
					Siguiente
				</Button>
			</div>
		</CardContent>
	</Card>
</div>
