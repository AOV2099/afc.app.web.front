<script>
	import { onMount, onDestroy } from 'svelte';
	import { adminUsersApi, careersApi } from '$lib/services/api';
	import { USER_STATUS_CATALOG } from '../../routes/store';

	import { Card, CardContent, CardHeader, CardTitle } from '$lib/components/ui/card';
	import { Button } from '$lib/components/ui/button';
	import { Badge } from '$lib/components/ui/badge';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { Separator } from '$lib/components/ui/separator';
	import * as Dialog from '$lib/components/ui/dialog';

	import { Search, Plus, Pencil, Loader2, KeyRound, Eye, EyeOff } from 'lucide-svelte';

	import {
		Table,
		TableBody,
		TableCell,
		TableHead,
		TableHeader,
		TableRow
	} from '$lib/components/ui/table';

	import { Avatar, AvatarFallback, AvatarImage } from '$lib/components/ui/avatar';

	// Igual que CreateEvent
	const cardShadow =
		'shadow-[inset_0_1px_0_rgba(255,255,255,0.7),0_1px_2px_rgba(0,0,0,0.06)]';

	let users = [];
	let careers = [];
	let loading = false;
	let submitting = false;
	let error = '';
	let formError = '';

	let q = '';
	let roleFilter = 'all';
	let statusFilter = 'all';
	let filtersReady = false;
	let filtersTimeout;

	let page = 1;
	let pageSize = 20;
	let total = 0;
	let totalPages = 1;

	let createOpen = false;
	let editOpen = false;
	let passwordOpen = false;
	let selectedUser = null;
	let passwordUser = null;
	let passwordSubmitting = false;
	let passwordError = '';
	let passwordForm = {
		newPassword: '',
		confirmPassword: ''
	};
	let showCreatePassword = false;
	let showCreateConfirmPassword = false;
	let showUpdatePassword = false;
	let showUpdateConfirmPassword = false;

	const roleOptions = ['admin', 'staff', 'student', 'auditor'];
	const statusOptions = Object.keys(USER_STATUS_CATALOG);

	let createForm = {
		email: '',
		password: '',
		confirmPassword: '',
		firstName: '',
		lastName: '',
		studentId: '',
		careerId: '',
		status: 'active',
		role: 'student'
	};

	let editForm = {
		email: '',
		firstName: '',
		lastName: '',
		studentId: '',
		careerId: '',
		status: 'active',
		role: 'student'
	};

	function badgeClass(role) {
		if (role === 'admin') return 'rounded-full bg-blue-50 text-blue-700 hover:bg-blue-50';
		if (role === 'staff') return 'rounded-full bg-slate-100 text-slate-700 hover:bg-slate-100';
		return 'rounded-full bg-slate-100 text-slate-700 hover:bg-slate-100';
	}

	function statusBadgeClass(status) {
		const normalized = String(status || 'active').toLowerCase();
		if (normalized === 'active') return 'rounded-full bg-emerald-50 text-emerald-700 hover:bg-emerald-50';
		return 'rounded-full bg-red-50 text-red-700 hover:bg-red-50';
	}

	function formatStatus(status) {
		const normalized = String(status || 'active').toLowerCase();
		if (USER_STATUS_CATALOG[normalized]) return USER_STATUS_CATALOG[normalized].label;
		return normalized;
	}

	function formatRole(role) {
		if (!role) return 'Visitor';
		return role.charAt(0).toUpperCase() + role.slice(1);
	}

	function resolveUserCareerId(user) {
		const value = user?.career_id ?? user?.career?.id ?? '';
		if (value === null || value === undefined || value === '') return '';
		return String(value);
	}

	function normalizeRoleInput(value, fallback = 'student') {
		const normalized = String(value || '').trim().toLowerCase();
		if (roleOptions.includes(normalized)) return normalized;
		return fallback;
	}

	$: editRoleOptions =
		selectedUser?.role && !roleOptions.includes(String(selectedUser.role).toLowerCase())
			? [...roleOptions, String(selectedUser.role).toLowerCase()]
			: roleOptions;

	function fullName(u) {
		return [u.first_name, u.last_name].filter(Boolean).join(' ').trim() || 'Sin nombre';
	}

	function initials(name = '') {
		const parts = name.trim().split(/\s+/).filter(Boolean);
		const a = parts[0]?.[0] ?? '';
		const b = parts[1]?.[0] ?? '';
		return (a + b).toUpperCase();
	}

	function resetCreateForm() {
		createForm = {
			email: '',
			password: '',
			confirmPassword: '',
			firstName: '',
			lastName: '',
			studentId: '',
			careerId: '',
			status: 'active',
			role: 'student'
		};
	}

	function openCreateUser() {
		formError = '';
		resetCreateForm();
		showCreatePassword = false;
		showCreateConfirmPassword = false;
		createOpen = true;
	}

	function openEditUser(user) {
		selectedUser = user;
		formError = '';
		editForm = {
			email: user.email || '',
			firstName: user.first_name || '',
			lastName: user.last_name || '',
			studentId: user.student_id || '',
			careerId: resolveUserCareerId(user),
			status: user.status || 'active',
			role: normalizeRoleInput(user.role, user.role || 'student')
		};
		editOpen = true;
	}

	function normalizeStudentId(value) {
		return String(value || '').slice(0, 10);
	}

	function openPasswordUser(user) {
		passwordUser = user;
		passwordError = '';
		passwordForm = { newPassword: '', confirmPassword: '' };
		showUpdatePassword = false;
		showUpdateConfirmPassword = false;
		passwordOpen = true;
	}

	function toUserPayload(form) {
		return {
			email: form.email.trim(),
			password: form.password,
			firstName: form.firstName.trim(),
			lastName: form.lastName.trim(),
			studentId: normalizeStudentId(form.studentId).trim() || undefined,
			career_id: form.careerId ? Number(form.careerId) : undefined,
			status: form.status,
			role: normalizeRoleInput(form.role)
		};
	}

	function getEditPayload() {
		const payload = {};
		if (!selectedUser) return payload;

		if (editForm.email.trim() !== (selectedUser.email || '')) payload.email = editForm.email.trim();
		if (editForm.firstName.trim() !== (selectedUser.first_name || '')) payload.firstName = editForm.firstName.trim();
		if (editForm.lastName.trim() !== (selectedUser.last_name || '')) payload.lastName = editForm.lastName.trim();
		if (normalizeStudentId(editForm.studentId).trim() !== normalizeStudentId(selectedUser.student_id).trim()) {
			payload.studentId = normalizeStudentId(editForm.studentId).trim();
		}
		if (editForm.careerId !== resolveUserCareerId(selectedUser)) {
			payload.career_id = editForm.careerId ? Number(editForm.careerId) : null;
		}
		if (editForm.status !== (selectedUser.status || 'active')) payload.status = editForm.status;
		if (editForm.role !== (selectedUser.role || 'student')) payload.role = editForm.role;

		return payload;
	}

	async function loadCareers() {
		try {
			const res = await careersApi.list();
			careers = Array.isArray(res?.careers) ? res.careers : [];
		} catch {
			careers = [];
		}
	}

	async function loadUsers() {
		loading = true;
		error = '';

		try {
			const res = await adminUsersApi.listUsers({
				page,
				pageSize,
				q: q.trim() || undefined,
				status: statusFilter === 'all' ? undefined : statusFilter,
				role: roleFilter === 'all' ? undefined : roleFilter
			});

			if (!res?.ok) {
				throw new Error(res?.message || 'No se pudo cargar usuarios.');
			}

			users = res.users || [];
			page = res.pagination?.page || page;
			pageSize = res.pagination?.pageSize || pageSize;
			total = res.pagination?.total || 0;
			totalPages = res.pagination?.totalPages || 1;
		} catch (e) {
			error = e?.message || 'No se pudo cargar usuarios.';
		} finally {
			loading = false;
		}
	}

	async function submitCreateUser() {
		formError = '';
		submitting = true;

		try {
			const payload = toUserPayload(createForm);
			if (!payload.email || !payload.password || !payload.firstName || !payload.lastName) {
				throw new Error('Email, contraseña, nombre y apellido son obligatorios.');
			}
			if (payload.password.length < 8) {
				throw new Error('La contraseña debe tener al menos 8 caracteres.');
			}
			if (!payload.role) {
				throw new Error('Debes seleccionar un rol.');
			}
			if (payload.role === 'student' && !createForm.careerId) {
				throw new Error('Para usuarios estudiante, la carrera es obligatoria.');
			}
			if (createForm.password !== createForm.confirmPassword) {
				throw new Error('Las contraseñas no coinciden.');
			}

			const res = await adminUsersApi.createUser(payload);
			if (!res?.ok) throw new Error(res?.message || 'No se pudo crear el usuario.');

			createOpen = false;
			await loadUsers();
		} catch (e) {
			formError = e?.message || 'No se pudo crear el usuario.';
		} finally {
			submitting = false;
		}
	}

	async function submitEditUser() {
		if (!selectedUser) return;
		formError = '';
		submitting = true;

		try {
			if (editForm.role === 'student' && !editForm.careerId) {
				throw new Error('Para usuarios estudiante, la carrera es obligatoria.');
			}

			const payload = getEditPayload();
			if (Object.keys(payload).length === 0) {
				editOpen = false;
				return;
			}

			const res = await adminUsersApi.updateUser(selectedUser.id, payload);
			if (!res?.ok) throw new Error(res?.message || 'No se pudo editar el usuario.');

			editOpen = false;
			await loadUsers();
		} catch (e) {
			formError = e?.message || 'No se pudo editar el usuario.';
		} finally {
			submitting = false;
		}
	}

	async function submitUserPassword() {
		if (!passwordUser) return;
		passwordError = '';
		passwordSubmitting = true;

		try {
			const nextPassword = passwordForm.newPassword.trim();
			if (!nextPassword || nextPassword.length < 8) {
				throw new Error('La nueva contraseña debe tener al menos 8 caracteres.');
			}
			if (passwordForm.newPassword !== passwordForm.confirmPassword) {
				throw new Error('Las contraseñas no coinciden.');
			}

			const res = await adminUsersApi.updateUserPassword(passwordUser.id, {
				newPassword: nextPassword
			});

			if (!res?.ok) throw new Error(res?.message || 'No se pudo actualizar la contraseña.');

			passwordOpen = false;
			passwordForm = { newPassword: '', confirmPassword: '' };
		} catch (e) {
			passwordError = e?.message || 'No se pudo actualizar la contraseña.';
		} finally {
			passwordSubmitting = false;
		}
	}

	function onSearchSubmit() {
		page = 1;
		loadUsers();
	}

	function scheduleFiltersLoad() {
		clearTimeout(filtersTimeout);
		filtersTimeout = setTimeout(() => {
			page = 1;
			loadUsers();
		}, 300);
	}

	function prevPage() {
		if (page <= 1) return;
		page -= 1;
		loadUsers();
	}

	function nextPage() {
		if (page >= totalPages) return;
		page += 1;
		loadUsers();
	}

	onMount(() => {
		loadUsers();
		loadCareers();
		filtersReady = true;
	});

	onDestroy(() => {
		clearTimeout(filtersTimeout);
	});

	$: if (filtersReady) {
		q;
		roleFilter;
		statusFilter;
		scheduleFiltersLoad();
	}
