<script>
  import { onMount } from 'svelte';
  import { toast } from 'svelte-sonner';
  import { toPng } from 'html-to-image';
  import { Card, CardContent } from "$lib/components/ui/card";
  import { Button } from "$lib/components/ui/button";
  import { Input } from '$lib/components/ui/input';
  import * as Tooltip from '$lib/components/ui/tooltip/index.js';
  import { myHoursApi, publicEventsApi } from '$lib/services/api';
  import { createTicketQrDataUrl } from '$lib/services/qrCodeService';
  import {
    EVENT_CATEGORY_OPTIONS,
    normalizeEventCategory as normalizeEventCategoryKey
  } from '$lib/catalogs/eventCategories';
  import { EVENT_CATEGORY_STYLE_CLASSES } from '$lib/stores/eventCategoryStyles';
  import { getEventCategoryIcon } from '$lib/catalogs/eventCategoryIcons';
  import * as Dialog from '$lib/components/ui/dialog/index.js';

  import {
    CalendarDays,
    ChevronDown,
    Ticket,
    Download
  } from "lucide-svelte";

  const HOURS_GOAL = 480;

  const CATEGORY_DESCRIPTIONS = {
    general: 'Categoría por defecto',
    culturales: 'Eventos culturales y artísticos',
    deportivas: 'Eventos deportivos',
    investigacion: 'Eventos de investigación',
    vinculacion: 'Eventos de vinculación académica y profesional',
    emprendimiento: 'Eventos de innovación, startups y emprendimiento',
    responsabilidad_social: 'Actividades con impacto social y comunitario',
    formacion_humana: 'Desarrollo personal, ética y valores'
  };

  const CATEGORY_META = EVENT_CATEGORY_OPTIONS.reduce((acc, category) => {
    const style = EVENT_CATEGORY_STYLE_CLASSES[category.value] ?? EVENT_CATEGORY_STYLE_CLASSES.general;
    acc[category.value] = {
      key: category.value,
      name: category.label,
      description: CATEGORY_DESCRIPTIONS[category.value] || 'Sin descripción',
      icon: getEventCategoryIcon(category.iconKey),
      ...style
    };
    return acc;
  }, {});

  let loading = false;
  let loadError = '';

  let items = [];
  let totalHours = 0;
  let categoryBreakdown = [];
  let pagination = {
    page: 1,
    pageSize: 20,
    total: 0,
    totalPages: 1
  };

  let ticketDialogOpen = false;
  let selectedTicket = null;
  let ticketCaptureContainer;
  let historySearch = '';

  function chipClass(type) {
    if (type === "positive") return "bg-emerald-100 text-emerald-700";
    if (type === "negative") return "bg-red-100 text-red-700";
    return "bg-muted text-foreground";
  }

  function wasTicketScanned(item) {
    const result = String(item?.checkinResult || '').trim().toLowerCase();
    return (
      result === 'accepted' ||
      result === 'used' ||
      result === 'duplicate' ||
      result === 'already_used' ||
      result === 'ok' ||
      result === 'success'
    );
  }

  function normalizeCategory(value) {
    const key = normalizeEventCategoryKey(value, 'general');
    return CATEGORY_META[key] ? key : 'general';
  }

  function toShortDateTime(value) {
    const date = value ? new Date(value) : null;
    if (!date || Number.isNaN(date.getTime())) return 'Sin fecha';
    return date.toLocaleString('es-MX', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  function toRelativeDate(value) {
    const date = value ? new Date(value) : null;
    if (!date || Number.isNaN(date.getTime())) return 'Sin fecha';

    const diffMs = Date.now() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays <= 0) return 'Hoy';
    if (diffDays === 1) return 'Ayer';
    if (diffDays < 7) return `Hace ${diffDays} días`;

    return date.toLocaleDateString('es-MX', {
      day: '2-digit',
      month: 'short'
    });
  }

  function normalizeSearchText(value) {
    return String(value || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');
  }

  function mapHoursEntryToItem(entry) {
    const event = entry?.event || null;
    const hoursDelta = Number(entry?.hours_delta ?? 0) || 0;
    const categoryKey = normalizeCategory(event?.category ?? entry?.category);
    const categoryMeta = CATEGORY_META[categoryKey];

    const movementType = hoursDelta >= 0 ? 'positive' : 'negative';

    return {
      id: entry?.id,
      eventId: event?.id || null,
      createdAt: entry?.created_at,
      when: toRelativeDate(entry?.created_at),
      title: event?.title || entry?.note || 'Movimiento de horas',
      date: toShortDateTime(event?.starts_at || entry?.created_at),
      reason: entry?.reason || 'checkin',
      note: entry?.note || '',
      hoursDelta,
      movementType,
      categoryKey,
      categoryMeta,
      checkinResult: entry?.checkin?.result || null
    };
  }

  function recalcCategoryBreakdown() {
    const sums = Object.values(CATEGORY_META).reduce((acc, category) => {
      acc[category.key] = 0;
      return acc;
    }, {});

    for (const item of items) {
      const key = normalizeCategory(item?.categoryKey);
      const hours = Number(item?.hoursDelta ?? 0) || 0;
      if (hours > 0) sums[key] += hours;
    }

    const totalPositive = Object.values(sums).reduce((a, b) => a + b, 0);
    categoryBreakdown = Object.values(CATEGORY_META).map((meta) => {
      const hours = Number(sums[meta.key] ?? 0) || 0;
      return {
        ...meta,
        hours,
        percentage: totalPositive > 0 ? Math.round((hours / totalPositive) * 100) : 0
      };
    });
  }

  async function loadHoursHistory(page = 1, append = false) {
    loading = true;
    loadError = '';

    try {
      const res = await myHoursApi.history({ page, pageSize: 20 });
      const mapped = (Array.isArray(res?.history) ? res.history : []).map(mapHoursEntryToItem);
      items = append ? [...items, ...mapped] : mapped;

      totalHours = Number(res?.total_hours ?? 0) || 0;

      pagination = {
        page: Number(res?.pagination?.page ?? 1) || 1,
        pageSize: Number(res?.pagination?.pageSize ?? 20) || 20,
        total: Number(res?.pagination?.total ?? mapped.length) || 0,
        totalPages: Number(res?.pagination?.totalPages ?? 1) || 1
      };

      recalcCategoryBreakdown();
    } catch (error) {
      loadError = error?.message || 'No se pudo cargar tu historial de horas.';
    } finally {
      loading = false;
    }
  }

  async function openTicket(item) {
    if (!item?.eventId) return;

    try {
      const res = await publicEventsApi.getEventTicket(item.eventId);
      const ticketCode = res?.ticket?.ticket_code || 'Sin código';
      const qrDataUrl = ticketCode && ticketCode !== 'Sin código'
        ? await createTicketQrDataUrl(ticketCode)
        : null;

      selectedTicket = {
        eventTitle: res?.event?.title || item?.title || 'Evento',
        ticketCode,
        ticketStatus: res?.ticket?.status || 'active',
        qrDataUrl
      };
      ticketDialogOpen = true;
    } catch (error) {
      toast.error(error?.message || 'No se pudo consultar el ticket.');
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
    } catch (error) {
      toast.error('No se pudo descargar la imagen del ticket.');
    }
  }

  function loadMore() {
    if (loading || pagination.page >= pagination.totalPages) return;
    loadHoursHistory(pagination.page + 1, true);
  }

  $: progressPercent = Math.max(0, Math.min(100, (Number(totalHours || 0) / HOURS_GOAL) * 100));
  $: remainingHours = Math.max(0, HOURS_GOAL - Number(totalHours || 0));
  $: normalizedHistorySearch = normalizeSearchText(historySearch);
  $: filteredItems = !normalizedHistorySearch
    ? items
    : items.filter((item) => {
        const haystack = normalizeSearchText([
          item?.title,
          item?.when,
          item?.date,
          item?.note,
          item?.reason,
          item?.categoryMeta?.name,
          item?.hoursDelta
        ].join(' '));

        return haystack.includes(normalizedHistorySearch);
      });

  onMount(() => {
    loadHoursHistory(1, false);
  });
</script>

<div class="mx-auto w-full max-w-screen-md px-4 pb-24 pt-6 sm:px-6 lg:px-8">
  <div class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
    <div class="flex items-center justify-between sm:justify-start sm:gap-4">
      <h1 class="text-2xl font-semibold tracking-tight sm:text-3xl">Historial</h1>
    </div>
  </div>

  <Card class="mt-6 overflow-hidden rounded-2xl border shadow-sm">
    <CardContent class="p-5 sm:p-6">
      <div class="text-xs font-semibold tracking-widest text-muted-foreground">
        PROGRESO DE HORAS COMPLEMENTARIAS
      </div>

      <div class="mt-3 flex items-baseline gap-3">
        <div class="text-4xl font-semibold">{Number(totalHours || 0).toFixed(2)}</div>
        <div class="text-base text-muted-foreground">
          de {HOURS_GOAL} hrs meta
        </div>
      </div>

      <div>
      <!--contador de eventos-->
        <div>
          <span class="text-sm text-muted-foreground">Eventos registrados: </span>
          <span class="inline-flex items-center rounded-lg bg-blue-100 px-2 py-1 text-xs font-semibold text-blue-700">
            {items.length}
          </span>
        </div>
      </div>

      <div class="mt-4">
        <div class="h-3 w-full rounded-full bg-slate-100">
          <div
            class="h-3 rounded-full bg-blue-600 transition-all"
            style={`width: ${progressPercent}%`}
          ></div>
        </div>
        <div class="mt-2 text-sm text-muted-foreground">
          {progressPercent.toFixed(1)}% completado · Restan {remainingHours.toFixed(2)} hrs
        </div>
      </div>

      <div class="mt-5 rounded-2xl border bg-muted/30 p-4">
        <div class="space-y-3">
          <div class="text-sm font-semibold">Distribución de horas por categoría</div>

          {#if categoryBreakdown.some((category) => category.hours > 0)}
            <div class="h-3 w-full overflow-hidden rounded-full bg-slate-100">
              <Tooltip.Provider delayDuration={120}>
                <div class="flex h-full w-full">
                  {#each categoryBreakdown.filter((category) => category.hours > 0) as category (category.key)}
                    <Tooltip.Root>
                      <Tooltip.Trigger class={`h-full ${category.barClass}`} style={`width: ${category.percentage}%`}>
                        <span class="sr-only">{category.name}</span>
                      </Tooltip.Trigger>
                      <Tooltip.Content>
                        {category.name}: {category.percentage}%
                      </Tooltip.Content>
                    </Tooltip.Root>
                  {/each}
                </div>
              </Tooltip.Provider>
            </div>
          {:else}
            <div class="h-3 w-full rounded-full bg-slate-100"></div>
          {/if}

          <div class="grid gap-2 sm:grid-cols-2">
            {#each categoryBreakdown as category (category.key)}
              <div class="flex items-center justify-between rounded-xl border bg-white/70 px-3 py-2">
                <div class="flex items-center gap-2">
                  <span class={`inline-flex h-7 w-7 items-center justify-center rounded-lg ${category.bgClass} ${category.colorClass}`}>
                    <svelte:component this={category.icon} class="h-4 w-4" />
                  </span>
                  <span class="text-sm font-medium">{category.name}</span>
                </div>
                <span class="text-xs text-muted-foreground">{category.hours.toFixed(2)} hrs</span>
              </div>
            {/each}
          </div>
        </div>
      </div>
    </CardContent>
  </Card>

  <div class="mt-8">
    <h2 class="text-2xl font-semibold tracking-tight">Historial de horas</h2>
  </div>

  <div class="mt-3">
    <Input
      class="h-11 rounded-2xl"
      placeholder="Buscar en historial..."
      bind:value={historySearch}
    />
  </div>

  {#if loadError}
    <div class="mt-3 text-sm font-semibold text-red-600">{loadError}</div>
  {/if}

  <div class="mt-4 space-y-4">
    {#if !loading && items.length === 0}
      <Card class="rounded-2xl border shadow-sm">
        <CardContent class="p-5 text-sm text-muted-foreground">
          No hay movimientos de horas para mostrar.
        </CardContent>
      </Card>
    {:else if !loading && filteredItems.length === 0}
      <Card class="rounded-2xl border shadow-sm">
        <CardContent class="p-5 text-sm text-muted-foreground">
          No se encontraron resultados para tu búsqueda.
        </CardContent>
      </Card>
    {/if}

    {#each filteredItems as e (e.id)}
      <Card class="rounded-2xl border shadow-sm transition hover:shadow-md">
        <CardContent class="px-5 sm:px-6 py-0 sm:py-0">
          <div class="flex items-start justify-between gap-3">
            <div class="flex items-center gap-3">
              <span class={`inline-flex items-center rounded-lg px-3 py-1 text-xs font-semibold ${chipClass(e.movementType)}`}>
                {e.hoursDelta >= 0 ? `+${e.hoursDelta.toFixed(2)} hrs` : `${e.hoursDelta.toFixed(2)} hrs`}
              </span>
              <span class="text-sm text-muted-foreground">{e.when}</span>
            </div>
          </div>

          <div class="mt-3 text-xl font-semibold leading-snug">
            {e.title}
          </div>

          <div class="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-muted-foreground">
            <div class="flex items-center gap-2">
              <CalendarDays class="h-4 w-4" />
              <span>{e.date}</span>
            </div>

            <span class={`inline-flex items-center rounded-lg px-2 py-1 text-xs ${e.categoryMeta.bgClass} ${e.categoryMeta.colorClass}`}>
              <svelte:component this={e.categoryMeta.icon} class="mr-1 h-3.5 w-3.5" />
              {e.categoryMeta.name}
            </span>
            <!--{#if e.note}
              <span class="text-xs">{e.note}</span>
            {/if}-->
          </div>

          {#if e.eventId && !wasTicketScanned(e)}
            <div class="mt-4">
              <Button class="rounded-xl bg-blue-600 text-white hover:bg-blue-700" onclick={() => openTicket(e)}>
                <Ticket class="mr-2 h-4 w-4" />
                Ver ticket
              </Button>
            </div>
          {:else if e.eventId && wasTicketScanned(e)}
            <div class="mt-4 inline-flex items-center rounded-lg bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
              Asistencia ya registrada
            </div>
          {/if}
        </CardContent>
      </Card>
    {/each}
  </div>

  {#if pagination.page < pagination.totalPages && !normalizedHistorySearch}
    <div class="mt-8 flex justify-center">
      <Button
        variant="secondary"
        class="h-12 rounded-full px-8"
        onclick={loadMore}
        disabled={loading}
      >
        {loading ? 'Cargando...' : 'Ver más registros'}
        <ChevronDown class="ml-2 h-4 w-4" />
      </Button>
    </div>
  {/if}
</div>

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
