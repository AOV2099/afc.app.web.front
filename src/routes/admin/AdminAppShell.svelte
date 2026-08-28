<script>
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import { tick } from 'svelte';

	import { Avatar, AvatarFallback, AvatarImage } from '$lib/components/ui/avatar';
	import { authApi, clearClientRole } from '$lib/services/api';
	import { isNavigationPathActive, isNavigationPathExact } from '$lib/utils/navigation.js';
	import {
		Home,
		User,
		CalendarPlus2,
		CalendarDays,
		ClipboardList,
		Bell,
		Settings,
		LogOut,
		Menu
	} from 'lucide-svelte';

	export let user = null;
	export let title = 'AFC Aragón';

	const NAV = [
		{ key: 'home', label: 'Inicio', path: '/admin/home', icon: Home },
		{ key: 'events', label: 'Eventos', path: '/admin/events', icon: CalendarDays },
		{ key: 'requests', label: 'Solicitudes', path: '/admin/requests', icon: ClipboardList },
		{ key: 'alerts', label: 'Alertas', path: '/admin/alerts', icon: Bell },
		{ key: 'Crear Evento', label: 'Crear Evento', path: '/admin/create-event', icon: CalendarPlus2 },
		{ key: 'Usuarios', label: 'Usuarios', path: '/admin/users', icon: User },
		{ key: 'settings', label: 'Configuración', path: '/admin/settings', icon: Settings }
	];

	let mobileOpen = false;
	let loggingOut = false;
	let mobileMenuButton;
	let mobileDrawer;

	$: firstName = String(user?.first_name || user?.firstName || '').trim();
	$: lastName = String(user?.last_name || user?.lastName || '').trim();
	$: email = String(user?.email || '').trim();
	$: displayName = [firstName, lastName].filter(Boolean).join(' ') || email || 'Administrador';
	$: initials = getInitials(firstName, lastName, email);
	$: userPicture = String(user?.picture || '').trim();
	$: administratorLabel =
		Number(user?.career_id ?? user?.careerId) === 1
			? 'Administrador global'
			: String(user?.career_name || user?.career?.name || '').trim() || 'Administrador';
	$: activeItem = NAV.find((item) => isNavigationPathActive($page.url.pathname, item.path));
	$: pageTitle = activeItem?.label || title;

	function getInitials(givenName, familyName, userEmail) {
		const nameInitials = `${givenName.charAt(0)}${familyName.charAt(0)}`;
		if (nameInitials) return nameInitials.toUpperCase();

		const emailName = userEmail.split('@')[0].replace(/[^a-zA-Z0-9]/g, '');
		return emailName.slice(0, 2).toUpperCase() || 'AD';
	}

	function goTo(path, closeMobile = false) {
		if (closeMobile) mobileOpen = false;
		if (isNavigationPathExact($page.url.pathname, path)) return;
		goto(path);
	}

	async function openMobileDrawer() {
		mobileOpen = true;
		await tick();
		mobileDrawer?.focus();
	}

	function closeMobileDrawer(restoreFocus = false) {
		mobileOpen = false;
		if (restoreFocus) mobileMenuButton?.focus();
	}

	function handleWindowKeydown(event) {
		if (event.key === 'Escape' && mobileOpen) {
			closeMobileDrawer(true);
		}
	}

	async function onLogout() {
		if (loggingOut) return;

		loggingOut = true;
		mobileOpen = false;

		try {
			await authApi.logout();
		} catch {
			// The local session is cleared and login is restored even if the request fails.
		} finally {
			clearClientRole();
			loggingOut = false;
			await goto('/login', { replaceState: true });
		}
	}
</script>

<svelte:window on:keydown={handleWindowKeydown} />

