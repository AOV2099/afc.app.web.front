<script>
  import { goto } from "$app/navigation";

  import { Card, CardContent } from "$lib/components/ui/card";
  import { Badge } from "$lib/components/ui/badge";
  import { Separator } from "$lib/components/ui/separator";

  import {
    CalendarCheck2,
    ClipboardList,
    UserRound,
    Bell,
    Lock,
    ChevronRight,
    LogOut
  } from "lucide-svelte";

  const profileStats = {
    attended: 12,
    pending: 3,
    notifications: 2,
    version: "2.4.1 (Build 2024)"
  };

  let loggingOut = false;

  async function onLogout() {
    if (loggingOut) return;

    loggingOut = true;

    try {
      const res = await fetch("/api/logout", { method: "POST" });
      if (!res.ok) throw new Error("Logout failed");

      await goto("/login");
    } catch (e) {
      console.error(e);
      // si quieres, aquí puedes mostrar toast
      // por ahora solo regresamos el botón a normal
    } finally {
      loggingOut = false;
    }
  }
</script>

<div class="space-y-8">
  <!-- Resumen -->
  <div>
    <div class="text-sm font-semibold tracking-widest text-foreground/80">
      RESUMEN DE ACTIVIDADES
    </div>

    <div class="mt-4 grid grid-cols-2 gap-4">
      <Card class="rounded-2xl border bg-blue-50/60">
        <CardContent class="p-5">
          <div class="flex items-center gap-3">
            <div class="grid h-10 w-10 place-items-center rounded-xl bg-blue-100">
              <CalendarCheck2 class="h-5 w-5 text-blue-700" />
            </div>
            <div class="text-base font-medium">Asistidos</div>
          </div>

          <div class="mt-4 text-5xl font-semibold text-blue-700">
            {profileStats.attended}
          </div>
        </CardContent>
      </Card>

      <Card class="rounded-2xl border bg-orange-50/60">
        <CardContent class="p-5">
          <div class="flex items-center gap-3">
            <div class="grid h-10 w-10 place-items-center rounded-xl bg-orange-100">
              <ClipboardList class="h-5 w-5 text-orange-700" />
            </div>
            <div class="text-base font-medium">Pendientes</div>
          </div>

          <div class="mt-4 text-5xl font-semibold text-orange-700">
            {profileStats.pending}
          </div>
        </CardContent>
      </Card>
    </div>
  </div>

  <!-- Configuración -->
  <div>
    <div class="text-sm font-semibold tracking-widest text-foreground/80">
      CONFIGURACIÓN DE CUENTA
    </div>

    <div class="mt-4 overflow-hidden rounded-2xl border bg-background">
      <button class="flex w-full items-center gap-4 px-4 py-4 text-left hover:bg-accent/40" type="button">
        <div class="grid h-11 w-11 place-items-center rounded-2xl bg-blue-50">
          <UserRound class="h-5 w-5 text-blue-700" />
        </div>
        <div class="flex-1">
          <div class="text-base font-medium">Editar Perfil</div>
        </div>
        <ChevronRight class="h-5 w-5 text-muted-foreground" />
      </button>

      <Separator />

      <button class="flex w-full items-center gap-4 px-4 py-4 text-left hover:bg-accent/40" type="button">
        <div class="grid h-11 w-11 place-items-center rounded-2xl bg-blue-50">
          <Bell class="h-5 w-5 text-blue-700" />
        </div>

        <div class="flex-1">
          <div class="text-base font-medium">Notificaciones</div>
        </div>

        <Badge class="rounded-full px-2.5 py-0.5">{profileStats.notifications}</Badge>
        <ChevronRight class="h-5 w-5 text-muted-foreground" />
      </button>

      <Separator />

      <button class="flex w-full items-center gap-4 px-4 py-4 text-left hover:bg-accent/40" type="button">
        <div class="grid h-11 w-11 place-items-center rounded-2xl bg-blue-50">
          <Lock class="h-5 w-5 text-blue-700" />
        </div>
        <div class="flex-1">
          <div class="text-base font-medium">Cambiar Contraseña</div>
        </div>
        <ChevronRight class="h-5 w-5 text-muted-foreground" />
      </button>
    </div>

    <div class="mt-5 overflow-hidden rounded-2xl border bg-background">
      <button
        class="flex w-full items-center gap-4 px-4 py-4 text-left hover:bg-red-50 disabled:opacity-60"
        type="button"
        on:click={onLogout}
        disabled={loggingOut}
      >
        <div class="grid h-11 w-11 place-items-center rounded-2xl bg-red-50">
          <LogOut class="h-5 w-5 text-red-600" />
        </div>

        <div class="flex-1">
          <div class="text-base font-semibold text-red-600">
            {loggingOut ? "Cerrando sesión..." : "Cerrar Sesión"}
          </div>
        </div>
      </button>
    </div>

    <div class="mt-8 text-center text-sm text-muted-foreground">
      Versión {profileStats.version}
    </div>
  </div>
</div>
