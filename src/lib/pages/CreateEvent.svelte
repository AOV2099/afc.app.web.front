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
	let bulkErrorsDialogOpen = false;
	let bulkValidationErrors = [];
	const MAX_EVENT_HOURS = 100;
	const minimumEventDate = (() => {
		const now = new Date();
		return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
	})();

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
		bulkValidationErrors = [];
		bulkErrorsDialogOpen = false;
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
				bulkValidationErrors = bulk.errors;
				bulkErrorsDialogOpen = true;
				formError = 'Corrige todos los eventos señalados antes de continuar.';
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

	function parseHoursInput(value) {
		if (typeof value === 'number') return Number.isFinite(value) ? value : null;
		const normalized = String(value ?? '').trim();
		if (!/^\d+(?:\.\d{1,2})?$/.test(normalized)) return null;
		const parsed = Number(normalized);
		return Number.isFinite(parsed) ? parsed : null;
	}

	function preventInvalidHoursKey(event) {
		if (['e', 'E', '+', '-'].includes(event.key)) event.preventDefault();
	}

	function handleManualHoursInput(event) {
		const hoursValue = parseHoursInput(event.currentTarget.value);
		fieldErrors = {
			...fieldErrors,
			hoursValue:
				hoursValue === null || hoursValue < 0 || hoursValue > MAX_EVENT_HOURS
					? `Las horas acreditables deben ser un decimal entre 0 y ${MAX_EVENT_HOURS}.`
					: undefined
		};
	}

	function buildSingleSession(startsAt, endsAt, hoursValue) {
		if (startsAt && endsAt) {
			return [
				{
					starts_at: startsAt,
					ends_at: endsAt,
					label: 'Sesión principal',
					hours_value: hoursValue
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
			hours_value: form.hoursValue,
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
			hours_value: row.hoursValue,
			capacity_enabled: Boolean(row.capacityEnabled),
			capacity: row.capacityEnabled ? (row.cupo === '' ? null : Number(row.cupo)) : null,
			status: row.status || 'draft',
			registration_mode: row.registrationMode || 'auto',
			resubmission_policy: row.resubmissionPolicy || 'only_changes_requested',
			allow_self_checkin: Boolean(row.allowSelfCheckin),
			cover_image_url: normalizeWebImageUrl(row.coverImageUrl) || null,
			geo_enforced: Boolean(row.geoEnforced),
			cancel_policy: resolveCancelPolicyForPayload(row.cancelPolicy || 'free_cancel'),
			cancel_deadline: getCancelPolicyMeta(row.cancelPolicy || 'free_cancel').requiresDeadline
				? cancelDeadline
				: cancelDeadline,
			geo,
			sessions: buildSingleSession(startsAt, endsAt, row.hoursValue),
			attributes: {
				location: row.location?.trim() || null,
				organizer: row.organizer?.trim() || null,
				cover_image_url: normalizeWebImageUrl(row.coverImageUrl) || null,
				...(row.staffUserId ? { staff_user_id: Number(row.staffUserId) } : {})
			},
			...(row.staffUserId
				? { assign_staff: true, staff_user_id: Number(row.staffUserId) }
				: {})
		};
	}

	function validatePayload(payload, source = form) {
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
		const now = Date.now();
		if (new Date(payload.starts_at).getTime() < now) {
			return 'La fecha/hora de inicio no puede estar en el pasado.';
		}
		if (new Date(payload.ends_at).getTime() < now) {
			return 'La fecha/hora de fin no puede estar en el pasado.';
		}
		if (new Date(payload.ends_at) <= new Date(payload.starts_at)) {
			return 'La fecha/hora de fin debe ser mayor a la de inicio.';
		}
		const hoursValue = parseHoursInput(payload.hours_value);
		if (hoursValue === null || hoursValue < 0 || hoursValue > MAX_EVENT_HOURS) {
			return `Las horas acreditables deben ser un decimal entre 0 y ${MAX_EVENT_HOURS}, sin letras.`;
		}
		if (payload.capacity_enabled) {
			if (!Number.isInteger(payload.capacity) || payload.capacity <= 0) {
				return 'El cupo debe ser un entero mayor a 0 cuando está habilitado.';
			}
		}
		if (payload.geo_enforced && !payload.geo) {
			return 'Si activas geocerca, debes capturar latitud/longitud.';
		}
		if (getCancelPolicyMeta(source.cancelPolicy).requiresDeadline && !payload.cancel_deadline) {
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
		const startsAt = toIsoFromDateTime(form.date, form.time);
		const endsAt = toIsoFromDateTime(form.endDate, form.endTime);
		if (startsAt && new Date(startsAt).getTime() < Date.now()) {
			errors.date = 'No puede estar en el pasado';
			errors.time = 'No puede estar en el pasado';
		}
		if (endsAt && new Date(endsAt).getTime() < Date.now()) {
			errors.endDate = 'No puede estar en el pasado';
			errors.endTime = 'No puede estar en el pasado';
		}
		const hoursValue = parseHoursInput(form.hoursValue);
		if (hoursValue === null || hoursValue < 0 || hoursValue > MAX_EVENT_HOURS) {
			errors.hoursValue = `Ingresa un decimal entre 0 y ${MAX_EVENT_HOURS}`;
		}

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

	function validateManualField(field) {
		let message;
		if (field === 'title' && !form.title?.trim()) message = 'El título del evento es obligatorio.';
		if (field === 'location' && !form.location?.trim()) message = 'La ubicación es obligatoria.';
		if (field === 'organizer' && !form.organizer?.trim()) message = 'El organizador es obligatorio.';
		if (field === 'date') {
			if (!form.date) message = 'La fecha de inicio es obligatoria.';
			else if (form.time && new Date(toIsoFromDateTime(form.date, form.time)).getTime() < Date.now()) message = 'La fecha y hora de inicio no pueden estar en el pasado.';
		}
		if (field === 'time') {
			if (!form.time) message = 'La hora de inicio es obligatoria.';
			else if (form.date && new Date(toIsoFromDateTime(form.date, form.time)).getTime() < Date.now()) message = 'La fecha y hora de inicio no pueden estar en el pasado.';
		}
		if (field === 'endDate') {
			if (!form.endDate) message = 'La fecha de fin es obligatoria.';
			else if (form.endTime && new Date(toIsoFromDateTime(form.endDate, form.endTime)).getTime() < Date.now()) message = 'La fecha y hora de fin no pueden estar en el pasado.';
		}
		if (field === 'endTime') {
			if (!form.endTime) message = 'La hora de fin es obligatoria.';
			else if (form.endDate && new Date(toIsoFromDateTime(form.endDate, form.endTime)).getTime() < Date.now()) message = 'La fecha y hora de fin no pueden estar en el pasado.';
		}
		if (field === 'hoursValue') {
			const hoursValue = parseHoursInput(form.hoursValue);
			if (hoursValue === null || hoursValue < 0 || hoursValue > MAX_EVENT_HOURS) {
				message = `Las horas acreditables deben ser un decimal entre 0 y ${MAX_EVENT_HOURS}.`;
			}
		}
		fieldErrors = { ...fieldErrors, [field]: message };
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

		const validationErrors = bulk.rows.flatMap((row, index) => {
			const message = validatePayload(buildCsvEventPayload(row), row);
			return message
				? [{ index: row.csvLine || index + 2, title: row.title || 'Evento sin título', errs: [message] }]
				: [];
		});
		if (validationErrors.length) {
			bulk.errors = validationErrors;
			bulkValidationErrors = validationErrors;
			bulkErrorsDialogOpen = true;
			toEdit();
			return;
		}

		submitting = true;
		try {
			const response = await adminEventsApi.createEventsBulk(bulk.rows.map(buildCsvEventPayload));
			toast.success(response?.message || `Eventos creados: ${bulk.rows.length}`);
			cancelCsvMode();
		} catch (error) {
			const apiErrors = Array.isArray(error?.data?.errors) ? error.data.errors : [];
			bulkValidationErrors = apiErrors.length
				? apiErrors.map((item) => ({
					index: item.line || item.index + 2,
					title: item.title || 'Evento sin título',
					errs: [item.message || 'No se pudo crear este evento.']
				}))
				: [{ index: '—', title: 'Importación', errs: [error?.message || 'No se pudo importar el archivo.'] }];
			bulkErrorsDialogOpen = true;
			toast.error('No se creó ningún evento. Revisa los errores del archivo.');
		} finally {
			submitting = false;
		}
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

	const csvHeaderLabels = {
		title: 'Título del evento',
		date: 'Fecha de inicio',
		time: 'Hora de inicio',
		end_date: 'Fecha de fin',
		end_time: 'Hora de fin',
		location: 'Ubicación',
		organizer: 'Organizador'
	};

	function isValidCsvDate(value) {
		if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
		const date = new Date(`${value}T12:00:00`);
		return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
	}

	function isValidCsvTime(value) {
		return /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value);
	}

	function isValidCsvBoolean(value) {
		return ['', '1', '0', 'true', 'false', 'si', 'sí', 'no', 'yes', 'y', 'n'].includes(
			String(value ?? '').trim().toLowerCase()
		);
	}

	function validateRow(row, source, lineNumber) {
		const errs = [];
		for (const key of ['title', 'date', 'time', 'end_date', 'end_time', 'location', 'organizer']) {
			if (!String(source[key] || '').trim()) errs.push(`${csvHeaderLabels[key]} es obligatorio.`);
		}
		if (source.date && !isValidCsvDate(source.date)) {
			errs.push('Fecha de inicio debe usar el formato AAAA-MM-DD y ser una fecha real.');
		}
		if (source.end_date && !isValidCsvDate(source.end_date)) {
			errs.push('Fecha de fin debe usar el formato AAAA-MM-DD y ser una fecha real.');
		}
		if (source.time && !isValidCsvTime(source.time)) {
			errs.push('Hora de inicio debe usar el formato HH:MM de 24 horas.');
		}
		if (source.end_time && !isValidCsvTime(source.end_time)) {
			errs.push('Hora de fin debe usar el formato HH:MM de 24 horas.');
		}
		if (
			isValidCsvDate(source.date) &&
			isValidCsvTime(source.time) &&
			isValidCsvDate(source.end_date) &&
			isValidCsvTime(source.end_time) &&
			new Date(`${source.end_date}T${source.end_time}:00`) <=
				new Date(`${source.date}T${source.time}:00`)
		) {
			errs.push('La fecha/hora de fin debe ser mayor a la de inicio.');
		}
		const csvHoursValue = parseHoursInput(source.hours_value);
		if (source.hours_value && (csvHoursValue === null || csvHoursValue < 0 || csvHoursValue > MAX_EVENT_HOURS)) {
			errs.push(`Horas acreditables debe ser un decimal simple entre 0 y ${MAX_EVENT_HOURS}.`);
		}
		for (const key of ['capacity_enabled', 'allow_self_checkin', 'geo_enforced']) {
			if (!isValidCsvBoolean(source[key])) {
				errs.push(`El valor de ${key === 'capacity_enabled' ? '“Limitar cupo”' : key === 'allow_self_checkin' ? '“Permitir self check-in”' : '“Geocerca obligatoria”'} debe ser true o false.`);
			}
		}
		if (row.capacityEnabled && (!/^\d+$/.test(source.capacity || '') || Number(source.capacity) <= 0)) {
			errs.push('Cupo debe ser un entero mayor a 0 cuando está habilitado.');
		}
		if (!EVENT_CATEGORY_OPTIONS.some((option) => option.value === source.category)) {
			errs.push('Categoría no corresponde a una opción permitida.');
		}
		if (!Object.hasOwn(EVENT_STATUS_CATALOG, row.status)) errs.push('Estatus no es válido.');
		if (!Object.hasOwn(EVENT_REGISTRATION_MODE_CATALOG, row.registrationMode)) errs.push('Modo de registro no es válido.');
		if (!Object.hasOwn(EVENT_RESUBMISSION_POLICY_CATALOG, row.resubmissionPolicy)) errs.push('Política de reenvío no es válida.');
		if (!Object.hasOwn(EVENT_CANCEL_POLICY_CATALOG, row.cancelPolicy)) errs.push('Política de cancelación no es válida.');
		if (row.geoEnforced) {
			const lat = Number(source.geo_center_lat);
			const lng = Number(source.geo_center_lng);
			const radius = Number(source.geo_radius_m);
			if (source.geo_center_lat === '' || !Number.isFinite(lat) || lat < -90 || lat > 90) errs.push('Latitud debe estar entre -90 y 90.');
			if (source.geo_center_lng === '' || !Number.isFinite(lng) || lng < -180 || lng > 180) errs.push('Longitud debe estar entre -180 y 180.');
			if (!Number.isFinite(radius) || radius <= 0) errs.push('Radio de geocerca debe ser mayor a 0 metros.');
		}
		if (source.cover_image_url && !normalizeWebImageUrl(source.cover_image_url)) errs.push('URL de imagen no es válida.');
		if (source.staff_user_id && (!/^\d+$/.test(source.staff_user_id) || Number(source.staff_user_id) <= 0)) errs.push('Identificador de staff debe ser un entero mayor a 0.');

		if (!errs.length) {
			const payloadMessage = validatePayload(buildCsvEventPayload(row), row);
			if (payloadMessage) errs.push(payloadMessage);
		}

		return errs.length
			? { index: lineNumber, title: row.title || 'Evento sin título', errs }
			: null;
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
			bulk.errors = [{ index: 1, title: 'Archivo CSV', errs: ['El archivo está vacío o no tiene un formato válido.'] }];
			bulkValidationErrors = bulk.errors;
			bulkErrorsDialogOpen = true;
			bulk.mode = false;
			return;
		}

		// headers
		const headers = table[0].map((h) => String(h ?? '').trim().toLowerCase());
		const required = ['title', 'date', 'time', 'end_date', 'end_time', 'location', 'organizer'];
		for (const reqHeader of required) {
			if (!headers.includes(reqHeader)) {
				bulk.errors = [{ index: 1, title: 'Encabezado del archivo', errs: [`Falta la columna obligatoria “${csvHeaderLabels[reqHeader]}”.`] }];
				bulkValidationErrors = bulk.errors;
				bulkErrorsDialogOpen = true;
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
				csvLine: i + 1,
				title: obj.title || '',
				category: obj.category || 'general',
				description: obj.description || '',
				date: obj.date || '',
				time: obj.time || '',
				endDate: obj.end_date || '',
				endTime: obj.end_time || '',
				hoursValue: obj.hours_value || '2',
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
				cancelDeadlineTime: obj.cancel_deadline_time || '',
				coverImageUrl: obj.cover_image_url || '',
				staffUserId: obj.staff_user_id || ''
			};

			const err = validateRow(mapped, obj, i + 1);
			if (err) errors.push(err);
			rows.push(mapped);
		}

		const seenTitles = new Map();
		for (const row of rows) {
			const key = row.title.trim().toLocaleLowerCase('es-MX');
			if (!key) continue;
			if (seenTitles.has(key)) {
				errors.push({ index: row.csvLine, title: row.title, errs: [`Título duplicado en el archivo; también aparece en la línea ${seenTitles.get(key)}.`] });
			} else {
				seenTitles.set(key, row.csvLine);
			}
		}

		bulk.rows = rows;
		bulk.errors = errors;
		bulk.mode = rows.length > 0;
		bulkValidationErrors = errors;
		bulkErrorsDialogOpen = errors.length > 0;

		// limpiar el input DESPUÉS de leer, para permitir re-selección del mismo archivo
		if (input) input.value = '';
	}

	function downloadCsvTemplate() {
		const baseDate = new Date();
		baseDate.setDate(baseDate.getDate() + 30);
		const secondDate = new Date(baseDate);
		secondDate.setDate(secondDate.getDate() + 2);
		const cancellationDate = new Date(secondDate);
		cancellationDate.setDate(cancellationDate.getDate() - 1);
		const formatDate = (value) => value.toISOString().slice(0, 10);
		const content =
			'title,category,description,date,time,end_date,end_time,hours_value,capacity_enabled,capacity,location,organizer,status,registration_mode,resubmission_policy,allow_self_checkin,geo_enforced,geo_center_lat,geo_center_lng,geo_radius_m,geo_strict_accuracy_m,cancel_policy,cancel_deadline_date,cancel_deadline_time,cover_image_url,staff_user_id\n' +
			`"Semana de Ingeniería y Tecnología",general,"Conferencias y talleres para la comunidad universitaria",${formatDate(baseDate)},10:00,${formatDate(baseDate)},13:00,3,true,120,"Auditorio Principal","Coordinación Académica",published,auto,only_changes_requested,true,false,,,120,,free_cancel,,,"https://images.unsplash.com/photo-1540575467063-178a50c2df87",\n` +
			`"Foro de Innovación Social",emprendimiento,"Panel con especialistas y organizaciones invitadas",${formatDate(secondDate)},16:00,${formatDate(secondDate)},18:30,2.5,false,,"Sala de Usos Múltiples","Dirección de Vinculación",draft,manual_review,allowed,true,true,19.432608,-99.133209,120,40,locked,${formatDate(cancellationDate)},18:00,"https://images.unsplash.com/photo-1511578314322-379afb476865",\n`;

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
										El archivo completo se valida antes de crear cualquier evento.
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
										Usa la plantilla para incluir todos los datos obligatorios y opcionales.
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
											<div class="flex items-center justify-between gap-2">
												<div class="text-xs font-semibold text-destructive">El archivo contiene eventos con errores</div>
												<Button variant="outline" class="h-8 rounded-xl" onclick={() => (bulkErrorsDialogOpen = true)}>
													Ver todos
												</Button>
											</div>
											{#each bulk.errors.slice(0, 3) as err (err.index)}
												<div class="text-xs text-muted-foreground">
													Línea {err.index} · {err.title}: {err.errs[0]}
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
										<Label for="create-event-title" class={`text-sm font-semibold ${fieldErrors.title ? 'text-red-600' : 'text-blue-600'}`}>Título del Evento</Label>
										<Input
											id="create-event-title"
											name="title"
											class="mt-2 h-12 rounded-2xl"
											placeholder="Ej. Semana de la Ingeniería"
											bind:value={form.title}
											onblur={() => validateManualField('title')}
										/>
										{#if fieldErrors.title}<div class="mt-1 text-xs text-red-600">{fieldErrors.title}</div>{/if}
									</div>

									<div>
										<Label for="create-event-category" class="text-sm font-semibold text-blue-600">Categoría</Label>
										<div class="relative mt-2">
											<span class="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
												<svelte:component this={selectedCategoryIcon} class="h-4 w-4" />
											</span>
											<select id="create-event-category" name="category" class="h-12 w-full rounded-2xl border pl-10 pr-3" bind:value={form.category}>
												{#each EVENT_CATEGORY_OPTIONS as categoryOption (categoryOption.value)}
													<option value={categoryOption.value}>{categoryOption.label}</option>
												{/each}
											</select>
										</div>
									</div>

									<div>
										<Label for="create-event-description" class="text-sm font-semibold text-blue-600">Descripción</Label>
										<Textarea
											id="create-event-description"
											name="description"
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
										<Label for="create-event-start-date" class={`text-sm font-semibold ${fieldErrors.date ? 'text-red-600' : 'text-blue-600'}`}>Fecha de inicio</Label>
										<div class="relative mt-2 w-full min-w-0">
											<Input id="create-event-start-date" name="starts_on" type="date" min={minimumEventDate} class="h-12 w-full min-w-0 max-w-full rounded-2xl pr-10" bind:value={form.date} onblur={() => validateManualField('date')} />
											<span class="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">
												<CalendarDays class="h-4 w-4" />
											</span>
										</div>
										{#if fieldErrors.date}<div class="mt-1 text-xs text-red-600">{fieldErrors.date}</div>{/if}
									</div>

									<div>
										<Label for="create-event-start-time" class={`text-sm font-semibold ${fieldErrors.time ? 'text-red-600' : 'text-blue-600'}`}>Hora de inicio</Label>
										<div class="relative mt-2 w-full min-w-0">
											<Input id="create-event-start-time" name="starts_at_time" type="time" class="h-12 w-full min-w-0 max-w-full rounded-2xl pr-10" bind:value={form.time} onblur={() => validateManualField('time')} />
											<span class="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">
												<Clock class="h-4 w-4" />
											</span>
										</div>
										{#if fieldErrors.time}<div class="mt-1 text-xs text-red-600">{fieldErrors.time}</div>{/if}
									</div>

									<div>
										<Label for="create-event-end-date" class={`text-sm font-semibold ${fieldErrors.endDate ? 'text-red-600' : 'text-blue-600'}`}>Fecha de fin</Label>
										<div class="relative mt-2 w-full min-w-0">
											<Input id="create-event-end-date" name="ends_on" type="date" min={form.date || minimumEventDate} class="h-12 w-full min-w-0 max-w-full rounded-2xl pr-10" bind:value={form.endDate} onblur={() => validateManualField('endDate')} />
											<span class="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">
												<CalendarDays class="h-4 w-4" />
											</span>
										</div>
										{#if fieldErrors.endDate}<div class="mt-1 text-xs text-red-600">{fieldErrors.endDate}</div>{/if}
									</div>

									<div>
										<Label for="create-event-end-time" class={`text-sm font-semibold ${fieldErrors.endTime ? 'text-red-600' : 'text-blue-600'}`}>Hora de fin</Label>
										<div class="relative mt-2 w-full min-w-0">
											<Input id="create-event-end-time" name="ends_at_time" type="time" class="h-12 w-full min-w-0 max-w-full rounded-2xl pr-10" bind:value={form.endTime} onblur={() => validateManualField('endTime')} />
											<span class="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">
												<Clock class="h-4 w-4" />
											</span>
										</div>
										{#if fieldErrors.endTime}<div class="mt-1 text-xs text-red-600">{fieldErrors.endTime}</div>{/if}
									</div>
								</div>

								<div class="mt-5">
									<Label for="create-event-location" class={`text-sm font-semibold ${fieldErrors.location ? 'text-red-600' : 'text-blue-600'}`}>Ubicación</Label>
									<div class="relative mt-2">
										<Input
											id="create-event-location"
											name="location"
											class="h-12 rounded-2xl pl-10"
											placeholder="Auditorio Principal o URL"
											bind:value={form.location}
											onblur={() => validateManualField('location')}
										/>
										<span class="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
											<MapPin class="h-4 w-4" />
										</span>
									</div>
									{#if fieldErrors.location}<div class="mt-1 text-xs text-red-600">{fieldErrors.location}</div>{/if}
								</div>

								<div class="mt-4">
									<Label for="create-event-organizer" class={`text-sm font-semibold ${fieldErrors.organizer ? 'text-red-600' : 'text-blue-600'}`}>Organizador</Label>
									<Input
										id="create-event-organizer"
										name="organizer"
										class="mt-2 h-12 rounded-2xl"
										placeholder="Ej. Coordinación Académica"
										bind:value={form.organizer}
										onblur={() => validateManualField('organizer')}
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
											<Label for="create-event-staff-user" class={`text-sm font-semibold ${fieldErrors.staffUserId ? 'text-red-600' : 'text-blue-600'}`}>
												Usuario staff
											</Label>
											<select
												id="create-event-staff-user"
												name="staff_user_id"
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
									<Switch aria-label="Permitir self check-in" bind:checked={form.allowSelfCheckin} />
								</div>

								<div class="mt-4 flex items-center justify-between rounded-2xl bg-slate-50 px-4 py-3">
									<div>
										<div class="text-sm font-semibold">Limitar cupo</div>
										<div class="text-xs text-muted-foreground">Si está desactivado, el evento será de cupo abierto.</div>
									</div>
									<Switch aria-label="Limitar cupo" bind:checked={form.capacityEnabled} />
								</div>

								<div class="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
									<div>
										<Label for="create-event-hours" class={`text-sm font-semibold ${fieldErrors.hoursValue ? 'text-red-600' : 'text-blue-600'}`}>Horas acreditables</Label>
										<input id="create-event-hours" name="hours_value" class="border-input bg-background mt-2 flex h-12 w-full rounded-2xl border px-3 py-1 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50" type="number" min="0" max={MAX_EVENT_HOURS} step="0.01" inputmode="decimal" autocomplete="off" bind:value={form.hoursValue} oninput={handleManualHoursInput} onkeydown={preventInvalidHoursKey} onblur={() => validateManualField('hoursValue')} />
										{#if fieldErrors.hoursValue}<div class="mt-1 text-xs text-red-600">{fieldErrors.hoursValue}</div>{/if}
									</div>
									<div>
										<Label for="create-event-status" class="text-sm font-semibold text-blue-600">Estatus</Label>
										<select id="create-event-status" name="status" class="mt-2 h-12 w-full rounded-2xl border px-3" bind:value={form.status}>
											{#each statusOptions as status}
												<option value={status.value}>{status.label}</option>
											{/each}
										</select>
									</div>
									{#if form.capacityEnabled}
										<div>
											<Label for="create-event-capacity" class="text-sm font-semibold text-blue-600">Cupo</Label>
											<Input id="create-event-capacity" name="capacity" class="mt-2 h-12 rounded-2xl" type="number" min="1" placeholder="Ej. 100" bind:value={form.cupo} />
										</div>
									{/if}
								</div>

								

								<div class="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
									<div>
										<Label for="create-event-registration-mode" class="text-sm font-semibold text-blue-600">Modo de registro</Label>
										<select id="create-event-registration-mode" name="registration_mode" class="mt-2 h-12 w-full rounded-2xl border px-3" bind:value={form.registrationMode}>
											{#each registrationModeOptions as mode}
												<option value={mode.value}>{mode.label}</option>
											{/each}
										</select>
									</div>
									<div>
										<Label for="create-event-resubmission-policy" class="text-sm font-semibold text-blue-600">Política de reenvío de requisitos</Label>
										<select id="create-event-resubmission-policy" name="resubmission_policy" class="mt-2 h-12 w-full rounded-2xl border px-3" bind:value={form.resubmissionPolicy}>
											{#each resubmissionPolicyOptions as policy}
												<option value={policy.value}>{policy.label}</option>
											{/each}
										</select>
									</div>
								</div>

								<div class="mt-4 flex items-center justify-between rounded-2xl bg-slate-50 px-4 py-3">
									<div class="text-sm font-semibold">Geocerca obligatoria</div>
									<Switch aria-label="Geocerca obligatoria" bind:checked={form.geoEnforced} />
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
										<Label for="create-event-cancel-policy" class="text-sm font-semibold text-blue-600">Política de cancelación</Label>
										<select id="create-event-cancel-policy" name="cancel_policy" class="mt-2 h-12 w-full rounded-2xl border px-3" bind:value={form.cancelPolicy}>
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
										<Label for="create-event-cover-url" class="text-sm font-semibold">URL de imagen</Label>
										<Input
											id="create-event-cover-url"
											name="cover_image_url"
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

<Dialog.Root bind:open={bulkErrorsDialogOpen}>
	<Dialog.Content class="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
		<Dialog.Header>
			<Dialog.Title>Eventos con errores</Dialog.Title>
			<Dialog.Description>
				No se creó ningún evento. Corrige todas las filas señaladas y vuelve a cargar el archivo.
			</Dialog.Description>
		</Dialog.Header>

		<div class="space-y-3 py-2">
			{#each bulkValidationErrors as error (`${error.index}-${error.title}`)}
				<div class="rounded-2xl border border-red-200 bg-red-50/60 p-4">
					<div class="font-semibold text-red-800">Línea {error.index} · {error.title}</div>
					<ul class="mt-2 list-disc space-y-1 pl-5 text-sm text-red-700">
						{#each error.errs as message}
							<li>{message}</li>
						{/each}
					</ul>
				</div>
			{/each}
		</div>

		<Dialog.Footer>
			<Button variant="outline" onclick={downloadCsvTemplate}>Descargar plantilla correcta</Button>
			<Button class="bg-blue-600 text-white hover:bg-blue-700" onclick={() => (bulkErrorsDialogOpen = false)}>
				Corregir archivo
			</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>

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
