<script>
  import { onMount } from "svelte";
  import { goto } from "$app/navigation";
  import { toast } from "svelte-sonner";
  import { adminEventsApi, adminStaffUsersApi } from "$lib/services/api";
  import {
    EVENT_CANCEL_POLICY_CATALOG,
    EVENT_REGISTRATION_MODE_CATALOG,
    EVENT_RESUBMISSION_POLICY_CATALOG,
    EVENT_STATUS_CATALOG,
    catalogLabel,
  } from "../../routes/store";
  import {
    EVENT_CATEGORY_OPTIONS,
    getEventCategoryMeta,
    normalizeEventCategory,
  } from "$lib/catalogs/eventCategories";
  import { getEventCategoryIcon } from "$lib/catalogs/eventCategoryIcons";
  import { getEventCategoryStyleClasses } from "$lib/stores/eventCategoryStyles";
  import { DEFAULT_EVENT_STATUS_FILTER, EVENT_COVER_HINT, eventStatusesQueryValue, isPastEvent } from "$lib/utils/events.js";
  import EventStatusMultiSelect from "$lib/components/EventStatusMultiSelect.svelte";
  import { Card, CardContent } from "$lib/components/ui/card";
  import { Badge } from "$lib/components/ui/badge";
  import { Button } from "$lib/components/ui/button";
  import { Input } from "$lib/components/ui/input";
  import { Label } from "$lib/components/ui/label";
  import { Textarea } from "$lib/components/ui/textarea";
  import { Switch } from "$lib/components/ui/switch";
  import * as Dialog from "$lib/components/ui/dialog";
  import AfcHoursSection from "$lib/components/AfcHoursSection.svelte";
  import { afcCatalog, ensureAfcCatalog } from "$lib/stores/afcCatalog.js";
  import {
    afcStateFromEvent,
    buildAfcValuationPayload,
    computeAfcPreview,
    createAfcState,
    describeAfcEventHours,
    eventGrantsAfcHours,
    validateAfcForSave,
  } from "$lib/utils/afcHoursForm.js";
  import { CalendarDays, LayoutGrid, List, MapPin, Plus, User } from "lucide-svelte";

  const FALLBACK_IMAGE =
    "https://gaceta.cch.unam.mx/sites/default/files/styles/imagen_articulos_1920x1080/public/2020-07/video_mensaje_1.jpg?h=d1cb525d&itok=4PYz5F61";
  const minimumEventDatetime = (() => {
    const now = new Date();
    const offset = now.getTimezoneOffset() * 60_000;
    return new Date(now.getTime() - offset).toISOString().slice(0, 16);
  })();

  let loading = false;
  let error = "";
  let events = [];
  let editOpen = false;
  let editLoading = false;
  let editSubmitting = false;
  let deleting = false;
  let deleteConfirmOpen = false;
  let editError = "";
  let selectedEventId = null;
  let eventStaffCredentials = null;
  let staffUsers = [];
  let staffUsersLoading = false;
  let staffUsersError = "";
  let editOriginalStaffUserId = "";
  let editSelectedStaffUserId = "";
  let editAfcState = createAfcState();
  let editAfcHoursEnabled = true;
  let editAfcEvent = null;
  let editAfcError = "";
  let editHasAttendance = false;

  const VIEW_STORAGE_KEY = "afc.adminEvents.view";
  const EMPTY_BULK_CHANGES = {
    status: "",
    category: "",
    location: "",
    organizer: "",
    capacityMode: "",
    capacity: "",
    registration_mode: "",
    resubmission_policy: "",
    cancel_policy: "",
  };
  const BULK_STATUS_OPTIONS = ["draft", "published", "cancelled"].map((value) => EVENT_STATUS_CATALOG[value]);
  const REGISTRATION_MODE_OPTIONS = Object.values(EVENT_REGISTRATION_MODE_CATALOG);
  const RESUBMISSION_POLICY_OPTIONS = Object.values(EVENT_RESUBMISSION_POLICY_CATALOG);
  // Las políticas con fecha límite se capturan evento por evento.
  const BULK_CANCEL_POLICY_OPTIONS = Object.values(EVENT_CANCEL_POLICY_CATALOG).filter((option) => !option.requiresDeadline);

  let viewMode = "cards";
  let selectedIds = [];
  let bulkChanges = { ...EMPTY_BULK_CHANGES };
  let bulkDialogOpen = false;
  let bulkAfcEnabled = false;
  let bulkAfcState = createAfcState();
  let bulkAfcHoursEnabled = true;
  let bulkFormError = "";
  let bulkApplying = false;
  let bulkErrors = [];

  let filters = {
    page: 1,
    pageSize: 12,
    q: "",
    statuses: [...DEFAULT_EVENT_STATUS_FILTER],
    category: "",
  };

  let pagination = {
    page: 1,
    pageSize: 12,
    total: 0,
    totalPages: 1,
  };

  const categoryOptions = EVENT_CATEGORY_OPTIONS;

  let editForm = {
    title: "",
    description: "",
    coverImageUrl: "",
    location: "",
    organizer: "",
    startsAt: "",
    endsAt: "",
    status: "draft",
    registrationMode: "auto",
    resubmissionPolicy: "only_changes_requested",
    allowSelfCheckin: true,
    geoEnforced: false,
    cancelPolicy: "free_cancel",
    cancelDeadlineDate: "",
    cancelDeadlineTime: "",
    category: "general",
    capacityEnabled: true,
    cupo: "",
    geoCenterLat: "",
    geoCenterLng: "",
    geoRadiusM: 120,
    geoStrictAccuracyM: "",
  };

  let editCoverPreviewFailed = false;
  let lastEditCoverPreviewUrl = "";
  let normalizedEditCoverImageUrl = "";
  let selectedEditCategoryMeta = getEventCategoryMeta(editForm.category);
  let selectedEditCategoryIcon = getEventCategoryIcon(selectedEditCategoryMeta.iconKey);
  $: selectedEditCategoryMeta = getEventCategoryMeta(editForm.category);
  $: selectedEditCategoryIcon = getEventCategoryIcon(selectedEditCategoryMeta.iconKey);

  function formatDate(iso) {
    if (!iso) return "Sin fecha";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "Sin fecha";
    return d.toLocaleString("es-MX", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  function eventImage(ev) {
    return (
      ev?.coverImageUrl ||
      ev?.cover_image_url ||
      ev?.image_url ||
      ev?.attributes?.cover_image_url ||
      ev?.attributes?.image_url ||
      FALLBACK_IMAGE
    );
  }

  function eventLocation(ev) {
    return ev?.location || ev?.attributes?.location || "Sin ubicación";
  }

  function eventCategory(ev) {
    return getEventCategoryMeta(ev?.category).label.toUpperCase();
  }

  function eventCategoryPaletteClass(ev) {
    const categoryMeta = getEventCategoryMeta(ev?.category);
    const style = getEventCategoryStyleClasses(categoryMeta?.value || "general");
    return `${style.bgClass} ${style.colorClass}`;
  }

  function eventCategoryIcon(ev) {
    const categoryMeta = getEventCategoryMeta(ev?.category);
    return getEventCategoryIcon(categoryMeta.iconKey);
  }

  function eventOrganizer(ev) {
    return ev?.organizer || ev?.attributes?.organizer || "Sin organizador";
  }

  function getEventRegistrationsCount(ev) {
    return (
      Number(
        ev?.registrations_count ??
          ev?.registration_count ??
          ev?.attributes?.registrations_count ??
          ev?.attributes?.registration_count ??
          0,
      ) || 0
    );
  }

  function getEventCapacityMeta(ev) {
    const rawCapacity =
      ev?.capacity ?? ev?.attributes?.capacity ?? ev?.cupo ?? ev?.attributes?.cupo;
    const capacityEnabled = ev?.capacity_enabled;
    const hasCapacityValue =
      rawCapacity !== undefined && rawCapacity !== null && rawCapacity !== "";
    const hasCapacity = capacityEnabled === false ? false : hasCapacityValue;
    const capacity = hasCapacity ? Number(rawCapacity) || 0 : 0;

    return { hasCapacity, capacity };
  }

  function getEventAvailabilityLabel(ev) {
    const registrationsCount = getEventRegistrationsCount(ev);
    const { hasCapacity, capacity } = getEventCapacityMeta(ev);

    if (hasCapacity) {
      const available = Math.max(capacity - registrationsCount, 0);
      return `Inscritos: ${registrationsCount} · Disponibles: ${available}`;
    }

    return `Inscritos: ${registrationsCount} · Disponibles: Sin límite`;
  }

  function isCareerRestricted(ev) {
    return ev?.can_manage === false;
  }

  function isBlank(value) {
    return value === undefined || value === null || String(value).trim() === "";
  }

  // Datos sin los que el evento no puede publicarse.
  function missingEventData(ev) {
    const missing = [];
    if (isBlank(ev?.description)) missing.push("descripción");
    if (!ev?.starts_at || !ev?.ends_at) missing.push("fechas");
    if (isBlank(ev?.location ?? ev?.attributes?.location)) missing.push("ubicación");
    if (isBlank(ev?.organizer ?? ev?.attributes?.organizer)) missing.push("organizador");
    if (ev?.hours_value === null || ev?.hours_value === undefined) missing.push("horas AFC");
    return missing;
  }

  function setViewMode(mode) {
    viewMode = mode;
    selectedIds = [];
    bulkErrors = [];
    try {
      localStorage.setItem(VIEW_STORAGE_KEY, mode);
    } catch {
      // Sin almacenamiento local se usa la vista por defecto.
    }
  }

  function toggleSelected(id) {
    selectedIds = selectedIds.includes(id) ? selectedIds.filter((item) => item !== id) : [...selectedIds, id];
  }

  function toggleAllSelected() {
    selectedIds = allSelected ? [] : [...manageableIds];
  }

  $: manageableIds = events.filter((ev) => !isCareerRestricted(ev)).map((ev) => ev.id);
  $: allSelected = manageableIds.length > 0 && manageableIds.every((id) => selectedIds.includes(id));
  $: hasBulkChanges =
    bulkAfcEnabled ||
    Object.entries(bulkChanges).some(([key, value]) => key !== "capacity" && String(value).trim() !== "");

  function openBulkDialog() {
    if (!selectedIds.length) return;
    bulkChanges = { ...EMPTY_BULK_CHANGES };
    bulkAfcEnabled = false;
    bulkAfcState = createAfcState();
    bulkAfcHoursEnabled = true;
    bulkFormError = "";
    bulkDialogOpen = true;
  }

  function eventDateKey(ev) {
    return isoToLocalDatetime(ev?.starts_at).slice(0, 10);
  }

  function validateBulkChanges() {
    if (bulkChanges.capacityMode === "limited") {
      const capacity = Number(bulkChanges.capacity);
      if (!Number.isInteger(capacity) || capacity <= 0) return "El cupo debe ser un número entero mayor a 0.";
    }
    if (bulkAfcEnabled && bulkAfcHoursEnabled) {
      const today = new Date().toISOString().slice(0, 10);
      const preview = computeAfcPreview(bulkAfcState, { catalog: $afcCatalog.types, defaultDate: today });
      if (preview.isCommittee) {
        return "Las actividades del Comité de Carrera requieren dictamen; capáturalas evento por evento.";
      }
      const validation = validateAfcForSave(bulkAfcState, {
        catalog: $afcCatalog.types,
        status: bulkChanges.status || "draft",
        defaultDate: today,
      });
      if (!validation.ok) return validation.message;
    }
    return "";
  }

  function buildBulkPayload(ev) {
    const payload = {};
    for (const key of ["status", "category", "registration_mode", "resubmission_policy", "cancel_policy"]) {
      if (bulkChanges[key]) payload[key] = bulkChanges[key];
    }
    if (payload.cancel_policy) payload.cancel_deadline = null;
    if (bulkChanges.location.trim()) payload.location = bulkChanges.location.trim();
    if (bulkChanges.organizer.trim()) payload.organizer = bulkChanges.organizer.trim();
    if (bulkChanges.capacityMode === "unlimited") {
      payload.capacity_enabled = false;
      payload.capacity = null;
    } else if (bulkChanges.capacityMode === "limited") {
      payload.capacity_enabled = true;
      payload.capacity = Number(bulkChanges.capacity);
    }
    if (bulkAfcEnabled && !bulkAfcHoursEnabled) {
      payload.afc_hours_enabled = false;
    } else if (bulkAfcEnabled) {
      // La fecha de cada evento se usa para los cursos de una sola jornada; la evidencia va evento por evento.
      const afcValuation = buildAfcValuationPayload(bulkAfcState, {
        catalog: $afcCatalog.types,
        defaultDate: eventDateKey(ev),
      });
      if (afcValuation) payload.afc_valuation = { ...afcValuation, evidence_file_id: null };
    }
    return payload;
  }

  async function applyBulkChanges() {
    if (!selectedIds.length || !hasBulkChanges || bulkApplying) return;
    bulkFormError = validateBulkChanges();
    if (bulkFormError) return;

    bulkApplying = true;
    bulkErrors = [];
    let updated = 0;
    for (const id of selectedIds) {
      const ev = events.find((item) => item.id === id);
      const payload = buildBulkPayload(ev);
      const title = ev?.title || `Evento ${id}`;
      try {
        await adminEventsApi.updateEvent(id, payload);
        updated += 1;
      } catch (e) {
        const message = e?.message || "No se pudo actualizar.";
        const { status, ...otherChanges } = payload;
        // Si falla el cambio de estatus (p. ej. faltan datos para publicar), se guardan los demás cambios.
        if (status && Object.keys(otherChanges).length) {
          try {
            await adminEventsApi.updateEvent(id, otherChanges);
            updated += 1;
            bulkErrors = [...bulkErrors, { id, title, message: `Se guardaron los demás cambios, pero no cambió su estatus. ${message}` }];
            continue;
          } catch (retryError) {
            bulkErrors = [...bulkErrors, { id, title, message: retryError?.message || message }];
            continue;
          }
        }
        bulkErrors = [...bulkErrors, { id, title, message }];
      }
    }
    bulkApplying = false;
    bulkDialogOpen = false;

    if (updated) toast.success(`${updated} evento(s) actualizado(s).`);
    if (bulkErrors.length) toast.warning(`${bulkErrors.length} evento(s) requieren revisión; consulta el detalle.`);
    selectedIds = bulkErrors.map((item) => item.id);
    await loadEvents({ page: filters.page });
  }

  function normalizeStaffUserId(value) {
    if (value === undefined || value === null || value === "") return "";
    const n = Number(value);
    if (!Number.isInteger(n) || n <= 0) return "";
    return String(n);
  }

  function resolveEventStaffUserId(eventData) {
    return normalizeStaffUserId(
      eventData?.staff_user_id ??
        eventData?.staff?.id ??
        eventData?.staff_user?.id ??
        eventData?.attributes?.staff_user_id ??
        eventData?.meta?.staff_user_id,
    );
  }

  async function loadStaffUsers() {
    staffUsersLoading = true;
    staffUsersError = "";
    try {
      const res = await adminStaffUsersApi.list();
      staffUsers = Array.isArray(res?.staff_users) ? res.staff_users : [];
    } catch (e) {
      staffUsers = [];
      staffUsersError = e?.message || "No se pudieron cargar usuarios staff.";
    } finally {
      staffUsersLoading = false;
    }
  }

  function isoToLocalDatetime(iso) {
    if (!iso) return "";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "";
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    const hh = String(d.getHours()).padStart(2, "0");
    const mm = String(d.getMinutes()).padStart(2, "0");
    return `${y}-${m}-${day}T${hh}:${mm}`;
  }

  function localDatetimeToIso(value) {
    if (!value) return null;
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return null;
    return d.toISOString();
  }

  function normalizeWebImageUrl(value) {
    const raw = String(value || "").trim();
    if (!raw) return "";

    let candidate = raw;
    if (raw.startsWith("//")) {
      candidate = `https:${raw}`;
    } else if (!/^https?:\/\//i.test(raw)) {
      if (/^www\./i.test(raw) || /^[a-z0-9.-]+\.[a-z]{2,}(?:\/|$)/i.test(raw)) {
        candidate = `https://${raw}`;
      }
    }

    try {
      const parsed = new URL(candidate);
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return "";
      return parsed.toString();
    } catch {
      return "";
    }
  }

  function isValidHttpUrl(value) {
    return Boolean(normalizeWebImageUrl(value));
  }

  function toIsoFromDateTime(date, time) {
    if (!date || !time) return null;
    const dt = new Date(`${date}T${time}:00`);
    if (Number.isNaN(dt.getTime())) return null;
    return dt.toISOString();
  }

  function resolveCancelPolicyForPayload(policy) {
    if (policy === "free_until_deadline") return "free_cancel";
    return policy;
  }

  function applyEventToForm(ev) {
    if (!ev) return;
    const cancelDeadlineLocal = isoToLocalDatetime(ev.cancel_deadline);
    const [cancelDeadlineDate = "", cancelDeadlineTime = ""] =
      cancelDeadlineLocal ? cancelDeadlineLocal.split("T") : ["", ""];
    const cancelPolicyUi =
      ev.cancel_policy === "free_cancel" && ev.cancel_deadline
        ? "free_until_deadline"
        : ev.cancel_policy || "free_cancel";

    editForm = {
      title: ev.title || "",
      description: ev.description || "",
      coverImageUrl:
        ev?.cover_image_url ||
        ev?.image_url ||
        ev?.attributes?.cover_image_url ||
        ev?.attributes?.image_url ||
        "",
      location: ev.location || ev?.attributes?.location || "",
      organizer: ev.organizer || ev?.attributes?.organizer || "",
      startsAt: isoToLocalDatetime(ev.starts_at),
      endsAt: isoToLocalDatetime(ev.ends_at),
      status: ev.status || "draft",
      registrationMode: ev.registration_mode || "auto",
      resubmissionPolicy: ev.resubmission_policy || "only_changes_requested",
      allowSelfCheckin: Boolean(ev.allow_self_checkin),
      // Geocerca deshabilitada temporalmente; restaurar: geoEnforced: Boolean(ev.geo_enforced),
      geoEnforced: false,
      cancelPolicy: cancelPolicyUi,
      cancelDeadlineDate,
      cancelDeadlineTime,
      category: normalizeEventCategory(ev?.category, "general"),
      capacityEnabled: Boolean(ev?.capacity_enabled),
      cupo: ev?.capacity ?? ev?.attributes?.cupo ?? "",
      geoCenterLat: ev?.geo?.center_lat ?? "",
      geoCenterLng: ev?.geo?.center_lng ?? "",
      geoRadiusM: ev?.geo?.radius_m ?? 120,
      geoStrictAccuracyM: ev?.geo?.strict_accuracy_m ?? "",
    };

    eventStaffCredentials = extractStaffCredentials(ev);
    editOriginalStaffUserId = resolveEventStaffUserId(ev);
    editSelectedStaffUserId = editOriginalStaffUserId;
    editAfcEvent = ev;
    editAfcState = afcStateFromEvent(ev);
    editAfcHoursEnabled = eventGrantsAfcHours(ev);
    editAfcError = "";
    editHasAttendance = Boolean(ev?.has_attendance);
  }

  function extractStaffCredentials(eventData) {
    const staffSourceCandidates = [
      eventData?.staff,
      eventData?.staff_user,
      eventData?.generated_staff,
      eventData?.created_staff,
      eventData?.staff_credentials,
      eventData?.credentials?.staff,
      eventData?.attributes?.staff,
      eventData?.attributes?.staff_credentials,
      eventData?.meta?.staff,
      eventData?.meta?.staff_credentials,
    ];

    const raw = staffSourceCandidates.find(
      (candidate) => candidate && typeof candidate === "object",
    );
    const fallbackRaw = {
      email:
        eventData?.staff_email ??
        eventData?.staffEmail ??
        eventData?.generated_staff_email ??
        eventData?.attributes?.staff_email ??
        eventData?.meta?.staff_email,
      username:
        eventData?.staff_username ??
        eventData?.staffUsername ??
        eventData?.generated_staff_username ??
        eventData?.attributes?.staff_username ??
        eventData?.meta?.staff_username,
      password:
        eventData?.staff_password ??
        eventData?.staffPassword ??
        eventData?.generated_staff_password ??
        eventData?.attributes?.staff_password ??
        eventData?.meta?.staff_password,
    };
    const source = raw || fallbackRaw;

    if (!source || typeof source !== "object") return null;

    const username =
      source?.username ||
      source?.user ||
      source?.login ||
      source?.email ||
      source?.correo ||
      "";

    const displayName =
      source?.name ||
      source?.full_name ||
      [source?.first_name, source?.last_name].filter(Boolean).join(" ").trim() ||
      "";

    if (!username && !displayName) return null;

    return {
      username,
      displayName,
      role: source?.role || "staff",
    };
  }

  async function loadEvents(next = {}) {
    loading = true;
    error = "";
    const query = { ...filters, ...next };
    const categoryFilter = String(query?.category || "").trim();
    query.category = categoryFilter ? normalizeEventCategory(categoryFilter, "general") : "";

    try {
      const { statuses, ...rest } = query;
      const res = await adminEventsApi.listEvents({ ...rest, status: eventStatusesQueryValue(statuses) });
      events = Array.isArray(res?.events) ? res.events : [];
      selectedIds = selectedIds.filter((id) => events.some((ev) => ev.id === id && !isCareerRestricted(ev)));
      pagination = res?.pagination || pagination;
      filters = { ...filters, ...query };
    } catch (e) {
      error = e?.message || "No se pudieron cargar los eventos.";
      events = [];
    } finally {
      loading = false;
    }
  }

  function search() {
    loadEvents({ page: 1 });
  }

  function prevPage() {
    if (filters.page <= 1) return;
    loadEvents({ page: filters.page - 1 });
  }

  function nextPage() {
    if (filters.page >= (pagination.totalPages || 1)) return;
    loadEvents({ page: filters.page + 1 });
  }

  function goToMetrics(event, e) {
    e?.stopPropagation?.();
    e?.preventDefault?.();
    if (isCareerRestricted(event)) return;
    const eventId = event?.id;
    if (!eventId) return;
    goto(`/admin/events/${eventId}/metrics`);
  }

  function buildSingleSession(startsAt, endsAt, hoursValue) {
    if (startsAt && endsAt) {
      return [
        {
          starts_at: startsAt,
          ends_at: endsAt,
          label: "Sesión principal",
          hours_value: hoursValue,
        },
      ];
    }

    return [];
  }

  function buildUpdatePayload() {
    const startsAt = localDatetimeToIso(editForm.startsAt);
    const endsAt = localDatetimeToIso(editForm.endsAt);
    const afcValuation =
      editHasAttendance || !editAfcHoursEnabled
        ? null
        : buildAfcValuationPayload(editAfcState, {
            catalog: $afcCatalog.types,
            defaultDate: String(editForm.startsAt || "").slice(0, 10),
          });
    const cancelDeadline =
      editForm.cancelPolicy === "free_until_deadline"
        ? toIsoFromDateTime(
            editForm.cancelDeadlineDate,
            editForm.cancelDeadlineTime,
          )
        : null;

    return {
      title: editForm.title?.trim(),
      description: editForm.description?.trim() || null,
      category: editForm.category,
      location: editForm.location?.trim() || null,
      organizer: editForm.organizer?.trim() || null,
      ...(editHasAttendance ? {} : { starts_at: startsAt, ends_at: endsAt }),
      ...(afcValuation ? { afc_valuation: afcValuation } : {}),
      ...(!editHasAttendance && !editAfcHoursEnabled ? { afc_hours_enabled: false } : {}),
      capacity_enabled: Boolean(editForm.capacityEnabled),
      capacity: editForm.capacityEnabled
        ? editForm.cupo === ""
          ? null
          : Number(editForm.cupo)
        : null,
      status: editForm.status,
      registration_mode: editForm.registrationMode,
      resubmission_policy: editForm.resubmissionPolicy,
      // Self check-in oculto por ahora; sin enviarlo el backend conserva el valor actual.
      // allow_self_checkin: Boolean(editForm.allowSelfCheckin),
      geo_enforced: Boolean(editForm.geoEnforced),
      cancel_policy: resolveCancelPolicyForPayload(editForm.cancelPolicy),
      cancel_deadline: cancelDeadline,
      attributes: {
        cover_image_url: normalizedEditCoverImageUrl || null,
        location: editForm.location?.trim() || null,
        organizer: editForm.organizer?.trim() || null,
      },
      geo:
        editForm.geoEnforced &&
        editForm.geoCenterLat !== "" &&
        editForm.geoCenterLng !== ""
          ? {
              center_lat: Number(editForm.geoCenterLat),
              center_lng: Number(editForm.geoCenterLng),
              radius_m: Number(editForm.geoRadiusM) || 120,
              strict_accuracy_m:
                editForm.geoStrictAccuracyM === ""
                  ? null
                  : Number(editForm.geoStrictAccuracyM),
            }
          : null,
      sessions: editHasAttendance ? undefined : buildSingleSession(startsAt, endsAt, null),
      ...(normalizeStaffUserId(editSelectedStaffUserId) &&
      normalizeStaffUserId(editSelectedStaffUserId) !==
        normalizeStaffUserId(editOriginalStaffUserId)
        ? {
            assign_staff: true,
            staff_user_id: Number(normalizeStaffUserId(editSelectedStaffUserId)),
          }
        : {}),
    };
  }

  function validateUpdatePayload(payload) {
    const publishing = payload.status === "published";
    if (!payload.title) return "El título es obligatorio.";
    if (!payload.description) return "La descripción es obligatoria.";
    if (!editHasAttendance) {
      const scheduleError = validateEditSchedule(payload);
      if (scheduleError) return scheduleError;
    }
    if (payload.geo_enforced && !payload.geo) {
      return "Si activas geocerca, captura latitud y longitud.";
    }
    if (payload.capacity_enabled) {
      if (!Number.isInteger(payload.capacity) || payload.capacity <= 0) {
        return "El cupo debe ser un entero mayor a 0 cuando está habilitado.";
      }
    }
    if (publishing && !payload.location?.trim?.()) {
      return "Para publicar, la ubicación es obligatoria.";
    }
    if (publishing && !payload.organizer?.trim?.()) {
      return "Para publicar, el organizador es obligatorio.";
    }
    if (editForm.cancelPolicy === "free_until_deadline") {
      if (!editForm.cancelDeadlineDate || !editForm.cancelDeadlineTime) {
        return "Debes seleccionar fecha y hora límite para esta política de cancelación.";
      }
    }
    return "";
  }

  function validateEditSchedule(payload) {
    if (payload.status === "published" && (!payload.starts_at || !payload.ends_at)) {
      return "Para publicar, captura inicio y fin del evento.";
    }
    if (Boolean(payload.starts_at) !== Boolean(payload.ends_at)) {
      return "Captura el inicio y también el fin del evento.";
    }
    if (payload.starts_at && new Date(payload.ends_at) <= new Date(payload.starts_at)) {
      return "La fecha/hora de fin debe ser mayor a la de inicio.";
    }
    if (payload.starts_at && new Date(payload.starts_at).getTime() < Date.now()) {
      return "La fecha/hora de inicio no puede estar en el pasado.";
    }
    if (payload.ends_at && new Date(payload.ends_at).getTime() < Date.now()) {
      return "La fecha/hora de fin no puede estar en el pasado.";
    }
    if (!editAfcHoursEnabled) {
      editAfcError = "";
      return "";
    }
    const afcValidation = validateAfcForSave(editAfcState, {
      catalog: $afcCatalog.types,
      status: payload.status,
      defaultDate: String(editForm.startsAt || "").slice(0, 10),
      legacyHours: editLegacyAfcHours,
    });
    editAfcError = afcValidation.ok ? "" : afcValidation.message;
    return afcValidation.ok ? "" : afcValidation.message;
  }

  $: lockedStatusValues = editHasAttendance
    ? ["draft", "published"].filter((value) => value !== editAfcEvent?.status)
    : [];
  // Un evento guardado sin horas AFC (0 hrs) no tiene horas previas que conservar al reactivarlas.
  $: editLegacyAfcHours =
    editAfcEvent?.afc_valuation || !eventGrantsAfcHours(editAfcEvent) ? null : editAfcEvent?.hours_value ?? null;

  $: {
    const nextUrl = String(editForm.coverImageUrl || "").trim();
    if (nextUrl !== lastEditCoverPreviewUrl) {
      lastEditCoverPreviewUrl = nextUrl;
      editCoverPreviewFailed = false;
    }
  }

  $: normalizedEditCoverImageUrl = normalizeWebImageUrl(editForm.coverImageUrl);

  async function openEditDialog(ev) {
    if (isCareerRestricted(ev)) return;
    selectedEventId = ev?.id;
    editError = "";
    eventStaffCredentials = null;
    applyEventToForm(ev);
    if (!staffUsers.length && !staffUsersLoading) {
      loadStaffUsers();
    }
    editOpen = true;

    if (!selectedEventId) return;
    editLoading = true;
    try {
      const res = await adminEventsApi.getEventById(selectedEventId);
      const fullEvent = res?.event || res?.data || res;
      if (fullEvent?.id || fullEvent?.title) {
        applyEventToForm(fullEvent);
      }
    } catch {
      // Si no existe endpoint de detalle, mantenemos datos de lista.
    } finally {
      editLoading = false;
    }
  }

  async function submitEditEvent() {
    if (!selectedEventId || editSubmitting) return;
    editError = "";
    const payload = buildUpdatePayload();
    const invalid = validateUpdatePayload(payload);
    if (invalid) {
      editError = invalid;
      return;
    }

    editSubmitting = true;
    try {
      const res = await adminEventsApi.updateEvent(selectedEventId, payload);
      if (!res?.ok && res?.success === false) {
        throw new Error(res?.message || "No se pudo actualizar el evento.");
      }
      toast.success(res?.message || "Evento actualizado correctamente.");
      editOpen = false;
      await loadEvents({ page: filters.page });
    } catch (e) {
      editError = e?.message || "No se pudo actualizar el evento.";
    } finally {
      editSubmitting = false;
    }
  }

  function openDeleteConfirm() {
    if (!selectedEventId || deleting || editSubmitting) return;
    deleteConfirmOpen = true;
  }

  async function confirmDeleteEvent() {
    if (!selectedEventId || deleting) return;
    deleting = true;
    editError = "";

    try {
      const res = await adminEventsApi.deleteEvent(selectedEventId);
      if (!res?.ok && res?.success === false) {
        throw new Error(res?.message || "No se pudo eliminar el evento.");
      }

      toast.success(res?.message || "Evento eliminado correctamente.");
      deleteConfirmOpen = false;
      editOpen = false;
      await loadEvents({ page: filters.page });
    } catch (e) {
      editError = e?.message || "No se pudo eliminar el evento.";
      deleteConfirmOpen = false;
    } finally {
      deleting = false;
    }
  }

  onMount(() => {
    try {
      if (localStorage.getItem(VIEW_STORAGE_KEY) === "table") viewMode = "table";
    } catch {
      // Sin almacenamiento local se usa la vista por defecto.
    }
    loadEvents();
    loadStaffUsers();
    ensureAfcCatalog();
  });
</script>

<div class="mx-auto w-full max-w-screen-xl px-4 pb-16 pt-6 sm:px-6 lg:px-8">
  <div class="flex items-center justify-between gap-3">
    <h1 class="text-2xl font-semibold tracking-tight sm:text-3xl">Eventos</h1>
    <div class="flex items-center gap-2">
      <Badge class="rounded-full bg-blue-50 text-blue-700 hover:bg-blue-50">
        {pagination.total} disponibles
      </Badge>
      <Button
        class="gap-2 rounded-xl bg-blue-600 text-white hover:bg-blue-700"
        href="/admin/create-event"
      >
        <Plus class="h-4 w-4" />
        Crear
      </Button>
    </div>
  </div>

  <div class="mt-4 grid gap-3 sm:grid-cols-4">
    <Input
      id="admin-events-search"
      name="event_search"
      aria-label="Buscar eventos"
      class="h-11 rounded-2xl sm:col-span-2"
      placeholder="Buscar por nombre..."
      bind:value={filters.q}
      onkeydown={(e) => e.key === "Enter" && search()}
    />
    <select
      id="admin-events-category-filter"
      name="category_filter"
      aria-label="Filtrar por categoría"
      class="h-11 w-full rounded-2xl border px-3"
      bind:value={filters.category}
    >
      <option value="">Todas las categorías</option>
      {#each categoryOptions as category}
        <option value={category.value}>{category.label}</option>
      {/each}
    </select>
    <div class="flex gap-2 sm:col-span-1">
      <EventStatusMultiSelect id="admin-events-status-filter" bind:selected={filters.statuses} />
      <Button
        class="h-11 rounded-2xl bg-blue-600 text-white hover:bg-blue-700"
        onclick={search}
        disabled={loading}
      >
        {loading ? "..." : "Buscar"}
      </Button>
    </div>
  </div>

  {#if error}
    <div class="mt-4 text-sm font-semibold text-red-600">{error}</div>
  {/if}

  <div class="mt-4 flex items-center justify-end">
    <div class="inline-flex rounded-xl border bg-white p-1" role="tablist" aria-label="Vista de eventos">
      <button
        type="button"
        role="tab"
        aria-selected={viewMode === "cards"}
        class={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium ${viewMode === "cards" ? "bg-blue-600 text-white" : "text-slate-600 hover:bg-slate-100"}`}
        onclick={() => setViewMode("cards")}
      >
        <LayoutGrid class="h-4 w-4" />
        Tarjetas
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={viewMode === "table"}
        class={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium ${viewMode === "table" ? "bg-blue-600 text-white" : "text-slate-600 hover:bg-slate-100"}`}
        onclick={() => setViewMode("table")}
      >
        <List class="h-4 w-4" />
        Tabla
      </button>
    </div>
  </div>

  {#if viewMode === "table"}
    <div class="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border bg-slate-50 px-4 py-3">
      <div class="text-sm font-semibold">
        {selectedIds.length
          ? `${selectedIds.length} evento(s) seleccionado(s)`
          : "Selecciona eventos en la tabla para editarlos en conjunto"}
      </div>
      <div class="flex gap-2">
        {#if selectedIds.length}
          <Button variant="ghost" class="h-9 rounded-xl" onclick={() => (selectedIds = [])} disabled={bulkApplying}>
            Quitar selección
          </Button>
        {/if}
        <Button
          class="h-9 rounded-xl bg-blue-600 text-white hover:bg-blue-700"
          onclick={openBulkDialog}
          disabled={!selectedIds.length || bulkApplying}
        >
          Editar seleccionados
        </Button>
      </div>
    </div>
    <div>
      {#if bulkErrors.length}
        <div class="mt-3 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          <div class="font-semibold">Revisa {bulkErrors.length} evento(s):</div>
          <ul class="mt-1 list-disc space-y-0.5 pl-5">
            {#each bulkErrors as item (item.id)}
              <li><span class="font-medium">{item.title}:</span> {item.message}</li>
            {/each}
          </ul>
        </div>
      {/if}
    </div>

    <div class="mt-4 overflow-x-auto rounded-2xl border bg-white">
      <table class="w-full min-w-[960px] text-sm">
        <thead class="bg-slate-50 text-left text-xs uppercase tracking-wide text-muted-foreground">
          <tr>
            <th class="w-10 px-3 py-3">
              <input
                type="checkbox"
                class="h-4 w-4 accent-blue-600"
                aria-label="Seleccionar todos los eventos de esta página"
                checked={allSelected}
                disabled={!manageableIds.length}
                onchange={toggleAllSelected}
              />
            </th>
            <th class="px-3 py-3">Evento</th>
            <th class="px-3 py-3">Inicio</th>
            <th class="px-3 py-3">Estatus</th>
            <th class="px-3 py-3">Registro</th>
            <th class="px-3 py-3">Reenvío</th>
            <th class="px-3 py-3">Cancelación</th>
            <th class="px-3 py-3">Staff</th>
            <th class="px-3 py-3">Datos</th>
          </tr>
        </thead>
        <tbody>
          {#each events as ev (ev.id)}
            {@const missing = missingEventData(ev)}
            <tr
              class={`border-t align-top ${selectedIds.includes(ev.id) ? "bg-blue-50/60" : ""} ${isCareerRestricted(ev) ? "text-slate-400" : ""}`}
            >
              <td class="px-3 py-3">
                <input
                  type="checkbox"
                  class="h-4 w-4 accent-blue-600"
                  aria-label={`Seleccionar ${ev.title}`}
                  checked={selectedIds.includes(ev.id)}
                  disabled={isCareerRestricted(ev)}
                  onchange={() => toggleSelected(ev.id)}
                />
              </td>
              <td class="max-w-[280px] px-3 py-3">
                <button
                  type="button"
                  class="text-left font-semibold text-foreground hover:text-blue-700 hover:underline disabled:pointer-events-none"
                  disabled={isCareerRestricted(ev)}
                  onclick={() => openEditDialog(ev)}
                >
                  {ev.title}
                </button>
                <div class="mt-0.5 truncate text-xs text-muted-foreground">
                  {eventCategory(ev)} · {eventOrganizer(ev)}
                  {#if isCareerRestricted(ev)}· Otra carrera{/if}
                </div>
              </td>
              <td class="whitespace-nowrap px-3 py-3">{formatDate(ev.starts_at)}</td>
              <td class="px-3 py-3">
                <Badge class="rounded-full bg-slate-100 text-slate-700 hover:bg-slate-100">
                  {catalogLabel(EVENT_STATUS_CATALOG, ev.status)}
                </Badge>
              </td>
              <td class="px-3 py-3">{catalogLabel(EVENT_REGISTRATION_MODE_CATALOG, ev.registration_mode)}</td>
              <td class="px-3 py-3">{catalogLabel(EVENT_RESUBMISSION_POLICY_CATALOG, ev.resubmission_policy)}</td>
              <td class="px-3 py-3">
                {ev.cancel_policy === "free_cancel" && ev.cancel_deadline
                  ? catalogLabel(EVENT_CANCEL_POLICY_CATALOG, "free_until_deadline")
                  : catalogLabel(EVENT_CANCEL_POLICY_CATALOG, ev.cancel_policy)}
              </td>
              <td class="px-3 py-3 text-xs">
                {#if ev.staff_user_email}
                  {ev.staff_user_email}
                {:else}
                  <span class="text-amber-700">Sin asignar</span>
                {/if}
              </td>
              <td class="px-3 py-3">
                {#if missing.length}
                  <Badge class="rounded-full bg-amber-50 text-amber-800 hover:bg-amber-50" title={`Falta: ${missing.join(", ")}`}>
                    Faltan {missing.length}
                  </Badge>
                  <div class="mt-1 text-xs text-muted-foreground">{missing.join(", ")}</div>
                {:else}
                  <Badge class="rounded-full bg-emerald-50 text-emerald-700 hover:bg-emerald-50">Completo</Badge>
                {/if}
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {:else}
  <div class="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
    {#each events as ev (ev.id)}
      <Card
        class={`overflow-hidden rounded-2xl border pt-0 transition ${isCareerRestricted(ev) ? 'pointer-events-none cursor-not-allowed border-slate-300 bg-slate-100 opacity-60 grayscale select-none' : 'cursor-pointer hover:shadow-md'} ${isPastEvent(ev) ? 'border-slate-300 bg-slate-100 opacity-60 grayscale' : ''}`}
        data-past={isPastEvent(ev) ? "true" : undefined}
        data-career-disabled={isCareerRestricted(ev) ? "true" : undefined}
        onclick={() => openEditDialog(ev)}
        onkeydown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            openEditDialog(ev);
          }
        }}
        role="button"
        aria-disabled={isCareerRestricted(ev)}
        tabindex={isCareerRestricted(ev) ? "-1" : "0"}
      >
        <div
          class="aspect-[2/1] w-full bg-muted"
          style:background-image={`url('${eventImage(ev)}')`}
          style:background-size="cover"
          style:background-position="center"
        ></div>
        <CardContent class="space-y-2 p-4">
          <div class="flex items-center justify-between gap-2">
            <Badge class={`rounded-full ${eventCategoryPaletteClass(ev)}`}>
              <span class="inline-flex items-center gap-1">
                <svelte:component this={eventCategoryIcon(ev)} class="h-3.5 w-3.5" />
                <span>{eventCategory(ev)}</span>
              </span>
            </Badge>
            <Badge
              class="rounded-full bg-slate-100 text-slate-700 hover:bg-slate-100"
              >{catalogLabel(EVENT_STATUS_CATALOG, ev.status)}</Badge
            >
          </div>

          {#if isCareerRestricted(ev)}
            <Badge class="rounded-full bg-slate-700 text-white hover:bg-slate-700">
              Otra carrera{ev.owner_career_name ? ` · ${ev.owner_career_name}` : ""}
            </Badge>
          {/if}

          {#if describeAfcEventHours(ev)}
            <Badge class="rounded-full bg-amber-50 text-amber-800 hover:bg-amber-50">
              {describeAfcEventHours(ev)}
            </Badge>
          {/if}

          <div class="line-clamp-2 text-lg font-semibold leading-tight">
            {ev.title}
          </div>

          <div class="space-y-1 text-sm text-muted-foreground">
            <div class="flex items-center gap-2">
              <CalendarDays class="h-4 w-4" />
              <span>{formatDate(ev.starts_at)}</span>
            </div>
            <div class="flex items-center gap-2">
              <MapPin class="h-4 w-4" />
              <span>{eventLocation(ev)}</span>
            </div>
            <div class="flex items-center gap-2">
              <User class="h-4 w-4" />
              <span>{eventOrganizer(ev)}</span>
            </div>
          </div>

          <div class="pt-1">
            <Badge class="rounded-full bg-slate-100 text-slate-700 hover:bg-slate-100">
              {getEventAvailabilityLabel(ev)}
            </Badge>
          </div>

          <div class="pt-2">
            <Button
              class="w-full rounded-xl bg-blue-600 text-white hover:bg-blue-700"
              disabled={isCareerRestricted(ev)}
              onclick={(e) => goToMetrics(ev, e)}
            >
              Ver métricas
            </Button>
          </div>
        </CardContent>
      </Card>
    {/each}
  </div>
  {/if}

  {#if !loading && !events.length}
    <div
      class="mt-6 rounded-2xl border bg-card p-6 text-center text-sm text-muted-foreground"
    >
      No hay eventos disponibles con los filtros seleccionados.
    </div>
  {/if}

  <div class="mt-5 flex items-center justify-between">
    <div class="text-xs text-muted-foreground">
      Página {pagination.page} de {pagination.totalPages}
    </div>
    <div class="flex gap-2">
      <Button
        variant="secondary"
        class="rounded-xl"
        onclick={prevPage}
        disabled={loading || filters.page <= 1}
      >
        Anterior
      </Button>
      <Button
        variant="secondary"
        class="rounded-xl"
        onclick={nextPage}
        disabled={loading || filters.page >= (pagination.totalPages || 1)}
      >
        Siguiente
      </Button>
    </div>
  </div>
</div>

<Dialog.Root bind:open={editOpen}>
  <Dialog.Content
    class="flex max-h-[90dvh] flex-col overflow-hidden sm:max-w-3xl"
  >
    <Dialog.Header>
      <Dialog.Title>Editar evento</Dialog.Title>
      <Dialog.Description
        >Actualiza la información del evento seleccionado.</Dialog.Description
      >
    </Dialog.Header>

    <div class="min-h-0 flex-1 overflow-y-auto pr-1">
      {#if editLoading}
        <div class="py-6 text-sm text-muted-foreground">
          Cargando datos del evento...
        </div>
      {:else}
        {#if editHasAttendance}
          <div class="mb-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            Este evento ya tiene asistencias registradas. No se pueden cambiar sus fechas, horas AFC ni eliminarlo.
            Para corregir horas de un alumno usa el ajuste manual en Usuarios.
          </div>
        {/if}
        <div class="grid gap-4 py-2 sm:grid-cols-2">
          <div class="space-y-2 sm:col-span-2">
            <Label for="edit-event-title">Título *</Label>
            <Input id="edit-event-title" name="title" bind:value={editForm.title} />
          </div>

          <div class="space-y-2 sm:col-span-2">
            <Label for="edit-event-description">Descripción</Label>
            <Textarea id="edit-event-description" name="description" class="min-h-[100px]" bind:value={editForm.description} />
          </div>

          <div class="space-y-2 sm:col-span-2">
            <Label for="edit-event-cover-url">URL de imagen</Label>
            <Input
              id="edit-event-cover-url"
              name="cover_image_url"
              bind:value={editForm.coverImageUrl}
              placeholder="https://ejemplo.com/portada.jpg"
            />
            <p class="text-xs text-muted-foreground">{EVENT_COVER_HINT}</p>
            {#if editForm.coverImageUrl && !normalizedEditCoverImageUrl}
              <div class="text-xs font-semibold text-red-600">
                Ingresa una URL válida (http/https).
              </div>
            {/if}
          </div>

          {#if normalizedEditCoverImageUrl}
            <div class="sm:col-span-2 rounded-2xl border p-3">
              <div class="mx-auto flex aspect-[2/1] w-full max-w-md items-center justify-center overflow-hidden rounded-xl bg-slate-100">
                {#if editCoverPreviewFailed}
                  <div class="px-4 text-center text-xs font-semibold text-red-600">
                    No se pudo cargar la imagen con esa URL.
                  </div>
                {:else}
                  <img
                    src={normalizedEditCoverImageUrl}
                    alt="Preview portada"
                    class="h-full w-full object-cover"
                    onerror={() => (editCoverPreviewFailed = true)}
                    onload={() => (editCoverPreviewFailed = false)}
                  />
                {/if}
              </div>
            </div>
          {/if}

          <div class="space-y-2 sm:col-span-2">
            <Label for="edit-event-location">Ubicación *</Label>
            <Input
              id="edit-event-location"
              name="location"
              bind:value={editForm.location}
              placeholder="Auditorio Principal o URL"
            />
          </div>

          <div class="space-y-2 sm:col-span-2">
            <Label for="edit-event-organizer">Organizador *</Label>
            <Input
              id="edit-event-organizer"
              name="organizer"
              bind:value={editForm.organizer}
              placeholder="Ej. Coordinación Académica"
            />
          </div>

          <div class="space-y-2 sm:col-span-2 rounded-2xl border bg-slate-50 p-4">
            <div class="text-sm font-semibold text-slate-700">
              Asignación staff (solo selección de existente)
            </div>
            <div class="mt-2 space-y-2">
              <Label for="edit-event-staff-user">Usuario staff</Label>
              <select
                id="edit-event-staff-user"
                name="staff_user_id"
                class="h-10 w-full rounded-md border px-3"
                bind:value={editSelectedStaffUserId}
                disabled={staffUsersLoading}
              >
                {#if editOriginalStaffUserId && !staffUsers.some((s) => String(s.id) === normalizeStaffUserId(editOriginalStaffUserId))}
                  <option value={editOriginalStaffUserId}>
                    Staff actual (ID {editOriginalStaffUserId})
                  </option>
                {/if}
                {#if !editOriginalStaffUserId}
                  <option value="">Sin staff asignado</option>
                {/if}
                {#each staffUsers as staff (staff.id)}
                  <option value={staff.id}>
                    {staff.email || `Staff #${staff.id}`}{Array.isArray(staff.events) ? ` (${staff.events.length} evento${staff.events.length === 1 ? "" : "s"})` : ""}
                  </option>
                {/each}
              </select>
              {#if staffUsersLoading}
                <div class="text-xs text-muted-foreground">
                  Cargando usuarios staff...
                </div>
              {/if}
              {#if staffUsersError}
                <div class="text-xs font-semibold text-red-600">{staffUsersError}</div>
                <Button variant="outline" class="h-9 rounded-xl" onclick={loadStaffUsers}>
                  Reintentar carga
                </Button>
              {/if}
              <div class="text-xs text-muted-foreground">
                En edición solo puedes asignar un staff existente.
              </div>
            </div>
          </div>

          {#if eventStaffCredentials}
            <div class="space-y-2 sm:col-span-2 rounded-2xl border bg-slate-50 p-4">
              <div class="flex items-center gap-2 text-sm font-semibold text-slate-700">
                <User class="h-4 w-4" />
                Cuenta staff (solo lectura)
              </div>
              <div class="mt-3 grid gap-3 sm:grid-cols-1">
                <div class="space-y-1">
                  <Label>Usuario</Label>
                  <Input
                    value={eventStaffCredentials.username || "No disponible"}
                    readonly
                  />
                </div>
              </div>
              <div class="mt-2 text-xs text-muted-foreground">
                Por seguridad, la contraseña solo se muestra una vez en el diálogo al crear el evento.
              </div>
            </div>
          {/if}

          <div class="space-y-2">
            <Label for="edit-event-start">Inicio *</Label>
            <Input id="edit-event-start" name="starts_at" type="datetime-local" min={minimumEventDatetime} bind:value={editForm.startsAt} disabled={editHasAttendance} />
          </div>

          <div class="space-y-2">
            <Label for="edit-event-end">Fin *</Label>
            <Input id="edit-event-end" name="ends_at" type="datetime-local" min={editForm.startsAt || minimumEventDatetime} bind:value={editForm.endsAt} disabled={editHasAttendance} />
          </div>

          <div class="space-y-2 sm:col-span-2">
            <div
              class="flex items-center justify-between rounded-2xl bg-slate-50 px-4 py-3"
            >
              <div>
                <div class="text-sm font-semibold">Limitar cupo</div>
                <div class="text-xs text-muted-foreground">
                  Si está desactivado, el evento tendrá cupo abierto.
                </div>
              </div>
              <Switch aria-label="Limitar cupo" bind:checked={editForm.capacityEnabled} />
            </div>
          </div>

          <div class="space-y-3 sm:col-span-2 rounded-2xl border p-4">
            <div class="text-sm font-semibold text-slate-700">Horas AFC</div>
            <AfcHoursSection
              bind:state={editAfcState}
              bind:enabled={editAfcHoursEnabled}
              catalog={$afcCatalog.types}
              catalogStatus={$afcCatalog.status === "idle" ? "loading" : $afcCatalog.status}
              catalogError={$afcCatalog.error}
              idPrefix="edit-event-afc"
              defaultDate={String(editForm.startsAt || "").slice(0, 10)}
              eventId={selectedEventId}
              legacyHours={editLegacyAfcHours}
              error={editAfcError}
              disabled={editHasAttendance}
            />
          </div>

          {#if editForm.capacityEnabled}
            <div class="space-y-2">
              <Label for="edit-event-capacity">Cupo</Label>
              <Input id="edit-event-capacity" name="capacity" type="number" min="1" bind:value={editForm.cupo} />
            </div>
          {/if}

          <div class="space-y-2">
            <Label for="edit-event-status">Estatus</Label>
            <select
              id="edit-event-status"
              name="status"
              class="h-10 w-full rounded-md border px-3"
              bind:value={editForm.status}
            >
              <option value="draft" disabled={lockedStatusValues.includes("draft")}>Borrador</option>
              <option value="published" disabled={lockedStatusValues.includes("published")}>Publicado</option>
              <option value="cancelled">Cancelado</option>
              <option value="ended">Finalizado</option>
            </select>
          </div>

          <div class="space-y-2">
            <Label for="edit-event-category">Categoría</Label>
            <div class="relative">
              <span class="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                <svelte:component this={selectedEditCategoryIcon} class="h-4 w-4" />
              </span>
              <select
                id="edit-event-category"
                name="category"
                class="h-10 w-full rounded-md border pl-10 pr-3"
                bind:value={editForm.category}
              >
                {#each categoryOptions as category}
                  <option value={category.value}>{category.label}</option>
                {/each}
              </select>
            </div>
          </div>

          <div class="space-y-2">
            <Label for="edit-event-registration-mode">Modo de registro</Label>
            <select
              id="edit-event-registration-mode"
              name="registration_mode"
              class="h-10 w-full rounded-md border px-3"
              bind:value={editForm.registrationMode}
            >
              <option value="auto">Automático</option>
              <option value="manual_review">Revisión manual</option>
            </select>
          </div>

          <div class="space-y-2">
            <Label for="edit-event-resubmission-policy">Reenvío de requisitos</Label>
            <select
              id="edit-event-resubmission-policy"
              name="resubmission_policy"
              class="h-10 w-full rounded-md border px-3"
              bind:value={editForm.resubmissionPolicy}
            >
              <option value="allowed">Permitido</option>
              <option value="only_changes_requested"
                >Solo cambios solicitados</option
              >
              <option value="not_allowed">No permitido</option>
            </select>
          </div>

          <div class="space-y-2">
            <Label for="edit-event-cancel-policy">Política de cancelación</Label>
            <select
              id="edit-event-cancel-policy"
              name="cancel_policy"
              class="h-10 w-full rounded-md border px-3"
              bind:value={editForm.cancelPolicy}
            >
              <option value="free_until_deadline"
                >Cancelación libre hasta fecha y hora límite</option
              >
              <option value="free_cancel">Cancelación libre</option>
              <option value="locked">Bloqueada</option>
              <option value="penalize_no_show">Penalizar inasistencia</option>
            </select>
          </div>

          {#if editForm.cancelPolicy === "free_until_deadline"}
            <div class="space-y-2">
              <Label>Fecha límite</Label>
              <Input type="date" bind:value={editForm.cancelDeadlineDate} />
            </div>

            <div class="space-y-2">
              <Label>Hora límite</Label>
              <Input type="time" bind:value={editForm.cancelDeadlineTime} />
            </div>
          {/if}

          <!--
          Self check-in oculto: permitiría que el propio alumno registre su asistencia sin escaneo del staff.
          Aún no existe ese flujo; solo se guardaba events.allow_self_checkin.
          <div
            class="sm:col-span-2 flex items-center justify-between rounded-2xl bg-slate-50 px-4 py-3"
          >
            <div class="text-sm font-semibold">Permitir self check-in</div>
            <Switch aria-label="Permitir self check-in" bind:checked={editForm.allowSelfCheckin} />
          </div>
          -->

          <!-- Geocerca deshabilitada temporalmente: con la ubicación activa el staff no podía registrar check-ins. -->
          <div
            class="sm:col-span-2 flex items-center justify-between rounded-2xl bg-slate-50 px-4 py-3 opacity-60"
          >
            <div>
              <div class="text-sm font-semibold">Geocerca obligatoria</div>
              <div class="text-xs text-muted-foreground">Temporalmente deshabilitada.</div>
            </div>
            <Switch aria-label="Geocerca obligatoria" bind:checked={editForm.geoEnforced} disabled />
          </div>

          {#if editForm.geoEnforced}
            <div class="space-y-2">
              <Label>Latitud</Label>
              <Input
                type="number"
                step="0.000001"
                bind:value={editForm.geoCenterLat}
              />
            </div>
            <div class="space-y-2">
              <Label>Longitud</Label>
              <Input
                type="number"
                step="0.000001"
                bind:value={editForm.geoCenterLng}
              />
            </div>
            <div class="space-y-2">
              <Label>Radio (m)</Label>
              <Input type="number" min="1" bind:value={editForm.geoRadiusM} />
            </div>
            <div class="space-y-2">
              <Label>Precisión estricta (m)</Label>
              <Input
                type="number"
                min="0"
                bind:value={editForm.geoStrictAccuracyM}
              />
            </div>
          {/if}

          <!-- Sesiones adicionales temporalmente deshabilitadas.
            La edición enviará una única sesión principal con inicio/fin del evento. -->
          <div class="space-y-2 sm:col-span-2">
            <Label>Sesión</Label>
            <!--<div class="rounded-lg border bg-slate-50 px-3 py-2 text-xs text-muted-foreground">
              Este evento usa una sola sesión principal automática.
            </div>-->
          </div>
        </div>
      {/if}

      {#if editError}
        <div
          class="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
        >
          {editError}
        </div>
      {/if}
    </div>

    <Dialog.Footer>
      {#if !editHasAttendance}
        <Button
          variant="outline"
          class="mr-auto border-red-200 text-red-700 hover:bg-red-50"
          onclick={openDeleteConfirm}
          disabled={editSubmitting || editLoading || deleting}
        >
          Eliminar evento
        </Button>
      {/if}
      <Button
        variant="outline"
        onclick={() => (editOpen = false)}
        disabled={editSubmitting}>Cancelar</Button
      >
      <Button
        class="bg-blue-600 text-white hover:bg-blue-700"
        onclick={submitEditEvent}
        disabled={editSubmitting || editLoading || deleting}
      >
        {editSubmitting ? "Guardando..." : "Guardar cambios"}
      </Button>
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>

<Dialog.Root bind:open={deleteConfirmOpen}>
  <Dialog.Content class="sm:max-w-md">
    <Dialog.Header>
      <Dialog.Title>¿Eliminar evento?</Dialog.Title>
      <Dialog.Description>
        Esta acción no se puede deshacer. Se eliminará el evento y su
        información asociada.
      </Dialog.Description>
    </Dialog.Header>

    <Dialog.Footer>
      <Button
        variant="outline"
        onclick={() => (deleteConfirmOpen = false)}
        disabled={deleting}>Cancelar</Button
      >
      <Button
        class="bg-red-600 text-white hover:bg-red-700"
        onclick={confirmDeleteEvent}
        disabled={deleting}
      >
        {deleting ? "Eliminando..." : "Sí, eliminar"}
      </Button>
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>

<Dialog.Root bind:open={bulkDialogOpen}>
  <Dialog.Content class="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
    <Dialog.Header>
      <Dialog.Title>Editar {selectedIds.length} evento(s)</Dialog.Title>
      <Dialog.Description>
        Solo se cambian los campos que modifiques; lo que quede en “Sin cambio” o vacío se conserva en cada evento.
      </Dialog.Description>
    </Dialog.Header>

    <div class="space-y-5 py-2">
      <section class="space-y-3">
        <div class="text-sm font-semibold text-slate-700">Datos generales</div>
        <div class="grid gap-3 sm:grid-cols-2">
          <div class="space-y-1">
            <Label for="bulk-status">Estatus</Label>
            <select id="bulk-status" class="h-10 w-full rounded-xl border bg-white px-2 text-sm" bind:value={bulkChanges.status}>
              <option value="">Sin cambio</option>
              {#each BULK_STATUS_OPTIONS as option (option.value)}
                <option value={option.value}>{option.label}</option>
              {/each}
            </select>
          </div>
          <div class="space-y-1">
            <Label for="bulk-category">Categoría</Label>
            <select id="bulk-category" class="h-10 w-full rounded-xl border bg-white px-2 text-sm" bind:value={bulkChanges.category}>
              <option value="">Sin cambio</option>
              {#each categoryOptions as option (option.value)}
                <option value={option.value}>{option.label}</option>
              {/each}
            </select>
          </div>
          <div class="space-y-1">
            <Label for="bulk-location">Ubicación</Label>
            <Input id="bulk-location" class="h-10 rounded-xl" placeholder="Sin cambio" bind:value={bulkChanges.location} />
          </div>
          <div class="space-y-1">
            <Label for="bulk-organizer">Organizador</Label>
            <Input id="bulk-organizer" class="h-10 rounded-xl" placeholder="Sin cambio" bind:value={bulkChanges.organizer} />
          </div>
          <div class="space-y-1">
            <Label for="bulk-capacity-mode">Cupo</Label>
            <select id="bulk-capacity-mode" class="h-10 w-full rounded-xl border bg-white px-2 text-sm" bind:value={bulkChanges.capacityMode}>
              <option value="">Sin cambio</option>
              <option value="unlimited">Sin límite</option>
              <option value="limited">Limitar a…</option>
            </select>
          </div>
          {#if bulkChanges.capacityMode === "limited"}
            <div class="space-y-1">
              <Label for="bulk-capacity">Lugares por evento</Label>
              <Input id="bulk-capacity" class="h-10 rounded-xl" type="number" min="1" bind:value={bulkChanges.capacity} />
            </div>
          {/if}
        </div>
      </section>

      <section class="space-y-3">
        <div class="text-sm font-semibold text-slate-700">Registro y políticas</div>
        <div class="grid gap-3 sm:grid-cols-3">
          <div class="space-y-1">
            <Label for="bulk-registration-mode">Tipo de registro</Label>
            <select id="bulk-registration-mode" class="h-10 w-full rounded-xl border bg-white px-2 text-sm" bind:value={bulkChanges.registration_mode}>
              <option value="">Sin cambio</option>
              {#each REGISTRATION_MODE_OPTIONS as option (option.value)}
                <option value={option.value}>{option.label}</option>
              {/each}
            </select>
          </div>
          <div class="space-y-1">
            <Label for="bulk-resubmission">Política de reenvío</Label>
            <select id="bulk-resubmission" class="h-10 w-full rounded-xl border bg-white px-2 text-sm" bind:value={bulkChanges.resubmission_policy}>
              <option value="">Sin cambio</option>
              {#each RESUBMISSION_POLICY_OPTIONS as option (option.value)}
                <option value={option.value}>{option.label}</option>
              {/each}
            </select>
          </div>
          <div class="space-y-1">
            <Label for="bulk-cancel-policy">Política de cancelación</Label>
            <select id="bulk-cancel-policy" class="h-10 w-full rounded-xl border bg-white px-2 text-sm" bind:value={bulkChanges.cancel_policy}>
              <option value="">Sin cambio</option>
              {#each BULK_CANCEL_POLICY_OPTIONS as option (option.value)}
                <option value={option.value}>{option.label}</option>
              {/each}
            </select>
          </div>
        </div>
      </section>

      <section class="space-y-3 rounded-2xl border p-4">
        <div class="flex items-center justify-between gap-3">
          <div>
            <div class="text-sm font-semibold text-slate-700">Horas AFC</div>
            <div class="text-xs text-muted-foreground">
              Aplica la misma actividad a todos. Los cursos de una jornada usan la fecha de cada evento; el dictamen del
              Comité se adjunta evento por evento.
            </div>
          </div>
          <Switch aria-label="Cambiar horas AFC" bind:checked={bulkAfcEnabled} />
        </div>
        {#if bulkAfcEnabled}
          <AfcHoursSection
            bind:state={bulkAfcState}
            bind:enabled={bulkAfcHoursEnabled}
            catalog={$afcCatalog.types}
            catalogStatus={$afcCatalog.status === "idle" ? "loading" : $afcCatalog.status}
            catalogError={$afcCatalog.error}
            idPrefix="bulk-event-afc"
            defaultDate={new Date().toISOString().slice(0, 10)}
          />
        {/if}
      </section>

      <p class="text-xs text-muted-foreground">
        Un evento solo se publica si tiene todos sus datos (fechas, ubicación, organizador y horas AFC). Los que no
        cumplan se listarán con el motivo.
      </p>
      {#if bulkFormError}
        <div class="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{bulkFormError}</div>
      {/if}
    </div>

    <Dialog.Footer>
      <Button variant="outline" onclick={() => (bulkDialogOpen = false)} disabled={bulkApplying}>Cancelar</Button>
      <Button
        class="bg-blue-600 text-white hover:bg-blue-700"
        onclick={applyBulkChanges}
        disabled={!hasBulkChanges || bulkApplying}
      >
        {bulkApplying ? "Guardando..." : `Aplicar a ${selectedIds.length} evento(s)`}
      </Button>
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>
