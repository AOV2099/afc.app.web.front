<script>
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import { toast } from 'svelte-sonner';
	import { adminEventsApi } from '$lib/services/api';
	import {
		EVENT_STATUS_CATALOG,
		EVENT_REGISTRATION_MODE_CATALOG,
		EVENT_RESUBMISSION_POLICY_CATALOG,
		EVENT_CANCEL_POLICY_CATALOG
	} from '../../routes/store';
	import {
		EVENT_CATEGORY_OPTIONS,
		normalizeEventCategory,
		getEventCategoryMeta
	} from '$lib/catalogs/eventCategories';
	import { getEventCategoryIcon } from '$lib/catalogs/eventCategoryIcons';
	import { Card, CardContent } from '$lib/components/ui/card';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Textarea } from '$lib/components/ui/textarea';
	import { Switch } from '$lib/components/ui/switch';

	export let eventId = '';

	const statusOptions = Object.values(EVENT_STATUS_CATALOG);
	const registrationModeOptions = Object.values(EVENT_REGISTRATION_MODE_CATALOG);
	const resubmissionPolicyOptions = Object.values(EVENT_RESUBMISSION_POLICY_CATALOG);
	const cancelPolicyOptions = Object.values(EVENT_CANCEL_POLICY_CATALOG);
	const categoryOptions = EVENT_CATEGORY_OPTIONS;

	let loading = false;
	let submitting = false;
	let loadError = '';

	let form = {
		title: '',
		description: '',
		coverImageUrl: '',
		startsAt: '',
		endsAt: '',
		hoursValue: 0,
		status: 'draft',
		registrationMode: 'auto',
		resubmissionPolicy: 'only_changes_requested',
		allowSelfCheckin: true,
		geoEnforced: false,
		cancelPolicy: 'free_cancel',
		cancelDeadline: '',
		category: 'general',
		capacityEnabled: true,
		cupo: '',
		geoCenterLat: '',
		geoCenterLng: '',
		geoRadiusM: 120,
		geoStrictAccuracyM: ''
	};

	let coverPreviewFailed = false;
	let lastCoverPreviewUrl = '';
	let normalizedCoverImageUrl = '';
	let selectedCategoryMeta = getEventCategoryMeta(form.category);
	let selectedCategoryIcon = getEventCategoryIcon(selectedCategoryMeta.iconKey);

	function isoToLocalDatetime(iso) {
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

	function localDatetimeToIso(value) {
		if (!value) return null;
		const d = new Date(value);
		if (Number.isNaN(d.getTime())) return null;
		return d.toISOString();
	}

	function normalizeWebImageUrl(value) {
		const raw = String(value || '').trim();
		if (!raw) return '';

		let candidate = raw;
		if (raw.startsWith('//')) {
			candidate = `https:${raw}`;
		} else if (!/^https?:\/\//i.test(raw)) {
			if (/^www\./i.test(raw) || /^[a-z0-9.-]+\.[a-z]{2,}(?:\/|$)/i.test(raw)) {
				candidate = `https://${raw}`;
			}
		}

		try {
			const parsed = new URL(candidate);
			if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return '';
			return parsed.toString();
		} catch {
			return '';
		}
	}

	function isValidHttpUrl(value) {
		return Boolean(normalizeWebImageUrl(value));
	}

	function applyEventToForm(ev) {
		if (!ev) return;
		form = {
			title: ev.title || '',
			description: ev.description || '',
			coverImageUrl:
				ev?.cover_image_url ||
				ev?.image_url ||
				ev?.attributes?.cover_image_url ||
				ev?.attributes?.image_url ||
				'',
			startsAt: isoToLocalDatetime(ev.starts_at),
			endsAt: isoToLocalDatetime(ev.ends_at),
			hoursValue: Number(ev.hours_value ?? 0),
			status: ev.status || 'draft',
			registrationMode: ev.registration_mode || 'auto',
			resubmissionPolicy: ev.resubmission_policy || 'only_changes_requested',
			allowSelfCheckin: Boolean(ev.allow_self_checkin),
			geoEnforced: Boolean(ev.geo_enforced),
			cancelPolicy: ev.cancel_policy || 'free_cancel',
			cancelDeadline: isoToLocalDatetime(ev.cancel_deadline),
			category: normalizeEventCategory(ev?.category, 'general'),
			capacityEnabled: Boolean(ev?.capacity_enabled),
			cupo: ev?.capacity ?? ev?.attributes?.cupo ?? '',
			geoCenterLat: ev?.geo?.center_lat ?? '',
			geoCenterLng: ev?.geo?.center_lng ?? '',
			geoRadiusM: ev?.geo?.radius_m ?? 120,
			geoStrictAccuracyM: ev?.geo?.strict_accuracy_m ?? ''
		};
	}

	function buildSingleSession(startsAtIso, endsAtIso, hoursValue) {
		if (!startsAtIso || !endsAtIso) return [];
		return [
			{
				starts_at: startsAtIso,
				ends_at: endsAtIso,
				label: 'Sesión principal',
				hours_value: Number(hoursValue) || 0
			}
		];
	}

	function buildPayload() {
		const startsAtIso = localDatetimeToIso(form.startsAt);
		const endsAtIso = localDatetimeToIso(form.endsAt);
		return {
			title: form.title?.trim(),
			description: form.description?.trim() || null,
			category: form.category,
			starts_at: startsAtIso,
			ends_at: endsAtIso,
			hours_value: Number(form.hoursValue) || 0,
			capacity_enabled: Boolean(form.capacityEnabled),
			capacity: form.capacityEnabled ? (form.cupo === '' ? null : Number(form.cupo)) : null,
			status: form.status,
			registration_mode: form.registrationMode,
			resubmission_policy: form.resubmissionPolicy,
			allow_self_checkin: Boolean(form.allowSelfCheckin),
			geo_enforced: Boolean(form.geoEnforced),
			cancel_policy: form.cancelPolicy,
			cancel_deadline: localDatetimeToIso(form.cancelDeadline),
			attributes: {
				cover_image_url: normalizedCoverImageUrl || null
			},
			geo:
				form.geoEnforced && form.geoCenterLat !== '' && form.geoCenterLng !== ''
					? {
						center_lat: Number(form.geoCenterLat),
						center_lng: Number(form.geoCenterLng),
						radius_m: Number(form.geoRadiusM) || 120,
						strict_accuracy_m:
							form.geoStrictAccuracyM === '' ? null : Number(form.geoStrictAccuracyM)
					}
					: null,
			sessions: buildSingleSession(startsAtIso, endsAtIso, form.hoursValue)
		};
	}

	function validatePayload(payload) {
		if (!payload.title || !payload.starts_at || !payload.ends_at) {
			return 'Título, inicio y fin son obligatorios.';
		}
		if (new Date(payload.ends_at) <= new Date(payload.starts_at)) {
			return 'La fecha/hora de fin debe ser mayor a la de inicio.';
		}
		if (payload.capacity_enabled) {
			if (!Number.isInteger(payload.capacity) || payload.capacity <= 0) {
				return 'El cupo debe ser un entero mayor a 0 cuando está habilitado.';
			}
		}
		if (payload.geo_enforced && !payload.geo) {
			return 'Si activas geocerca, captura latitud y longitud.';
		}
		return '';
	}

	$: {
		const nextUrl = String(form.coverImageUrl || '').trim();
		if (nextUrl !== lastCoverPreviewUrl) {
			lastCoverPreviewUrl = nextUrl;
			coverPreviewFailed = false;
		}
	}

	$: normalizedCoverImageUrl = normalizeWebImageUrl(form.coverImageUrl);
	$: selectedCategoryMeta = getEventCategoryMeta(form.category);
	$: selectedCategoryIcon = getEventCategoryIcon(selectedCategoryMeta.iconKey);

	async function loadEvent() {
		if (!eventId) return;
		loading = true;
		loadError = '';
		try {
			const stateEvent = $page?.state?.event;
			if (stateEvent && String(stateEvent.id) === String(eventId)) {
				applyEventToForm(stateEvent);
			}

			const res = await adminEventsApi.getEventById(eventId);
			const ev = res?.event || res?.data || res;
			if (ev?.id || ev?.title) applyEventToForm(ev);
		} catch (e) {
			if (!form.title) {
				loadError = e?.message || 'No se pudo cargar el evento para edición.';
			}
		} finally {
			loading = false;
		}
	}

	async function submitEdit() {
		if (submitting || !eventId) return;
		const payload = buildPayload();
		const error = validatePayload(payload);
		if (error) {
			toast.error(error);
			return;
		}

		submitting = true;
		try {
			const res = await adminEventsApi.updateEvent(eventId, payload);
			if (!res?.ok && res?.success === false) {
				throw new Error(res?.message || 'No se pudo actualizar el evento.');
			}
			toast.success(res?.message || 'Evento actualizado correctamente.');
			goto('/admin/events');
		} catch (e) {
			toast.error(e?.message || 'No se pudo actualizar el evento.');
		} finally {
			submitting = false;
		}
	}

	onMount(loadEvent);
</script>

<div class="mx-auto w-full max-w-screen-md px-4 pb-16 pt-6 sm:px-6 lg:px-8">
	<div class="mb-4 flex items-center justify-between">
		<h1 class="text-2xl font-semibold tracking-tight">Editar evento #{eventId}</h1>
		<Button variant="secondary" class="rounded-xl" on:click={() => goto('/admin/events')}>Volver</Button>
	</div>

	{#if loadError}
		<div class="mb-4 text-sm font-semibold text-red-600">{loadError}</div>
	{/if}

	<Card class="rounded-3xl border bg-card text-card-foreground">
		<CardContent class="space-y-4 p-5">
			<div>
				<div class="text-sm font-semibold text-blue-600">Título</div>
				<Input class="mt-2 h-11 rounded-2xl" bind:value={form.title} />
			</div>
			<div>
				<div class="text-sm font-semibold text-blue-600">Descripción</div>
				<Textarea class="mt-2 min-h-[100px] rounded-2xl" bind:value={form.description} />
			</div>

			<div>
				<div class="text-sm font-semibold">URL de imagen</div>
				<Input
					class="mt-2 h-11 rounded-2xl"
					placeholder="https://ejemplo.com/portada.jpg"
					bind:value={form.coverImageUrl}
				/>
				{#if form.coverImageUrl && !normalizedCoverImageUrl}
					<div class="mt-1 text-xs font-semibold text-red-600">Ingresa una URL válida (http/https).</div>
				{/if}
			</div>

			{#if normalizedCoverImageUrl}
				<div class="rounded-2xl border p-3">
					{#if coverPreviewFailed}
						<div class="py-6 text-center text-xs font-semibold text-red-600">No se pudo cargar la imagen con esa URL.</div>
					{:else}
						<img
							src={normalizedCoverImageUrl}
							alt="Preview portada"
							class="h-44 w-full rounded-xl object-cover"
							onerror={() => (coverPreviewFailed = true)}
							onload={() => (coverPreviewFailed = false)}
						/>
					{/if}
				</div>
			{/if}

			<div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
				<div>
					<div class="text-sm font-semibold text-blue-600">Inicio</div>
					<Input class="mt-2 h-11 rounded-2xl" type="datetime-local" bind:value={form.startsAt} />
				</div>
				<div>
					<div class="text-sm font-semibold text-blue-600">Fin</div>
					<Input class="mt-2 h-11 rounded-2xl" type="datetime-local" bind:value={form.endsAt} />
				</div>
			</div>

			<div class="flex items-center justify-between rounded-2xl bg-slate-50 px-4 py-3">
				<div>
					<div class="text-sm font-semibold">Limitar cupo</div>
					<div class="text-xs text-muted-foreground">Si está desactivado, el evento tendrá cupo abierto.</div>
				</div>
				<Switch bind:checked={form.capacityEnabled} />
			</div>

			<div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
				<div>
					<div class="text-sm font-semibold text-blue-600">Horas acreditables</div>
					<Input class="mt-2 h-11 rounded-2xl" type="number" step="0.25" min="0" bind:value={form.hoursValue} />
				</div>
				{#if form.capacityEnabled}
					<div>
						<div class="text-sm font-semibold text-blue-600">Cupo</div>
						<Input class="mt-2 h-11 rounded-2xl" type="number" min="1" bind:value={form.cupo} />
					</div>
				{/if}
			</div>

			

				<div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
					<div>
						<div class="text-sm font-semibold text-blue-600">Estatus</div>
						<select class="mt-2 h-11 w-full rounded-2xl border px-3" bind:value={form.status}>
							{#each statusOptions as status}
								<option value={status.value}>{status.label}</option>
							{/each}
						</select>
					</div>
					<div>
						<div class="text-sm font-semibold text-blue-600">Categoría</div>
						<div class="relative mt-2">
							<span class="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
								<svelte:component this={selectedCategoryIcon} class="h-4 w-4" />
							</span>
							<select class="h-11 w-full rounded-2xl border pl-10 pr-3" bind:value={form.category}>
								{#each categoryOptions as category}
									<option value={category.value}>{category.label}</option>
								{/each}
							</select>
						</div>
					</div>
				</div>

			<div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
				<div>
					<div class="text-sm font-semibold text-blue-600">Modo de registro</div>
					<select class="mt-2 h-11 w-full rounded-2xl border px-3" bind:value={form.registrationMode}>
						{#each registrationModeOptions as mode}
							<option value={mode.value}>{mode.label}</option>
						{/each}
					</select>
				</div>
				<div>
					<div class="text-sm font-semibold text-blue-600">Política de reenvío</div>
					<select class="mt-2 h-11 w-full rounded-2xl border px-3" bind:value={form.resubmissionPolicy}>
						{#each resubmissionPolicyOptions as policy}
							<option value={policy.value}>{policy.label}</option>
						{/each}
					</select>
				</div>
			</div>

			<div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
				<div>
					<div class="text-sm font-semibold text-blue-600">Política de cancelación</div>
					<select class="mt-2 h-11 w-full rounded-2xl border px-3" bind:value={form.cancelPolicy}>
						{#each cancelPolicyOptions as policy}
							<option value={policy.value}>{policy.label}</option>
						{/each}
					</select>
				</div>
				<div>
					<div class="text-sm font-semibold text-blue-600">Fecha/hora límite cancelación</div>
					<Input class="mt-2 h-11 rounded-2xl" type="datetime-local" bind:value={form.cancelDeadline} />
				</div>
			</div>

			<div class="flex items-center justify-between rounded-2xl bg-slate-50 px-4 py-3">
				<div class="text-sm font-semibold">Permitir self check-in</div>
				<Switch bind:checked={form.allowSelfCheckin} />
			</div>

			<div class="flex items-center justify-between rounded-2xl bg-slate-50 px-4 py-3">
				<div class="text-sm font-semibold">Geocerca obligatoria</div>
				<Switch bind:checked={form.geoEnforced} />
			</div>

			{#if form.geoEnforced}
				<div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
					<Input class="h-11 rounded-2xl" type="number" step="0.000001" placeholder="Latitud" bind:value={form.geoCenterLat} />
					<Input class="h-11 rounded-2xl" type="number" step="0.000001" placeholder="Longitud" bind:value={form.geoCenterLng} />
					<Input class="h-11 rounded-2xl" type="number" min="1" placeholder="Radio (m)" bind:value={form.geoRadiusM} />
					<Input class="h-11 rounded-2xl" type="number" min="0" placeholder="Precisión estricta (m)" bind:value={form.geoStrictAccuracyM} />
				</div>
			{/if}

			<!-- Sesiones adicionales temporalmente deshabilitadas.
				La edición enviará una única sesión principal con inicio/fin del evento. -->
			<!--<div class="rounded-2xl border bg-slate-50 px-4 py-3 text-xs text-muted-foreground">
				Este evento usa una sola sesión principal automática.
			</div>-->

			<Button class="h-12 w-full rounded-2xl bg-blue-600 text-white hover:bg-blue-700" on:click={submitEdit} disabled={loading || submitting}>
				{submitting ? 'Guardando cambios...' : 'Guardar cambios'}
			</Button>
		</CardContent>
	</Card>
</div>
