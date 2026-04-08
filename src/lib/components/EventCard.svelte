<script>
  import { Badge } from "$lib/components/ui/badge";
  import { Card, CardContent } from "$lib/components/ui/card";
  import { cn } from "$lib/utils";
  import { CalendarDays, MapPin, User } from "lucide-svelte";

  export let event;
  export let variant = "upcoming";
  export let availabilityLabel = null;
  export let onClick = null;

  const variantClasses = {
    featured: {
      card: "w-[280px] sm:w-[340px] lg:w-[380px]",
      image: "h-36 sm:h-44",
      content: "space-y-1.5 p-4 sm:p-5",
      title: "text-base sm:text-lg",
      meta: "space-y-1",
      showDetails: true
    },
    upcoming: {
      card: "w-full",
      image: "h-44 sm:h-48",
      content: "space-y-2 p-4 sm:p-5",
      title: "text-lg",
      meta: "space-y-1",
      showDetails: true
    }
  };

  $: currentVariant = variantClasses[variant] || variantClasses.upcoming;

  function handleClick() {
    if (typeof onClick === "function") onClick();
  }

  function handleKeydown(eventObj) {
    if (eventObj.key === "Enter" || eventObj.key === " ") {
      eventObj.preventDefault();
      handleClick();
    }
  }
</script>

<Card
  class={cn("overflow-hidden rounded-2xl border pt-0", currentVariant.card)}
  role="button"
  tabindex="0"
  onclick={handleClick}
  onkeydown={handleKeydown}
>
  <div class={cn("relative w-full overflow-hidden bg-blue-600", currentVariant.image)}>
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
      <span class={`inline-flex items-center rounded-lg px-2 py-1 text-xs font-medium ${event.tagClass}`}>
        <svelte:component this={event.categoryIcon} class="mr-1 h-3.5 w-3.5" />
        {event.tag}
      </span>

      {#if event.credits}
        <Badge class="rounded-xl bg-white/90 text-foreground hover:bg-white/90">
          {event.credits}
        </Badge>
      {/if}
    </div>
  </div>

  <CardContent class={currentVariant.content}>
    <div class={cn("font-semibold leading-tight", currentVariant.title)}>
      {event.title}
    </div>

    <div class={cn("text-sm text-muted-foreground", currentVariant.meta)}>
      <div class="flex items-center gap-2">
        <CalendarDays class="h-4 w-4" />
        <span>{event.date}</span>
      </div>

      {#if currentVariant.showDetails}
        <div class="flex items-center gap-2">
          <MapPin class="h-4 w-4" />
          <span><span class="font-semibold text-foreground">Ubicación:</span> {event.place}</span>
        </div>
        <div class="flex items-center gap-2">
          <User class="h-4 w-4" />
          <span><span class="font-semibold text-foreground">Organizador:</span> {event.organizer || "Sin organizador"}</span>
        </div>
        {#if !availabilityLabel}
          <div class="flex items-center gap-2">
            <User class="h-4 w-4" />
            <span><span class="font-semibold text-foreground">Inscritos:</span> {event.registrationsCount ?? 0}</span>
          </div>
        {/if}
      {/if}

      {#if availabilityLabel}
        <div class="flex items-center gap-2">
          <User class="h-4 w-4" />
          <span>{availabilityLabel}</span>
        </div>
      {/if}
    </div>
  </CardContent>
</Card>
