<script>
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import { tick } from 'svelte';

	import { Avatar, AvatarFallback, AvatarImage } from '$lib/components/ui/avatar';
	import { authApi, clearClientRole } from '$lib/services/api';
	import { isNavigationPathActive, isNavigationPathExact } from '$lib/utils/navigation.js';
	import { clearCurrentUser } from '../../routes/store';
	import { Home, Calendar, History as HistoryIcon, User, LogOut, Menu } from 'lucide-svelte';

	export let user = null;
	export let title = 'AFC Aragón';

	const NAV = [
		{ key: 'home', label: 'Inicio', path: '/app/home', icon: Home },
		{ key: 'explore', label: 'Explorar', path: '/app/explore', icon: Calendar },
		{ key: 'history', label: 'Historial', path: '/app/history', icon: HistoryIcon },
		{ key: 'account', label: 'Perfil', path: '/app/account', icon: User }
	];

	const ROLE_LABELS = {
		student: 'Estudiante',
		visitor: 'Visitante',
		auditor: 'Auditor'
	};

	let mobileOpen = false;
	let loggingOut = false;
	let mobileMenuButton;
	let mobileDrawer;

	$: firstName = String(user?.first_name || user?.firstName || '').trim();
	$: lastName = String(user?.last_name || user?.lastName || '').trim();
	$: email = String(user?.email || '').trim();
	$: displayName = [firstName, lastName].filter(Boolean).join(' ') || email || 'Usuario';
	$: initials = getInitials(firstName, lastName, email);
	$: userPicture = String(user?.picture || '').trim();
	$: roleLabel = ROLE_LABELS[String(user?.role || '').toLowerCase()] || 'Usuario';
	$: careerName = String(user?.career_name || user?.career?.name || '').trim();
	$: userSubtitle = careerName ? `${roleLabel} · ${careerName}` : roleLabel;
	$: activeItem = NAV.find((item) => isNavigationPathActive($page.url.pathname, item.path));
	$: pageTitle = activeItem?.label || title;

	function getInitials(givenName, familyName, userEmail) {
		const nameInitials = `${givenName.charAt(0)}${familyName.charAt(0)}`;
		if (nameInitials) return nameInitials.toUpperCase();

		const emailName = userEmail.split('@')[0].replace(/[^a-zA-Z0-9]/g, '');
		return emailName.slice(0, 2).toUpperCase() || 'U';
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
		if (event.key === 'Escape' && mobileOpen) closeMobileDrawer(true);
	}

	async function onLogout() {
		if (loggingOut) return;

		loggingOut = true;
		mobileOpen = false;
		try {
			await authApi.logout();
		} catch {
			// The local session is cleared even when the server request fails.
		} finally {
			clearClientRole();
			clearCurrentUser();
			loggingOut = false;
			await goto('/login', { replaceState: true });
		}
	}
</script>


<svelte:window on:keydown={handleWindowKeydown} />

