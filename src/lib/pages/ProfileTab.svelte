<script>
  import { goto } from "$app/navigation";

  import { Card } from "$lib/components/ui/card";
  import { Separator } from "$lib/components/ui/separator";
  import { authApi, clearClientRole } from "$lib/services/api";
  import { clearCurrentUser } from "../../routes/store";

  import { UserRound, Lock, ChevronRight, LogOut } from "lucide-svelte";

  let loggingOut = false;

  async function onLogout() {
    if (loggingOut) return;

    loggingOut = true;

    try {
      await authApi.logout();
      clearClientRole();
      clearCurrentUser();

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

<div class="space-y-4">
  <Card class="overflow-hidden rounded-2xl border bg-background">
    <button
      class="flex w-full items-center gap-4 px-4  text-left hover:bg-accent/40"
      type="button"
      on:click={() => goto("/app/account/edit-profile")}
    >
      <div class="grid h-11 w-11 place-items-center rounded-2xl bg-blue-50">
        <UserRound class="h-5 w-5 text-blue-700" />
      </div>
      <div class="flex-1">
        <div class="text-base font-medium">Editar Perfil</div>
      </div>
      <ChevronRight class="h-5 w-5 text-muted-foreground" />
    </button>

    <Separator />

    <button
      class="flex w-full items-center gap-4 px-4  text-left hover:bg-accent/40"
      type="button"
      on:click={() => goto("/app/account/change-password")}
    >
      <div class="grid h-11 w-11 place-items-center rounded-2xl bg-blue-50">
        <Lock class="h-5 w-5 text-blue-700" />
      </div>
      <div class="flex-1">
        <div class="text-base font-medium">Cambiar Contraseña</div>
      </div>
      <ChevronRight class="h-5 w-5 text-muted-foreground" />
    </button>

    <Separator />

    <button
      class="flex w-full items-center gap-4 px-4  text-left hover:bg-red-50 disabled:opacity-60"
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
  </Card>
</div>
