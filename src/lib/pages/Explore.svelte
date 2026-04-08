<script>
  import { onMount } from 'svelte';
  import { toast } from 'svelte-sonner';
  import QRCode from 'qrcode';
  import { toPng } from 'html-to-image';
  import { Button } from "$lib/components/ui/button";
  import { Input } from "$lib/components/ui/input";
  import { ScrollArea, Scrollbar } from "$lib/components/ui/scroll-area";
  import * as Dialog from '$lib/components/ui/dialog/index.js';
  import { adminEventsApi, publicEventsApi, myRegistrationsApi } from '$lib/services/api';
  import { getEventCategoryMeta } from '$lib/catalogs/eventCategories';
  import { getEventCategoryIcon } from '$lib/catalogs/eventCategoryIcons';
  import EventCard from "$lib/components/EventCard.svelte";

  import { Search, SlidersHorizontal, Ticket, Download } from "lucide-svelte";
  import EventDetailSheet from "./EventDetailSheet.svelte";

  export let adminMode = false;

  const EVENT_IMAGE_FALLBACK = 'https://gaceta.cch.unam.mx/sites/default/files/styles/imagen_articulos_1920x1080/public/2020-07/video_mensaje_1.jpg?h=d1cb525d&itok=4PYz5F61';

  let sheetOpen = false;
  let selectedEvent = null;
  let loadingEvents = false;
  let loadError = '';

  let filters = {
    page: 1,
    pageSize: 20,
    q: '',
    status: '',
    starts_from: '',
    starts_to: ''
  };

  let pagination = {
    page: 1,
    pageSize: 20,
    total: 0,
    totalPages: 1
  };

  let featured = [];
  let upcoming = [];
  let registeringEventId = null;
  let registrationsByEventId = {};
  let ticketDialogOpen = false;
  let selectedTicket = null;
  let ticketCaptureContainer;
  let unsubscribeDialogOpen = false;
  let unsubscribingEventId = null;
  let unsubscribeTargetEvent = null;


  function resolveEventImage(event) {
    return (
      event?.coverImageUrl ||
      event?.cover_image_url ||
      event?.image ||
      event?.image_url ||
      event?.cover_url ||
      event?.attributes?.cover_image_url ||
      event?.attributes?.image_url ||
      EVENT_IMAGE_FALLBACK
    );
  }

  function mapAdminEventToUi(event) {
    const startsAt = event?.starts_at ? new Date(event.starts_at) : null;
    const location = event?.location || event?.attributes?.location || 'Sin ubicación';
    const organizer = event?.organizer || event?.attributes?.organizer || 'Sin organizador';
    const categoryMeta = getEventCategoryMeta(event?.category || 'general');
    const rawCapacity = event?.capacity ?? event?.attributes?.capacity ?? event?.cupo ?? event?.attributes?.cupo;
    const capacityEnabled = event?.capacity_enabled;
    const hasCapacityValue = rawCapacity !== undefined && rawCapacity !== null && rawCapacity !== '';
    const hasCapacity = capacityEnabled === false ? false : hasCapacityValue;
    const capacity = hasCapacity ? Number(rawCapacity) || 0 : null;
    const registrationsCount = Number(event?.registrations_count ?? event?.attributes?.registrations_count ?? 0) || 0;
    const startsLabel = startsAt && !Number.isNaN(startsAt.getTime())
      ? startsAt.toLocaleString('es-MX', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
      : 'Sin fecha';

    return {
      id: event?.id,
      tag: categoryMeta.label,
      tagClass: categoryMeta.tagClass,
      categoryIcon: getEventCategoryIcon(categoryMeta.iconKey),
      title: event?.title || 'Sin título',
      date: startsLabel,
      img: resolveEventImage(event),
      credits: event?.hours_value ? `${event.hours_value} Hrs.` : null,
      category: categoryMeta.label.toUpperCase(),
      place: location,
      organizer,
      capacity,
      hasCapacity,
      registrationsCount,
      description: event?.description || '',
      raw: event
    };
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
      const base = {
        secondaryLabel: 'Darme de baja',
        secondaryDisabled: false,
        secondaryAction: 'request_unsubscribe',
        availabilityLabel: null
      };

      if (registrationStatus === 'approved' && isUsedTicket(ticket)) {
        return {
          label: 'Asistencia registrada',
          disabled: true,
          action: 'none',
          ticket,
          secondaryLabel: null,
          secondaryDisabled: true,
          secondaryAction: 'none',
          availabilityLabel: 'Este ticket ya ha sido registrado.'
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
          label: 'Ver ticket',
          disabled: false,
          action: 'view_ticket',
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
        return {
          label: 'Rechazado',
          disabled: true,
          action: 'none',
          ticket: null,
          ...base
        };
      }
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
    const item = upcoming.find((ev) => ev.id === eventId) || featured.find((ev) => ev.id === eventId);
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

    try {
      const res = adminMode
        ? await adminEventsApi.listEvents(query)
        : await publicEventsApi.listEvents({
            page: query.page,
            pageSize: query.pageSize,
            q: query.q,
            starts_from: query.starts_from,
            starts_to: query.starts_to
          });
      const events = Array.isArray(res?.events) ? res.events : [];
          const mapped = await enrichWithRegistrationsCount(events.map(mapAdminEventToUi));

      upcoming = mapped;
      featured = mapped.slice(0, 5);
      pagination = res?.pagination || pagination;
      filters = { ...filters, ...query };
    } catch (err) {
      loadError = err?.message || 'No se pudieron cargar los eventos.';
      upcoming = [];
      featured = [];
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
      availabilityLabel: primaryState.availabilityLabel || getAvailabilityLabel(item)
    };

    sheetOpen = true;
  }

  function setEventRegistrationsCount(eventId, count) {
    const nextCount = Number(count ?? 0) || 0;

    upcoming = upcoming.map((item) =>
      item.id === eventId ? { ...item, registrationsCount: nextCount } : item
    );
    featured = featured.map((item) =>
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

    if (action === 'view_ticket') {
      try {
        const res = await publicEventsApi.getEventTicket(evt.id);
        const ticketCode = res?.ticket?.ticket_code || 'Sin código';
        const qrDataUrl = ticketCode && ticketCode !== 'Sin código'
          ? await QRCode.toDataURL(ticketCode, {
              width: 280,
              margin: 1,
              color: {
                dark: '#0f172a',
                light: '#ffffff'
              }
            })
          : null;

        selectedTicket = {
          eventTitle: res?.event?.title || evt?.title || 'Evento',
          registrationStatus: res?.registration?.status || 'approved',
          ticketCode,
          ticketStatus: res?.ticket?.status || 'active',
          issuedAt: res?.ticket?.issued_at || null,
          qrDataUrl
        };
        ticketDialogOpen = true;
      } catch (error) {
        toast.error(error?.message || 'No se pudo consultar el ticket.');
      }
      return;
    }

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

  async function confirmUnsubscribe() {
    const evt = unsubscribeTargetEvent;
    if (!evt?.id || unsubscribingEventId) return;

    try {
      unsubscribingEventId = evt.id;
		const res = await publicEventsApi.unregisterFromEvent(evt.id, null);
      const status = String(res?.registration?.status || '').toLowerCase();
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

      toast.success(res?.message || 'Se solicitó la baja del evento.');
      unsubscribeDialogOpen = false;
      unsubscribeTargetEvent = null;
      syncSelectedEventState(evt.id);
    } catch (error) {
      toast.error(error?.message || 'No se pudo solicitar la baja del evento.');
    } finally {
      unsubscribingEventId = null;
    }
  }

  async function downloadTicketImage() {
    if (!ticketCaptureContainer || !selectedTicket) return;

    try {
      const dataUrl = await toPng(ticketCaptureContainer, {
        cacheBust: true,
        pixelRatio: 2,
        backgroundColor: '#ffffff'
      });

      const eventTitle = String(selectedTicket?.eventTitle || 'evento')
        .toLowerCase()
        .replace(/[^a-z0-9]+/gi, '-')
        .replace(/(^-|-$)/g, '') || 'evento';

      const link = document.createElement('a');
      link.download = `ticket-${eventTitle}.png`;
      link.href = dataUrl;
      link.click();
    } catch {
      toast.error('No se pudo descargar la imagen del ticket.');
    }
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
      <select class="h-11 w-full rounded-2xl border px-3 text-sm" bind:value={filters.status}>
        <option value="">Todos los estatus</option>
        <option value="draft">Borrador</option>
        <option value="published">Publicado</option>
        <option value="cancelled">Cancelado</option>
        <option value="ended">Finalizado</option>
      </select>
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

  <!-- Destacados -->
  <div class="mt-8 flex items-center justify-between">
    <h2 class="text-lg font-semibold sm:text-xl">Destacados</h2>
    <Button variant="link" class="h-auto px-0 text-primary">Ver todos</Button>
  </div>

  <ScrollArea class="mt-3 w-full whitespace-nowrap">
    <div class="flex gap-4 pb-3">
      {#each featured as item (item.id)}
        <EventCard
          event={item}
          variant="featured"
          availabilityLabel={getAvailabilityLabel(item)}
          onClick={() => openEventDetail(item)}
        />
      {/each}
    </div>

    <Scrollbar orientation="horizontal" />
  </ScrollArea>

  <!-- Próximos eventos -->
  <div class="mt-6">
    <h2 class="text-lg font-semibold sm:text-xl">Próximos Eventos</h2>
  </div>

  <!-- Grid responsivo -->
  <div class="mt-3 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
    {#each upcoming as e (e.id)}
      <EventCard
        event={e}
        variant="upcoming"
        availabilityLabel={getAvailabilityLabel(e)}
        onClick={() => openEventDetail(e)}
      />
    {/each}
  </div>

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

<Dialog.Root bind:open={unsubscribeDialogOpen}>
  <Dialog.Content class="mx-auto w-[min(92vw,460px)] rounded-2xl p-0">
    <div class="p-5">
      <h3 class="text-lg font-semibold">Confirmar baja del evento</h3>
      <p class="mt-3 text-sm text-muted-foreground">
        ¿Seguro que deseas darte de baja de <span class="font-medium text-foreground">{unsubscribeTargetEvent?.title || 'este evento'}</span>?
      </p>
      <p class="mt-2 text-sm text-muted-foreground">
        Nota: algunas solicitudes de baja pueden quedar en revisión del organizador antes de aplicarse.
      </p>

      <div class="mt-5 grid grid-cols-2 gap-3">
        <Dialog.Close asChild>
          <Button variant="secondary" class="w-full rounded-xl" disabled={Boolean(unsubscribingEventId)}>
            Cancelar
          </Button>
        </Dialog.Close>
        <Button
          class="w-full rounded-xl bg-red-600 text-white hover:bg-red-700"
          disabled={Boolean(unsubscribingEventId)}
          onclick={confirmUnsubscribe}
        >
          {unsubscribingEventId ? 'Procesando...' : 'Confirmar baja'}
        </Button>
      </div>
    </div>
  </Dialog.Content>
</Dialog.Root>

<Dialog.Root bind:open={ticketDialogOpen}>
  <Dialog.Content class="mx-auto w-[min(92vw,420px)] rounded-2xl p-0">
    <div class="p-5">
      <div bind:this={ticketCaptureContainer} class="rounded-2xl border bg-white p-4">
        <div class="flex items-center gap-2 text-blue-700">
          <Ticket class="h-4 w-4" />
          <h3 class="text-lg font-semibold">Ticket del evento</h3>
        </div>

        <div class="mt-4 space-y-2 text-sm">
          <div>
            <span class="font-semibold">Evento:</span> {selectedTicket?.eventTitle || 'Sin evento'}
          </div>
        </div>

        {#if selectedTicket?.qrDataUrl}
          <div class="mt-5 flex justify-center">
            <img
              src={selectedTicket.qrDataUrl}
              alt={`QR ticket ${selectedTicket?.ticketCode || ''}`}
              class="h-56 w-56 rounded-md object-contain"
            />
          </div>
        {/if}
      </div>

      <div class="mt-5 grid grid-cols-2 gap-3">
        <Dialog.Close asChild>
          <Button variant="secondary" class="w-full rounded-xl">Cerrar</Button>
        </Dialog.Close>
        <Button class="w-full rounded-xl bg-blue-600 text-white hover:bg-blue-700" onclick={downloadTicketImage}>
          <Download class="mr-2 h-4 w-4" />
          Descargar
        </Button>
      </div>
    </div>
  </Dialog.Content>
</Dialog.Root>
