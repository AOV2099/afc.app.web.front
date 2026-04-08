<script>
  import { onMount } from "svelte";
  import { goto } from "$app/navigation";
  import { toast } from "svelte-sonner";
  import { adminEventsApi, adminStaffUsersApi } from "$lib/services/api";
  import {
    EVENT_CATEGORY_OPTIONS,
    getEventCategoryMeta,
    normalizeEventCategory,
  } from "$lib/catalogs/eventCategories";
  import { getEventCategoryIcon } from "$lib/catalogs/eventCategoryIcons";
  import { getEventCategoryStyleClasses } from "$lib/stores/eventCategoryStyles";
  import { Card, CardContent } from "$lib/components/ui/card";
  import { Badge } from "$lib/components/ui/badge";
  import { Button } from "$lib/components/ui/button";
  import { Input } from "$lib/components/ui/input";
  import { Label } from "$lib/components/ui/label";
  import { Textarea } from "$lib/components/ui/textarea";
  import { Switch } from "$lib/components/ui/switch";
  import * as Dialog from "$lib/components/ui/dialog";
  import { CalendarDays, MapPin, User } from "lucide-svelte";

  const FALLBACK_IMAGE =
    "https://gaceta.cch.unam.mx/sites/default/files/styles/imagen_articulos_1920x1080/public/2020-07/video_mensaje_1.jpg?h=d1cb525d&itok=4PYz5F61";

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

  let filters = {
    page: 1,
    pageSize: 12,
    q: "",
    status: "",
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
    hoursValue: 0,
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
      hoursValue: Number(ev.hours_value ?? 0),
      status: ev.status || "draft",
      registrationMode: ev.registration_mode || "auto",
      resubmissionPolicy: ev.resubmission_policy || "only_changes_requested",
      allowSelfCheckin: Boolean(ev.allow_self_checkin),
      geoEnforced: Boolean(ev.geo_enforced),
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
      const res = await adminEventsApi.listEvents(query);
      events = Array.isArray(res?.events) ? res.events : [];
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

  function goToMetrics(eventId, e) {
    e?.stopPropagation?.();
    e?.preventDefault?.();
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
          hours_value: Number(hoursValue) || 0,
        },
      ];
    }

    return [];
  }

  function buildUpdatePayload() {
    const startsAt = localDatetimeToIso(editForm.startsAt);
    const endsAt = localDatetimeToIso(editForm.endsAt);
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
      starts_at: startsAt,
      ends_at: endsAt,
      hours_value: Number(editForm.hoursValue) || 0,
      capacity_enabled: Boolean(editForm.capacityEnabled),
      capacity: editForm.capacityEnabled
        ? editForm.cupo === ""
          ? null
          : Number(editForm.cupo)
        : null,
      status: editForm.status,
      registration_mode: editForm.registrationMode,
      resubmission_policy: editForm.resubmissionPolicy,
      allow_self_checkin: Boolean(editForm.allowSelfCheckin),
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
      sessions: buildSingleSession(
        startsAt,
        endsAt,
        editForm.hoursValue,
      ),
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
    if (!payload.title || !payload.starts_at || !payload.ends_at) {
      return "Título, inicio y fin son obligatorios.";
    }
    if (new Date(payload.ends_at) <= new Date(payload.starts_at)) {
      return "La fecha/hora de fin debe ser mayor a la de inicio.";
    }
    if (payload.geo_enforced && !payload.geo) {
      return "Si activas geocerca, captura latitud y longitud.";
    }
    if (payload.capacity_enabled) {
      if (!Number.isInteger(payload.capacity) || payload.capacity <= 0) {
        return "El cupo debe ser un entero mayor a 0 cuando está habilitado.";
      }
    }
    if (!payload.location?.trim?.()) {
      return "La ubicación es obligatoria.";
    }
    if (!payload.organizer?.trim?.()) {
      return "El organizador es obligatorio.";
    }
    if (editForm.cancelPolicy === "free_until_deadline") {
      if (!editForm.cancelDeadlineDate || !editForm.cancelDeadlineTime) {
        return "Debes seleccionar fecha y hora límite para esta política de cancelación.";
      }
    }
    return "";
  }

  $: {
    const nextUrl = String(editForm.coverImageUrl || "").trim();
    if (nextUrl !== lastEditCoverPreviewUrl) {
      lastEditCoverPreviewUrl = nextUrl;
      editCoverPreviewFailed = false;
    }
  }

  $: normalizedEditCoverImageUrl = normalizeWebImageUrl(editForm.coverImageUrl);

  async function openEditDialog(ev) {
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
    loadEvents();
    loadStaffUsers();
  });
</script>

