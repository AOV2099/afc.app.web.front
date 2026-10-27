<script>
  import { onMount } from 'svelte';
  import { toast } from 'svelte-sonner';
  import { Button } from "$lib/components/ui/button";
  import { Input } from "$lib/components/ui/input";
  import UnsubscribeDialog from '$lib/components/UnsubscribeDialog.svelte';
  import { adminEventsApi, publicEventsApi, myRegistrationsApi } from '$lib/services/api';
  import {
    DEFAULT_EVENT_STATUS_FILTER,
    eventStatusesQueryValue,
    isFutureEvent,
    isPastEvent,
    isVisibleToUser
  } from '$lib/utils/events.js';
  import { attendancePreview, canRequestUnsubscribe, describeAttendanceProgress } from '$lib/utils/eventSessions.js';
  import { mapEventToCard } from '$lib/utils/eventCards.js';
  import EventCard from "$lib/components/EventCard.svelte";
  import EventStatusMultiSelect from "$lib/components/EventStatusMultiSelect.svelte";

  import { Search, SlidersHorizontal } from "lucide-svelte";
  import EventDetailSheet from "./EventDetailSheet.svelte";

  export let adminMode = false;

  let sheetOpen = false;
  let selectedEvent = null;
  let loadingEvents = false;
  let loadError = '';

  let filters = {
    page: 1,
    pageSize: 20,
    q: '',
    statuses: [...DEFAULT_EVENT_STATUS_FILTER],
    starts_from: '',
    starts_to: ''
  };

  let pagination = {
    page: 1,
    pageSize: 20,
    total: 0,
    totalPages: 1
  };

  let upcoming = [];
  let registeringEventId = null;
  let registrationsByEventId = {};
  let unsubscribeDialogOpen = false;
  let unsubscribeTargetEvent = null;

  function mapAdminEventToUi(event) {
    return mapEventToCard(event);
  }

  function getAvailabilityLabel(item) {
    if (!item?.hasCapacity) return null;

    const inscritos = Number(item?.registrationsCount ?? 0) || 0;
    const capacity = Number(item?.capacity ?? 0) || 0;

    if (capacity > 0) {
      const disponibles = Math.max(capacity - inscritos, 0);
      return `Inscritos: ${inscritos} · Disponibles: ${disponibles}`;
    }

    return null;
  }

  function getRegistrationForEvent(eventId) {
    return registrationsByEventId?.[eventId] || null;
  }

  const ENROLLMENT_BADGES = {
    approved: { label: 'Inscrito', className: 'bg-emerald-100 text-emerald-800 hover:bg-emerald-100' },
    pending: { label: 'Solicitud pendiente', className: 'bg-amber-100 text-amber-800 hover:bg-amber-100' },
    changes_requested: { label: 'Solicitud pendiente', className: 'bg-amber-100 text-amber-800 hover:bg-amber-100' },
    cancel_pending: { label: 'Baja en revisión', className: 'bg-slate-200 text-slate-700 hover:bg-slate-200' }
  };

  // Recibe el mapa como argumento para que la marca se actualice al inscribirse o darse de baja.
  function enrollmentBadges(byEvent, eventId) {
    const status = String(byEvent?.[eventId]?.registration?.status || '').toLowerCase();
    return ENROLLMENT_BADGES[status] ? [ENROLLMENT_BADGES[status]] : [];
  }

  function isUsedTicket(ticket) {
    const status = String(ticket?.status || '').toLowerCase();
    return status === 'used';
  }

  function getPrimaryStateForEvent(item) {
    const registrationEntry = getRegistrationForEvent(item.id);
    const registrationStatus = String(registrationEntry?.registration?.status || '').toLowerCase();
    const ticket = registrationEntry?.ticket || null;
    const cancelRequestStatus = String(
      registrationEntry?.registration?.payload?.cancel_request?.status ||
      registrationEntry?.payload?.cancel_request?.status ||
      ''
    ).toLowerCase();

    if (registrationEntry) {
      const attendance = registrationEntry?.attendance || null;
      const attendanceLabel = describeAttendanceProgress(attendance);
      const hasPendingSessions = Number(attendance?.total) > 1 && Number(attendance?.pending) > 0;
      const base = {
        secondaryLabel: 'Darme de baja',
        secondaryDisabled: !canRequestUnsubscribe(registrationEntry),
        secondaryAction: 'request_unsubscribe',
        availabilityLabel: attendanceLabel || null
      };

      if (registrationStatus === 'approved' && isUsedTicket(ticket) && !hasPendingSessions) {
        return {
          label: 'Asistencia registrada',
          disabled: true,
          action: 'none',
          ticket,
          secondaryLabel: null,
          secondaryDisabled: true,
          secondaryAction: 'none',
          availabilityLabel: attendanceLabel || 'Este ticket ya ha sido registrado.'
        };
      }

      if (
        cancelRequestStatus === 'pending' ||
        registrationStatus === 'cancel_pending' ||
        registrationStatus.includes('review') ||
        registrationStatus.includes('withdraw_pending')
      ) {
        return {
          label: 'Baja en revisión',
          disabled: true,
          action: 'none',
          ticket: null,
          ...base,
          secondaryDisabled: true
        };
      }

      if (registrationStatus === 'pending' || registrationEntry?.pending_approval) {
        return {
          label: 'Pendiente',
          disabled: true,
          action: 'none',
          ticket: null,
          ...base
        };
      }

      if (registrationStatus === 'approved' && ticket) {
        return {
          label: null,
          disabled: true,
          action: 'none',
          ticket,
          ...base
        };
      }

      if (registrationStatus === 'approved') {
        return {
          label: 'Aprobado',
          disabled: true,
          action: 'none',
          ticket: null,
          ...base
        };
      }

      if (registrationStatus === 'rejected') {
        const canReapply = item?.raw?.resubmission_policy === 'allowed' && !isPastEvent(item);
        return {
          label: canReapply ? 'Volver a solicitar' : 'Solicitud rechazada',
          disabled: !canReapply,
          action: canReapply ? 'register' : 'none',
          ticket: null,
          ...base,
          secondaryLabel: null,
          secondaryDisabled: true,
          secondaryAction: 'none'
        };
      }
    }

    if (isPastEvent(item)) {
      return {
        label: 'Evento finalizado',
        disabled: true,
        action: 'none',
        ticket: null,
        secondaryLabel: null,
        secondaryDisabled: true,
        secondaryAction: 'none',
        availabilityLabel: 'Este evento ya finalizó.'
      };
    }

    const capacity = Number(item?.capacity ?? 0) || 0;
    const inscritos = Number(item?.registrationsCount ?? 0) || 0;
    if (item?.hasCapacity && capacity > 0 && inscritos >= capacity) {
      return {
        label: 'Sin cupo',
        disabled: true,
        action: 'none',
		ticket: null,
		secondaryLabel: null,
		secondaryDisabled: true,
		secondaryAction: 'none',
		availabilityLabel: null
      };
    }

    return {
      label: 'Inscribirme ahora',
      disabled: false,
      action: 'register',
		ticket: null,
		secondaryLabel: null,
		secondaryDisabled: true,
		secondaryAction: 'none',
		availabilityLabel: null
    };
  }

  function syncSelectedEventState(eventId) {
    if (!selectedEvent || selectedEvent.id !== eventId) return;
    const item = upcoming.find((ev) => ev.id === eventId);
    if (!item) return;

    const primaryState = getPrimaryStateForEvent(item);
    selectedEvent = {
      ...selectedEvent,
      primaryLabel: primaryState.label,
      primaryDisabled: primaryState.disabled,
      primaryAction: primaryState.action,
		ticket: primaryState.ticket,
		secondaryLabel: primaryState.secondaryLabel,
		secondaryDisabled: primaryState.secondaryDisabled,
		secondaryAction: primaryState.secondaryAction,
		availabilityLabel: primaryState.availabilityLabel || getAvailabilityLabel(item)
    };
  }

  function removeRegistrationState(eventId) {
    const nextMap = { ...registrationsByEventId };
    delete nextMap[eventId];
    delete nextMap[String(eventId)];
    registrationsByEventId = nextMap;
    syncSelectedEventState(eventId);
  }

  async function loadMyRegistrations() {
    if (adminMode) return;

    let page = 1;
    let totalPages = 1;
    const nextMap = {};

    do {
      const res = await myRegistrationsApi.list({ page, pageSize: 50 });
      const rows = Array.isArray(res?.registrations) ? res.registrations : [];

      rows.forEach((entry) => {
        const eventId = entry?.event?.id;
        if (!eventId) return;
        nextMap[eventId] = entry;
      });

      totalPages = Number(res?.pagination?.totalPages ?? 1) || 1;
      page += 1;
    } while (page <= totalPages && page <= 10);

    registrationsByEventId = nextMap;
  }

  async function enrichWithRegistrationsCount(items = []) {
    if (!Array.isArray(items) || items.length === 0) return items;
    return items.map((item) => ({
      ...item,
      registrationsCount: Number(item?.registrationsCount ?? 0) || 0
    }));
  }

  async function loadEvents(next = {}) {
    loadingEvents = true;
    loadError = '';

    const query = { ...filters, ...next };
    const now = Date.now();

    try {
      const { statuses, ...adminQuery } = query;
      const res = adminMode
        ? await adminEventsApi.listEvents({ ...adminQuery, status: eventStatusesQueryValue(statuses) })
        : await publicEventsApi.listEvents({
            page: query.page,
            pageSize: query.pageSize,
            q: query.q,
            starts_to: query.starts_to
          });
      const events = Array.isArray(res?.events) ? res.events : [];
          const mapped = await enrichWithRegistrationsCount(events.map(mapAdminEventToUi));
          const visible = adminMode ? mapped : mapped.filter((item) => isVisibleToUser(item, now));

          upcoming = adminMode ? visible : visible.filter((item) => isFutureEvent(item, now));
      pagination = res?.pagination || pagination;
      filters = { ...filters, ...query };
    } catch (err) {
      loadError = err?.message || 'No se pudieron cargar los eventos.';
      upcoming = [];
    } finally {
      loadingEvents = false;
    }
  }

  onMount(async () => {
    try {
      await loadMyRegistrations();
    } catch {
      // noop
    }
    await loadEvents();
  });

  function trackEventViewInBackground(eventId) {
    if (adminMode || !eventId) return;

    const registration =
      registrationsByEventId?.[eventId] ??
      registrationsByEventId?.[String(eventId)] ??
      null;

    const status = String(registration?.registration?.status || '').toLowerCase();
    const hasPendingCancelRequest =
      String(registration?.registration?.payload?.cancel_request?.status || '').toLowerCase() === 'pending';

    const isActiveRegistration =
      status === 'pending' ||
      status === 'approved' ||
      status === 'cancel_pending' ||
      status.includes('withdraw_pending') ||
      status.includes('review') ||
      hasPendingCancelRequest;

    // Solo registrar vista si el usuario NO está inscrito en este evento.
    if (isActiveRegistration) return;

    publicEventsApi.trackEventView(eventId).catch(() => {
      // noop
    });
  }

  function openEventDetail(item) {
    trackEventViewInBackground(item?.id);

    const primaryState = getPrimaryStateForEvent(item);

    selectedEvent = {
      id: item.id,
      coverImageUrl: item.img,
      creditsLabel: item.credits || 'Sin créditos',
      categoryLabel: item.category || 'EVENTO',
      title: item.title,
      dateLabel: 'Fecha',
      timeLabel: item.date || 'Sin fecha',
      locationTitle: 'Ubicación',
      locationSubtitle: item.place || 'Sin ubicación',
      speakerName: 'Organizador',
      speakerRole: item.organizer || 'Sin organizador',
      capacityTitle: item?.hasCapacity && Number(item.capacity) > 0 ? 'Cupo' : '',
      capacityValue: item?.hasCapacity && Number(item.capacity) > 0 ? String(item.capacity) : '',
      registrationsCount: Number(item.registrationsCount ?? 0) || 0,
      aboutText: item.description || 'Sin descripción',
      primaryLabel: adminMode ? 'Cerrar' : primaryState.label,
      primaryDisabled: adminMode ? false : primaryState.disabled,
      primaryAction: adminMode ? 'close' : primaryState.action,
      ticket: primaryState.ticket,
		secondaryLabel: adminMode ? null : primaryState.secondaryLabel,
		secondaryDisabled: adminMode ? true : primaryState.secondaryDisabled,
		secondaryAction: adminMode ? 'none' : primaryState.secondaryAction,
      availabilityLabel: primaryState.availabilityLabel || getAvailabilityLabel(item),
      ...(adminMode ? {} : attendancePreview(registrationsByEventId?.[item.id] ?? registrationsByEventId?.[String(item.id)]))
    };

    sheetOpen = true;
  }

  function setEventRegistrationsCount(eventId, count) {
    const nextCount = Number(count ?? 0) || 0;

    upcoming = upcoming.map((item) =>
      item.id === eventId ? { ...item, registrationsCount: nextCount } : item
    );

    if (selectedEvent?.id === eventId) {
      const selectedCupo = Number(selectedEvent.capacityValue ?? 0) || 0;
      selectedEvent = {
        ...selectedEvent,
        registrationsCount: nextCount,
        availabilityLabel: getAvailabilityLabel({
          hasCapacity: Boolean(selectedEvent.capacityValue),
          capacity: selectedCupo,
          registrationsCount: nextCount
        })
      };
      syncSelectedEventState(eventId);
    }
  }

  function upsertRegistrationState(eventId, registrationPayload) {
    registrationsByEventId = {
      ...registrationsByEventId,
      [eventId]: registrationPayload
    };
    syncSelectedEventState(eventId);
  }

  function incrementSingleCount(eventId) {
    const current = upcoming.find((item) => item.id === eventId)?.registrationsCount ?? 0;
    setEventRegistrationsCount(eventId, Number(current) + 1);
  }

  async function handlePrimaryAction(evt) {
    if (!evt?.id) return;

    if (adminMode) {
      sheetOpen = false;
      return;
    }

    const action = evt?.primaryAction || 'register';
    if (action === 'none') return;

    if (registeringEventId) return;

    try {
      registeringEventId = evt.id;
      selectedEvent = {
        ...selectedEvent,
        primaryLabel: 'Inscribiendo...',
        primaryDisabled: true
      };
      const res = await publicEventsApi.registerToEvent(evt.id, {});
      toast.success(res?.message || 'Registro creado correctamente.');
      upsertRegistrationState(evt.id, {
        registration: res?.registration || { status: 'pending' },
        pending_approval: String(res?.registration?.status || '').toLowerCase() === 'pending',
        event: { id: evt.id },
        ticket: res?.ticket || null
      });
      incrementSingleCount(evt.id);
      syncSelectedEventState(evt.id);
    } catch (error) {
      const message = error?.message || 'No se pudo completar el registro al evento.';

      if (/ya existe un registro/i.test(message)) {
        toast.info(message);
        selectedEvent = {
          ...selectedEvent,
          primaryLabel: 'Ya inscrito',
          primaryDisabled: true
        };
        try {
          const res = await publicEventsApi.getEventTicket(evt.id);
          upsertRegistrationState(evt.id, {
            registration: res?.registration || { status: 'pending' },
            pending_approval: Boolean(res?.pending_approval),
            event: res?.event || { id: evt.id },
            ticket: res?.ticket || null
          });
        } catch {
          // noop
        }
        return;
      }

      toast.error(message);
      selectedEvent = {
        ...selectedEvent,
        primaryLabel: 'Inscribirme ahora',
        primaryDisabled: false
      };
    } finally {
      registeringEventId = null;
    }
  }

  async function handleSecondaryAction(evt) {
    if (!evt?.id || adminMode) return;
    const action = evt?.secondaryAction || 'none';
    if (action !== 'request_unsubscribe') return;

    unsubscribeTargetEvent = evt;
    unsubscribeDialogOpen = true;
  }

  function afterUnsubscribe(res, evt) {
    const mode = String(res?.mode || '').toLowerCase();

    if (res?.registration && mode === 'requested') {
      upsertRegistrationState(evt.id, {
        registration: res.registration,
        pending_approval: Boolean(res?.pending_approval),
        event: res?.event || { id: evt.id },
        ticket: res?.ticket || null
      });
    } else {
      removeRegistrationState(evt.id);
      const current = upcoming.find((item) => item.id === evt.id)?.registrationsCount ?? 0;
      setEventRegistrationsCount(evt.id, Math.max(Number(current) - 1, 0));
    }

    unsubscribeTargetEvent = null;
    syncSelectedEventState(evt.id);
  }

  function searchEvents() {
    loadEvents({ page: 1 });
  }

  function nextPage() {
    if (filters.page >= (pagination.totalPages || 1)) return;
    loadEvents({ page: filters.page + 1 });
  }

  function prevPage() {
    if (filters.page <= 1) return;
    loadEvents({ page: filters.page - 1 });
  }