</script>

<div class="min-h-screen bg-background">
	<!-- Top bar -->
	<div class="sticky top-0 z-20 border-b bg-background/80 backdrop-blur">
		<div class="mx-auto w-full max-w-screen-lg px-4 py-4 sm:px-6 lg:px-8">
			<div class="flex items-start justify-between gap-3">
				<div>
					<h1 class="text-base font-semibold tracking-tight">Usuarios</h1>
					<p class="text-sm text-muted-foreground">Formación Complementaria</p>
				</div>

				<!-- Botón de alta de usuario -->
				<Button
					class="h-11 rounded-2xl bg-blue-600 px-4 text-white shadow-sm hover:bg-blue-700"
					onclick={openCreateUser}
					aria-label="Crear usuario"
				>
					<Plus class="mr-2 h-4 w-4" />
					Nuevo usuario
				</Button>
			</div>

			<div class="mt-4 space-y-3">
				<div class="grid gap-3 sm:grid-cols-[1fr_auto_auto_auto]">
					<div class="relative">
						<Search class="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
						<Input
							class="h-11 rounded-2xl bg-background pl-9 shadow-sm"
							placeholder="Buscar por nombre, email, matrícula..."
							bind:value={q}
							autocomplete="off"
						/>
					</div>

					<select class="h-11 rounded-2xl border px-3 text-sm" bind:value={roleFilter}>
						<option value="all">Todos los roles</option>
						{#each roleOptions as role}
							<option value={role}>{formatRole(role)}</option>
						{/each}
					</select>

					<select class="h-11 rounded-2xl border px-3 text-sm" bind:value={statusFilter}>
						<option value="all">Todos los estatus</option>
						{#each statusOptions as status}
							<option value={status}>{formatStatus(status)}</option>
						{/each}
					</select>

					<Button
						type="button"
						class="h-11 rounded-2xl bg-blue-600 text-white hover:bg-blue-700"
						onclick={onSearchSubmit}
					>
						Buscar
					</Button>
				</div>
			</div>
		</div>
	</div>

	<!-- Content -->
	<main class="mx-auto w-full max-w-screen-lg px-4 pb-10 pt-6 sm:px-6 lg:px-8">
		<div class="space-y-6">
			<!-- KPI -->
			<div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
				<Card class={`rounded-3xl border bg-card text-card-foreground ${cardShadow}`}>
					<CardHeader class="pb-2">
						<CardTitle class="text-sm font-medium text-muted-foreground">Total Usuarios</CardTitle>
					</CardHeader>
					<CardContent>
						<div class="text-3xl font-semibold tracking-tight">{total}</div>
						<p class="mt-1 text-xs text-muted-foreground">
							Mostrando {users.length} {users.length === 1 ? 'resultado' : 'resultados'} en página {page}.
						</p>
					</CardContent>
				</Card>

				<Card class={`hidden rounded-3xl border bg-card text-card-foreground sm:block ${cardShadow}`}>
					<CardContent class="flex h-full items-center justify-center">
						<p class="text-sm text-muted-foreground">Espacio para KPI futuro</p>
					</CardContent>
				</Card>
			</div>

			<div class="flex items-center justify-between">
				<p class="text-xs font-semibold tracking-wider text-muted-foreground">RESULTADOS RECIENTES</p>
				<div class="flex items-center gap-2">
					<Button variant="outline" class="rounded-xl" disabled={page <= 1 || loading} onclick={prevPage}>
						Anterior
					</Button>
					<Button
						variant="outline"
						class="rounded-xl"
						disabled={page >= totalPages || loading}
						onclick={nextPage}
					>
						Siguiente
					</Button>
				</div>
			</div>

			{#if error}
				<div class="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
			{/if}

			<!-- Desktop table -->
			<Card class={`hidden rounded-3xl border bg-card text-card-foreground sm:block ${cardShadow}`}>
				<CardContent class="p-0">
					<Table>
						<TableHeader>
							<TableRow class="bg-slate-50 hover:bg-slate-50">
								<TableHead class="pl-6">Usuario</TableHead>
								<TableHead>ID</TableHead>
								<TableHead>Email</TableHead>
								<TableHead>Estatus</TableHead>
								<TableHead>Rol</TableHead>
								<TableHead class="pr-4 text-right">Acciones</TableHead>
							</TableRow>
						</TableHeader>

						<TableBody>
							{#if loading}
								<TableRow>
									<TableCell colspan="6" class="py-12 text-center text-sm text-muted-foreground">
										<Loader2 class="mx-auto h-4 w-4 animate-spin" />
									</TableCell>
								</TableRow>
							{:else if users.length === 0}
								<TableRow>
									<TableCell colspan="6" class="py-12 text-center text-sm text-muted-foreground">
										No se encontraron usuarios.
									</TableCell>
								</TableRow>
							{:else}
								{#each users as u (u.id)}
									<TableRow class="cursor-pointer hover:bg-slate-100/40" onclick={() => openEditUser(u)}>
										<TableCell class="pl-6">
											<div class="flex items-center gap-3">
												<Avatar class="h-9 w-9">
													<AvatarImage src="" alt={fullName(u)} />
													<AvatarFallback>{initials(fullName(u))}</AvatarFallback>
												</Avatar>

												<div class="min-w-0">
													<div class="truncate font-medium">{fullName(u)}</div>
													<div class="truncate text-xs text-muted-foreground">{u.email}</div>
												</div>
											</div>
										</TableCell>

										<TableCell class="font-mono text-xs text-muted-foreground">{u.id}</TableCell>
										<TableCell class="truncate">{u.email}</TableCell>
										<TableCell>
											<Badge class={statusBadgeClass(u.status)}>{formatStatus(u.status)}</Badge>
										</TableCell>

										<TableCell>
											<Badge class={badgeClass(u.role)}>{formatRole(u.role || 'visitor')}</Badge>
										</TableCell>

										<TableCell class="pr-4 text-right">
											<Button
												variant="ghost"
												size="icon"
												class="rounded-full"
												onclick|stopPropagation={() => openPasswordUser(u)}
												aria-label="Cambiar contraseña"
											>
												<KeyRound class="h-4 w-4 text-amber-600" />
											</Button>
											<Button
												variant="ghost"
												size="icon"
												class="rounded-full"
												onclick|stopPropagation={() => openEditUser(u)}
												aria-label="Editar"
											>
												<Pencil class="h-4 w-4 text-blue-600" />
											</Button>
										</TableCell>
									</TableRow>
								{/each}
							{/if}
						</TableBody>
					</Table>
				</CardContent>
			</Card>

			<!-- Mobile cards -->
			<div class="space-y-3 sm:hidden">
				{#if loading}
					<Card class={`rounded-3xl border bg-card text-card-foreground ${cardShadow}`}>
						<CardContent class="py-12 text-center text-sm text-muted-foreground">
							<Loader2 class="mx-auto h-4 w-4 animate-spin" />
						</CardContent>
					</Card>
				{:else if users.length === 0}
					<Card class={`rounded-3xl border bg-card text-card-foreground ${cardShadow}`}>
						<CardContent class="py-12 text-center text-sm text-muted-foreground">
							No se encontraron usuarios.
						</CardContent>
					</Card>
				{:else}
					{#each users as u (u.id)}
						<Card class={`rounded-3xl border bg-card text-card-foreground ${cardShadow}`} onclick={() => openEditUser(u)}>
							<CardContent class="p-5">
								<div class="flex items-start justify-between gap-3">
									<div class="flex items-center gap-3">
										<Avatar class="h-12 w-12">
											<AvatarImage src="" alt={fullName(u)} />
											<AvatarFallback>{initials(fullName(u))}</AvatarFallback>
										</Avatar>

										<div class="min-w-0">
											<div class="truncate text-base font-semibold tracking-tight">{fullName(u)}</div>
											<div class="text-xs text-muted-foreground">ID: {u.id}</div>
											<div class="mt-1">
												<Badge class={statusBadgeClass(u.status)}>{formatStatus(u.status)}</Badge>
											</div>
											<div class="truncate text-xs text-muted-foreground">{u.email}</div>
										</div>
									</div>

									<Badge class={badgeClass(u.role)}>{formatRole(u.role || 'visitor')}</Badge>
								</div>

								<Separator class="my-4" />

								<div class="flex items-center justify-end">
									<Button
										variant="ghost"
										size="icon"
										class="rounded-full"
										onclick|stopPropagation={() => openPasswordUser(u)}
										aria-label="Cambiar contraseña"
									>
										<KeyRound class="h-4 w-4 text-amber-600" />
									</Button>
									<Button
										variant="ghost"
										size="icon"
										class="rounded-full"
										onclick|stopPropagation={() => openEditUser(u)}
										aria-label="Editar"
									>
										<Pencil class="h-4 w-4 text-blue-600" />
									</Button>
								</div>
							</CardContent>
						</Card>
					{/each}
				{/if}
			</div>
		</div>
	</main>
</div>

<Dialog.Root bind:open={createOpen}>
	<Dialog.Content class="sm:max-w-2xl">
		<Dialog.Header>
			<Dialog.Title>Crear usuario</Dialog.Title>
			<Dialog.Description>Alta de usuario desde panel admin.</Dialog.Description>
		</Dialog.Header>

		<div class="grid gap-4 py-2 sm:grid-cols-2">
			<div class="space-y-2 sm:col-span-2">
				<Label>Email *</Label>
				<Input bind:value={createForm.email} type="email" placeholder="usuario@correo.com" />
			</div>

			<div class="space-y-2 sm:col-span-2">
				<Label>Contraseña *</Label>
				<div class="relative">
					<Input
						bind:value={createForm.password}
						type={showCreatePassword ? 'text' : 'password'}
						placeholder="Mínimo 8 caracteres"
						class="pr-11"
					/>
					<button
						type="button"
						class="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-slate-500 hover:bg-slate-100"
						onclick={() => (showCreatePassword = !showCreatePassword)}
						aria-label="Mostrar/ocultar contraseña"
					>
						{#if showCreatePassword}
							<EyeOff class="h-4 w-4" />
						{:else}
							<Eye class="h-4 w-4" />
						{/if}
					</button>
				</div>
			</div>

			<div class="space-y-2 sm:col-span-2">
				<Label>Confirmar contraseña *</Label>
				<div class="relative">
					<Input
						bind:value={createForm.confirmPassword}
						type={showCreateConfirmPassword ? 'text' : 'password'}
						placeholder="Confirme la contraseña"
						class="pr-11"
					/>
					<button
						type="button"
						class="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-slate-500 hover:bg-slate-100"
						onclick={() => (showCreateConfirmPassword = !showCreateConfirmPassword)}
						aria-label="Mostrar/ocultar confirmación de contraseña"
					>
						{#if showCreateConfirmPassword}
							<EyeOff class="h-4 w-4" />
						{:else}
							<Eye class="h-4 w-4" />
						{/if}
					</button>
				</div>
			</div>

			<div class="space-y-2">
				<Label>Nombre *</Label>
				<Input bind:value={createForm.firstName} />
			</div>

			<div class="space-y-2">
				<Label>Apellido *</Label>
				<Input bind:value={createForm.lastName} />
			</div>

			<div class="space-y-2">
				<Label>Matrícula</Label>
				<Input
					bind:value={createForm.studentId}
					maxlength="10"
					on:input={(event) => (createForm.studentId = normalizeStudentId(event.currentTarget.value))}
				/>
			</div>

			<div class="space-y-2 sm:col-span-2">
				<Label>Carrera</Label>
				<select class="h-10 w-full rounded-md border px-3" bind:value={createForm.careerId}>
					<option value="">Sin carrera</option>
					{#each careers as career (career.id)}
						<option value={career.id}>{career.name} — {career.faculty}</option>
					{/each}
				</select>
			</div>

			<div class="space-y-2">
				<Label>Estatus</Label>
				<select class="h-10 w-full rounded-md border px-3" bind:value={createForm.status}>
					{#each statusOptions as status}
						<option value={status}>{formatStatus(status)}</option>
					{/each}
				</select>
			</div>

			<div class="space-y-2">
				<Label>Rol</Label>
				<select class="h-10 w-full rounded-md border px-3" bind:value={createForm.role}>
					{#each roleOptions as role}
						<option value={role}>{formatRole(role)}</option>
					{/each}
				</select>
			</div>
		</div>

		{#if formError}
			<div class="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{formError}</div>
		{/if}

		<Dialog.Footer>
			<Button variant="outline" onclick={() => (createOpen = false)} disabled={submitting}>Cancelar</Button>
			<Button class="bg-blue-600 text-white hover:bg-blue-700" onclick={submitCreateUser} disabled={submitting}>
				{submitting ? 'Guardando...' : 'Crear usuario'}
			</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>

<Dialog.Root bind:open={editOpen}>
	<Dialog.Content class="sm:max-w-2xl">
		<Dialog.Header>
			<Dialog.Title>Editar usuario</Dialog.Title>
			<Dialog.Description>Actualiza datos o rol del usuario seleccionado.</Dialog.Description>
		</Dialog.Header>

		<div class="grid gap-4 py-2 sm:grid-cols-2">
			<div class="space-y-2 sm:col-span-2">
				<Label>Email</Label>
				<Input bind:value={editForm.email} type="email" />
			</div>

			<div class="space-y-2">
				<Label>Nombre</Label>
				<Input bind:value={editForm.firstName} />
			</div>

			<div class="space-y-2">
				<Label>Apellido</Label>
				<Input bind:value={editForm.lastName} />
			</div>

			<div class="space-y-2">
				<Label>Matrícula</Label>
				<Input
					bind:value={editForm.studentId}
					maxlength="10"
					on:input={(event) => (editForm.studentId = normalizeStudentId(event.currentTarget.value))}
				/>
			</div>

			<div class="space-y-2 sm:col-span-2">
				<Label>Carrera</Label>
				<select class="h-10 w-full rounded-md border px-3" bind:value={editForm.careerId}>
					<option value="">Sin carrera</option>
					{#each careers as career (career.id)}
						<option value={career.id}>{career.name} — {career.faculty}</option>
					{/each}
				</select>
			</div>

			<div class="space-y-2">
				<Label>Estatus</Label>
				<select class="h-10 w-full rounded-md border px-3" bind:value={editForm.status}>
					{#each statusOptions as status}
						<option value={status}>{formatStatus(status)}</option>
					{/each}
				</select>
			</div>

			<div class="space-y-2">
				<Label>Rol</Label>
				<select class="h-10 w-full rounded-md border px-3" bind:value={editForm.role}>
					{#each editRoleOptions as role}
						<option value={role}>{formatRole(role)}</option>
					{/each}
				</select>
			</div>
		</div>

		{#if formError}
			<div class="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{formError}</div>
		{/if}

		<Dialog.Footer>
			<Button variant="outline" onclick={() => (editOpen = false)} disabled={submitting}>Cancelar</Button>
			<Button class="bg-blue-600 text-white hover:bg-blue-700" onclick={submitEditUser} disabled={submitting}>
				{submitting ? 'Guardando...' : 'Guardar cambios'}
			</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>

<Dialog.Root bind:open={passwordOpen}>
	<Dialog.Content class="sm:max-w-md">
		<Dialog.Header>
			<Dialog.Title>Cambiar contraseña</Dialog.Title>
			<Dialog.Description>
				Actualiza la contraseña de {passwordUser ? fullName(passwordUser) : 'usuario'}.
			</Dialog.Description>
		</Dialog.Header>

		<div class="space-y-2 py-2">
			<Label>Nueva contraseña</Label>
			<div class="relative">
				<Input
					bind:value={passwordForm.newPassword}
					type={showUpdatePassword ? 'text' : 'password'}
					placeholder="Mínimo 8 caracteres"
					class="pr-11"
				/>
				<button
					type="button"
					class="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-slate-500 hover:bg-slate-100"
					onclick={() => (showUpdatePassword = !showUpdatePassword)}
					aria-label="Mostrar/ocultar nueva contraseña"
				>
					{#if showUpdatePassword}
						<EyeOff class="h-4 w-4" />
					{:else}
						<Eye class="h-4 w-4" />
					{/if}
				</button>
			</div>
		</div>

		<div class="space-y-2 py-2">
			<Label>Confirmar nueva contraseña</Label>
			<div class="relative">
				<Input
					bind:value={passwordForm.confirmPassword}
					type={showUpdateConfirmPassword ? 'text' : 'password'}
					placeholder="Confirme la nueva contraseña"
					class="pr-11"
				/>
				<button
					type="button"
					class="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-slate-500 hover:bg-slate-100"
					onclick={() => (showUpdateConfirmPassword = !showUpdateConfirmPassword)}
					aria-label="Mostrar/ocultar confirmación"
				>
					{#if showUpdateConfirmPassword}
						<EyeOff class="h-4 w-4" />
					{:else}
						<Eye class="h-4 w-4" />
					{/if}
				</button>
			</div>
		</div>

		{#if passwordError}
			<div class="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
				{passwordError}
			</div>
		{/if}

		<Dialog.Footer>
			<Button variant="outline" onclick={() => (passwordOpen = false)} disabled={passwordSubmitting}>
				Cancelar
			</Button>
			<Button
				class="bg-amber-600 text-white hover:bg-amber-700"
				onclick={submitUserPassword}
				disabled={passwordSubmitting}
			>
				{passwordSubmitting ? 'Guardando...' : 'Actualizar contraseña'}
			</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>
