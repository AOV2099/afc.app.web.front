<script>
  import { Card, CardContent } from "$lib/components/ui/card";
  import { Badge } from "$lib/components/ui/badge";
  import { Button } from "$lib/components/ui/button";
  import { Input } from "$lib/components/ui/input";
  import { ScrollArea, Scrollbar } from "$lib/components/ui/scroll-area";

  import { Search, SlidersHorizontal, CalendarDays, MapPin } from "lucide-svelte";

  const featured = [
    {
      id: 1,
      tag: "Conferencia",
      tagClass: "bg-blue-600 text-white",
      title: "Cumbre de Innovación 2024",
      date: "15 Oct • Auditorio A",
      img: "https://images.unsplash.com/photo-1521737604893-d14cc237f11d?q=80&w=1600&auto=format&fit=crop"
    },
    {
      id: 2,
      tag: "Taller",
      tagClass: "bg-purple-600 text-white",
      title: "Hackathon",
      date: "18 Oct • Laboratorio",
      img: "https://images.unsplash.com/photo-1515879218367-8466d910aaa4?q=80&w=1600&auto=format&fit=crop"
    },
    {
      id: 3,
      tag: "Conferencia",
      tagClass: "bg-blue-600 text-white",
      title: "Foro de Ciberseguridad",
      date: "20 Oct • Auditorio Principal",
      img: "https://images.unsplash.com/photo-1550751827-4bd374c3f58b?q=80&w=1600&auto=format&fit=crop"
    },
    {
      id: 4,
      tag: "Taller",
      tagClass: "bg-purple-600 text-white",
      title: "Taller de Diseño UX",
      date: "21 Oct • Sala Creativa",
      img: "https://images.unsplash.com/photo-1522202176988-66273c2fd55f?q=80&w=1600&auto=format&fit=crop"
    },
    {
      id: 5,
      tag: "Conferencia",
      tagClass: "bg-blue-600 text-white",
      title: "Summit de Startups",
      date: "23 Oct • Centro de Convenciones",
      img: "https://images.unsplash.com/photo-1540575467063-178a50c2df87?q=80&w=1600&auto=format&fit=crop"
    }
  ];

  const upcoming = [
    {
      id: 1,
      credits: "2 Créditos",
      category: "TECNOLOGÍA",
      title: "Introducción a la Inteligencia Artificial",
      date: "22 Oct, 14:00 - 16:00",
      place: "Auditorio Principal",
      img: "https://images.unsplash.com/photo-1526374965328-7f61d4dc18c5?q=80&w=1600&auto=format&fit=crop"
    },
    {
      id: 2,
      category: "NEGOCIOS",
      title: "Emprendimiento Digital",
      date: "25 Oct, 10:00 - 11:30",
      place: "Sala de Conferencias B",
      img: "https://images.unsplash.com/photo-1522071901873-411886a10004?q=80&w=1600&auto=format&fit=crop"
    },
    {
      id: 3,
      credits: "3 Créditos",
      category: "SOCIAL",
      title: "Voluntariado Comunitario",
      date: "28 Oct, 09:00 - 13:00",
      place: "Centro Estudiantil",
      img: "https://images.unsplash.com/photo-1520975682015-9345c7f1bb2d?q=80&w=1600&auto=format&fit=crop"
    },
    {
      id: 4,
      credits: "2 Créditos",
      category: "INNOVACIÓN",
      title: "Experiencia VR en Educación",
      date: "01 Nov, 15:00 - 16:30",
      place: "Laboratorio VR",
      img: "https://images.unsplash.com/photo-1593508512255-86ab42a8e620?q=80&w=1600&auto=format&fit=crop"
    },
    {
      id: 5,
      credits: "2 Créditos",
      category: "TECNOLOGÍA",
      title: "Introducción a Data Science",
      date: "03 Nov, 12:00 - 14:00",
      place: "Aula Magna",
      img: "https://images.unsplash.com/photo-1551288049-bebda4e38f71?q=80&w=1600&auto=format&fit=crop"
    },
    {
      id: 6,
      credits: "2 Créditos",
      category: "NEGOCIOS",
      title: "Marketing Digital y Growth",
      date: "05 Nov, 10:00 - 12:00",
      place: "Sala de Conferencias A",
      img: "https://images.unsplash.com/photo-1552664730-d307ca884978?q=80&w=1600&auto=format&fit=crop"
    },
    {
      id: 7,
      credits: "3 Créditos",
      category: "SOCIAL",
      title: "Liderazgo y Trabajo en Equipo",
      date: "07 Nov, 09:00 - 11:30",
      place: "Centro Estudiantil",
      img: "https://images.unsplash.com/photo-1521737604893-d14cc237f11d?q=80&w=1600&auto=format&fit=crop"
    }
  ];
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
        <Input class="h-11 rounded-2xl pl-9 pr-11" placeholder="Buscar por nombre o categoría..." />
        <Button
          variant="ghost"
          size="icon"
          class="absolute right-1.5 top-1/2 h-9 w-9 -translate-y-1/2 rounded-xl"
          aria-label="Filtros"
        >
          <SlidersHorizontal class="h-4 w-4 text-muted-foreground" />
        </Button>
      </div>
    </div>
  </div>

  <!-- Destacados -->
  <div class="mt-8 flex items-center justify-between">
    <h2 class="text-lg font-semibold sm:text-xl">Destacados</h2>
    <Button variant="link" class="h-auto px-0 text-primary">Ver todos</Button>
  </div>

  <ScrollArea class="mt-3 w-full whitespace-nowrap">
    <div class="flex gap-4 pb-3">
      {#each featured as item (item.id)}
        <Card class="w-[280px] overflow-hidden rounded-2xl border sm:w-[340px] lg:w-[380px] pt-0">
          <div
            class="relative h-36 w-full bg-muted sm:h-44"
            style={`background-image:url('${item.img}');background-size:cover;background-position:center;`}
          >
            <div class="absolute left-3 top-3">
              <span class={`inline-flex items-center rounded-lg px-2 py-1 text-xs font-medium ${item.tagClass}`}>
                {item.tag}
              </span>
            </div>
          </div>

          <CardContent class="space-y-1.5 p-4 sm:p-5">
            <div class="text-base font-semibold leading-tight sm:text-lg">
              {item.title}
            </div>
            <div class="flex items-center gap-2 text-sm text-muted-foreground">
              <CalendarDays class="h-4 w-4" />
              <span>{item.date}</span>
            </div>
          </CardContent>
        </Card>
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
      <Card class="overflow-hidden rounded-2xl border pt-0">
        <div
          class="relative h-44 w-full bg-muted sm:h-48"
          style={`background-image:url('${e.img}');background-size:cover;background-position:center;`}
        >
          {#if e.credits}
            <Badge class="absolute right-3 top-3 rounded-xl bg-white/90 text-foreground hover:bg-white/90">
              {e.credits}
            </Badge>
          {/if}
        </div>

        <CardContent class="space-y-2 p-4 sm:p-5">
          <div class="text-xs font-semibold tracking-widest text-blue-600">
            {e.category}
          </div>

          <div class="text-lg font-semibold leading-tight">
            {e.title}
          </div>

          <div class="space-y-1 text-sm text-muted-foreground">
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
    {/each}
  </div>
</div>