</script>

<!-- Nota: el padding-bottom deja espacio para la bottom nav en mobile -->
<div class="mx-auto w-full max-w-screen-xl px-4 pb-24 pt-6 sm:px-6 lg:px-8" >
  <!-- Header + Search -->
  <div class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
    <div class="flex items-center justify-between sm:justify-start sm:gap-4">
      <h1 class="text-2xl font-semibold tracking-tight sm:text-3xl">Explorar</h1>

      <!-- En desktop el avatar vive en el sidebar del AppShell, aquí no hace falta -->
    </div>

    <div class="w-full sm:max-w-lg">
      <div class="relative">
        <Search class="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          class="h-11 rounded-2xl pl-9 pr-11"
          placeholder="Buscar por nombre o categoría..."
          bind:value={filters.q}
          onkeydown={(e) => e.key === 'Enter' && searchEvents()}
        />
        <Button
          variant="ghost"
          size="icon"
          class="absolute right-1.5 top-1/2 h-9 w-9 -translate-y-1/2 rounded-xl"
          aria-label="Filtros"
          onclick={searchEvents}
        >
          <SlidersHorizontal class="h-4 w-4 text-muted-foreground" />
        </Button>
      </div>
    </div>
  </div>

  {#if adminMode}
    <div class="mt-4 grid gap-3 sm:grid-cols-4">
      <EventStatusMultiSelect id="admin-explore-status-filter" bind:selected={filters.statuses} />
      <Input type="date" class="h-11 rounded-2xl" bind:value={filters.starts_from} />
      <Input type="date" class="h-11 rounded-2xl" bind:value={filters.starts_to} />
      <Button class="h-11 rounded-2xl bg-blue-600 text-white hover:bg-blue-700" onclick={searchEvents} disabled={loadingEvents}>
        {loadingEvents ? 'Buscando...' : 'Buscar'}
      </Button>
    </div>
  {/if}

  {#if loadError}
    <div class="mt-3 text-sm font-semibold text-red-600">{loadError}</div>
  {/if}

  <!-- Próximos eventos -->
  <div class="mt-6">
    <h2 class="text-lg font-semibold sm:text-xl">{adminMode ? 'Eventos' : 'Próximos Eventos'}</h2>
  </div>

  <!-- Grid responsivo -->
  {#if loadingEvents}
    <div class="mt-3 text-sm text-muted-foreground">Cargando eventos...</div>
  {:else if !upcoming.length}
    <div class="mt-3 rounded-xl border border-dashed bg-background/60 px-4 py-6 text-center text-sm text-muted-foreground">
      {adminMode ? 'No hay eventos con los filtros seleccionados.' : 'No hay próximos eventos disponibles.'}
    </div>
  {:else}
    <div class="mt-3 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {#each upcoming as e, i (e.id)}
        <EventCard
          index={i}
          event={e}
          badges={enrollmentBadges(registrationsByEventId, e.id)}
          availabilityLabel={getAvailabilityLabel(e)}
          onClick={() => openEventDetail(e)}
        />
      {/each}
    </div>
  {/if}

  {#if pagination.totalPages > 1}
    <div class="mt-4 flex items-center justify-between">
      <div class="text-xs text-muted-foreground">
        Página {pagination.page} de {pagination.totalPages} • Total {pagination.total}
      </div>
      <div class="flex items-center gap-2">
        <Button variant="secondary" class="h-9 rounded-xl" onclick={prevPage} disabled={loadingEvents || filters.page <= 1}>
          Anterior
        </Button>
        <Button variant="secondary" class="h-9 rounded-xl" onclick={nextPage} disabled={loadingEvents || filters.page >= (pagination.totalPages || 1)}>
          Siguiente
        </Button>
      </div>
    </div>
  {/if}
</div>



<EventDetailSheet
  bind:open={sheetOpen}
  event={selectedEvent}
  onPrimary={handlePrimaryAction}
  onSecondary={handleSecondaryAction}
/>

<UnsubscribeDialog bind:open={unsubscribeDialogOpen} event={unsubscribeTargetEvent} onDone={afterUnsubscribe} />