<div class="app-shell min-h-dvh">
	<aside class="app-desktop-sidebar">
		<div class="app-sidebar-content">
			<button
				type="button"
				class="app-user-card"
				aria-label="Abrir perfil de {displayName}"
				on:click={() => goTo('/app/account')}
			>
				<Avatar class="h-11 w-11 border-2 border-white/25 bg-white/15 text-white">
					{#if userPicture}<AvatarImage src={userPicture} alt={displayName} />{/if}
					<AvatarFallback class="bg-white/15 text-sm font-bold text-white">
						{initials}
					</AvatarFallback>
				</Avatar>
				<span class="app-user-copy">
					<span class="app-user-name">{displayName}</span>
					<span class="app-user-role">{userSubtitle}</span>
				</span>
			</button>

			<nav class="app-desktop-nav" aria-label="Navegación de usuario">
				{#each NAV as item (item.key)}
					<div class="app-nav-entry">
						<button
							type="button"
							class:app-nav-button-active={isNavigationPathActive($page.url.pathname, item.path)}
							class="app-nav-button"
							aria-label={item.label}
							aria-current={isNavigationPathActive($page.url.pathname, item.path) ? 'page' : undefined}
							on:click={() => goTo(item.path)}
						>
							<span class="app-nav-icon">
								<svelte:component this={item.icon} class="h-5 w-5" />
							</span>
							<span class="app-nav-label">{item.label}</span>
						</button>
					</div>
				{/each}
			</nav>

			<button
				type="button"
				class="app-logout-button"
				disabled={loggingOut}
				aria-label="Cerrar sesión"
				aria-busy={loggingOut}
				on:click={onLogout}
			>
				<span class="app-nav-icon"><LogOut class="h-5 w-5" /></span>
				<span class="app-nav-label">
					{loggingOut ? 'Cerrando sesión...' : 'Cerrar sesión'}
				</span>
			</button>
		</div>
	</aside>

	<header class="app-mobile-bar">
		<button
			bind:this={mobileMenuButton}
			type="button"
			class="app-mobile-icon-button"
			aria-label="Abrir menú de usuario"
			aria-expanded={mobileOpen}
			aria-controls="app-mobile-navigation"
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
			class="app-mobile-backdrop"
			aria-label="Cerrar menú de usuario"
			on:click={() => closeMobileDrawer(true)}
		></button>
	{/if}

	<aside
		bind:this={mobileDrawer}
		id="app-mobile-navigation"
		class:app-mobile-drawer-open={mobileOpen}
		class="app-mobile-drawer"
		aria-label="Menú de usuario"
		aria-hidden={!mobileOpen}
		inert={!mobileOpen}
		tabindex="-1"
	>
		<button
			type="button"
			class="app-mobile-user-card"
			aria-label="Abrir perfil de {displayName}"
			on:click={() => goTo('/app/account', true)}
		>
			<Avatar class="h-12 w-12 border-2 border-white/25 bg-white/15 text-white">
				{#if userPicture}<AvatarImage src={userPicture} alt={displayName} />{/if}
				<AvatarFallback class="bg-white/15 text-sm font-bold text-white">
					{initials}
				</AvatarFallback>
			</Avatar>
			<span class="app-user-copy">
				<span class="app-user-name">{displayName}</span>
				<span class="app-user-role">{userSubtitle}</span>
			</span>
		</button>

		<nav class="app-mobile-nav" aria-label="Navegación de usuario">
			{#each NAV as item (item.key)}
				<button
					type="button"
					class:app-nav-button-active={isNavigationPathActive($page.url.pathname, item.path)}
					class="app-nav-button app-mobile-nav-button"
					aria-current={isNavigationPathActive($page.url.pathname, item.path) ? 'page' : undefined}
					on:click={() => goTo(item.path, true)}
				>
					<span class="app-nav-icon">
						<svelte:component this={item.icon} class="h-5 w-5" />
					</span>
					<span class="app-nav-label">{item.label}</span>
				</button>
			{/each}
		</nav>

		<button
			type="button"
			class="app-logout-button app-mobile-logout-button"
			disabled={loggingOut}
			aria-busy={loggingOut}
			on:click={onLogout}
		>
			<span class="app-nav-icon"><LogOut class="h-5 w-5" /></span>
			<span class="app-nav-label">
				{loggingOut ? 'Cerrando sesión...' : 'Cerrar sesión'}
			</span>
		</button>
	</aside>

	<main class="app-main"><slot /></main>
</div>

<style>
	.app-desktop-sidebar {
		position: fixed;
		inset: 0 auto 0 0;
		z-index: 40;
		display: none;
		width: 280px;
		background: #082f62;
		color: white;
		box-shadow: 8px 0 28px rgba(2, 20, 45, 0.18);
	}

	.app-sidebar-content {
		display: flex;
		height: 100%;
		min-height: 0;
		width: 100%;
		flex-direction: column;
		gap: 16px;
		padding: 16px 12px;
	}

	.app-user-card,
	.app-mobile-user-card {
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

	.app-user-card {
		height: 68px;
		width: 256px;
		padding: 10px;
	}

	.app-user-card:hover,
	.app-user-card:focus-visible,
	.app-mobile-user-card:hover,
	.app-mobile-user-card:focus-visible {
		background: rgba(255, 255, 255, 0.16);
		outline: none;
	}

	.app-user-copy {
		display: flex;
		min-width: 0;
		flex: 1;
		flex-direction: column;
	}

	.app-user-name,
	.app-user-role {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.app-user-name {
		font-size: 14px;
		font-weight: 700;
	}

	.app-user-role {
		margin-top: 2px;
		font-size: 11px;
		color: rgba(255, 255, 255, 0.68);
	}

	.app-desktop-nav,
	.app-mobile-nav {
		display: flex;
		min-height: 0;
		flex: 1;
		flex-direction: column;
		gap: 6px;
	}

	.app-nav-entry {
		width: 100%;
	}

	.app-nav-button,
	.app-logout-button {
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
		padding: 0 10px;
		font-size: 14px;
		font-weight: 600;
		text-align: left;
		transition: background 160ms ease, color 160ms ease, box-shadow 160ms ease;
	}

	.app-nav-button:hover,
	.app-nav-button:focus-visible {
		background: rgba(255, 255, 255, 0.05);
		color: white;
		outline: none;
	}

	.app-nav-button-active,
	.app-nav-button-active:hover,
	.app-nav-button-active:focus-visible {
		background: rgba(255, 255, 255, 0.15);
		color: white;
		box-shadow: 0 8px 18px rgba(2, 20, 45, 0.13);
	}

	.app-nav-button-active::before {
		position: absolute;
		top: 9px;
		bottom: 9px;
		left: -12px;
		width: 4px;
		border-radius: 0 4px 4px 0;
		background: white;
		content: '';
	}

	.app-nav-icon {
		display: grid;
		height: 34px;
		width: 34px;
		flex: 0 0 34px;
		place-items: center;
		border-radius: 10px;
		background: rgba(255, 255, 255, 0.1);
	}

	.app-nav-label {
		white-space: nowrap;
	}

	.app-logout-button {
		margin-top: auto;
		border: 1px solid rgba(255, 255, 255, 0.14);
		background: rgba(255, 255, 255, 0.08);
		color: white;
	}

	.app-logout-button:hover,
	.app-logout-button:focus-visible {
		background: rgba(255, 255, 255, 0.15);
		outline: none;
	}

	.app-logout-button:disabled {
		cursor: not-allowed;
		opacity: 0.6;
	}

	.app-main {
		min-height: 100dvh;
		padding-bottom: 32px;
		background: var(--light-blue-background);
	}

	.app-mobile-bar {
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

	.app-mobile-icon-button {
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

	.app-mobile-icon-button:hover,
	.app-mobile-icon-button:focus-visible {
		background: rgba(255, 255, 255, 0.18);
		outline: none;
	}

	.app-mobile-backdrop {
		position: fixed;
		inset: 0;
		z-index: 50;
		border: 0;
		background: rgba(2, 12, 27, 0.62);
		backdrop-filter: blur(2px);
	}

	.app-mobile-drawer {
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

	.app-mobile-drawer-open {
		transform: translateX(0);
	}

	.app-mobile-user-card,
	.app-mobile-nav-button,
	.app-mobile-logout-button {
		width: 100%;
	}

	.app-mobile-user-card {
		padding: 12px;
	}

	.app-mobile-logout-button {
		min-height: 48px;
	}

	@media (max-width: 1023px) {
		.app-main :global(.sticky.top-0) {
			top: 64px;
		}
	}

	@media (min-width: 1024px) {
		.app-desktop-sidebar {
			display: flex;
		}

		.app-mobile-bar,
		.app-mobile-backdrop,
		.app-mobile-drawer {
			display: none;
		}

		.app-main {
			margin-left: 280px;
			padding-bottom: 0;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.app-mobile-drawer,
		.app-nav-button,
		.app-logout-button {
			transition-duration: 0.01ms;
		}
	}
</style>
