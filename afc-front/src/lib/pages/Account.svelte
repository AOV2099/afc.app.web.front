<script>
  import { Button } from "$lib/components/ui/button";
  import { Avatar, AvatarFallback, AvatarImage } from "$lib/components/ui/avatar";
  import * as Tabs from "$lib/components/ui/tabs";


  import { Settings, Camera, GraduationCap } from "lucide-svelte";
	import ProfileTab from "./ProfileTab.svelte";
	import ProgressTab from "./ProgressTab.svelte";

  export let title = "Cuenta";
  export let defaultTab = "perfil"; // "perfil" | "progreso"

  const user = {
    name: "Juan Pérez",
    career: "Ingeniería de Sistemas",
    matricula: "202310450",
    semester: "7mo Semestre",
    avatarUrl:
      ""
  };
</script>

<div class="mx-auto w-full max-w-screen-md px-4 pb-24 pt-6 sm:px-6 lg:px-8">
  <!-- Top bar -->
  <div class="relative flex items-center justify-between">
    <h1 class="text-2xl font-semibold tracking-tight sm:text-2xl">{title}</h1>

    <Button
      variant="ghost"
      size="icon"
      class="absolute right-0 top-1/2 -translate-y-1/2 rounded-full"
      aria-label="Configuración"
    >
      <Settings class="h-8 w-8" />
    </Button>
  </div>

  <!-- User block (común) -->
  <div class="mt-6 flex items-center gap-4">
    <div class="relative">
      <Avatar class="h-16 w-16 shadow-sm">
        <AvatarImage src={user.avatarUrl} alt={user.name} />
        <AvatarFallback>JP</AvatarFallback>
      </Avatar>

      <Button
        size="icon"
        class="absolute -bottom-1 -right-1 h-8 w-8 rounded-full border-4 border-background"
        aria-label="Cambiar foto"
      >
        <Camera class="h-4 w-4" />
      </Button>
    </div>

    <div class="min-w-0">
      <div class="text-xl font-semibold leading-tight">{user.name}</div>
      <div class="text-sm text-muted-foreground">{user.career}</div>

      <div class="mt-1 flex flex-wrap items-center gap-2 text-sm">
        <div class="text-muted-foreground">Matrícula:</div>
        <div class="font-medium">{user.matricula}</div>

        <span class="text-muted-foreground">•</span>

        <div class="inline-flex items-center gap-1 text-primary">
          <GraduationCap class="h-4 w-4" />
          <span class="font-medium">{user.semester}</span>
        </div>
      </div>
    </div>
  </div>

  <!-- Tabs -->
  <div class="mt-6">
    <Tabs.Root value={defaultTab} class="w-full">
      <Tabs.List class="grid w-full grid-cols-2 rounded-2xl bg-muted p-1">
        <Tabs.Trigger value="perfil" class="rounded-xl">Perfil</Tabs.Trigger>
        <Tabs.Trigger value="progreso" class="rounded-xl">Progreso</Tabs.Trigger>
      </Tabs.List>

      <Tabs.Content value="perfil" class="mt-6">
        <ProfileTab />
      </Tabs.Content>

      <Tabs.Content value="progreso" class="mt-6">
        <ProgressTab />
      </Tabs.Content>
    </Tabs.Root>
  </div>
</div>
