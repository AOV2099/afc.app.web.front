<script>
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';

	import { Button } from '$lib/components/ui/button';
	import { Avatar, AvatarFallback } from '$lib/components/ui/avatar';
	import { Home, User, CalendarPlus2, CalendarDays, ClipboardList, Bell, Settings } from 'lucide-svelte';
	import { selectedView } from '../store';
	import { onMount } from 'svelte';

	export let title = 'AFC Aragón';

	let NAV = [
		{ key: 'home', label: 'Inicio', path: '/admin/home', icon: Home, active: false },
		{ key: 'events', label: 'Eventos', path: '/admin/events', icon: CalendarDays, active: false },
		{ key: 'requests', label: 'Solicitudes', path: '/admin/requests', icon: ClipboardList, active: false },
		{ key: 'alerts', label: 'Alertas', path: '/admin/alerts', icon: Bell, active: false },
		{ key: 'Crear Evento', label: 'Crear Evento', path: '/admin/create-event', icon: CalendarPlus2, active: false },
		{ key: 'Usuarios', label: 'Usuarios', path: '/admin/users', icon: User, active: false },
		{ key: 'settings', label: 'Configuración', path: '/admin/settings', icon: Settings, active: false }
	];

	const baseDesktop =
		'flex w-full items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition';

	const baseMobile = 'flex flex-col items-center gap-1 rounded-xl px-3 py-2 transition';

	// Sincronizar con la ruta actual al cargar
	function syncWithCurrentRoute() {
		const currentPath = $page.url.pathname;
		const matchedItem = NAV.find((item) => item.path === currentPath);

		if (matchedItem) {
			selectedView.set(matchedItem.key);
		} else {
			// Si no hay match exacto, intentar con el default
			if (!$selectedView) {
				$selectedView = 'home';
			}
		}
	}

	syncWithCurrentRoute();

	$: ($selectedView, updateActiveClass($selectedView));

	// Reaccionar a cambios de ruta
	$: if ($page.url.pathname) {
		const matchedItem = NAV.find((item) => item.path === $page.url.pathname);
		if (matchedItem && $selectedView !== matchedItem.key) {
			selectedView.set(matchedItem.key);
		}
	}

	async function goTo(key) {
		const item = NAV.find((i) => i.key === key);
		if (!item) return;

		selectedView.set(key);

		await goto(item.path);
	}

	function updateActiveClass(key) {
		console.log('View', $selectedView);
		//reset all items to false
		NAV.forEach((i) => (i.active = false));

		//set active item to true
		const item = NAV.find((i) => i.key === key);
		if (item) item.active = true;

		// Forzar reactividad en Svelte
		NAV = [...NAV];

		console.log(NAV);
	}

	onMount(() => {});
</script>

<div class="min-h-dvh bg-background ">
	<!-- Sidebar (desktop) -->
	<aside class="fixed inset-y-0 left-0 hidden w-64 border-r bg-background sm:flex">
		<div class="flex w-full flex-col p-4">
			<div class="flex items-center justify-between">
				<div class="text-lg font-semibold">{title}</div>

				<Button variant="ghost" size="icon" class="rounded-full" on:click={() => goTo('settings')}>
					<Avatar class="h-9 w-9">
						<AvatarFallback class="text-xs">
							<User class="h-4 w-4" />
						</AvatarFallback>
					</Avatar>
				</Button>
			</div>

			<nav class="mt-6 space-y-1">
				{#each NAV as item (item.key)}
					<button
						type="button"
						class={item.active
							? `${baseDesktop} bg-blue-50 text-blue-700`
							: `${baseDesktop} text-muted-foreground hover:bg-accent hover:text-foreground`}
						on:click={() => goTo(item.key)}
					>
						<svelte:component this={item.icon} class="h-4 w-4" />
						{item.label}
					</button>
				{/each}
			</nav>
		</div>
	</aside>

	<!-- Main -->
	<main class="sm:pl-64 bg-[#f1f1f1] min-h-dvh pb-16 sm:pb-0">
		<slot />
	</main>

	<!-- Bottom Nav (mobile) -->
	<div class="fixed inset-x-0 bottom-0 border-t bg-background/95 backdrop-blur sm:hidden">
		<div class="mx-auto flex max-w-[520px] items-center justify-between px-3 py-2">
			{#each NAV as item (item.key)}
				<button
					type="button"
					class={item.active
						? `${baseMobile} bg-blue-50 text-blue-700`
						: `${baseMobile} text-muted-foreground`}
					on:click={() => goTo(item.key)}
				>
					<svelte:component this={item.icon} class="h-5 w-5" />
					<span class="text-[11px] font-medium">{item.label}</span>
				</button>
			{/each}
		</div>
	</div>
</div>
