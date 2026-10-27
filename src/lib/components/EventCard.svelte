<script>
  import { Badge } from "$lib/components/ui/badge";
  import { Card, CardContent } from "$lib/components/ui/card";
  import { cn } from "$lib/utils";
  import { isPastEvent } from "$lib/utils/events.js";
  import { panelIn, staggerDelay } from "$lib/utils/motion.js";
  import { CalendarDays, MapPin, User, Users } from "lucide-svelte";

  /** Datos de mapEventToCard ($lib/utils/eventCards.js). */
  export let event;
  // carousel: ancho fijo para listas horizontales; grid: ocupa su celda.
  export let variant = "grid";
  export let availabilityLabel = null;
  /** @type {{ label: string, className?: string }[]} */
  export let badges = [];
  // Eventos de otra carrera u otros que no se pueden abrir.
  export let disabled = false;
  // Administración puede abrir eventos finalizados; alumnos no.
  export let allowPast = false;
  export let onClick = null;
  // Posición en la lista: escalona la animación de entrada.
  export let index = 0;

  const WIDTHS = {
    carousel: "w-[280px] shrink-0 sm:w-[320px]",
    grid: "w-full",
  };

  $: past = isPastEvent(event);
  $: blocked = disabled || (past && !allowPast);
  $: interactive = typeof onClick === "function" && !blocked;
  $: width = WIDTHS[variant === "featured" ? "carousel" : variant === "upcoming" ? "grid" : variant] || WIDTHS.grid;

  function handleClick() {
    if (interactive) onClick();
  }

  function handleKeydown(keyEvent) {
    if (!interactive) return;
    if (keyEvent.key === "Enter" || keyEvent.key === " ") {
      keyEvent.preventDefault();
      onClick();
    }
  }
</script>

<!-- min-w-0: en grid/flex el texto largo (URLs, ubicaciones) no debe ensanchar la tarjeta. -->
<div class={cn("flex min-w-0", width)} in:panelIn|global={{ delay: staggerDelay(index) }}>
<Card
  class={cn(
    "flex w-full min-w-0 flex-col gap-0 overflow-hidden rounded-2xl border py-0 transition whitespace-normal",
    interactive && "cursor-pointer hover:-translate-y-0.5 hover:shadow-md motion-reduce:hover:translate-y-0",
    (past || disabled) && "border-slate-300 bg-slate-100 opacity-60 grayscale",
    blocked && "cursor-not-allowed select-none"
  )}
  data-testid="event-card"
  data-past={past ? "true" : undefined}
  role={interactive ? "button" : undefined}
  aria-disabled={typeof onClick === "function" && blocked ? true : undefined}
  aria-label={typeof onClick === "function" ? `Ver evento: ${event.title}` : undefined}
  tabindex={interactive ? "0" : undefined}
  onclick={handleClick}
  onkeydown={handleKeydown}
>
  <div class="relative aspect-[2/1] w-full overflow-hidden bg-blue-600">
    <img
      src={event.img}
      alt={event.title}
      class="h-full w-full object-cover"
      loading="lazy"
      onerror={(evt) => {
        evt.currentTarget.style.display = "none";
      }}
    />

    <div class="absolute inset-x-3 top-3 flex items-start justify-between gap-2">
      <span class={`inline-flex min-w-0 items-center rounded-lg px-2 py-1 text-xs font-medium ${event.tagClass}`}>
        <svelte:component this={event.categoryIcon} class="mr-1 h-3.5 w-3.5 shrink-0" />
        <span class="truncate">{event.tag}</span>
      </span>

      {#if event.credits}
        <Badge class="shrink-0 rounded-xl bg-white/90 text-foreground hover:bg-white/90">
          {event.credits}
        </Badge>
      {/if}
    </div>

    {#if past}
      <Badge class="absolute right-3 bottom-3 rounded-lg bg-slate-800 text-white hover:bg-slate-800">
        Finalizado
      </Badge>
    {/if}
  </div>

  <CardContent class="flex min-w-0 flex-1 flex-col gap-2 p-4 sm:p-5">
    {#if badges.length}
      <div class="flex flex-wrap gap-1.5">
        {#each badges as badge}
          <Badge class={cn("max-w-full truncate rounded-full bg-slate-100 text-slate-700 hover:bg-slate-100", badge.className)}>
            {badge.label}
          </Badge>
        {/each}
      </div>
    {/if}

    <div class="line-clamp-2 text-lg font-semibold leading-tight [overflow-wrap:anywhere]">
      {event.title}
    </div>

    <div class="min-w-0 space-y-1 text-sm text-muted-foreground">
      <div class="flex items-start gap-2">
        <CalendarDays class="mt-0.5 h-4 w-4 shrink-0" />
        <span class="min-w-0 [overflow-wrap:anywhere]">{event.date}</span>
      </div>
      <div class="flex items-start gap-2">
        <MapPin class="mt-0.5 h-4 w-4 shrink-0" />
        <span class="min-w-0 truncate">{event.place}</span>
      </div>
      <div class="flex items-start gap-2">
        <User class="mt-0.5 h-4 w-4 shrink-0" />
        <span class="min-w-0 truncate">{event.organizer || "Sin organizador"}</span>
      </div>
      <div class="flex items-start gap-2">
        <Users class="mt-0.5 h-4 w-4 shrink-0" />
        <span class="min-w-0 [overflow-wrap:anywhere]">{availabilityLabel || `Inscritos: ${event.registrationsCount ?? 0}`}</span>
      </div>
    </div>

    {#if $$slots.footer}
      <!-- Los controles del pie no abren la tarjeta. -->
      <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
      <div class="mt-auto space-y-3 pt-2" onclick={(e) => e.stopPropagation()}>
        <slot name="footer" />
      </div>
    {/if}
  </CardContent>
</Card>
</div>
