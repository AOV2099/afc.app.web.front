<script>
  import { Card, CardContent } from "$lib/components/ui/card";
  import { Button } from "$lib/components/ui/button";
  import { Badge } from "$lib/components/ui/badge";
  import { Separator } from "$lib/components/ui/separator";

  import {
    ChevronLeft,
    Info,
    CalendarDays,
    MapPin,
    ChevronRight,
    ChevronDown
  } from "lucide-svelte";

  // tabs: "all" | "attended" | "pending"
  let filter = "all";

  const summary = {
    totalThisYear: 14,
    note:
      "La validación final de la formación complementaria es gestionada por la dirección de tu carrera. Aquí podrás ver el estado de cada asistencia."
  };

  const items = [
    {
      id: 1,
      status: "validated", // validated | pending
      statusText: "ASISTENCIA VALIDADA",
      statusTone: "success",
      when: "Hace 2 días",
      title: "Seminario de Innovación Tecnológica 2023",
      date: "12 Oct",
      place: "Auditorio Principal"
    },
    {
      id: 2,
      status: "pending",
      statusText: "PENDIENTE DE VALIDACIÓN",
      statusTone: "warning",
      when: "Ayer",
      title: "Taller de Liderazgo Estudiantil",
      date: "10 Nov",
      place: "Sala de Juntas B"
    },
    {
      id: 3,
      status: "validated",
      statusText: "ASISTENCIA VALIDADA",
      statusTone: "success",
      when: "05 Sep",
      title: "Conferencia: Ética en la IA",
      date: "05 Sep",
      place: "Salón de Grados"
    },
    {
      id: 4,
      status: "validated",
      statusText: "ASISTENCIA VALIDADA",
      statusTone: "success",
      when: "20 Ago",
      title: "Voluntariado: Limpieza de Playas",
      date: "20 Ago",
      place: "Campus Externo"
    }
  ];

  function chipClass(tone) {
    if (tone === "success") return "bg-emerald-100 text-emerald-700";
    if (tone === "warning") return "bg-orange-100 text-orange-700";
    return "bg-muted text-foreground";
  }

  $: filtered =
    filter === "all"
      ? items
      : filter === "attended"
        ? items.filter((x) => x.status === "validated")
        : items.filter((x) => x.status === "pending");

  function goBack() {
    // TODO: aquí conectas tu navegación real
    console.log("back");
  }

  function openItem(id) {
    console.log("open item", id);
  }

  function loadMore() {
    console.log("load more");
  }
</script>

<div class="mx-auto w-full max-w-screen-md px-4 pb-24 pt-6 sm:px-6 lg:px-8">
  <!-- Header -->
  <div class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
    <div class="flex items-center justify-between sm:justify-start sm:gap-4">
      <h1 class="text-2xl font-semibold tracking-tight sm:text-3xl">Historial</h1>

    </div>
  </div>

  <!-- Summary card -->
  <Card class="mt-6 overflow-hidden rounded-2xl border shadow-sm">
    <CardContent class="p-5 sm:p-6">
      <div class="text-xs font-semibold tracking-widest text-muted-foreground">
        RESUMEN DE ASISTENCIA
      </div>

      <div class="mt-3 flex items-baseline gap-3">
        <div class="text-4xl font-semibold"> {summary.totalThisYear} </div>
        <div class="text-base text-muted-foreground">
          Eventos registrados este año
        </div>
      </div>

      <div class="mt-5 rounded-2xl border bg-muted/30 p-4">
        <div class="flex gap-3">
          <div class="mt-0.5 grid h-8 w-8 place-items-center rounded-xl bg-blue-50 text-blue-700">
            <Info class="h-4 w-4" />
          </div>

          <p class="text-sm leading-relaxed text-muted-foreground">
            {summary.note}
          </p>
        </div>
      </div>
    </CardContent>
  </Card>

  <!-- Filter pills -->
  <div class="mt-6 flex gap-3">
    <button
      type="button"
      on:click={() => (filter = "all")}
      class={`h-11 rounded-full border px-6 text-sm font-medium shadow-sm transition ${
        filter === "all"
          ? "border-blue-600 bg-blue-600 text-white"
          : "bg-background text-foreground hover:bg-accent"
      }`}
    >
      Todos
    </button>

    <button
      type="button"
      on:click={() => (filter = "attended")}
      class={`h-11 rounded-full border px-6 text-sm font-medium shadow-sm transition ${
        filter === "attended"
          ? "border-blue-600 bg-blue-600 text-white"
          : "bg-background text-foreground hover:bg-accent"
      }`}
    >
      Asistidos
    </button>

    <button
      type="button"
      on:click={() => (filter = "pending")}
      class={`h-11 rounded-full border px-6 text-sm font-medium shadow-sm transition ${
        filter === "pending"
          ? "border-blue-600 bg-blue-600 text-white"
          : "bg-background text-foreground hover:bg-accent"
      }`}
    >
      Pendientes
    </button>
  </div>

  <!-- Section title -->
  <div class="mt-8">
    <h2 class="text-2xl font-semibold tracking-tight">Actividad Reciente</h2>
  </div>

  <!-- List -->
  <div class="mt-4 space-y-4">
    {#each filtered as e (e.id)}
      <button
        type="button"
        on:click={() => openItem(e.id)}
        class="w-full text-left"
      >
        <Card class="rounded-2xl border shadow-sm transition hover:shadow-md">
          <CardContent class="p-5 sm:p-6">
            <div class="flex items-start justify-between gap-3">
              <div class="flex items-center gap-3">
                <span class={`inline-flex items-center rounded-lg px-3 py-1 text-xs font-semibold ${chipClass(e.statusTone)}`}>
                  {e.statusText}
                </span>
                <span class="text-sm text-muted-foreground">{e.when}</span>
              </div>

              <ChevronRight class="h-5 w-5 text-muted-foreground" />
            </div>

            <div class="mt-3 text-xl font-semibold leading-snug">
              {e.title}
            </div>

            <div class="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-muted-foreground">
              <div class="flex items-center gap-2">
                <CalendarDays class="h-4 w-4" />
                <span>{e.date}</span>
              </div>

              <div class="flex items-center gap-2">
                <MapPin class="h-4 w-4" />
                <span>{e.place}</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </button>
    {/each}
  </div>

  <!-- Load more -->
  <!--<div class="mt-8 flex justify-center">
    <Button
      variant="secondary"
      class="h-12 rounded-full px-8"
      on:click={loadMore}
    >
      Ver más registros
      <ChevronDown class="ml-2 h-4 w-4" />
    </Button>
  </div>-->
</div>
