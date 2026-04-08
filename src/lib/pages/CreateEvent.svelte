<script>
	import { onMount } from 'svelte';
	import { tick } from 'svelte';
	import { toast } from 'svelte-sonner';
	import { adminEventsApi, adminStaffUsersApi } from '$lib/services/api';
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
	import { getEventCategoryStyleClasses } from '$lib/stores/eventCategoryStyles';

	import { Card, CardContent } from '$lib/components/ui/card';
	import { Button } from '$lib/components/ui/button';
	import { Badge } from '$lib/components/ui/badge';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { Textarea } from '$lib/components/ui/textarea';
	import { Switch } from '$lib/components/ui/switch';
	import * as ToggleGroup from '$lib/components/ui/toggle-group';
	import * as Dialog from '$lib/components/ui/dialog';

	import {
		ArrowLeft,
		CalendarDays,
		Clock,
		MapPin,
		ImagePlus,
		QrCode,
		Eye,
		EyeOff,
		Download
	} from 'lucide-svelte';

	// -----------------------------
	// State
	// -----------------------------
	let slide = 0; // 0 = editar, 1 = preview
	let submitting = false;
	let fieldErrors = {};
	let formError = '';
	let staffUsers = [];
	let staffUsersLoading = false;
	let staffUsersError = '';
	let staffAssignmentMode = 'existing'; // auto | existing
	let selectedStaffUserId = '';
	let createdStaffDialogOpen = false;
	let createdStaffCredentials = null;
	let showCreatedStaffPassword = false;

	let form = {
		title: '',
		category: 'general',
		description: '',
		date: '',
		time: '',
		endDate: '',
		endTime: '',
		hoursValue: 2,
		capacityEnabled: true,
		cupo: 50,
		location: '',
		organizer: '',
		status: 'draft',
		registrationMode: 'auto',
		resubmissionPolicy: 'only_changes_requested',
		allowSelfCheckin: true,
		geoEnforced: false,
		geoCenterLat: '',
		geoCenterLng: '',
		geoRadiusM: 120,
		geoStrictAccuracyM: '',
		cancelPolicy: 'free_cancel',
		cancelDeadlineDate: '',
		cancelDeadlineTime: '',
		coverImageUrl: ''
	};

	let coverPreviewFailed = false;
	let lastCoverPreviewUrl = '';
	let normalizedCoverImageUrl = '';
	let selectedCategoryMeta = getEventCategoryMeta(form.category);
	let selectedCategoryIcon = getEventCategoryIcon(selectedCategoryMeta.iconKey);

	function getPreviewCategoryMeta(value) {
		return getEventCategoryMeta(value || 'general');
	}

	function getPreviewCategoryClass(value) {
		const meta = getPreviewCategoryMeta(value);
		const style = getEventCategoryStyleClasses(meta.value || 'general');
		return `${style.bgClass} ${style.colorClass}`;
	}

	function getPreviewCategoryIcon(value) {
		const meta = getPreviewCategoryMeta(value);
		return getEventCategoryIcon(meta.iconKey);
	}

	const statusOptions = Object.values(EVENT_STATUS_CATALOG);
	const registrationModeOptions = Object.values(EVENT_REGISTRATION_MODE_CATALOG);
	const resubmissionPolicyOptions = Object.values(EVENT_RESUBMISSION_POLICY_CATALOG);
	const cancelPolicyOptions = Object.values(EVENT_CANCEL_POLICY_CATALOG);

	let contentContainerEl;

	let bulk = {
		mode: false, // si true, confirm crea muchos eventos
		file: null,
		rows: [],
		errors: []
	};

	let csvInputEl; // ref del input file (CSV)

	function goBack() {
		console.log('back');
	}

	function cancel() {
		console.log('cancel');
	}

	function clearForm() {
		fieldErrors = {};
		formError = '';
		staffAssignmentMode = 'existing';
		selectedStaffUserId = '';
		form = {
			title: '',
			category: 'general',
			description: '',
			date: '',
			time: '',
			endDate: '',
			endTime: '',
			hoursValue: 2,
			capacityEnabled: true,
			cupo: 50,
			location: '',
			organizer: '',
			status: 'draft',
			registrationMode: 'auto',
			resubmissionPolicy: 'only_changes_requested',
			allowSelfCheckin: true,
			geoEnforced: false,
			geoCenterLat: '',
			geoCenterLng: '',
			geoRadiusM: 120,
			geoStrictAccuracyM: '',
			cancelPolicy: 'free_cancel',
			cancelDeadlineDate: '',
			cancelDeadlineTime: '',
			coverImageUrl: ''
		};
		coverPreviewFailed = false;
		lastCoverPreviewUrl = '';
	}

	function normalizeStaffUserId(value) {
		if (value === undefined || value === null || value === '') return '';
		const n = Number(value);
		if (!Number.isInteger(n) || n <= 0) return '';
		return String(n);
	}

	function resolveEventStaffUserId(eventData) {
		return normalizeStaffUserId(
			eventData?.staff_user_id ??
				eventData?.staff?.id ??
				eventData?.staff_user?.id ??
				eventData?.attributes?.staff_user_id ??
				eventData?.meta?.staff_user_id
		);
	}

	function resolveEventIdFromResponse(response) {
		return (
			response?.event?.id ??
			response?.data?.event?.id ??
			response?.id ??
			response?.event_id ??
			null
		);
	}

	function extractCreatedStaffCredentials(response) {
		const candidates = [
			response?.staff,
			response?.staff_user,
			response?.created_staff,
			response?.generated_staff,
			response?.staff_credentials,
			response?.credentials?.staff,
			response?.event?.staff,
			response?.event?.staff_user,
			response?.event?.staff_credentials,
			response?.event?.attributes?.staff,
			response?.event?.attributes?.staff_credentials,
			response?.data?.staff,
			response?.data?.staff_user
		];

		const raw = candidates.find((candidate) => candidate && typeof candidate === 'object');
		const fallbackRaw = {
			email:
				response?.staff_email ??
				response?.staffEmail ??
				response?.generated_staff_email ??
				response?.event?.staff_email ??
				response?.event?.staffEmail ??
				response?.data?.staff_email ??
				response?.data?.staffEmail,
			password:
				response?.staff_password ??
				response?.staffPassword ??
				response?.generated_staff_password ??
				response?.event?.staff_password ??
				response?.event?.staffPassword ??
					response?.data?.staff_password ??
					response?.data?.staffPassword
		};
		const sources = [
			raw,
			fallbackRaw,
			response?.staff_credentials,
			response,
			response?.event,
			response?.data
		].filter((item) => item && typeof item === 'object');

		const pickFirstValue = (keys) => {
			for (const source of sources) {
				for (const key of keys) {
					const value = source?.[key];
					if (value === undefined || value === null) continue;
					const normalized = String(value).trim();
					if (normalized) return normalized;
				}
			}
			return '';
		};

		const email = pickFirstValue(['email', 'username', 'user', 'login', 'correo']);
		const password = pickFirstValue([
			'password',
			'temp_password',
			'temporary_password',
			'plain_password',
			'generated_password',
			'contrasena',
			'contraseña',
			'staff_password',
			'staffPassword'
		]);

		if (!email && !password) return null;
		return { email, password };
	}

	function extractCreatedStaffUserId(response) {
		return normalizeStaffUserId(
			response?.staff_user?.id ??
				response?.staff?.id ??
				response?.event?.staff_user?.id ??
				response?.event?.staff?.id ??
				response?.created_staff?.id ??
				response?.generated_staff?.id ??
				response?.data?.staff_user?.id ??
				response?.data?.staff?.id ??
				response?.staff_user_id ??
				response?.event?.staff_user_id ??
				response?.event?.attributes?.staff_user_id
		);
	}

	function formatStaffOptionLabel(staff) {
		const eventsCount = Array.isArray(staff?.events) ? staff.events.length : 0;
		if (eventsCount > 0) {
			return `${staff?.email || `Staff #${staff?.id}`} (${eventsCount} evento${eventsCount > 1 ? 's' : ''})`;
		}
		return staff?.email || `Staff #${staff?.id}`;
	}

	function downloadCreatedStaffCredentialsTxt() {
		const email = String(createdStaffCredentials?.email || '').trim() || 'No disponible';
		const password = String(createdStaffCredentials?.password || '').trim() || 'No disponible';
		const content = [
			'Credenciales staff del evento',
			`Fecha: ${new Date().toLocaleString('es-MX')}`,
			'',
			`Correo: ${email}`,
			`Contrasena: ${password}`
		].join('\n');

		const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
		const url = URL.createObjectURL(blob);
		const anchor = document.createElement('a');
		anchor.href = url;
		anchor.download = `staff-credenciales-${Date.now()}.txt`;
		anchor.click();
		URL.revokeObjectURL(url);
	}

	async function loadStaffUsers() {
		staffUsersLoading = true;
		staffUsersError = '';
		try {
			const res = await adminStaffUsersApi.list();
			staffUsers = Array.isArray(res?.staff_users) ? res.staff_users : [];
		} catch (e) {
			staffUsers = [];
			staffUsersError = e?.message || 'No se pudo cargar la lista de usuarios staff.';
		} finally {
			staffUsersLoading = false;
		}
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

	function cancelCsvMode() {
		bulk = { mode: false, file: null, rows: [], errors: [] };
		// Permite re-seleccionar el mismo archivo (muchos browsers no disparan change si es el mismo)
		if (csvInputEl) csvInputEl.value = '';
        //regresar a la slide incial
        slide = 0;
		fieldErrors = {};
		formError = '';
	}

	function getCatalogLabel(catalog, key, fallback = key) {
		return catalog?.[key]?.label || fallback;
	}

	function getCancelPolicyMeta(policy) {
		return (
			EVENT_CANCEL_POLICY_CATALOG?.[policy] || {
				value: policy,
				label: policy,
				backendValue: policy,
				requiresDeadline: false
			}
		);
	}

	function resolveCancelPolicyForPayload(policy) {
		const meta = getCancelPolicyMeta(policy);
		return meta.backendValue || meta.value || policy;
	}

	async function toPreview() {
		if (bulk.mode) {
			fieldErrors = {};
			formError = '';
			if (!bulk.rows.length) {
				formError = 'Tu CSV no tiene filas válidas para previsualizar.';
				return;
			}
			if (bulk.errors.length) {
				formError = 'Corrige los errores del CSV antes de continuar.';
				return;
			}
		} else {
			const validation = validateManualForm();
			fieldErrors = validation.fieldErrors;
			formError = validation.message;
			if (!validation.ok) return;
		}

		slide = 1;
		await tick();
		contentContainerEl?.scrollTo?.({ top: 0, behavior: 'smooth' });
		window.scrollTo({ top: 0, behavior: 'smooth' });
	}

	function toEdit() {
		slide = 0;
	}

	function confirm() {
		if (submitting) return;
		if (bulk.mode && bulk.rows.length) {
			createBulkEvents();
			return;
		}

		createSingleEvent();
	}

	function toIsoFromDateTime(date, time) {
		if (!date || !time) return null;
		const dt = new Date(`${date}T${time}:00`);
		if (Number.isNaN(dt.getTime())) return null;
		return dt.toISOString();
	}

	function addHoursToIso(iso, hours = 2) {
		const base = new Date(iso);
		if (Number.isNaN(base.getTime())) return null;
		base.setHours(base.getHours() + hours);
		return base.toISOString();
	}

	function buildSingleSession(startsAt, endsAt, hoursValue) {
		if (startsAt && endsAt) {
			return [
				{
					starts_at: startsAt,
					ends_at: endsAt,
					label: 'Sesión principal',
					hours_value: Number(hoursValue) || 0
				}
			];
		}

		return [];
	}

	function buildSingleEventPayload() {
		const startsAt = toIsoFromDateTime(form.date, form.time);
		const endsAt =
			toIsoFromDateTime(form.endDate, form.endTime) ||
			(startsAt ? addHoursToIso(startsAt, Number(form.hoursValue) || 2) : null);
		const cancelDeadline = toIsoFromDateTime(form.cancelDeadlineDate, form.cancelDeadlineTime);
		const selectedExistingStaffId = normalizeStaffUserId(selectedStaffUserId);
		const geo =
			form.geoEnforced && form.geoCenterLat !== '' && form.geoCenterLng !== ''
				? {
					center_lat: Number(form.geoCenterLat),
					center_lng: Number(form.geoCenterLng),
					radius_m: Number(form.geoRadiusM) || 120,
					strict_accuracy_m:
						form.geoStrictAccuracyM === '' ? null : Number(form.geoStrictAccuracyM)
				}
				: null;

		return {
			title: form.title?.trim(),
			description: form.description?.trim() || null,
			category: form.category,
			location: form.location?.trim() || null,
			organizer: form.organizer?.trim() || null,
			starts_at: startsAt,
			ends_at: endsAt,
			hours_value: Number(form.hoursValue) || 0,
			capacity_enabled: Boolean(form.capacityEnabled),
			capacity: form.capacityEnabled ? (form.cupo === '' ? null : Number(form.cupo)) : null,
			status: form.status,
			registration_mode: form.registrationMode,
			resubmission_policy: form.resubmissionPolicy,
			allow_self_checkin: Boolean(form.allowSelfCheckin),
			geo_enforced: Boolean(form.geoEnforced),
			cancel_policy: resolveCancelPolicyForPayload(form.cancelPolicy),
			cancel_deadline: getCancelPolicyMeta(form.cancelPolicy).requiresDeadline
				? cancelDeadline
				: cancelDeadline,
			geo,
			sessions: buildSingleSession(startsAt, endsAt, form.hoursValue),
			attributes: {
				location: form.location?.trim() || null,
				organizer: form.organizer?.trim() || null,
				cover_image_url: normalizedCoverImageUrl || null,
				...(staffAssignmentMode === 'existing' && selectedExistingStaffId
					? {
						staff_user_id: Number(selectedExistingStaffId)
					}
					: {})
			},
			...(staffAssignmentMode === 'existing' && selectedExistingStaffId
				? {
					assign_staff: true,
					staff_user_id: Number(selectedExistingStaffId)
				}
				: {})
		};
	}

	function buildCsvEventPayload(row) {
		const startsAt = toIsoFromDateTime(row.date, row.time);
		const endsAt =
			toIsoFromDateTime(row.endDate, row.endTime) ||
			(startsAt ? addHoursToIso(startsAt, Number(row.hoursValue) || 2) : null);
		const cancelDeadline = toIsoFromDateTime(row.cancelDeadlineDate, row.cancelDeadlineTime);
		const geo =
			row.geoEnforced && row.geoCenterLat !== '' && row.geoCenterLng !== ''
				? {
					center_lat: Number(row.geoCenterLat),
					center_lng: Number(row.geoCenterLng),
					radius_m: Number(row.geoRadiusM) || 120,
					strict_accuracy_m:
						row.geoStrictAccuracyM === '' ? null : Number(row.geoStrictAccuracyM)
				}
				: null;

		return {
			title: row.title?.trim(),
			description: row.description?.trim() || null,
			category: row.category,
			location: row.location?.trim() || null,
			organizer: row.organizer?.trim() || null,
			starts_at: startsAt,
			ends_at: endsAt,
			hours_value: Number(row.hoursValue) || 0,
			capacity_enabled: Boolean(row.capacityEnabled),
			capacity: row.capacityEnabled ? (row.cupo === '' ? null : Number(row.cupo)) : null,
			status: row.status || 'draft',
			registration_mode: row.registrationMode || 'auto',
			resubmission_policy: row.resubmissionPolicy || 'only_changes_requested',
			allow_self_checkin: Boolean(row.allowSelfCheckin),
			geo_enforced: Boolean(row.geoEnforced),
			cancel_policy: resolveCancelPolicyForPayload(row.cancelPolicy || 'free_cancel'),
			cancel_deadline: getCancelPolicyMeta(row.cancelPolicy || 'free_cancel').requiresDeadline
				? cancelDeadline
				: cancelDeadline,
			geo,
			sessions: buildSingleSession(startsAt, endsAt, row.hoursValue),
			attributes: {
				location: row.location?.trim() || null,
				organizer: row.organizer?.trim() || null
			}
		};
	}

	function validatePayload(payload) {
		const payloadLocation = payload?.location || payload?.attributes?.location;
		const payloadOrganizer = payload?.organizer || payload?.attributes?.organizer;
		if (!payload?.title || !payload?.starts_at || !payload?.ends_at) {
			return 'Título, fecha y hora son requeridos.';
		}
		if (!payloadLocation?.trim?.()) {
			return 'La ubicación es obligatoria.';
		}
		if (!payloadOrganizer?.trim?.()) {
			return 'El organizador es obligatorio.';
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
			return 'Si activas geocerca, debes capturar latitud/longitud.';
		}
		if (
			getCancelPolicyMeta(form.cancelPolicy).requiresDeadline &&
			(!form.cancelDeadlineDate || !form.cancelDeadlineTime)
		) {
			return 'Debes seleccionar fecha y hora límite para esta política de cancelación.';
		}
		return '';
	}

	function validateManualForm() {
		const errors = {};

		if (!form.title?.trim()) errors.title = 'Campo obligatorio';
		if (!form.date) errors.date = 'Campo obligatorio';
		if (!form.time) errors.time = 'Campo obligatorio';
		if (!form.location?.trim()) errors.location = 'Campo obligatorio';
		if (!form.organizer?.trim()) errors.organizer = 'Campo obligatorio';

		if (getCancelPolicyMeta(form.cancelPolicy).requiresDeadline) {
			if (!form.cancelDeadlineDate) errors.cancelDeadlineDate = 'Campo obligatorio';
			if (!form.cancelDeadlineTime) errors.cancelDeadlineTime = 'Campo obligatorio';
		}

		if (form.geoEnforced) {
			if (form.geoCenterLat === '') errors.geoCenterLat = 'Campo obligatorio';
			if (form.geoCenterLng === '') errors.geoCenterLng = 'Campo obligatorio';
		}

		if (staffAssignmentMode === 'existing' && !normalizeStaffUserId(selectedStaffUserId)) {
			errors.staffUserId = 'Selecciona un usuario staff existente';
		}

		const payload = buildSingleEventPayload();
		const payloadError = validatePayload(payload);
		if (payloadError) errors._payload = payloadError;

		return {
			ok: Object.keys(errors).length === 0,
			fieldErrors: errors,
			message:
				Object.keys(errors).length > 0
					? errors._payload || 'Completa los campos marcados en rojo.'
					: ''
		};
	}

	async function createSingleEvent() {
		const validation = validateManualForm();
		fieldErrors = validation.fieldErrors;
		formError = validation.message;
		if (!validation.ok) return;

		const payload = buildSingleEventPayload();
		const invalidMessage = validatePayload(payload);
		if (invalidMessage) {
			formError = invalidMessage;
			return;
		}

		submitting = true;
		try {
			const res = await adminEventsApi.createEvent(payload);
			if (!res?.ok && res?.success === false) {
				throw new Error(res?.message || 'No se pudo crear el evento.');
			}

			if (staffAssignmentMode === 'auto') {
				const createdEventId = resolveEventIdFromResponse(res);
				const createdStaffUserId = extractCreatedStaffUserId(res);
				const alreadyAssignedStaffId = resolveEventStaffUserId(res?.event || res?.data?.event || res);

				if (createdEventId && createdStaffUserId && alreadyAssignedStaffId !== createdStaffUserId) {
					try {
						await adminEventsApi.updateEvent(createdEventId, {
							assign_staff: true,
							staff_user_id: Number(createdStaffUserId)
						});
					} catch (assignError) {
						console.error('No se pudo vincular automáticamente el staff al evento:', assignError);
						toast.warning(
							'El evento se creó, pero no se pudo confirmar la asignación automática del staff.'
						);
					}
				}
			}

			const createdStaff = extractCreatedStaffCredentials(res);
			if (staffAssignmentMode === 'auto') {
				createdStaffCredentials = createdStaff || { email: '', password: '' };
				showCreatedStaffPassword = false;
				createdStaffDialogOpen = true;
			} else {
				toast.success(res?.message || `Evento "${payload.title}" creado correctamente.`);
			}

			clearForm();
			slide = 0;
			await loadStaffUsers();
		} catch (e) {
			toast.error(e?.message || 'No se pudo crear el evento.');
		} finally {
			submitting = false;
		}
	}

	async function createBulkEvents() {
		if (!bulk.rows.length) return;

		submitting = true;
		let okCount = 0;
		let failCount = 0;

		for (const row of bulk.rows) {
			const payload = buildCsvEventPayload(row);
			const invalidMessage = validatePayload(payload);
			if (invalidMessage) {
				failCount += 1;
				continue;
			}

			try {
				await adminEventsApi.createEvent(payload);
				okCount += 1;
			} catch {
				failCount += 1;
			}
		}

		if (okCount > 0) {
			toast.success(`Eventos creados: ${okCount}`);
		}
		if (failCount > 0) {
			toast.error(`Eventos con error: ${failCount}`);
		}

		if (okCount > 0 && failCount === 0) {
			cancelCsvMode();
		}

		submitting = false;
	}

	$: {
		const nextUrl = String(form.coverImageUrl || '').trim();
		if (nextUrl !== lastCoverPreviewUrl) {
			lastCoverPreviewUrl = nextUrl;
			coverPreviewFailed = false;
		}
	}

	$: normalizedCoverImageUrl = normalizeWebImageUrl(form.coverImageUrl);
	$: if (!createdStaffDialogOpen) {
		showCreatedStaffPassword = false;
	}

	// -----------------------------
	// CSV helpers (sin dependencias)
	// -----------------------------
	function parseCsv(text) {
		// Soporta comas, saltos de línea y comillas dobles.
		// No busca ser un parser perfecto, pero cubre el 95% de casos comunes.
		const rows = [];
		let row = [];
		let cur = '';
		let inQuotes = false;

		for (let i = 0; i < text.length; i++) {
			const ch = text[i];
			const next = text[i + 1];

			if (ch === '"') {
				if (inQuotes && next === '"') {
					cur += '"';
					i++;
				} else {
					inQuotes = !inQuotes;
				}
				continue;
			}

			if (!inQuotes && (ch === ',' || ch === '\n' || ch === '\r')) {
				if (ch === ',') {
					row.push(cur);
					cur = '';
					continue;
				}

				// new line (handle \r\n)
				if (ch === '\r' && next === '\n') i++;
				row.push(cur);
				cur = '';

				// ignora líneas totalmente vacías
				if (row.some((c) => (c ?? '').trim() !== '')) rows.push(row);
				row = [];
				continue;
			}

			cur += ch;
		}

		// flush
		row.push(cur);
		if (row.some((c) => (c ?? '').trim() !== '')) rows.push(row);

		return rows;
	}

	function parseBool(v, fallback = true) {
		const s = String(v ?? '').trim().toLowerCase();
		if (!s) return fallback;
		return ['1', 'true', 'si', 'sí', 'yes', 'y'].includes(s);
	}

	function parseNumber(v, fallback = 0) {
		const n = Number(v);
		return Number.isFinite(n) ? n : fallback;
	}

	function validateRow(obj, index) {
		const errs = [];
		if (!obj.title) errs.push('Falta title');
		if (!obj.date) errs.push('Falta date (YYYY-MM-DD)');
		if (!obj.time) errs.push('Falta time (HH:MM)');
		if (!obj.location) errs.push('Falta location');
		if (!obj.organizer) errs.push('Falta organizer');
		return errs.length ? { index, errs } : null;
	}

	async function onPickCsv(e) {
		const input = e?.currentTarget;
		const file = input?.files?.[0] ?? null;
		bulk.file = file;
		bulk.rows = [];
		bulk.errors = [];

		if (!file) return;

		const text = await file.text();
		const table = parseCsv(text);
		if (!table.length) {
			bulk.errors = [{ index: 0, errs: ['CSV vacío o inválido'] }];
			bulk.mode = false;
			return;
		}

		// headers
		const headers = table[0].map((h) => String(h ?? '').trim().toLowerCase());
		const required = ['title', 'date', 'time'];
		for (const reqHeader of required) {
			if (!headers.includes(reqHeader)) {
				bulk.errors = [{ index: 0, errs: [`Falta columna obligatoria: ${reqHeader}`] }];
				bulk.mode = false;
				if (input) input.value = '';
				return;
			}
		}

		const rows = [];
		const errors = [];

		for (let i = 1; i < table.length; i++) {
			const line = table[i];
			const obj = {};
			for (let c = 0; c < headers.length; c++) {
				obj[headers[c]] = (line[c] ?? '').trim();
			}

			const mapped = {
				title: obj.title || '',
				category: normalizeEventCategory(obj.category, 'general'),
				description: obj.description || '',
				date: obj.date || '',
				time: obj.time || '',
				endDate: obj.end_date || '',
				endTime: obj.end_time || '',
				hoursValue: parseNumber(obj.hours_value, 2),
				capacityEnabled: parseBool(obj.capacity_enabled, true),
				cupo: obj.capacity || obj.cupo || '',
				location: obj.location || '',
				organizer: obj.organizer || '',
				status: obj.status || 'draft',
				registrationMode: obj.registration_mode || 'auto',
				resubmissionPolicy: obj.resubmission_policy || 'only_changes_requested',
				allowSelfCheckin: parseBool(obj.allow_self_checkin, true),
				geoEnforced: parseBool(obj.geo_enforced, false),
				geoCenterLat: obj.geo_center_lat || '',
				geoCenterLng: obj.geo_center_lng || '',
				geoRadiusM: parseNumber(obj.geo_radius_m, 120),
				geoStrictAccuracyM: obj.geo_strict_accuracy_m || '',
				cancelPolicy: obj.cancel_policy || 'free_cancel',
				cancelDeadlineDate: obj.cancel_deadline_date || '',
				cancelDeadlineTime: obj.cancel_deadline_time || ''
			};

			const err = validateRow(mapped, i);
			if (err) errors.push(err);
			else rows.push(mapped);
		}

		bulk.rows = rows;
		bulk.errors = errors;
		bulk.mode = rows.length > 0;

		// limpiar el input DESPUÉS de leer, para permitir re-selección del mismo archivo
		if (input) input.value = '';
	}

	function downloadCsvTemplate() {
		const content =
			'title,category,description,date,time,end_date,end_time,hours_value,capacity_enabled,capacity,location,organizer,status,registration_mode,resubmission_policy,allow_self_checkin,geo_enforced,geo_center_lat,geo_center_lng,geo_radius_m,geo_strict_accuracy_m,cancel_policy,cancel_deadline_date,cancel_deadline_time\n' +
			'"Semana de la Ingeniería",general,"Evento de conferencias",2026-03-10,10:00,2026-03-10,12:00,2,true,120,"Auditorio Principal","Coordinación Académica",published,auto,only_changes_requested,true,false,,,,120,,free_cancel,,\n' +
			'"Charla de Innovación",emprendimiento,"Invitados externos",2026-03-12,14:00,2026-03-12,16:00,2,false,,"Sala 2","Dirección de Vinculación",draft,manual_review,allowed,true,true,19.432608,-99.133209,120,40,locked,2026-03-11,18:00\n';

		const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = 'eventos-template.csv';
		a.click();
		URL.revokeObjectURL(url);
	}

	const cardShadow =
		'shadow-[inset_0_1px_0_rgba(255,255,255,0.7),0_1px_2px_rgba(0,0,0,0.06)]';

	onMount(() => {
		loadStaffUsers();
	});

	$: selectedCategoryMeta = getEventCategoryMeta(form.category);
	$: selectedCategoryIcon = getEventCategoryIcon(selectedCategoryMeta.iconKey);
	$: cancelPolicyMeta = getCancelPolicyMeta(form.cancelPolicy);
</script>

<div class="min-h-screen bg-background">
	<!-- Top bar -->
	<div class="sticky top-0 z-20 border-b bg-background/80 backdrop-blur">
		<div class="mx-auto w-full max-w-screen-md px-4 py-4 sm:px-6 lg:px-8">
			<div class="relative flex items-center w-full justify-between">
				{#if slide !== 0}
					<Button variant="ghost" size="icon" class="rounded-full" aria-label="Volver" onclick={toEdit}>
						<ArrowLeft class="h-6 w-6" />
					</Button>
				{:else}
					<div></div>
				{/if}

				<h1 class="text-base font-semibold tracking-tight">Crear Evento</h1>

				{#if slide === 0}
					<Button variant="ghost" size="sm" class="rounded-full" aria-label="Limpiar campos" onclick={clearForm}>
						Limpiar
					</Button>
				{:else}
					<div></div>
				{/if}
			</div>

			<!-- Dots (2 slides) -->
			<div class="mt-3">
				<div class="flex items-center justify-center gap-2">
					<div class={`h-2 w-8 rounded-full ${slide === 0 ? 'bg-blue-600' : 'bg-slate-200'}`}></div>
					<div class={`h-2 w-8 rounded-full ${slide === 1 ? 'bg-blue-600' : 'bg-slate-200'}`}></div>
				</div>
				<div class="mt-2 text-center text-sm text-muted-foreground">{slide === 0 ? 'Edición' : 'Preview'}</div>
			</div>
		</div>
	</div>

	<!-- Content -->
	<main bind:this={contentContainerEl} class="mx-auto w-full max-w-screen-md px-4 pb-10 pt-6 sm:px-6 lg:px-8">
		<!-- Carousel -->
		<div class="overflow-hidden">
			<div
				class="flex w-full transition-transform duration-300 ease-out"
				style={`transform: translateX(-${slide * 100}%);`}
			>
				<!-- Slide 1: Editar -->
				<section class="w-full flex-none space-y-6 overflow-x-hidden">
					<!-- CSV Import (opcional) -->
					<Card class={`rounded-3xl border bg-card text-card-foreground ${cardShadow}`}>
						<CardContent class="p-5">
							<div class="flex items-start justify-between gap-4">
								<div>
									<div class="text-[14px] font-extrabold text-foreground">Crear desde CSV</div>
									<div class="mt-1 text-sm text-muted-foreground">
										Sube un CSV y creamos eventos automáticamente.
									</div>
								</div>
								<div class="flex items-center gap-3">
									{#if bulk.file}
										<button
											type="button"
											class="text-sm font-semibold text-slate-600 hover:text-slate-800"
											onclick={cancelCsvMode}
										>
											Cancelar
										</button>
									{/if}
									<Badge class={`rounded-full ${bulk.mode ? 'bg-blue-50 text-blue-700 hover:bg-blue-50' : 'bg-slate-100 text-slate-700 hover:bg-slate-100'}`}>
										{bulk.mode ? 'Modo CSV' : 'Manual'}
									</Badge>
									<button
										type="button"
										class="text-sm font-semibold text-blue-600 hover:text-blue-700"
										onclick={downloadCsvTemplate}
									>
										Descargar template
									</button>
								</div>
							</div>

							<label
								class="mt-4 flex cursor-pointer items-center justify-between gap-4 rounded-2xl border border-dashed border-border/70 bg-slate-50 px-4 py-4 hover:bg-slate-100/40"
							>
								<input
								class="hidden"
								type="file"
								accept=".csv,text/csv"
								bind:this={csvInputEl}
								onchange={onPickCsv}
							/>
								<div class="min-w-0">
									<div class="text-sm font-semibold">Toca para subir CSV</div>
									<div class="mt-1 text-xs text-muted-foreground">
										Columnas base: title, date (YYYY-MM-DD), time (HH:MM). Incluye las demás opcionales en el template.
									</div>
								</div>
								<div class="flex items-center gap-2">
									<div class="flex h-10 w-10 items-center justify-center rounded-2xl bg-blue-50">
										<QrCode class="h-5 w-5 text-blue-600" />
									</div>
									<span class="text-xs font-semibold text-muted-foreground">CSV</span>
								</div>
							</label>

							{#if bulk.file}
								<div class="mt-4 rounded-2xl bg-slate-50 p-4">
									<div class="flex items-center justify-between gap-3">
										<div class="min-w-0">
											<div class="truncate text-sm font-semibold">{bulk.file.name}</div>
											<div class="mt-1 text-xs text-muted-foreground">
												Válidos: <span class="font-semibold">{bulk.rows.length}</span> • Errores:{' '}
												<span class="font-semibold">{bulk.errors.length}</span>
											</div>
										</div>
										{#if bulk.mode}
											<Badge class="rounded-full bg-blue-50 text-blue-700 hover:bg-blue-50">Listo</Badge>
										{:else}
											<Badge class="rounded-full bg-slate-100 text-slate-700 hover:bg-slate-100">Revisar</Badge>
										{/if}
									</div>

									{#if bulk.errors.length}
										<div class="mt-3 space-y-2">
											<div class="text-xs font-semibold text-destructive">Errores (primeros 3)</div>
											{#each bulk.errors.slice(0, 3) as err (err.index)}
												<div class="text-xs text-muted-foreground">
													Línea {err.index}: {err.errs.join(', ')}
												</div>
											{/each}
										</div>
									{/if}
								</div>
							{/if}
					</CardContent>
					</Card>

					<!-- Manual form: solo si NO está en modo CSV -->
					{#if !bulk.mode}
						<h2 class="text-[22px] font-extrabold tracking-tight text-foreground">Detalles Básicos</h2>

						<Card class={`rounded-3xl border bg-card text-card-foreground ${cardShadow}`}>
							<CardContent class="p-5">
								<div class="space-y-5">
									<div>
										<div class={`text-sm font-semibold ${fieldErrors.title ? 'text-red-600' : 'text-blue-600'}`}>Título del Evento</div>
										<Input
											class="mt-2 h-12 rounded-2xl"
											placeholder="Ej. Semana de la Ingeniería"
											bind:value={form.title}
										/>
										{#if fieldErrors.title}<div class="mt-1 text-xs text-red-600">{fieldErrors.title}</div>{/if}
									</div>

									<div>
										<div class="text-sm font-semibold text-blue-600">Categoría</div>
										<div class="relative mt-2">
											<span class="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
												<svelte:component this={selectedCategoryIcon} class="h-4 w-4" />
											</span>
											<select class="h-12 w-full rounded-2xl border pl-10 pr-3" bind:value={form.category}>
												{#each EVENT_CATEGORY_OPTIONS as categoryOption (categoryOption.value)}
													<option value={categoryOption.value}>{categoryOption.label}</option>
												{/each}
											</select>
										</div>
									</div>

									<div>
										<div class="text-sm font-semibold text-blue-600">Descripción</div>
										<Textarea
											class="mt-2 min-h-[120px] rounded-2xl"
											placeholder="Describe los objetivos y detalles del evento…"
											bind:value={form.description}
										/>
									</div>
								</div>
							</CardContent>
						</Card>

						<h2 class="text-[22px] font-extrabold tracking-tight text-foreground">Fecha y Lugar</h2>
						<Card class={`rounded-3xl border bg-card text-card-foreground ${cardShadow}`}>
							<CardContent class="p-5">
								<div class="grid w-full grid-cols-1 gap-4 sm:grid-cols-2 overflow-hidden">
									<div>
										<div class={`text-sm font-semibold ${fieldErrors.date ? 'text-red-600' : 'text-blue-600'}`}>Fecha</div>
										<div class="relative mt-2 w-full min-w-0">
											<Input type="date" class="h-12 w-full min-w-0 max-w-full rounded-2xl pr-10" bind:value={form.date} />
											<span class="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">
												<CalendarDays class="h-4 w-4" />
											</span>
										</div>
										{#if fieldErrors.date}<div class="mt-1 text-xs text-red-600">{fieldErrors.date}</div>{/if}
									</div>

									<div>
										<div class={`text-sm font-semibold ${fieldErrors.time ? 'text-red-600' : 'text-blue-600'}`}>Hora</div>
										<div class="relative mt-2 w-full min-w-0">
											<Input type="time" class="h-12 w-full min-w-0 max-w-full rounded-2xl pr-10" bind:value={form.time} />
											<span class="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">
												<Clock class="h-4 w-4" />
											</span>
										</div>
										{#if fieldErrors.time}<div class="mt-1 text-xs text-red-600">{fieldErrors.time}</div>{/if}
									</div>

									<div>
										<div class="text-sm font-semibold text-blue-600">Fecha fin</div>
										<div class="relative mt-2 w-full min-w-0">
											<Input type="date" class="h-12 w-full min-w-0 max-w-full rounded-2xl pr-10" bind:value={form.endDate} />
											<span class="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">
												<CalendarDays class="h-4 w-4" />
											</span>
										</div>
									</div>

									<div>
										<div class="text-sm font-semibold text-blue-600">Hora fin</div>
										<div class="relative mt-2 w-full min-w-0">
											<Input type="time" class="h-12 w-full min-w-0 max-w-full rounded-2xl pr-10" bind:value={form.endTime} />
											<span class="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">
												<Clock class="h-4 w-4" />
											</span>
										</div>
									</div>
								</div>

								<div class="mt-5">
									<div class={`text-sm font-semibold ${fieldErrors.location ? 'text-red-600' : 'text-blue-600'}`}>Ubicación</div>
									<div class="relative mt-2">
										<Input
											class="h-12 rounded-2xl pl-10"
											placeholder="Auditorio Principal o URL"
											bind:value={form.location}
										/>
										<span class="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
											<MapPin class="h-4 w-4" />
										</span>
									</div>
									{#if fieldErrors.location}<div class="mt-1 text-xs text-red-600">{fieldErrors.location}</div>{/if}
								</div>

								<div class="mt-4">
									<div class={`text-sm font-semibold ${fieldErrors.organizer ? 'text-red-600' : 'text-blue-600'}`}>Organizador</div>
									<Input
										class="mt-2 h-12 rounded-2xl"
										placeholder="Ej. Coordinación Académica"
										bind:value={form.organizer}
									/>
									{#if fieldErrors.organizer}<div class="mt-1 text-xs text-red-600">{fieldErrors.organizer}</div>{/if}
								</div>

								<div class="mt-4 space-y-3 rounded-2xl border bg-slate-50/60 p-4">
									<div class="text-sm font-semibold text-blue-600">Asignación de staff</div>
									<ToggleGroup.Root
										type="single"
										value={staffAssignmentMode}
										onValueChange={(value) => {
											staffAssignmentMode = value || 'auto';
											fieldErrors = { ...fieldErrors, staffUserId: undefined };
										}}
									>
										<ToggleGroup.Item
											value="auto"
											class="rounded-2xl px-4 py-2 data-[state=on]:bg-blue-600 data-[state=on]:text-white"
										>
											<span class="text-sm font-semibold">Crear staff automático</span>
										</ToggleGroup.Item>
										<ToggleGroup.Item
											value="existing"
											class="rounded-2xl px-4 py-2 data-[state=on]:bg-blue-600 data-[state=on]:text-white"
										>
											<span class="text-sm font-semibold">Seleccionar staff existente</span>
										</ToggleGroup.Item>
									</ToggleGroup.Root>

									{#if staffAssignmentMode === 'existing'}
										<div class="space-y-2">
											<div class={`text-sm font-semibold ${fieldErrors.staffUserId ? 'text-red-600' : 'text-blue-600'}`}>
												Usuario staff
											</div>
											<select
												class="h-12 w-full rounded-2xl border px-3"
												bind:value={selectedStaffUserId}
												disabled={staffUsersLoading}
											>
												<option value="">Selecciona un usuario staff</option>
												{#each staffUsers as staff (staff.id)}
													<option value={staff.id}>{formatStaffOptionLabel(staff)}</option>
												{/each}
											</select>
											{#if staffUsersLoading}
												<div class="text-xs text-muted-foreground">Cargando usuarios staff...</div>
											{/if}
											{#if !staffUsersLoading && !staffUsers.length}
												<div class="text-xs text-muted-foreground">
													No hay usuarios staff disponibles.
												</div>
											{/if}
											{#if staffUsersError}
												<div class="text-xs font-semibold text-red-600">{staffUsersError}</div>
												<Button variant="outline" class="h-9 rounded-xl" onclick={loadStaffUsers}>
													Reintentar carga de staff
												</Button>
											{/if}
											{#if fieldErrors.staffUserId}
												<div class="text-xs text-red-600">{fieldErrors.staffUserId}</div>
											{/if}
										</div>
									{:else}
										<div class="text-xs text-muted-foreground">
											Se generará automáticamente una cuenta staff al crear este evento.
										</div>
									{/if}
								</div>

								<div class="mt-4 flex items-center justify-between rounded-2xl bg-slate-50 px-4 py-3">
									<div class="flex items-center gap-3">
										<div class="flex h-10 w-10 items-center justify-center rounded-2xl bg-blue-50">
											<QrCode class="h-5 w-5 text-blue-600" />
										</div>
										<div class="min-w-0">
											<div class="text-sm font-semibold">Self check-in</div>
											<div class="text-xs text-muted-foreground">Permite auto check-in del usuario</div>
										</div>
									</div>
									<Switch bind:checked={form.allowSelfCheckin} />
								</div>

								<div class="mt-4 flex items-center justify-between rounded-2xl bg-slate-50 px-4 py-3">
									<div>
										<div class="text-sm font-semibold">Limitar cupo</div>
										<div class="text-xs text-muted-foreground">Si está desactivado, el evento será de cupo abierto.</div>
									</div>
									<Switch bind:checked={form.capacityEnabled} />
								</div>

								<div class="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
									<div>
										<div class="text-sm font-semibold text-blue-600">Horas acreditables</div>
										<Input class="mt-2 h-12 rounded-2xl" type="number" min="0" step="0.5" bind:value={form.hoursValue} />
									</div>
									<div>
										<div class="text-sm font-semibold text-blue-600">Estatus</div>
										<select class="mt-2 h-12 w-full rounded-2xl border px-3" bind:value={form.status}>
											{#each statusOptions as status}
												<option value={status.value}>{status.label}</option>
											{/each}
										</select>
									</div>
									{#if form.capacityEnabled}
										<div>
											<div class="text-sm font-semibold text-blue-600">Cupo</div>
											<Input class="mt-2 h-12 rounded-2xl" type="number" min="1" placeholder="Ej. 120" bind:value={form.cupo} />
										</div>
									{/if}
								</div>

								

								<div class="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
									<div>
										<div class="text-sm font-semibold text-blue-600">Modo de registro</div>
										<select class="mt-2 h-12 w-full rounded-2xl border px-3" bind:value={form.registrationMode}>
											{#each registrationModeOptions as mode}
												<option value={mode.value}>{mode.label}</option>
											{/each}
										</select>
									</div>
									<div>
										<div class="text-sm font-semibold text-blue-600">Política de reenvío de requisitos</div>
										<select class="mt-2 h-12 w-full rounded-2xl border px-3" bind:value={form.resubmissionPolicy}>
											{#each resubmissionPolicyOptions as policy}
												<option value={policy.value}>{policy.label}</option>
											{/each}
										</select>
									</div>
								</div>

								<div class="mt-4 flex items-center justify-between rounded-2xl bg-slate-50 px-4 py-3">
									<div class="text-sm font-semibold">Geocerca obligatoria</div>
									<Switch bind:checked={form.geoEnforced} />
								</div>

								{#if form.geoEnforced}
									<div class="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
										<Input class="h-12 rounded-2xl" type="number" step="0.000001" placeholder="Latitud" bind:value={form.geoCenterLat} />
										<Input class="h-12 rounded-2xl" type="number" step="0.000001" placeholder="Longitud" bind:value={form.geoCenterLng} />
										<Input class="h-12 rounded-2xl" type="number" min="1" placeholder="Radio (m)" bind:value={form.geoRadiusM} />
										<Input class="h-12 rounded-2xl" type="number" min="0" placeholder="Precisión estricta (m, opcional)" bind:value={form.geoStrictAccuracyM} />
									</div>
									{#if fieldErrors.geoCenterLat || fieldErrors.geoCenterLng}
										<div class="mt-1 text-xs text-red-600">
											{fieldErrors.geoCenterLat ? 'Latitud requerida. ' : ''}{fieldErrors.geoCenterLng ? 'Longitud requerida.' : ''}
										</div>
									{/if}
								{/if}

								<div class="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
									<div>
										<div class="text-sm font-semibold text-blue-600">Política de cancelación</div>
										<select class="mt-2 h-12 w-full rounded-2xl border px-3" bind:value={form.cancelPolicy}>
											{#each cancelPolicyOptions as policy}
												<option value={policy.value}>{policy.label}</option>
											{/each}
										</select>
										{#if cancelPolicyMeta.requiresDeadline}
											<div class="mt-2 text-xs font-semibold text-amber-700">
												Cancelación libre únicamente hasta la fecha y hora límite seleccionadas.
											</div>
										{/if}
									</div>
									{#if cancelPolicyMeta.requiresDeadline}
										<div class="grid grid-cols-2 gap-2">
											<div>
												<div class={`text-sm font-semibold ${fieldErrors.cancelDeadlineDate ? 'text-red-600' : 'text-blue-600'}`}>Fecha límite</div>
												<Input class="mt-2 h-12 rounded-2xl" type="date" bind:value={form.cancelDeadlineDate} />
												{#if fieldErrors.cancelDeadlineDate}<div class="mt-1 text-xs text-red-600">{fieldErrors.cancelDeadlineDate}</div>{/if}
											</div>
											<div>
												<div class={`text-sm font-semibold ${fieldErrors.cancelDeadlineTime ? 'text-red-600' : 'text-blue-600'}`}>Hora límite</div>
												<Input class="mt-2 h-12 rounded-2xl" type="time" bind:value={form.cancelDeadlineTime} />
												{#if fieldErrors.cancelDeadlineTime}<div class="mt-1 text-xs text-red-600">{fieldErrors.cancelDeadlineTime}</div>{/if}
											</div>
										</div>
									{/if}
								</div>

								<!-- Sesiones adicionales temporalmente deshabilitadas.
									Por ahora se enviará una única sesión principal usando inicio/fin del evento. -->
								<!--<div class="mt-4 rounded-2xl border bg-slate-50/60 p-4 text-xs text-muted-foreground">
									Se creará automáticamente una sesión principal con las fechas y horas del evento.
								</div>-->
							</CardContent>
						</Card>

						<h2 class="text-[22px] font-extrabold tracking-tight text-foreground">Imagen de Portada</h2>
						<Card class={`rounded-3xl border bg-card text-card-foreground ${cardShadow}`}>
							<CardContent class="p-5">
								<!-- Carga local de imagen comentada a petición del usuario. -->
								<div class="space-y-3">
									<div>
										<div class="text-sm font-semibold">URL de imagen</div>
										<Input
											class="mt-2 h-12 rounded-2xl"
											placeholder="https://ejemplo.com/portada.jpg"
											bind:value={form.coverImageUrl}
										/>
									</div>

									{#if form.coverImageUrl && !normalizedCoverImageUrl}
										<div class="text-xs font-semibold text-red-600">Ingresa una URL válida (http/https).</div>
									{:else if normalizedCoverImageUrl}
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
								</div>
							</CardContent>
						</Card>
					{/if}

					<div class="pt-2">
						<Button
							class="h-12 w-full rounded-2xl bg-blue-600 text-white hover:bg-blue-700"
						 onclick={toPreview}
							disabled={submitting}
						>
							Visualizar
						</Button>
						{#if formError}
							<div class="mt-2 text-xs font-semibold text-red-600">{formError}</div>
						{/if}
						{#if bulk.file && !bulk.rows.length}
							<div class="mt-2 text-xs text-destructive">Tu CSV tiene errores o no tiene filas válidas.</div>
						{/if}
					</div>
				</section>

				<!-- Slide 2: Preview -->
				<section class="w-full flex-none space-y-6 overflow-x-hidden">
					<div class="flex items-center justify-between">
						<h2 class="text-[22px] font-extrabold tracking-tight text-foreground">Preview</h2>
						<button
							type="button"
							class="text-sm font-semibold text-blue-600 hover:text-blue-700"
							onclick={toEdit}
						>
							Editar
						</button>
					</div>

					{#if bulk.mode}
						<Card class={`rounded-3xl border bg-card text-card-foreground ${cardShadow}`}>
							<CardContent class="p-5">
								<div class="flex items-start justify-between gap-3">
									<div>
										<div class="text-sm font-semibold text-blue-600">Eventos desde CSV</div>
										<div class="mt-1 text-sm text-muted-foreground">
											Se crearán <span class="font-semibold text-foreground">{bulk.rows.length}</span> eventos.
										</div>
									</div>
									<Badge class="rounded-full bg-blue-50 text-blue-700 hover:bg-blue-50">Bulk</Badge>
								</div>

								<div class="mt-4 space-y-3">
									{#each bulk.rows.slice(0, 5) as ev, idx}
										<div class="rounded-2xl bg-slate-50 p-4">
											<div class="text-sm font-extrabold text-foreground">{idx + 1}. {ev.title}</div>
											<div class="mt-1 text-xs text-muted-foreground">{ev.date} {ev.time} • {ev.location}</div>
											<div class="mt-1 text-xs text-muted-foreground">Organizador: {ev.organizer || '—'}</div>
											<div class="mt-2 flex flex-wrap gap-2">
														<Badge class={`rounded-full ${getPreviewCategoryClass(ev.category)}`}>
															<span class="inline-flex items-center gap-1">
																<svelte:component this={getPreviewCategoryIcon(ev.category)} class="h-3.5 w-3.5" />
																<span>{getPreviewCategoryMeta(ev.category).label}</span>
															</span>
														</Badge>
												<Badge class={`rounded-full ${ev.allowSelfCheckin ? 'bg-blue-50 text-blue-700 hover:bg-blue-50' : 'bg-slate-100 text-slate-700 hover:bg-slate-100'}`}>
													{ev.allowSelfCheckin ? 'Self check-in' : 'Sin self check-in'}
												</Badge>
											</div>
										</div>
									{/each}

									{#if bulk.rows.length > 5}
										<div class="text-xs text-muted-foreground">Mostrando 5 de {bulk.rows.length}…</div>
									{/if}
								</div>
							</CardContent>
						</Card>
					{:else}
						<Card class={`rounded-3xl border bg-card text-card-foreground ${cardShadow}`}>
							<CardContent class="p-5">
								<div class="text-sm font-semibold text-blue-600">Resumen</div>
									<div class="mt-2 text-xl font-extrabold">{form.title || 'Sin título'}</div>
									<div class="mt-1 text-sm text-muted-foreground">{form.description || 'Sin descripción'}</div>

									<div class="mt-3 rounded-2xl border bg-slate-50 p-3">
										<div class="text-xs text-muted-foreground">Imagen de portada</div>
										<div class="mt-2">
											{#if normalizedCoverImageUrl}
												{#if coverPreviewFailed}
													<div class="py-6 text-center text-xs font-semibold text-red-600">
														No se pudo cargar la imagen con esa URL.
													</div>
												{:else}
													<img
														src={normalizedCoverImageUrl}
														alt="Preview portada"
														class="h-44 w-full rounded-xl object-cover"
														onerror={() => (coverPreviewFailed = true)}
														onload={() => (coverPreviewFailed = false)}
													/>
												{/if}
											{:else}
												<div class="text-sm text-muted-foreground">Sin imagen configurada.</div>
											{/if}
										</div>
									</div>

									<div class="mt-4 grid grid-cols-2 gap-3">
										<div class="rounded-2xl bg-slate-50 p-3">
										<div class="text-xs text-muted-foreground">Fecha</div>
										<div class="mt-1 text-sm font-semibold">{form.date || '—'}</div>
									</div>
									<div class="rounded-2xl bg-slate-50 p-3">
										<div class="text-xs text-muted-foreground">Hora</div>
										<div class="mt-1 text-sm font-semibold">{form.time || '—'}</div>
									</div>
								</div>

								<div class="mt-3 rounded-2xl bg-slate-50 p-3">
									<div class="text-xs text-muted-foreground">Ubicación</div>
									<div class="mt-1 text-sm font-semibold">{form.location || '—'}</div>
								</div>

								<div class="mt-3 rounded-2xl bg-slate-50 p-3">
									<div class="text-xs text-muted-foreground">Organizador</div>
									<div class="mt-1 text-sm font-semibold">{form.organizer || '—'}</div>
								</div>

								{#if form.capacityEnabled && Number(form.cupo) > 0}
									<div class="mt-3 rounded-2xl bg-slate-50 p-3">
										<div class="text-xs text-muted-foreground">Cupo</div>
										<div class="mt-1 text-sm font-semibold">{form.cupo}</div>
									</div>
								{/if}

								<div class="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
									<div class="rounded-2xl bg-slate-50 p-3">
										<div class="text-xs text-muted-foreground">Estatus</div>
										<div class="mt-1 text-sm font-semibold">
											{getCatalogLabel(EVENT_STATUS_CATALOG, form.status, form.status)}
										</div>
									</div>
									<div class="rounded-2xl bg-slate-50 p-3">
										<div class="text-xs text-muted-foreground">Política de cancelación</div>
										<div class="mt-1 text-sm font-semibold">
											{getCatalogLabel(EVENT_CANCEL_POLICY_CATALOG, form.cancelPolicy, form.cancelPolicy)}
										</div>
									</div>
								</div>

								<div class="mt-3 flex items-center justify-between rounded-2xl bg-slate-50 p-3">
									<div class="inline-flex items-center gap-2 text-sm font-semibold">
										<QrCode class="h-4 w-4 text-blue-600" />
										Self check-in
									</div>
									<Badge
										class={`rounded-full ${
											form.allowSelfCheckin
												? 'bg-blue-50 text-blue-700 hover:bg-blue-50'
												: 'bg-slate-100 text-slate-700 hover:bg-slate-100'
										}`}
									>
										{form.allowSelfCheckin ? 'Activado' : 'Desactivado'}
									</Badge>
								</div>

								<div class="mt-3 rounded-2xl bg-slate-50 p-3">
									<div class="text-xs text-muted-foreground">Sesión</div>
									<div class="mt-1 text-sm font-semibold">Sesión principal automática</div>
								</div>
							</CardContent>
						</Card>
					{/if}

					<div class="pt-2 space-y-3">
						<Button
							class="h-12 w-full rounded-2xl bg-blue-600 text-white hover:bg-blue-700"
							onclick={confirm}
							disabled={submitting}
						>
							{submitting ? 'Guardando...' : 'Confirmar'}
						</Button>

						{#if bulk.mode}
							<Button variant="secondary" class="h-12 w-full rounded-2xl" onclick={cancelCsvMode}>
								Cancelar CSV
							</Button>
						{/if}
					</div>
				</section>
			</div>
		</div>
	</main>
</div>

<Dialog.Root bind:open={createdStaffDialogOpen}>
	<Dialog.Content class="sm:max-w-md">
		<Dialog.Header>
			<Dialog.Title>Evento creado correctamente</Dialog.Title>
			<Dialog.Description>
				Se generó una cuenta staff automática para este evento.
			</Dialog.Description>
		</Dialog.Header>

			<div class="space-y-3 py-2">
				<div class="space-y-2">
					<Label>Correo staff</Label>
					<Input value={createdStaffCredentials?.email || 'No disponible'} readonly />
				</div>
				<div class="space-y-2">
					<Label>Contraseña staff</Label>
					<div class="relative">
						<Input
							type={showCreatedStaffPassword ? 'text' : 'password'}
							value={createdStaffCredentials?.password || 'No disponible'}
							readonly
							class="pr-12"
						/>
						<Button
							type="button"
							variant="ghost"
							size="icon"
							class="absolute right-1 top-1/2 h-9 w-9 -translate-y-1/2 rounded-full"
							onclick={() => {
								showCreatedStaffPassword = !showCreatedStaffPassword;
							}}
						>
							{#if showCreatedStaffPassword}
								<EyeOff class="h-4 w-4" />
							{:else}
								<Eye class="h-4 w-4" />
							{/if}
						</Button>
					</div>
				</div>
			</div>

			<Dialog.Footer>
				<Button
					variant="outline"
					class="gap-2"
					onclick={downloadCreatedStaffCredentialsTxt}
				>
					<Download class="h-4 w-4" />
					Descargar .txt
				</Button>
				<Button
					class="bg-blue-600 text-white hover:bg-blue-700"
					onclick={() => {
						createdStaffDialogOpen = false;
						createdStaffCredentials = null;
						showCreatedStaffPassword = false;
					}}
				>
					Cerrar
				</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>