<div class="mx-auto w-full max-w-screen-xl px-4 pb-16 pt-6 sm:px-6 lg:px-8">
  <div class="flex items-center justify-between gap-3">
    <h1 class="text-2xl font-semibold tracking-tight sm:text-3xl">Eventos</h1>
    <Badge class="rounded-full bg-blue-50 text-blue-700 hover:bg-blue-50">
      {pagination.total} disponibles
    </Badge>
  </div>

  <div class="mt-4 grid gap-3 sm:grid-cols-4">
    <Input
      class="h-11 rounded-2xl sm:col-span-2"
      placeholder="Buscar por nombre..."
      bind:value={filters.q}
      onkeydown={(e) => e.key === "Enter" && search()}
    />
    <select
      class="h-11 w-full rounded-2xl border px-3"
      bind:value={filters.category}
    >
      <option value="">Todas las categorías</option>
      {#each categoryOptions as category}
        <option value={category.value}>{category.label}</option>
      {/each}
    </select>
    <div class="flex gap-2 sm:col-span-1">
      <select
        class="h-11 w-full rounded-2xl border px-3"
        bind:value={filters.status}
      >
        <option value="">Todos</option>
        <option value="draft">Borrador</option>
        <option value="published">Publicado</option>
        <option value="cancelled">Cancelado</option>
        <option value="ended">Finalizado</option>
      </select>
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

  <div class="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
    {#each events as ev (ev.id)}
      <Card
        class="cursor-pointer overflow-hidden rounded-2xl border pt-0 transition hover:shadow-md"
        onclick={() => openEditDialog(ev)}
        onkeydown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            openEditDialog(ev);
          }
        }}
        role="button"
        tabindex="0"
      >
        <div
          class="h-44 w-full bg-muted"
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
              >{ev.status}</Badge
            >
          </div>

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
              onclick={(e) => goToMetrics(ev.id, e)}
            >
              Ver métricas
            </Button>
          </div>
        </CardContent>
      </Card>
    {/each}
  </div>

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
        <div class="grid gap-4 py-2 sm:grid-cols-2">
          <div class="space-y-2 sm:col-span-2">
            <Label>Título *</Label>
            <Input bind:value={editForm.title} />
          </div>

          <div class="space-y-2 sm:col-span-2">
            <Label>Descripción</Label>
            <Textarea class="min-h-[100px]" bind:value={editForm.description} />
          </div>

          <div class="space-y-2 sm:col-span-2">
            <Label>URL de imagen</Label>
            <Input
              bind:value={editForm.coverImageUrl}
              placeholder="https://ejemplo.com/portada.jpg"
            />
            {#if editForm.coverImageUrl && !normalizedEditCoverImageUrl}
              <div class="text-xs font-semibold text-red-600">
                Ingresa una URL válida (http/https).
              </div>
            {/if}
          </div>

          {#if normalizedEditCoverImageUrl}
            <div class="sm:col-span-2 rounded-2xl border p-3">
              {#if editCoverPreviewFailed}
                <div class="py-6 text-center text-xs font-semibold text-red-600">
                  No se pudo cargar la imagen con esa URL.
                </div>
              {:else}
                <img
                  src={normalizedEditCoverImageUrl}
                  alt="Preview portada"
                  class="h-44 w-full rounded-xl object-cover"
                  onerror={() => (editCoverPreviewFailed = true)}
                  onload={() => (editCoverPreviewFailed = false)}
                />
              {/if}
            </div>
          {/if}

          <div class="space-y-2 sm:col-span-2">
            <Label>Ubicación *</Label>
            <Input
              bind:value={editForm.location}
              placeholder="Auditorio Principal o URL"
            />
          </div>

          <div class="space-y-2 sm:col-span-2">
            <Label>Organizador *</Label>
            <Input
              bind:value={editForm.organizer}
              placeholder="Ej. Coordinación Académica"
            />
          </div>

          <div class="space-y-2 sm:col-span-2 rounded-2xl border bg-slate-50 p-4">
            <div class="text-sm font-semibold text-slate-700">
              Asignación staff (solo selección de existente)
            </div>
            <div class="mt-2 space-y-2">
              <Label>Usuario staff</Label>
              <select
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
            <Label>Inicio *</Label>
            <Input type="datetime-local" bind:value={editForm.startsAt} />
          </div>

          <div class="space-y-2">
            <Label>Fin *</Label>
            <Input type="datetime-local" bind:value={editForm.endsAt} />
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
              <Switch bind:checked={editForm.capacityEnabled} />
            </div>
          </div>

          <div class="space-y-2">
            <Label>Horas acreditables</Label>
            <Input
              type="number"
              min="0"
              step="0.25"
              bind:value={editForm.hoursValue}
            />
          </div>

          {#if editForm.capacityEnabled}
            <div class="space-y-2">
              <Label>Cupo</Label>
              <Input type="number" min="1" bind:value={editForm.cupo} />
            </div>
          {/if}

          <div class="space-y-2">
            <Label>Estatus</Label>
            <select
              class="h-10 w-full rounded-md border px-3"
              bind:value={editForm.status}
            >
              <option value="draft">Borrador</option>
              <option value="published">Publicado</option>
              <option value="cancelled">Cancelado</option>
              <option value="ended">Finalizado</option>
            </select>
          </div>

          <div class="space-y-2">
            <Label>Categoría</Label>
            <div class="relative">
              <span class="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                <svelte:component this={selectedEditCategoryIcon} class="h-4 w-4" />
              </span>
              <select
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
            <Label>Modo de registro</Label>
            <select
              class="h-10 w-full rounded-md border px-3"
              bind:value={editForm.registrationMode}
            >
              <option value="auto">Automático</option>
              <option value="manual_review">Revisión manual</option>
            </select>
          </div>

          <div class="space-y-2">
            <Label>Reenvío de requisitos</Label>
            <select
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
            <Label>Política de cancelación</Label>
            <select
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

          <div
            class="sm:col-span-2 flex items-center justify-between rounded-2xl bg-slate-50 px-4 py-3"
          >
            <div class="text-sm font-semibold">Permitir self check-in</div>
            <Switch bind:checked={editForm.allowSelfCheckin} />
          </div>

          <div
            class="sm:col-span-2 flex items-center justify-between rounded-2xl bg-slate-50 px-4 py-3"
          >
            <div class="text-sm font-semibold">Geocerca obligatoria</div>
            <Switch bind:checked={editForm.geoEnforced} />
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
      <Button
        variant="outline"
        class="mr-auto border-red-200 text-red-700 hover:bg-red-50"
        onclick={openDeleteConfirm}
        disabled={editSubmitting || editLoading || deleting}
      >
        Eliminar evento
      </Button>
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