<div class="admin-shell min-h-dvh">
	<aside class="admin-desktop-sidebar">
		<div class="admin-sidebar-content">
			<button
				type="button"
				class="admin-user-card"
				aria-label="Abrir configuración de {displayName}"
				on:click={() => goTo('/admin/settings')}
			>
				<Avatar class="h-11 w-11 border-2 border-white/25 bg-white/15 text-white">
					{#if userPicture}<AvatarImage src={userPicture} alt={displayName} />{/if}
					<AvatarFallback class="bg-white/15 text-sm font-bold text-white">
						{initials}
					</AvatarFallback>
				</Avatar>
				<span class="admin-user-copy">
					<span class="admin-user-name">{displayName}</span>
					<span class="admin-user-role">{administratorLabel}</span>
				</span>
			</button>

			<nav class="admin-desktop-nav" aria-label="Navegación de administración">
				{#each NAV as item (item.key)}
					<div class="admin-nav-entry">
						<button
							type="button"
							class:admin-nav-button-active={isNavigationPathActive(
								$page.url.pathname,
								item.path
							)}
							class="admin-nav-button"
							aria-label={item.label}
							aria-current={isNavigationPathActive($page.url.pathname, item.path)
								? 'page'
								: undefined}
							on:click={() => goTo(item.path)}
						>
							<span class="admin-nav-icon">
								<svelte:component this={item.icon} class="h-5 w-5" />
							</span>
							<span class="admin-nav-label">{item.label}</span>
						</button>
					</div>
				{/each}
			</nav>

			<button
				type="button"
				class="admin-logout-button"
				disabled={loggingOut}
				aria-label="Cerrar sesión"
				aria-busy={loggingOut}
				on:click={onLogout}
			>
				<span class="admin-nav-icon"><LogOut class="h-5 w-5" /></span>
				<span class="admin-nav-label">
					{loggingOut ? 'Cerrando sesión...' : 'Cerrar sesión'}
				</span>
			</button>
		</div>
	</aside>

	<header class="admin-mobile-bar">
		<button
			bind:this={mobileMenuButton}
			type="button"
			class="admin-mobile-icon-button"
			aria-label="Abrir menú de administración"
			aria-expanded={mobileOpen}
			aria-controls="admin-mobile-navigation"
			on:click={openMobileDrawer}
		>
			<Menu class="h-5 w-5" />
		</button>
		<div class="min-w-0">
			<div class="truncate text-xs font-semibold tracking-[0.14em] text-white/65 uppercase">
				{title}
			</div>
			<div class="truncate text-base font-semibold text-white">{pageTitle}</div>
		</div>
	</header>

	{#if mobileOpen}
		<button
			type="button"
			class="admin-mobile-backdrop"
			aria-label="Cerrar menú de administración"
			on:click={() => closeMobileDrawer(true)}
		></button>
	{/if}

	<aside
		bind:this={mobileDrawer}
		id="admin-mobile-navigation"
		class:admin-mobile-drawer-open={mobileOpen}
		class="admin-mobile-drawer"
		aria-label="Menú de administración"
		aria-hidden={!mobileOpen}
		inert={!mobileOpen}
		tabindex="-1"
	>
		<button
			type="button"
			class="admin-mobile-user-card"
			aria-label="Abrir configuración de {displayName}"
			on:click={() => goTo('/admin/settings', true)}
		>
			<Avatar class="h-12 w-12 border-2 border-white/25 bg-white/15 text-white">
				{#if userPicture}<AvatarImage src={userPicture} alt={displayName} />{/if}
				<AvatarFallback class="bg-white/15 text-sm font-bold text-white">
					{initials}
				</AvatarFallback>
			</Avatar>
			<span class="admin-user-copy">
				<span class="admin-user-name">{displayName}</span>
				<span class="admin-user-role">{administratorLabel}</span>
			</span>
		</button>

		<nav class="admin-mobile-nav" aria-label="Navegación de administración">
			{#each NAV as item (item.key)}
				<button
					type="button"
					class:admin-nav-button-active={isNavigationPathActive(
						$page.url.pathname,
						item.path
					)}
					class="admin-nav-button admin-mobile-nav-button"
					aria-current={isNavigationPathActive($page.url.pathname, item.path)
						? 'page'
						: undefined}
					on:click={() => goTo(item.path, true)}
				>
					<span class="admin-nav-icon">
						<svelte:component this={item.icon} class="h-5 w-5" />
					</span>
					<span class="admin-nav-label">{item.label}</span>
				</button>
			{/each}
		</nav>

		<button
			type="button"
			class="admin-logout-button admin-mobile-logout-button"
			disabled={loggingOut}
			aria-busy={loggingOut}
			on:click={onLogout}
		>
			<span class="admin-nav-icon"><LogOut class="h-5 w-5" /></span>
			<span class="admin-nav-label">
				{loggingOut ? 'Cerrando sesión...' : 'Cerrar sesión'}
			</span>
		</button>
	</aside>

	<main class="admin-main">
		<slot />
	</main>
</div>

<style>
	.admin-desktop-sidebar {
		position: fixed;
		inset: 0 auto 0 0;
		z-index: 40;
		display: none;
		width: 280px;
		background: #082f62;
		color: white;
		box-shadow: 8px 0 28px rgba(2, 20, 45, 0.18);
		overflow: visible;
	}

	.admin-sidebar-content {
		display: flex;
		height: 100%;
		min-height: 0;
		width: 100%;
		flex-direction: column;
		gap: 16px;
		padding: 16px 12px;
		overflow: visible;
	}


	.admin-user-card,
	.admin-mobile-user-card {
		position: relative;
		display: flex;
		min-width: 0;
		align-items: center;
		gap: 12px;
		border: 1px solid rgba(255, 255, 255, 0.15);
		border-radius: 16px;
		background: rgba(255, 255, 255, 0.1);
		color: white;
		text-align: left;
		box-shadow: 0 8px 20px rgba(2, 20, 45, 0.12);
		transition: background 160ms ease;
	}

	.admin-user-card {
		height: 68px;
		width: 256px;
		flex: 0 0 auto;
		padding: 10px;
	}

	.admin-user-card:hover,
	.admin-user-card:focus-visible,
	.admin-mobile-user-card:hover,
	.admin-mobile-user-card:focus-visible {
		background: rgba(255, 255, 255, 0.16);
		outline: none;
	}

	.admin-user-copy {
		display: flex;
		min-width: 0;
		flex: 1;
		flex-direction: column;
	}

	.admin-user-name,
	.admin-user-role {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.admin-user-name {
		font-size: 14px;
		font-weight: 700;
	}

	.admin-user-role {
		margin-top: 2px;
		font-size: 11px;
		color: rgba(255, 255, 255, 0.68);
	}

	.admin-desktop-nav {
		display: flex;
		min-height: 0;
		flex: 1;
		flex-direction: column;
		gap: 6px;
		overflow: visible;
	}

	.admin-nav-entry {
		position: relative;
		width: 100%;
	}

	.admin-nav-button,
	.admin-logout-button {
		position: relative;
		display: flex;
		height: 46px;
		width: 256px;
		align-items: center;
		gap: 12px;
		border: 0;
		border-radius: 13px;
		background: transparent;
		color: rgba(255, 255, 255, 0.7);
		font-size: 14px;
		font-weight: 600;
		text-align: left;
		transition:
			background 160ms ease,
			color 160ms ease,
			box-shadow 160ms ease;
	}

	.admin-nav-button {
		padding: 0 10px;
	}

	.admin-nav-button:hover,
	.admin-nav-button:focus-visible {
		background: rgba(255, 255, 255, 0.05);
		color: white;
		outline: none;
	}

	.admin-nav-button-active,
	.admin-nav-button-active:hover,
	.admin-nav-button-active:focus-visible {
		background: rgba(255, 255, 255, 0.15);
		color: white;
		box-shadow: 0 8px 18px rgba(2, 20, 45, 0.13);
	}

	.admin-nav-button-active::before {
		position: absolute;
		top: 9px;
		bottom: 9px;
		left: -12px;
		width: 4px;
		border-radius: 0 4px 4px 0;
		background: white;
		content: '';
	}

	.admin-nav-icon {
		display: grid;
		height: 34px;
		width: 34px;
		flex: 0 0 34px;
		place-items: center;
		border-radius: 10px;
		background: rgba(255, 255, 255, 0.1);
	}

	.admin-nav-label {
		white-space: nowrap;
	}

	.admin-logout-button {
		flex: 0 0 auto;
		padding: 0 10px;
		border: 1px solid rgba(255, 255, 255, 0.14);
		background: rgba(255, 255, 255, 0.08);
		color: white;
	}

	.admin-logout-button:hover,
	.admin-logout-button:focus-visible {
		background: rgba(255, 255, 255, 0.15);
		outline: none;
	}

	.admin-logout-button:disabled {
		cursor: not-allowed;
		opacity: 0.6;
	}

	.admin-main {
		min-height: 100dvh;
		padding-bottom: 32px;
		background: var(--light-blue-background);
	}

	.admin-mobile-bar {
		position: sticky;
		top: 0;
		z-index: 30;
		display: flex;
		height: 64px;
		align-items: center;
		gap: 12px;
		background: #082f62;
		padding: 8px 16px;
		box-shadow: 0 6px 18px rgba(2, 20, 45, 0.16);
	}

	.admin-mobile-icon-button {
		display: grid;
		height: 40px;
		width: 40px;
		flex: 0 0 40px;
		place-items: center;
		border: 1px solid rgba(255, 255, 255, 0.18);
		border-radius: 12px;
		background: rgba(255, 255, 255, 0.1);
		color: white;
		transition: background 160ms ease;
	}

	.admin-mobile-icon-button:hover,
	.admin-mobile-icon-button:focus-visible {
		background: rgba(255, 255, 255, 0.18);
		outline: none;
	}

	.admin-mobile-backdrop {
		position: fixed;
		inset: 0;
		z-index: 50;
		border: 0;
		background: rgba(2, 12, 27, 0.62);
		backdrop-filter: blur(2px);
	}

	.admin-mobile-drawer {
		position: fixed;
		inset: 0 auto 0 0;
		z-index: 60;
		display: flex;
		width: 280px;
		max-width: calc(100vw - 40px);
		flex-direction: column;
		gap: 16px;
		transform: translateX(-105%);
		background: #082f62;
		padding: 16px 12px;
		color: white;
		box-shadow: 12px 0 32px rgba(2, 20, 45, 0.28);
		overflow-y: auto;
		transition: transform 220ms ease;
	}

	.admin-mobile-drawer-open {
		transform: translateX(0);
	}

	.admin-mobile-user-card {
		width: 100%;
		padding: 12px;
	}

	.admin-mobile-nav {
		display: flex;
		flex: 1;
		flex-direction: column;
		gap: 6px;
	}

	.admin-mobile-nav-button,
	.admin-mobile-logout-button {
		width: 100%;
	}

	.admin-mobile-logout-button {
		min-height: 48px;
	}

	@media (max-width: 1023px) {
		.admin-main :global(.sticky.top-0) {
			top: 64px;
		}
	}

	@media (min-width: 1024px) {
		.admin-desktop-sidebar {
			display: flex;
		}

		.admin-mobile-bar,
		.admin-mobile-backdrop,
		.admin-mobile-drawer {
			display: none;
		}

		.admin-main {
			margin-left: 280px;
			padding-bottom: 0;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.admin-mobile-drawer,
		.admin-nav-button,
		.admin-logout-button {
			transition-duration: 0.01ms;
		}
	}
</style>
