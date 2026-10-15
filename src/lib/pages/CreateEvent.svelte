<script>
	import { onMount } from 'svelte';
	import { tick } from 'svelte';
	import { toast } from 'svelte-sonner';
	import { adminEventsApi, adminStaffUsersApi } from '$lib/services/api';
	import { EVENT_COVER_HINT } from '$lib/utils/events.js';
 	import {
		EVENT_STATUS_CATALOG,
		EVENT_REGISTRATION_MODE_CATALOG,
		EVENT_REGISTRATION_MODE_HELP,
		EVENT_REAPPLY_HELP,
		EVENT_REAPPLY_OPTIONS,
		EVENT_CANCEL_POLICY_CATALOG,
		EVENT_CANCEL_POLICY_HELP,
		EVENT_CANCEL_POLICY_OPTIONS
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
	import AfcHoursSection from '$lib/components/AfcHoursSection.svelte';
	import PolicyHelpTooltip from '$lib/components/PolicyHelpTooltip.svelte';
	import { afcCatalog, ensureAfcCatalog } from '$lib/stores/afcCatalog.js';
	import {
		buildAfcValuationPayload,
		computeAfcPreview,
		createAfcState,
		formatAfcHours,
		validateAfcForSave
	} from '$lib/utils/afcHoursForm.js';

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
	let afcState = createAfcState();
	let afcHoursEnabled = true;
	let creationMode = 'individual';
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
		capacityEnabled: true,
		cupo: 50,
		location: '',
		organizer: '',
		status: 'draft',
		registrationMode: 'auto',
		resubmissionPolicy: 'not_allowed',
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
	const cancelPolicyOptions = EVENT_CANCEL_POLICY_OPTIONS;

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
		afcState = createAfcState();
		afcHoursEnabled = true;
		form = {
			title: '',
			category: 'general',
			description: '',
			date: '',
			time: '',
			endDate: '',
			endTime: '',
			capacityEnabled: true,
			cupo: 50,
			location: '',
			organizer: '',
			status: 'draft',
			registrationMode: 'auto',
			resubmissionPolicy: 'not_allowed',
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

	function setCreationMode(mode) {
		if (mode === creationMode) return;
		if (mode === 'individual' && bulk.file) cancelCsvMode();
		creationMode = mode;
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
		if (creationMode === 'masiva') {
			fieldErrors = {};
			formError = '';
			if (!bulk.file) {
				formError = 'Sube un archivo CSV para continuar.';
				return;
			}
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
			(startsAt ? addHoursToIso(startsAt, 2) : null);
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
			afc_valuation: afcHoursEnabled
				? buildAfcValuationPayload(afcState, { catalog: $afcCatalog.types, defaultDate: form.date })
				: null,
			...(afcHoursEnabled ? {} : { afc_hours_enabled: false, hours_value: 0 }),
			capacity_enabled: Boolean(form.capacityEnabled),
			capacity: form.capacityEnabled ? (form.cupo === '' ? null : Number(form.cupo)) : null,
			status: form.status,
			registration_mode: form.registrationMode,
			resubmission_policy: form.resubmissionPolicy,
			// Self check-in oculto por ahora (sin flujo de auto check-in); el backend usa false por defecto.
			// allow_self_checkin: Boolean(form.allowSelfCheckin),
			geo_enforced: Boolean(form.geoEnforced),
			cancel_policy: resolveCancelPolicyForPayload(form.cancelPolicy),
			cancel_deadline: getCancelPolicyMeta(form.cancelPolicy).requiresDeadline
				? cancelDeadline
				: cancelDeadline,
			geo,
			sessions: buildSingleSession(startsAt, endsAt, null),
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
		const endsAt = toIsoFromDateTime(row.endDate, row.endTime);
		const capacity = row.cupo ? Number(row.cupo) : null;
		const coverImageUrl = normalizeWebImageUrl(row.coverImageUrl) || null;

		// Borrador sin horas ni staff: se completa después desde la lista de eventos.
		return {
			title: row.title,
			description: row.description,
			category: row.category,
			location: row.location || null,
			organizer: row.organizer || null,
			starts_at: startsAt,
			ends_at: endsAt,
			hours_value: null,
			capacity_enabled: capacity !== null,
			capacity,
			status: 'draft',
			cover_image_url: coverImageUrl,
			sessions: buildSingleSession(startsAt, endsAt, null),
			attributes: {
				location: row.location || null,
				organizer: row.organizer || null,
				cover_image_url: coverImageUrl
			}
		};
	}

	function validatePayload(payload, source = form) {
		const payloadLocation = payload?.location || payload?.attributes?.location;
		const payloadOrganizer = payload?.organizer || payload?.attributes?.organizer;
		const isDraft = (payload?.status || 'draft') === 'draft';
		if (!payload?.title) return 'El título del evento es obligatorio.';
		if (!payload?.description) return 'La descripción del evento es obligatoria.';
		if (!isDraft) {
			if (!payload?.starts_at || !payload?.ends_at) return 'Para publicar, captura fecha y hora de inicio y de fin.';
			if (!payloadLocation?.trim?.()) return 'Para publicar, la ubicación es obligatoria.';
			if (!payloadOrganizer?.trim?.()) return 'Para publicar, el organizador es obligatorio.';
		}
		if (Boolean(payload?.starts_at) !== Boolean(payload?.ends_at)) {
			return 'Captura la fecha y hora de inicio y también las de fin.';
		}
		const now = Date.now();
		if (payload.starts_at && new Date(payload.starts_at).getTime() < now) {
			return 'La fecha/hora de inicio no puede estar en el pasado.';
		}
		if (payload.ends_at && new Date(payload.ends_at).getTime() < now) {
			return 'La fecha/hora de fin no puede estar en el pasado.';
		}
		if (payload.starts_at && new Date(payload.ends_at) <= new Date(payload.starts_at)) {
			return 'La fecha/hora de fin debe ser mayor a la de inicio.';
		}
		const hoursValue = parseHoursInput(payload.hours_value);
		if (
			!payload.afc_valuation &&
			payload.hours_value !== null &&
			(hoursValue === null || hoursValue < 0 || hoursValue > MAX_EVENT_HOURS)
		) {
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
		const publishing = form.status !== 'draft';

		if (!form.title?.trim()) errors.title = 'Campo obligatorio';
		if (!form.description?.trim()) errors.description = 'Campo obligatorio';
		if (publishing) {
			if (!form.date) errors.date = 'Campo obligatorio';
			if (!form.time) errors.time = 'Campo obligatorio';
			if (!form.location?.trim()) errors.location = 'Campo obligatorio';
			if (!form.organizer?.trim()) errors.organizer = 'Campo obligatorio';
		}
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
		if (afcHoursEnabled) {
			const afcValidation = validateAfcForSave(afcState, {
				catalog: $afcCatalog.types,
				status: form.status,
				defaultDate: form.date
			});
			if (!afcValidation.ok) errors.afc = afcValidation.message;
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
					? errors._payload || errors.afc || 'Completa los campos marcados en rojo.'
					: ''
		};
	}

	function validateManualField(field) {
		let message;
		const publishing = form.status !== 'draft';
		if (field === 'title' && !form.title?.trim()) message = 'El título del evento es obligatorio.';
		if (field === 'description' && !form.description?.trim()) message = 'La descripción del evento es obligatoria.';
		if (field === 'location' && publishing && !form.location?.trim()) message = 'La ubicación es obligatoria para publicar.';
		if (field === 'organizer' && publishing && !form.organizer?.trim()) message = 'El organizador es obligatorio para publicar.';
		if (field === 'date') {
			if (!form.date) message = publishing ? 'La fecha de inicio es obligatoria para publicar.' : undefined;
			else if (form.time && new Date(toIsoFromDateTime(form.date, form.time)).getTime() < Date.now()) message = 'La fecha y hora de inicio no pueden estar en el pasado.';
		}
		if (field === 'time') {
			if (!form.time) message = publishing ? 'La hora de inicio es obligatoria para publicar.' : undefined;
			else if (form.date && new Date(toIsoFromDateTime(form.date, form.time)).getTime() < Date.now()) message = 'La fecha y hora de inicio no pueden estar en el pasado.';
		}
		if (field === 'endDate') {
			if (!form.endDate) message = publishing ? 'La fecha de fin es obligatoria para publicar.' : undefined;
			else if (form.endTime && new Date(toIsoFromDateTime(form.endDate, form.endTime)).getTime() < Date.now()) message = 'La fecha y hora de fin no pueden estar en el pasado.';
		}
		if (field === 'endTime') {
			if (!form.endTime) message = publishing ? 'La hora de fin es obligatoria para publicar.' : undefined;
			else if (form.endDate && new Date(toIsoFromDateTime(form.endDate, form.endTime)).getTime() < Date.now()) message = 'La fecha y hora de fin no pueden estar en el pasado.';
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

		const validationErrors = bulk.rows.flatMap((row) => {
			const errs = validateCsvRow(row);
			return errs.length ? [{ index: row.csvLine, title: row.title || 'Evento sin título', errs }] : [];
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
			toast.success(
				`${response?.message || `Eventos creados: ${bulk.rows.length}`} Quedaron como borrador, con datos pendientes.`
			);
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

	// Encabezados en español; se aceptan con o sin acentos, mayúsculas o espacios.
	const CSV_COLUMNS = [
		['titulo', 'Título'],
		['descripcion', 'Descripción'],
		['categoria', 'Categoría'],
		['fecha_inicio', 'Fecha de inicio'],
		['hora_inicio', 'Hora de inicio'],
		['fecha_fin', 'Fecha de fin'],
		['hora_fin', 'Hora de fin'],
		['ubicacion', 'Ubicación'],
		['organizador', 'Organizador'],
		['cupo', 'Cupo'],
		['url_imagen', 'URL de imagen']
	];
	const CSV_REQUIRED_COLUMNS = ['titulo', 'descripcion'];
	const csvColumnLabels = Object.fromEntries(CSV_COLUMNS);

	function normalizeCsvKey(value) {
		return String(value ?? '')
			.trim()
			.toLowerCase()
			.normalize('NFD')
			.replace(/[\u0300-\u036f]/g, '')
			.replace(/[^a-z0-9]+/g, '_')
			.replace(/^_+|_+$/g, '');
	}

	function resolveCsvCategory(value) {
		const key = normalizeCsvKey(value);
		if (!key) return 'general';
		const match = EVENT_CATEGORY_OPTIONS.find(
			(option) => normalizeCsvKey(option.value) === key || normalizeCsvKey(option.label) === key
		);
		return match ? match.value : null;
	}

	function normalizeCsvTime(value) {
		const text = String(value ?? '').trim();
		return /^\d:[0-5]\d$/.test(text) ? `0${text}` : text;
	}

	function isValidCsvDate(value) {
		if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
		const date = new Date(`${value}T12:00:00`);
		return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
	}

	function isValidCsvTime(value) {
		return /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value);
	}

	function validateCsvRow(row) {
		const errs = [];
		if (!row.title) errs.push('El campo “Título” es obligatorio.');
		if (!row.description) errs.push('El campo “Descripción” es obligatorio.');
		if (!row.category) {
			errs.push(
				`La categoría “${row.categoryInput}” no existe. Usa: ${EVENT_CATEGORY_OPTIONS.map((option) => option.label).join(', ')}.`
			);
		}

		const schedule = [row.date, row.time, row.endDate, row.endTime];
		if (schedule.some(Boolean)) {
			if (!schedule.every(Boolean)) errs.push('Si capturas fechas, llena fecha y hora de inicio y también de fin.');
			if (row.date && !isValidCsvDate(row.date)) errs.push('La fecha de inicio debe tener el formato AAAA-MM-DD.');
			if (row.endDate && !isValidCsvDate(row.endDate)) errs.push('La fecha de fin debe tener el formato AAAA-MM-DD.');
			if (row.time && !isValidCsvTime(row.time)) errs.push('La hora de inicio debe tener el formato HH:MM (24 h).');
			if (row.endTime && !isValidCsvTime(row.endTime)) errs.push('La hora de fin debe tener el formato HH:MM (24 h).');
			const startsAt = toIsoFromDateTime(row.date, row.time);
			const endsAt = toIsoFromDateTime(row.endDate, row.endTime);
			if (!errs.length && startsAt && endsAt) {
				if (new Date(startsAt).getTime() < Date.now()) errs.push('La fecha de inicio no puede estar en el pasado.');
				if (new Date(endsAt) <= new Date(startsAt)) errs.push('La fecha y hora de fin deben ser posteriores al inicio.');
			}
		}
		if (row.cupo && (!/^\d+$/.test(row.cupo) || Number(row.cupo) <= 0)) {
			errs.push('El cupo debe ser un número entero mayor a 0; déjalo vacío para no limitarlo.');
		}
		if (row.coverImageUrl && !normalizeWebImageUrl(row.coverImageUrl)) errs.push('La URL de imagen no es válida.');
		return errs;
	}

	async function onPickCsv(e) {
		const input = e?.currentTarget;
		const file = input?.files?.[0] ?? null;
		bulk.file = file;
		bulk.rows = [];
		bulk.errors = [];

		if (!file) return;

		const text = (await file.text()).replace(/^\uFEFF/, '');
		const table = parseCsv(text);
		if (!table.length) {
			bulk.errors = [{ index: 1, title: 'Archivo CSV', errs: ['El archivo está vacío o no tiene un formato válido.'] }];
			bulkValidationErrors = bulk.errors;
			bulkErrorsDialogOpen = true;
			bulk.mode = false;
			return;
		}

		// headers
		const headers = table[0].map(normalizeCsvKey);
		const headerError = headers.includes('title')
			? 'El archivo usa la plantilla anterior en inglés. Descarga el ejemplo nuevo y copia tus datos ahí.'
			: CSV_REQUIRED_COLUMNS.filter((key) => !headers.includes(key))
					.map((key) => `Falta la columna obligatoria “${key}” (${csvColumnLabels[key]}).`)
					.join(' ');
		if (headerError) {
			bulk.errors = [{ index: 1, title: 'Encabezados del archivo', errs: [headerError] }];
			bulkValidationErrors = bulk.errors;
			bulkErrorsDialogOpen = true;
			bulk.mode = false;
			if (input) input.value = '';
			return;
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
				title: obj.titulo || '',
				description: obj.descripcion || '',
				categoryInput: obj.categoria || '',
				category: resolveCsvCategory(obj.categoria),
				date: obj.fecha_inicio || '',
				time: normalizeCsvTime(obj.hora_inicio),
				endDate: obj.fecha_fin || '',
				endTime: normalizeCsvTime(obj.hora_fin),
				location: obj.ubicacion || '',
				organizer: obj.organizador || '',
				cupo: obj.cupo || '',
				coverImageUrl: obj.url_imagen || ''
			};

			const errs = validateCsvRow(mapped);
			if (errs.length) errors.push({ index: i + 1, title: mapped.title || 'Evento sin título', errs });
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
		const formatDate = (daysAhead) => {
			const value = new Date();
			value.setDate(value.getDate() + daysAhead);
			return value.toISOString().slice(0, 10);
		};
		const header = CSV_COLUMNS.map(([key]) => key).join(',');
		const rows = [
			['Semana de Ingeniería y Tecnología', 'Conferencias y talleres para la comunidad universitaria', 'General', formatDate(30), '10:00', formatDate(30), '13:00', 'Auditorio Principal', 'Coordinación Académica', '120', 'https://images.unsplash.com/photo-1540575467063-178a50c2df87'],
			['Foro de Innovación Social', 'Panel con especialistas y organizaciones invitadas', 'Emprendimiento', formatDate(32), '16:00', formatDate(32), '18:30', 'Sala de Usos Múltiples', 'Dirección de Vinculación', '', ''],
			['Torneo Relámpago de Fútbol Rápido', 'Torneo por equipos mixtos entre carreras', 'Deportivas', formatDate(35), '09:00', formatDate(35), '14:00', 'Canchas de Fútbol Rápido', 'Departamento de Actividades Deportivas', '80', ''],
			['Muestra de Cine Mexicano', 'Proyección y charla con la directora invitada', 'Culturales', '', '', '', '', 'Teatro José Vasconcelos', 'Departamento de Actividades Culturales', '150', ''],
			['Taller de Redacción de Artículos Científicos', 'Taller práctico de estructura y estilo para publicar investigación', '', '', '', '', '', '', '', '', '']
		];
		const content = [header, ...rows.map((row) => row.map(csvCell).join(','))].join('\n') + '\n';

		const blob = new Blob(['\ufeff', content], { type: 'text/csv;charset=utf-8;' });
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = 'eventos-ejemplo.csv';
		a.click();
		URL.revokeObjectURL(url);
	}

	function csvCell(value) {
		const text = String(value ?? '');
		return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
	}

	const cardShadow =
		'shadow-[inset_0_1px_0_rgba(255,255,255,0.7),0_1px_2px_rgba(0,0,0,0.06)]';

	onMount(() => {
		loadStaffUsers();
		ensureAfcCatalog();
	});

	$: selectedCategoryMeta = getEventCategoryMeta(form.category);
	$: selectedCategoryIcon = getEventCategoryIcon(selectedCategoryMeta.iconKey);
	$: cancelPolicyMeta = getCancelPolicyMeta(form.cancelPolicy);
	$: afcPreview = computeAfcPreview(afcState, { catalog: $afcCatalog.types, defaultDate: form.date });
	$: if (
		fieldErrors.afc &&
		(!afcHoursEnabled ||
			validateAfcForSave(afcState, { catalog: $afcCatalog.types, status: form.status, defaultDate: form.date }).ok)
	) {
		fieldErrors = { ...fieldErrors, afc: undefined };
	}
</script>

<div class="min-h-screen bg-light-blue-background">
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
					<div class="flex w-full rounded-2xl border bg-white p-1" role="tablist" aria-label="Tipo de carga">
						<button
							type="button"
							role="tab"
							aria-selected={creationMode === 'individual'}
							class={`flex-1 rounded-xl px-3 py-2 text-sm font-semibold ${creationMode === 'individual' ? 'bg-blue-600 text-white' : 'text-slate-600 hover:bg-slate-100'}`}
							onclick={() => setCreationMode('individual')}
						>
							Individual
						</button>
						<button
							type="button"
							role="tab"
							aria-selected={creationMode === 'masiva'}
							class={`flex-1 rounded-xl px-3 py-2 text-sm font-semibold ${creationMode === 'masiva' ? 'bg-blue-600 text-white' : 'text-slate-600 hover:bg-slate-100'}`}
							onclick={() => setCreationMode('masiva')}
						>
							Masiva (CSV)
						</button>
					</div>

					{#if creationMode === 'masiva'}
					<Card class={`rounded-3xl border bg-card text-card-foreground ${cardShadow}`}>
						<CardContent class="p-5">
							<div class="flex items-start justify-between gap-4">
								<div>
									<div class="text-[14px] font-extrabold text-foreground">Crear desde CSV</div>
									<div class="mt-1 text-sm text-muted-foreground">
										Los eventos se crean como <span class="font-semibold text-foreground">borrador</span>; solo se requieren
										título y descripción. Completa los datos pendientes (horas AFC, staff, políticas) desde Eventos antes de
										publicarlos.
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
									<button
										type="button"
										class="text-sm font-semibold text-blue-600 hover:text-blue-700"
										onclick={downloadCsvTemplate}
									>
										Descargar ejemplo CSV
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
										Columnas: titulo, descripcion, categoria, fecha_inicio (AAAA-MM-DD), hora_inicio (HH:MM), fecha_fin,
										hora_fin, ubicacion, organizador, cupo, url_imagen. Solo título y descripción son obligatorios.
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
												Válidos: <span class="font-semibold">{bulk.rows.length - new Set(bulk.errors.map((err) => err.index)).size}</span> • Errores:{' '}
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
					{/if}

					{#if creationMode === 'individual'}
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
										<Label for="create-event-description" class={`text-sm font-semibold ${fieldErrors.description ? 'text-red-600' : 'text-blue-600'}`}>Descripción</Label>
										<Textarea
											id="create-event-description"
											name="description"
											class="mt-2 min-h-[120px] rounded-2xl"
											placeholder="Describe los objetivos y detalles del evento…"
											bind:value={form.description}
											onblur={() => validateManualField('description')}
										/>
										{#if fieldErrors.description}<div class="mt-1 text-xs text-red-600">{fieldErrors.description}</div>{/if}
										<div class="mt-1 text-xs text-muted-foreground">
											Para guardar como borrador basta con título y descripción; para publicar se requieren todos los datos.
										</div>
									</div>
								</div>
							</CardContent>
						</Card>

						<h2 class="text-[22px] font-extrabold tracking-tight text-foreground">Horas AFC</h2>
						<Card class={`rounded-3xl border bg-card text-card-foreground ${cardShadow}`}>
							<CardContent class="p-5">
								<AfcHoursSection
									bind:state={afcState}
									bind:enabled={afcHoursEnabled}
									catalog={$afcCatalog.types}
									catalogStatus={$afcCatalog.status === 'idle' ? 'loading' : $afcCatalog.status}
									catalogError={$afcCatalog.error}
									idPrefix="create-event-afc"
									defaultDate={form.date}
									error={fieldErrors.afc || ''}
								/>
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

								<!--
								Self check-in oculto: permitiría que el propio alumno registre su asistencia (QR/geolocalización)
								sin escaneo del staff. Aún no existe ese flujo; solo se guardaba events.allow_self_checkin.
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
								-->

								<div class="mt-4 flex items-center justify-between rounded-2xl bg-slate-50 px-4 py-3">
									<div>
										<div class="text-sm font-semibold">Limitar cupo</div>
										<div class="text-xs text-muted-foreground">Si está desactivado, el evento será de cupo abierto.</div>
									</div>
									<Switch aria-label="Limitar cupo" bind:checked={form.capacityEnabled} />
								</div>

								<div class="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
									<div>
										<Label for="create-event-status" class="text-sm font-semibold text-blue-600">Estatus</Label>
										<select id="create-event-status" name="status" class="mt-2 h-12 w-full rounded-2xl border px-3" bind:value={form.status}>
											{#each statusOptions as status}
												<option value={status.value}>{status.label}</option>
											{/each}
										</select>
										{#if afcHoursEnabled && afcPreview.status === 'incomplete'}
											<div class="mt-1 text-xs text-amber-700">Sin horas AFC completas, el evento debe guardarse como borrador.</div>
										{/if}
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
										<div class="flex items-center gap-1.5">
											<Label for="create-event-registration-mode" class="text-sm font-semibold text-blue-600">Modo de registro</Label>
											<PolicyHelpTooltip title="Modo de registro" intro={EVENT_REGISTRATION_MODE_HELP} options={registrationModeOptions} />
										</div>
										<select id="create-event-registration-mode" name="registration_mode" class="mt-2 h-12 w-full rounded-2xl border px-3" bind:value={form.registrationMode}>
											{#each registrationModeOptions as mode}
												<option value={mode.value}>{mode.label}</option>
											{/each}
										</select>
									</div>
									{#if form.registrationMode === 'manual_review'}
										<div>
											<div class="flex items-center gap-1.5">
												<Label for="create-event-reapply" class="text-sm font-semibold text-blue-600">¿Puede volver a solicitar si es rechazado?</Label>
												<PolicyHelpTooltip title="Volver a solicitar" intro={EVENT_REAPPLY_HELP} options={EVENT_REAPPLY_OPTIONS} />
											</div>
											<select id="create-event-reapply" name="resubmission_policy" class="mt-2 h-12 w-full rounded-2xl border px-3" bind:value={form.resubmissionPolicy}>
												{#each EVENT_REAPPLY_OPTIONS as option (option.value)}
													<option value={option.value}>{option.label}</option>
												{/each}
											</select>
										</div>
									{/if}
								</div>

								<!-- Geocerca deshabilitada temporalmente: con la ubicación activa el staff no podía registrar check-ins. -->
								<div class="mt-4 flex items-center justify-between rounded-2xl bg-slate-50 px-4 py-3 opacity-60">
									<div>
										<div class="text-sm font-semibold">Geocerca obligatoria</div>
										<div class="text-xs text-muted-foreground">Temporalmente deshabilitada.</div>
									</div>
									<Switch aria-label="Geocerca obligatoria" bind:checked={form.geoEnforced} disabled />
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
										<div class="flex items-center gap-1.5">
											<Label for="create-event-cancel-policy" class="text-sm font-semibold text-blue-600">Política de cancelación</Label>
											<PolicyHelpTooltip title="Política de cancelación" intro={EVENT_CANCEL_POLICY_HELP} options={cancelPolicyOptions} />
										</div>
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
										<p class="mt-1 text-xs text-muted-foreground">{EVENT_COVER_HINT}</p>
									</div>

									{#if form.coverImageUrl && !normalizedCoverImageUrl}
										<div class="text-xs font-semibold text-red-600">Ingresa una URL válida (http/https).</div>
									{:else if normalizedCoverImageUrl}
										<div class="rounded-2xl border p-3">
											<div class="mx-auto flex aspect-[2/1] w-full max-w-md items-center justify-center overflow-hidden rounded-xl bg-slate-100">
												{#if coverPreviewFailed}
													<div class="px-4 text-center text-xs font-semibold text-red-600">No se pudo cargar la imagen con esa URL.</div>
												{:else}
													<img
														src={normalizedCoverImageUrl}
														alt="Preview portada"
														class="h-full w-full object-cover"
														onerror={() => (coverPreviewFailed = true)}
														onload={() => (coverPreviewFailed = false)}
													/>
												{/if}
											</div>
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
											Se crearán <span class="font-semibold text-foreground">{bulk.rows.length}</span> eventos como borrador, con datos pendientes.
										</div>
									</div>
									<Badge class="rounded-full bg-blue-50 text-blue-700 hover:bg-blue-50">Bulk</Badge>
								</div>

								<div class="mt-4 space-y-3">
									{#each bulk.rows.slice(0, 5) as ev, idx}
										<div class="rounded-2xl bg-slate-50 p-4">
											<div class="text-sm font-extrabold text-foreground">{idx + 1}. {ev.title}</div>
											<div class="mt-1 text-xs text-muted-foreground">
												{ev.date ? `${ev.date} ${ev.time}` : 'Sin fecha'} • {ev.location || 'Sin ubicación'}
											</div>
											<div class="mt-1 text-xs text-muted-foreground">Organizador: {ev.organizer || '—'}</div>
											<div class="mt-2 flex flex-wrap gap-2">
														<Badge class={`rounded-full ${getPreviewCategoryClass(ev.category)}`}>
															<span class="inline-flex items-center gap-1">
																<svelte:component this={getPreviewCategoryIcon(ev.category)} class="h-3.5 w-3.5" />
																<span>{getPreviewCategoryMeta(ev.category).label}</span>
															</span>
														</Badge>
												<!-- Self check-in oculto por ahora.
												<Badge class={`rounded-full ${ev.allowSelfCheckin ? 'bg-blue-50 text-blue-700 hover:bg-blue-50' : 'bg-slate-100 text-slate-700 hover:bg-slate-100'}`}>
													{ev.allowSelfCheckin ? 'Self check-in' : 'Sin self check-in'}
												</Badge>
												-->
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
												<div class="mx-auto flex aspect-[2/1] w-full max-w-md items-center justify-center overflow-hidden rounded-xl bg-slate-100">
													{#if coverPreviewFailed}
														<div class="px-4 text-center text-xs font-semibold text-red-600">
															No se pudo cargar la imagen con esa URL.
														</div>
													{:else}
														<img
															src={normalizedCoverImageUrl}
															alt="Preview portada"
															class="h-full w-full object-cover"
															onerror={() => (coverPreviewFailed = true)}
															onload={() => (coverPreviewFailed = false)}
														/>
													{/if}
												</div>
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

								<!-- Self check-in oculto por ahora.
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
								-->

								<div class="mt-3 rounded-2xl bg-slate-50 p-3">
									<div class="text-xs text-muted-foreground">Horas AFC</div>
									{#if !afcHoursEnabled}
										<div class="mt-1 text-sm font-semibold">No se consideran horas AFC</div>
										<div class="mt-1 text-sm">Horas AFC asignadas: 0</div>
									{:else}
									<div class="mt-1 text-sm font-semibold">
										{afcPreview.type?.name || 'Sin tipo de actividad'}{afcPreview.scenario ? ` · ${afcPreview.scenario.label}` : ''}
									</div>
									<div class="mt-1 text-sm">
										{#if afcPreview.status === 'calculated'}
											Horas AFC asignadas: {formatAfcHours(afcPreview.valuation.final_hours)}
										{:else if afcPreview.status === 'unselected'}
											Pendiente de selección
										{:else}
											Horas pendientes de captura
										{/if}
									</div>
									{/if}
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
