<script>
  import { onMount } from 'svelte';
  import { Button } from "$lib/components/ui/button";
  import { Avatar, AvatarFallback, AvatarImage } from "$lib/components/ui/avatar";
  import { meApi } from '$lib/services/api';
  import { currentUser, setCurrentUser } from '../../routes/store';


  import { Camera, GraduationCap } from "lucide-svelte";
	import ProfileTab from "./ProfileTab.svelte";

  export let title = "Cuenta";

  function resolveUserName(user) {
    const firstName = user?.firstName || user?.first_name || '';
    const lastName = user?.lastName || user?.last_name || '';
    const full = `${firstName} ${lastName}`.trim();
    return full || user?.email || 'Usuario';
  }

  function resolveCareer(user) {
    if (typeof user?.career === 'string') return user.career;
    if (user?.career?.name) return user.career.name;
    return user?.career_name || 'Sin carrera';
  }

  function resolveStudentId(user) {
    return user?.studentId || user?.student_id || 'Sin matrícula';
  }

  function initialsFromName(name) {
    const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return 'U';
    if (parts.length === 1) return parts[0][0]?.toUpperCase() || 'U';
    return `${parts[0][0] || ''}${parts[1][0] || ''}`.toUpperCase();
  }

  $: userName = resolveUserName($currentUser);
  $: userCareer = resolveCareer($currentUser);
  $: userMatricula = resolveStudentId($currentUser);
  $: userAvatarUrl = $currentUser?.avatarUrl || $currentUser?.avatar_url || '';
  $: userInitials = initialsFromName(userName);

  onMount(async () => {
    if ($currentUser?.id) return;
    try {
      const res = await meApi.getProfile();
      if (res?.user) setCurrentUser(res.user);
    } catch {
      // noop
    }
  });
</script>

<div class="mx-auto w-full max-w-screen-md px-4 pb-24 pt-6 sm:px-6 lg:px-8">
  <!-- Top bar -->
  <div class="relative flex items-center justify-between">
    <h1 class="text-2xl font-semibold tracking-tight sm:text-2xl">{title}</h1>
  </div>

  <!-- User block (común) -->
  <div class="mt-6 flex items-center gap-4">
    <div class="relative">
      <Avatar class="h-16 w-16 shadow-sm">
        <AvatarImage src={userAvatarUrl} alt={userName} />
        <AvatarFallback>{userInitials}</AvatarFallback>
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
      <div class="text-xl font-semibold leading-tight">{userName}</div>
      <div class="text-sm text-muted-foreground">{userCareer}</div>

      <div class="mt-1 flex flex-wrap items-center gap-2 text-sm">
        <div class="text-muted-foreground">Matrícula:</div>
        <div class="font-medium">{userMatricula}</div>

        <span class="text-muted-foreground">•</span>

        <div class="inline-flex items-center gap-1 text-primary">
          <GraduationCap class="h-4 w-4" />
          <span class="font-medium">Perfil</span>
        </div>
      </div>
    </div>
  </div>

  <div class="mt-6">
    <ProfileTab />
  </div>
</div>
