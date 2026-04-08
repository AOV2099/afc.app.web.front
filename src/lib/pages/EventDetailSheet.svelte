<script>
  import { Button } from "$lib/components/ui/button";
  import { Badge } from "$lib/components/ui/badge";
  import * as Dialog from "$lib/components/ui/dialog/index.js";

  import { CalendarDays, MapPin, User, Users, X, ArrowRight } from "lucide-svelte";

  export let open = false;
  export let event = null;
  export let onPrimary = null;
  export let onSecondary = null;

  function handlePrimary() {
    if (!event) return;
    if (typeof onPrimary === "function") onPrimary(event);
  }

  function handleSecondary() {
    if (!event) return;
    if (typeof onSecondary === "function") onSecondary(event);
  }
</script>

<Dialog.Root bind:open >
  <Dialog.Content
   class="fixed bottom-0 left-1/2 z-50 min-h-[75dvh] max-h-[95dvh] w-[min(92vw,420px)] -translate-x-1/2 rounded-t-md p-0 shadow-2xl outline-none pb-4">
    {#if event}
      <!-- Contenedor con alto máximo -->
      <div class="flex h-full flex-col overflow-hidden rounded-t-md">
        <!-- Hero (siempre visible) -->
        <div class="relative shrink-0">
          {#if event.coverImageUrl}
            <img
              src={event.coverImageUrl}
              alt={event.title}
              class="h-44 w-full object-cover sm:h-48"
              loading="lazy"
            />
          {:else}
            <div class="h-44 w-full bg-muted sm:h-48"></div>
          {/if}

          {#if event.creditsLabel}
            <div class="absolute left-4 top-4">
              <Badge class="bg-blue-600 text-white hover:bg-blue-600">
                {event.creditsLabel}
              </Badge>
            </div>
          {/if}

          <button
            type="button"
            class="absolute right-4 top-4 inline-flex h-9 w-9 items-center justify-center rounded-full bg-black/35 text-white backdrop-blur hover:bg-black/45"
            aria-label="Cerrar"
            onclick={() => (open = false)}
          >
            <X class="h-4 w-4" />
          </button>
        </div>

        <!-- Body scrolleable -->
        <div class="min-h-0 flex-1 overflow-y-auto px-5 pt-4">
          {#if event.categoryLabel}
            <div class="text-[11px] font-semibold tracking-widest text-blue-700">
              {event.categoryLabel}
            </div>
          {/if}

          <div class="mt-1 text-2xl font-extrabold leading-tight text-foreground">
            {event.title}
          </div>

          <div class="mt-4 space-y-3">
            {#if event.dateLabel || event.timeLabel}
              <div class="flex items-start gap-3">
                <div class="mt-0.5 flex h-9 w-9 items-center justify-center rounded-xl bg-muted">
                  <CalendarDays class="h-4 w-4" />
                </div>
                <div class="leading-snug">
                  {#if event.dateLabel}
                    <div class="text-sm font-semibold">{event.dateLabel}</div>
                  {/if}
                  {#if event.timeLabel}
                    <div class="text-xs text-muted-foreground">{event.timeLabel}</div>
                  {/if}
                </div>
              </div>
            {/if}

            {#if event.locationTitle || event.locationSubtitle}
              <div class="flex items-start gap-3">
                <div class="mt-0.5 flex h-9 w-9 items-center justify-center rounded-xl bg-muted">
                  <MapPin class="h-4 w-4" />
                </div>
                <div class="leading-snug">
                  {#if event.locationTitle}
                    <div class="text-sm font-semibold">{event.locationTitle}</div>
                  {/if}
                  {#if event.locationSubtitle}
                    <div class="text-xs text-muted-foreground">{event.locationSubtitle}</div>
                  {/if}
                </div>
              </div>
            {/if}

            {#if event.speakerName || event.speakerRole}
              <div class="flex items-start gap-3">
                <div class="mt-0.5 flex h-9 w-9 items-center justify-center rounded-xl bg-muted">
                  <User class="h-4 w-4" />
                </div>
                <div class="leading-snug">
                  {#if event.speakerName}
                    <div class="text-sm font-semibold">{event.speakerName}</div>
                  {/if}
                  {#if event.speakerRole}
                    <div class="text-xs text-muted-foreground">{event.speakerRole}</div>
                  {/if}
                </div>
              </div>
            {/if}

            {#if event.capacityTitle && event.capacityValue}
              <div class="flex items-start gap-3">
                <div class="mt-0.5 flex h-9 w-9 items-center justify-center rounded-xl bg-muted">
                  <Users class="h-4 w-4" />
                </div>
                <div class="leading-snug">
                  <div class="text-sm font-semibold">{event.capacityTitle}</div>
                  <div class="text-xs text-muted-foreground">{event.capacityValue}</div>
                </div>
              </div>
            {/if}
          </div>

          {#if event.aboutText}
            <div class="mt-5 pb-6">
              <div class="text-sm font-bold">{event.aboutTitle || "Acerca del evento"}</div>
              <p class="mt-2 text-sm leading-relaxed text-muted-foreground">
                {event.aboutText}
              </p>
            </div>
          {:else}
            <div class="pb-6"></div>
          {/if}
        </div>

        <!-- Footer sticky (no se corta el botón) -->
        <div class="shrink-0 border-t bg-background/95 px-5 pb-[calc(12px+env(safe-area-inset-bottom))] pt-3 backdrop-blur">
          {#if event.secondaryLabel}
            <div class="grid grid-cols-2 gap-2">
              <Button
                variant="outline"
                class="h-12 w-full rounded-2xl text-base font-semibold"
                disabled={event.secondaryDisabled}
                onclick={handleSecondary}
              >
                {event.secondaryLabel}
              </Button>

              <Button
                class="h-12 w-full rounded-2xl text-base font-semibold"
                disabled={event.primaryDisabled}
                onclick={handlePrimary}
              >
                {event.primaryLabel || "Inscribirme ahora"}
                <ArrowRight class="ml-2 h-4 w-4" />
              </Button>
            </div>
          {:else}
            <Button
              class="h-12 w-full rounded-2xl text-base font-semibold"
              disabled={event.primaryDisabled}
              onclick={handlePrimary}
            >
              {event.primaryLabel || "Inscribirme ahora"}
              <ArrowRight class="ml-2 h-4 w-4" />
            </Button>
          {/if}

          {#if event.availabilityLabel}
            <div class="mt-2 text-center text-[11px] text-muted-foreground">
              {event.availabilityLabel}
            </div>
          {/if}
        </div>
      </div>
    {/if}
  </Dialog.Content>
</Dialog.Root>
