<script>
	import { onMount, onDestroy } from 'svelte';
	import { toast } from 'svelte-sonner';
	import { adminUsersApi, careersApi } from '$lib/services/api';
	import {
		STUDENT_CSV_MAX_ROWS,
		STUDENT_CSV_TEMPLATE,
		STUDENT_CSV_TEMPLATE_FILENAME,
		normalizeStudentCsvErrors,
		validateStudentCsvFile,
		validateStudentCsvText
	} from '$lib/services/studentCsvImport';
	import {
		buildAdminUserCreatePayload,
		buildAdminUserEditPayload,
		getAdminCareerScope,
		normalizeAdminStudentId,
		positiveCareerId
	} from '$lib/services/adminUserCareerScope';
	import { USER_STATUS_CATALOG } from '../../routes/store';

	import { Card, CardContent } from '$lib/components/ui/card';
	import { Button } from '$lib/components/ui/button';
	import { Badge } from '$lib/components/ui/badge';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { Separator } from '$lib/components/ui/separator';
	import * as Dialog from '$lib/components/ui/dialog';

	import {
		Search,
		Plus,
		Pencil,
		Loader2,
		KeyRound,
		Eye,
		EyeOff,
		Upload,
		Download,
		AlertTriangle,
		CheckCircle2
	} from 'lucide-svelte';

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

	export let currentUser = null;

	let users = [];
	let careers = [];
	let loading = false;
	let submitting = false;
	let error = '';
	let formError = '';

	let q = '';
	let roleFilter = 'all';
	let statusFilter = 'all';
	let careerFilter = 'all';
	let filtersReady = false;
	let filtersTimeout;
	let filtersKey = '';
	let loadedFiltersKey = '';

	let page = 1;
	let pageSize = 50;
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

	let importUploadOpen = false;
	let importConfirmationOpen = false;
	let importErrorOpen = false;
	let importResultOpen = false;
	let importPreviewLoading = false;
	let importCommitLoading = false;
	let importFile = null;
	let importFileInput;
	let importTargetCareerId = '';
	let importFormError = '';
	let importId = '';
	let importSummary = null;
	let importDestinationName = '';
	let importErrors = [];
	let importErrorTitle = 'No se pudo validar el archivo';
	let importErrorDescription = '';
	let importResult = null;
	let previewRequestId = 0;
	let commitRequestId = 0;
	let currentCareerId = null;
	let isGlobalAdmin = false;
	let isScopedAdmin = false;
	let hasCareerAdminAccess = false;
	let academicCareers = [];
	let scopedCareerName = '';
	let currentAdminCareerName = '';
	let accessDisabledMessage = '';
	let importDisabledMessage = '';
	let canImportStudents = false;
	let adminCareerScope = null;

	const roleOptions = ['admin', 'staff', 'student', 'auditor'];
	const statusOptions = Object.keys(USER_STATUS_CATALOG);
	const pageSizeOptions = [10, 25, 50, 100];
	const defaultPageSize = 50;
	const pageSizeStorageKey = 'afc.admin.users.pageSize';

	function normalizePageSize(value) {
		const parsed = Number(value);
		return pageSizeOptions.includes(parsed) ? parsed : defaultPageSize;
	}

	function careerNameById(careerId, availableCareers = careers, user = currentUser) {
		const career = availableCareers.find((item) => Number(item.id) === Number(careerId));
		return (
			career?.name ||
			(Number(careerId) === currentCareerId
				? user?.career_name || user?.career?.name
				: '') ||
			`Carrera ${careerId}`
		);
	}

	$: adminCareerScope = getAdminCareerScope(currentUser);
	$: currentCareerId = adminCareerScope.careerId;
	$: isGlobalAdmin = adminCareerScope.isGlobalAdmin;
	$: isScopedAdmin = adminCareerScope.isScopedAdmin;
	$: hasCareerAdminAccess = adminCareerScope.hasCareerAdminAccess;
	$: academicCareers = careers.filter((career) => Number(career.id) > 1);
	$: scopedCareerName =
		currentCareerId && currentCareerId > 1
			? careerNameById(currentCareerId, careers, currentUser)
			: '';
	$: currentAdminCareerName = currentCareerId
		? careerNameById(currentCareerId, careers, currentUser)
		: 'Sin carrera válida';
	$: accessDisabledMessage =
		String(currentUser?.role || '').toLowerCase() !== 'admin'
			? 'Solo los administradores pueden administrar usuarios.'
			: currentCareerId === null
				? 'Tu sesión no incluye una carrera válida. Vuelve a iniciar sesión para administrar usuarios.'
				: '';
	$: importDisabledMessage = accessDisabledMessage;
	$: canImportStudents = !importDisabledMessage;
	$: if (isScopedAdmin && currentCareerId !== null && careerFilter !== String(currentCareerId)) {
		careerFilter = String(currentCareerId);
	}
	$: if (!hasCareerAdminAccess && careerFilter !== 'all') {
		careerFilter = 'all';
	}

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

	function userCareerName(user) {
		const name = String(user?.career_name || user?.career?.name || '').trim();
		if (name) return name;
		const careerId = positiveCareerId(user?.career_id ?? user?.career?.id);
		return careerId === null ? 'Sin carrera' : careerNameById(careerId);
	}

	function userCareerFaculty(user) {
		return String(user?.career_faculty || user?.career?.faculty || '').trim();
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
			careerId: isScopedAdmin ? String(currentCareerId) : '',
			status: 'active',
			role: 'student'
		};
	}

	function openCreateUser() {
		if (!hasCareerAdminAccess) return;
		formError = '';
		resetCreateForm();
		showCreatePassword = false;
		showCreateConfirmPassword = false;
		createOpen = true;
	}

	function openEditUser(user) {
		if (!hasCareerAdminAccess) return;
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
		return normalizeAdminStudentId(value);
	}

	function openPasswordUser(user) {
		if (!hasCareerAdminAccess) return;
		passwordUser = user;
		passwordError = '';
		passwordForm = { newPassword: '', confirmPassword: '' };
		showUpdatePassword = false;
		showUpdateConfirmPassword = false;
		passwordOpen = true;
	}

	function clearImportFile() {
		importFile = null;
		if (importFileInput) importFileInput.value = '';
	}

	function clearImportPreview() {
		importId = '';
		importSummary = null;
		importDestinationName = '';
	}

	function resetImportFlow({ keepTargetCareer = false } = {}) {
		previewRequestId += 1;
		commitRequestId += 1;
		importPreviewLoading = false;
		importCommitLoading = false;
		importFormError = '';
		clearImportFile();
		clearImportPreview();
		if (!keepTargetCareer) {
			importTargetCareerId = isGlobalAdmin ? '' : String(currentCareerId || '');
		}
	}

	function openStudentImport() {
		if (!canImportStudents || importPreviewLoading || importCommitLoading) return;
		resetImportFlow();
		importTargetCareerId = isGlobalAdmin ? '' : String(currentCareerId);
		importUploadOpen = true;
	}

	function handleImportUploadOpenChange(open) {
		if (!open && !importConfirmationOpen) resetImportFlow({ keepTargetCareer: true });
	}

	function handleImportConfirmationOpenChange(open) {
		if (!open && !importCommitLoading && !importResultOpen) {
			resetImportFlow({ keepTargetCareer: true });
		}
	}

	function handleImportErrorOpenChange(open) {
		if (!open) {
			importErrors = [];
			importErrorDescription = '';
		}
	}

	function handleImportResultOpenChange(open) {
		if (!open) importResult = null;
	}

	function handleImportFile(event) {
		importFile = event?.currentTarget?.files?.[0] || null;
		importFormError = '';
		clearImportPreview();
	}

	function downloadStudentCsvTemplate() {
		if (typeof document === 'undefined') return;
		const blob = new Blob([STUDENT_CSV_TEMPLATE], { type: 'text/csv;charset=utf-8' });
		const url = URL.createObjectURL(blob);
		const link = document.createElement('a');
		link.href = url;
		link.download = STUDENT_CSV_TEMPLATE_FILENAME;
		document.body.appendChild(link);
		link.click();
		link.remove();
		URL.revokeObjectURL(url);
	}

	function showImportError(error, { title, description } = {}) {
		importErrors = normalizeStudentCsvErrors(error);
		importErrorTitle = title || 'No se pudo validar el archivo';
		importErrorDescription =
			description ||
			error?.data?.message ||
			'Corrige el archivo y vuelve a validarlo. No se creó ningún estudiante.';
		importErrorOpen = true;
	}

	function retryStudentImport() {
		importErrorOpen = false;
		importTargetCareerId = isGlobalAdmin ? '' : String(currentCareerId || '');
		openStudentImport();
	}

	async function previewStudentImport() {
		importFormError = '';
		const fileError = validateStudentCsvFile(importFile);
		if (fileError) {
			importFormError = fileError;
			return;
		}
		if (isGlobalAdmin && (positiveCareerId(importTargetCareerId) === null || Number(importTargetCareerId) <= 1)) {
			importFormError = 'Selecciona la carrera destino.';
			return;
		}

		const requestId = ++previewRequestId;
		importPreviewLoading = true;
		try {
			const csvText = await importFile.text();
			if (requestId !== previewRequestId || !importUploadOpen) return;
			const textError = validateStudentCsvText(csvText);
			if (textError) {
				importFormError = textError;
				return;
			}

			const targetCareerId = isGlobalAdmin ? Number(importTargetCareerId) : undefined;
			const response = await adminUsersApi.previewStudentCsv(csvText, targetCareerId);
			if (requestId !== previewRequestId || !importUploadOpen) return;
			if (Array.isArray(response?.errors) && response.errors.length > 0) {
				const validationError = new Error(response?.message || 'El archivo CSV contiene errores.');
				validationError.data = { ...response, errors: response.errors };
				throw validationError;
			}
			if (!response?.ok || !response?.import_id || !response?.summary) {
				throw new Error(response?.message || 'La respuesta de validación no es válida.');
			}

			importId = response.import_id;
			importSummary = {
				rows: Number(response.summary.rows || 0),
				toCreate: Number(response.summary.to_create || 0),
				toSkip: Number(response.summary.to_skip || 0),
				careerId: Number(response.summary.career_id)
			};
			importDestinationName = careerNameById(importSummary.careerId);
			clearImportFile();
			importConfirmationOpen = true;
			importUploadOpen = false;
		} catch (error) {
			if (requestId !== previewRequestId) return;
			clearImportFile();
			clearImportPreview();
			importUploadOpen = false;
			showImportError(error);
		} finally {
			if (requestId === previewRequestId) importPreviewLoading = false;
		}
	}

	async function commitStudentImport() {
		if (!importId || importCommitLoading) return;
		const requestId = ++commitRequestId;
		importCommitLoading = true;
		try {
			const response = await adminUsersApi.commitStudentCsv(importId);
			if (requestId !== commitRequestId) return;
			if (!response?.ok) throw new Error(response?.message || 'No se pudo completar la importación.');

			importResult = {
				created: Number(response.created || 0),
				skipped: Number(response.skipped || 0),
				careerId: Number(response.career_id),
				destinationName: careerNameById(response.career_id)
			};
			clearImportFile();
			clearImportPreview();
			importResultOpen = true;
			importConfirmationOpen = false;
			toast.success('Importación de estudiantes completada.');
			await loadUsers();
		} catch (error) {
			if (requestId !== commitRequestId) return;
			const mustRevalidate = Number(error?.status) === 410 || Number(error?.status) === 409;
			importConfirmationOpen = false;
			resetImportFlow({ keepTargetCareer: true });
			showImportError(error, {
				title: mustRevalidate ? 'La vista previa ya no es válida' : 'No se pudo importar el archivo',
				description: mustRevalidate
					? 'Los datos cambiaron o la vista previa expiró. Selecciona y valida nuevamente el archivo.'
					: 'No se creó ningún estudiante. Selecciona y valida nuevamente el archivo antes de reintentar.'
			});
		} finally {
			if (requestId === commitRequestId) importCommitLoading = false;
		}
	}

	function toUserPayload(form) {
		return buildAdminUserCreatePayload(
			{ ...form, role: normalizeRoleInput(form.role) },
			{ isGlobalAdmin, currentCareerId }
		);
	}

	function getEditPayload() {
		return buildAdminUserEditPayload({
			form: editForm,
			selectedUser,
			isGlobalAdmin
		});
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
				role: roleFilter === 'all' ? undefined : roleFilter,
				career_id: careerFilter === 'all' ? undefined : careerFilter
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
		if (!hasCareerAdminAccess) return;
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
			if (payload.role === 'student' && !payload.career_id) {
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
		if (!selectedUser || !hasCareerAdminAccess) return;
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
			toast.success(res?.message || 'Usuario actualizado correctamente.');
			await loadUsers();
		} catch (e) {
			formError = e?.message || 'No se pudo editar el usuario.';
		} finally {
			submitting = false;
		}
	}

	async function submitUserPassword() {
		if (!passwordUser || !hasCareerAdminAccess) return;
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
			toast.success(res?.message || 'Contraseña actualizada correctamente.');
		} catch (e) {
			passwordError = e?.message || 'No se pudo actualizar la contraseña.';
		} finally {
			passwordSubmitting = false;
		}
	}

	function handlePageSizeChange(event) {
		const nextPageSize = normalizePageSize(event.currentTarget?.value);
		pageSize = nextPageSize;
		page = 1;
		clearTimeout(filtersTimeout);

		try {
			window.localStorage.setItem(pageSizeStorageKey, String(nextPageSize));
		} catch {
			// La preferencia no es crítica si el almacenamiento del navegador no está disponible.
		}

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
		try {
			pageSize = normalizePageSize(window.localStorage.getItem(pageSizeStorageKey));
		} catch {
			pageSize = defaultPageSize;
		}

		loadedFiltersKey = filtersKey;
		loadUsers();
		loadCareers();
		filtersReady = true;
	});

	onDestroy(() => {
		clearTimeout(filtersTimeout);
	});

	$: filtersKey = `${q}\u0000${roleFilter}\u0000${statusFilter}\u0000${careerFilter}`;

	$: if (filtersReady && filtersKey !== loadedFiltersKey) {
		loadedFiltersKey = filtersKey;
		scheduleFiltersLoad();
	}
</script>

<div class="min-h-screen bg-light-blue-background">
	<!-- Top bar -->
	<div class="sticky top-0 z-30 border-b bg-background/95 shadow-sm backdrop-blur supports-[backdrop-filter]:bg-background/85">
		<div class="mx-auto w-full max-w-screen-lg px-4 py-4 sm:px-6 lg:px-8">
			<div class="flex flex-wrap items-start justify-between gap-3">
				<div>
					<h1 class="text-base font-semibold tracking-tight">Usuarios</h1>
					<p class="text-sm text-muted-foreground">Formación Complementaria</p>
					<p class="mt-1 text-xs font-medium text-slate-600">
						{isGlobalAdmin ? 'Administración global' : 'Carrera administrada'}: {currentAdminCareerName}
					</p>
				</div>

				<div class="flex flex-wrap justify-end gap-2">
					<Button
						variant="outline"
						class="h-11 rounded-2xl px-4 shadow-sm"
						onclick={downloadStudentCsvTemplate}
					>
						<Download class="h-4 w-4" />
						Descargar plantilla
					</Button>
					<span title={importDisabledMessage || 'Importar estudiantes desde un archivo CSV'}>
						<Button
							variant="outline"
							class="h-11 rounded-2xl px-4 shadow-sm"
							onclick={openStudentImport}
							disabled={!canImportStudents || importPreviewLoading || importCommitLoading}
							aria-describedby={importDisabledMessage ? 'student-import-disabled-message' : undefined}
						>
							<Upload class="h-4 w-4" />
							Importar estudiantes
						</Button>
					</span>
					<Button
						class="h-11 rounded-2xl bg-blue-600 px-4 text-white shadow-sm hover:bg-blue-700"
						onclick={openCreateUser}
						disabled={!hasCareerAdminAccess}
						aria-label="Crear usuario"
					>
						<Plus class="h-4 w-4" />
						Nuevo usuario
					</Button>
				</div>
			</div>

			{#if importDisabledMessage}
				<p
					id="student-import-disabled-message"
					class="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800"
					role="alert"
				>
					{importDisabledMessage}
				</p>
			{/if}

			<div class="mt-4 space-y-3">
				<div
					class="grid grid-cols-1 gap-2 sm:grid-cols-2 sm:gap-3 lg:grid-cols-[minmax(12rem,1fr)_minmax(8rem,auto)_minmax(9rem,auto)_minmax(9rem,auto)_minmax(8.5rem,auto)]"
				>
					<div class="relative sm:col-span-2 lg:col-span-1">
						<Search class="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
						<Input
							class="h-11 rounded-2xl bg-background pl-9 shadow-sm"
							placeholder="Buscar por nombre, email, matrícula o carrera..."
							bind:value={q}
							autocomplete="off"
						/>
					</div>

					<div>
						<Label for="admin-users-career-filter" class="sr-only">Filtrar por carrera</Label>
						<select
							id="admin-users-career-filter"
							class="h-11 w-full rounded-2xl border bg-background px-3 text-sm"
							bind:value={careerFilter}
							disabled={!hasCareerAdminAccess || isScopedAdmin}
						>
							{#if isGlobalAdmin}
								<option value="all">Todas las carreras</option>
								<option value="none">Sin carrera</option>
								{#each careers as career (career.id)}
									<option value={String(career.id)}>{career.name}</option>
								{/each}
							{:else if isScopedAdmin}
								<option value={String(currentCareerId)}>{scopedCareerName}</option>
							{:else}
								<option value="all">Carrera no disponible</option>
							{/if}
						</select>
					</div>

					<select class="h-11 w-full rounded-2xl border px-3 text-sm" bind:value={roleFilter}>
						<option value="all">Todos los roles</option>
						{#each roleOptions as role}
							<option value={role}>{formatRole(role)}</option>
						{/each}
					</select>

					<select class="h-11 w-full rounded-2xl border px-3 text-sm" bind:value={statusFilter}>
						<option value="all">Todos los estatus</option>
						{#each statusOptions as status}
							<option value={status}>{formatStatus(status)}</option>
						{/each}
					</select>

					<div class="sm:col-span-2 lg:col-span-1">
						<Label for="admin-users-page-size" class="sr-only">Registros por página</Label>
						<select
							id="admin-users-page-size"
							class="h-11 w-full rounded-2xl border bg-background px-3 text-sm"
							value={pageSize}
							onchange={handlePageSizeChange}
							aria-label="Registros por página"
						>
							{#each pageSizeOptions as option}
								<option value={option}>{option} por página</option>
							{/each}
						</select>
					</div>
				</div>
			</div>
		</div>
	</div>

	<!-- Content -->
	<main class="mx-auto w-full max-w-screen-lg px-4 pb-10 pt-6 sm:px-6 lg:px-8">
		<div class="space-y-6">
			<!-- KPI de usuarios temporalmente ocultos -->

			<div class="flex items-center justify-between">
				<p class="text-xs font-semibold tracking-wider text-muted-foreground">RESULTADOS RECIENTES</p>
				<div class="flex items-center gap-2">
					<Button variant="outline" class="rounded-xl" disabled={page <= 1 || loading} onclick={prevPage}>
						Anterior
					</Button>
					<span
						class="min-w-24 whitespace-nowrap text-center text-xs font-medium text-muted-foreground"
						aria-live="polite"
						aria-atomic="true"
					>
						Página {page} de {totalPages}
					</span>
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
								<TableHead>Carrera</TableHead>
								<TableHead>Estatus</TableHead>
								<TableHead>Rol</TableHead>
								<TableHead class="pr-4 text-right">Acciones</TableHead>
							</TableRow>
						</TableHeader>

						<TableBody>
							{#if loading}
								<TableRow>
									<TableCell colspan="7" class="py-12 text-center text-sm text-muted-foreground">
										<Loader2 class="mx-auto h-4 w-4 animate-spin" />
									</TableCell>
								</TableRow>
							{:else if users.length === 0}
								<TableRow>
									<TableCell colspan="7" class="py-12 text-center text-sm text-muted-foreground">
										No se encontraron usuarios.
									</TableCell>
								</TableRow>
							{:else}
								{#each users as u (u.id)}
									<TableRow
										class={hasCareerAdminAccess ? 'cursor-pointer hover:bg-slate-100/40' : ''}
										onclick={() => openEditUser(u)}
									>
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
											<div class="max-w-48 text-sm font-medium">{userCareerName(u)}</div>
											{#if userCareerFaculty(u)}
												<div class="max-w-48 truncate text-xs text-muted-foreground">
													{userCareerFaculty(u)}
												</div>
											{/if}
										</TableCell>
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
												disabled={!hasCareerAdminAccess}
												onclick={(event) => {
													event.stopPropagation();
													openPasswordUser(u);
												}}
												aria-label="Cambiar contraseña"
											>
												<KeyRound class="h-4 w-4 text-amber-600" />
											</Button>
											<Button
												variant="ghost"
												size="icon"
												class="rounded-full"
												disabled={!hasCareerAdminAccess}
												onclick={(event) => {
													event.stopPropagation();
													openEditUser(u);
												}}
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
											<div class="mt-1 text-xs text-muted-foreground">
												<span class="font-medium text-slate-600">Carrera:</span> {userCareerName(u)}
											</div>
											{#if userCareerFaculty(u)}
												<div class="truncate text-xs text-muted-foreground">{userCareerFaculty(u)}</div>
											{/if}
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
										disabled={!hasCareerAdminAccess}
										onclick={(event) => {
											event.stopPropagation();
											openPasswordUser(u);
										}}
										aria-label="Cambiar contraseña"
									>
										<KeyRound class="h-4 w-4 text-amber-600" />
									</Button>
									<Button
										variant="ghost"
										size="icon"
										class="rounded-full"
										disabled={!hasCareerAdminAccess}
										onclick={(event) => {
											event.stopPropagation();
											openEditUser(u);
										}}
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

<Dialog.Root bind:open={importUploadOpen} onOpenChange={handleImportUploadOpenChange}>
	<Dialog.Content
		class="max-h-[90dvh] overflow-y-auto sm:max-w-lg"
		showCloseButton={!importPreviewLoading}
		onEscapeKeydown={(event) => importPreviewLoading && event.preventDefault()}
		onInteractOutside={(event) => importPreviewLoading && event.preventDefault()}
	>
		<Dialog.Header>
			<Dialog.Title>Importar estudiantes</Dialog.Title>
			<Dialog.Description>
				Selecciona el CSV y valida todo el archivo antes de crear cuentas.
			</Dialog.Description>
		</Dialog.Header>

		<div class="space-y-5 py-1">
			{#if isGlobalAdmin}
				<div class="space-y-2">
					<Label for="student-import-career">Carrera destino *</Label>
					<select
						id="student-import-career"
						class="h-11 w-full rounded-md border bg-background px-3 text-sm"
						bind:value={importTargetCareerId}
						disabled={importPreviewLoading}
						required
					>
						<option value="">Selecciona una carrera académica</option>
						{#each academicCareers as career (career.id)}
							<option value={career.id}>{career.name} — {career.faculty}</option>
						{/each}
					</select>
					<p class="text-xs text-muted-foreground">La carrera institucional (ID 1) no es un destino válido.</p>
				</div>
			{:else}
				<div class="rounded-2xl border bg-slate-50 px-4 py-3">
					<p class="text-xs font-semibold uppercase tracking-wide text-slate-500">Carrera asignada</p>
					<p class="mt-1 text-sm font-medium text-slate-900">{scopedCareerName}</p>
					<p class="mt-1 text-xs text-slate-600">Todos los estudiantes se importarán en esta carrera.</p>
				</div>
			{/if}

			<div class="space-y-2">
				<Label for="student-import-file">Archivo CSV *</Label>
				<input
					bind:this={importFileInput}
					id="student-import-file"
					type="file"
					accept=".csv,text/csv"
					onchange={handleImportFile}
					disabled={importPreviewLoading}
					aria-describedby="student-import-file-help"
					class="block w-full rounded-xl border border-slate-200 bg-white text-sm text-slate-700 file:mr-4 file:border-0 file:bg-slate-100 file:px-4 file:py-3 file:font-medium file:text-slate-700 hover:file:bg-slate-200"
				/>
				<p id="student-import-file-help" class="text-xs text-muted-foreground">
					Máximo 2 MB y {STUDENT_CSV_MAX_ROWS} filas. El servidor comprobará el formato y todos los datos.
				</p>
				{#if importFile}
					<p class="rounded-lg bg-blue-50 px-3 py-2 text-sm text-blue-800" aria-live="polite">
						Archivo seleccionado: <span class="font-medium">{importFile.name}</span>
					</p>
				{/if}
			</div>

			{#if importFormError}
				<div role="alert" class="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
					{importFormError}
				</div>
			{/if}

			{#if importPreviewLoading}
				<div class="flex items-center gap-2 text-sm text-muted-foreground" role="status" aria-live="polite">
					<Loader2 class="h-4 w-4 animate-spin" />
					Validando el archivo de forma segura…
				</div>
			{/if}
		</div>

		<Dialog.Footer class="gap-2 sm:gap-0">
			<Button variant="outline" onclick={downloadStudentCsvTemplate} disabled={importPreviewLoading}>
				<Download class="h-4 w-4" />
				Plantilla
			</Button>
			<Button variant="outline" onclick={() => (importUploadOpen = false)} disabled={importPreviewLoading}>
				Cancelar
			</Button>
			<Button
				class="bg-blue-600 text-white hover:bg-blue-700"
				onclick={previewStudentImport}
				disabled={importPreviewLoading || !importFile || (isGlobalAdmin && !importTargetCareerId)}
				aria-busy={importPreviewLoading}
			>
				{#if importPreviewLoading}<Loader2 class="h-4 w-4 animate-spin" />{/if}
				{importPreviewLoading ? 'Validando…' : 'Validar archivo'}
			</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>

<Dialog.Root bind:open={importConfirmationOpen} onOpenChange={handleImportConfirmationOpenChange}>
	<Dialog.Content
		class="max-h-[90dvh] overflow-y-auto sm:max-w-lg"
		showCloseButton={!importCommitLoading}
		onEscapeKeydown={(event) => importCommitLoading && event.preventDefault()}
		onInteractOutside={(event) => importCommitLoading && event.preventDefault()}
	>
		<Dialog.Header>
			<Dialog.Title>Confirmar importación</Dialog.Title>
			<Dialog.Description>
				La validación terminó sin errores. Revisa el resumen antes de crear los estudiantes.
			</Dialog.Description>
		</Dialog.Header>

		{#if importSummary}
			<div class="space-y-4 py-1">
				<div class="grid grid-cols-3 gap-2 text-center">
					<div class="rounded-2xl border bg-slate-50 p-3">
						<div class="text-2xl font-semibold">{importSummary.rows}</div>
						<div class="text-xs text-muted-foreground">Filas</div>
					</div>
					<div class="rounded-2xl border border-emerald-200 bg-emerald-50 p-3">
						<div class="text-2xl font-semibold text-emerald-700">{importSummary.toCreate}</div>
						<div class="text-xs text-emerald-700">Por crear</div>
					</div>
					<div class="rounded-2xl border border-amber-200 bg-amber-50 p-3">
						<div class="text-2xl font-semibold text-amber-700">{importSummary.toSkip}</div>
						<div class="text-xs text-amber-700">Por omitir</div>
					</div>
				</div>

				<div class="rounded-2xl border bg-white p-4 text-sm">
					<p><span class="font-medium">Destino:</span> {importDestinationName}</p>
					<p class="mt-2 text-slate-700">
						Se crearán {importSummary.toCreate}, se omitirán {importSummary.toSkip} existentes. Confirma para
						aplicar la importación.
					</p>
				</div>

				<p class="text-xs text-muted-foreground">
					La vista previa es temporal. Si expira o cambian los datos, será necesario validar el CSV nuevamente.
				</p>

				{#if importCommitLoading}
					<div class="flex items-center gap-2 text-sm text-muted-foreground" role="status" aria-live="polite">
						<Loader2 class="h-4 w-4 animate-spin" />
						Creando estudiantes…
					</div>
				{/if}
			</div>
		{/if}

		<Dialog.Footer>
			<Button
				variant="outline"
				onclick={() => (importConfirmationOpen = false)}
				disabled={importCommitLoading}
			>
				Cancelar
			</Button>
			<Button
				class="bg-blue-600 text-white hover:bg-blue-700"
				onclick={commitStudentImport}
				disabled={importCommitLoading || !importId}
				aria-busy={importCommitLoading}
			>
				{#if importCommitLoading}<Loader2 class="h-4 w-4 animate-spin" />{/if}
				{importCommitLoading ? 'Importando…' : 'Confirmar importación'}
			</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>

<Dialog.Root bind:open={importErrorOpen} onOpenChange={handleImportErrorOpenChange}>
	<Dialog.Content class="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
		<Dialog.Header>
			<div class="flex items-center gap-2 text-red-700">
				<AlertTriangle class="h-5 w-5" aria-hidden="true" />
				<Dialog.Title>{importErrorTitle}</Dialog.Title>
			</div>
			<Dialog.Description>{importErrorDescription}</Dialog.Description>
		</Dialog.Header>

		<div class="space-y-2 py-1" role="alert" aria-live="assertive">
			{#each importErrors.slice(0, 50) as item, index (`${item.row}-${item.field}-${index}`)}
				<div class="rounded-xl border border-red-200 bg-red-50/70 p-3">
					<div class="text-sm font-semibold text-red-800">Fila {item.row} · {item.field}</div>
					<p class="mt-1 text-sm text-red-700">{item.message}</p>
				</div>
			{/each}
			{#if importErrors.length > 50}
				<p class="rounded-xl bg-slate-100 px-3 py-2 text-sm text-slate-700">
					Se muestran los primeros 50 errores. Hay {importErrors.length - 50} errores adicionales.
				</p>
			{/if}
		</div>

		<Dialog.Footer>
			<Button variant="outline" onclick={downloadStudentCsvTemplate}>
				<Download class="h-4 w-4" />
				Descargar plantilla
			</Button>
			<Button class="bg-blue-600 text-white hover:bg-blue-700" onclick={retryStudentImport}>
				Seleccionar otro archivo
			</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>

<Dialog.Root bind:open={importResultOpen} onOpenChange={handleImportResultOpenChange}>
	<Dialog.Content class="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
		<Dialog.Header>
			<div class="flex items-center gap-2 text-emerald-700">
				<CheckCircle2 class="h-5 w-5" aria-hidden="true" />
				<Dialog.Title>Importación completada</Dialog.Title>
			</div>
			<Dialog.Description>La lista de usuarios se actualizó con el resultado de la importación.</Dialog.Description>
		</Dialog.Header>

		{#if importResult}
			<div class="space-y-4 py-1" role="status" aria-live="polite">
				<div class="grid grid-cols-2 gap-3 text-center">
					<div class="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
						<div class="text-3xl font-semibold text-emerald-700">{importResult.created}</div>
						<div class="text-sm text-emerald-700">Creados</div>
					</div>
					<div class="rounded-2xl border border-amber-200 bg-amber-50 p-4">
						<div class="text-3xl font-semibold text-amber-700">{importResult.skipped}</div>
						<div class="text-sm text-amber-700">Omitidos</div>
					</div>
				</div>
				<p class="text-sm"><span class="font-medium">Carrera:</span> {importResult.destinationName}</p>
				{#if importResult.skipped > 0}
					<p class="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
						Se omitieron {importResult.skipped} estudiantes porque ya existían exactamente como estudiantes
						activos en esta carrera. Sus cuentas no se modificaron.
					</p>
				{/if}
			</div>
		{/if}

		<Dialog.Footer>
			<Button class="bg-blue-600 text-white hover:bg-blue-700" onclick={() => (importResultOpen = false)}>
				Cerrar
			</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>

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
				{#if isGlobalAdmin}
					<select class="h-10 w-full rounded-md border px-3" bind:value={createForm.careerId}>
						<option value="">Sin carrera</option>
						{#each careers as career (career.id)}
							<option value={career.id}>{career.name} — {career.faculty}</option>
						{/each}
					</select>
				{:else}
					<div class="rounded-xl border bg-slate-50 px-3 py-2 text-sm font-medium text-slate-800">
						{scopedCareerName}
					</div>
					<p class="text-xs text-muted-foreground">Los usuarios nuevos se asignan automáticamente a tu carrera.</p>
				{/if}
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
			<Button
				class="bg-blue-600 text-white hover:bg-blue-700"
				onclick={submitCreateUser}
				disabled={submitting || !hasCareerAdminAccess}
			>
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
				{#if isGlobalAdmin}
					<select class="h-10 w-full rounded-md border px-3" bind:value={editForm.careerId}>
						<option value="">Sin carrera</option>
						{#each careers as career (career.id)}
							<option value={career.id}>{career.name} — {career.faculty}</option>
						{/each}
					</select>
				{:else}
					<div class="rounded-xl border bg-slate-50 px-3 py-2 text-sm font-medium text-slate-800">
						{selectedUser ? careerNameById(resolveUserCareerId(selectedUser) || currentCareerId) : scopedCareerName}
					</div>
					<p class="text-xs text-muted-foreground">La carrera no puede modificarse desde una administración acotada.</p>
				{/if}
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
			<Button
				class="bg-blue-600 text-white hover:bg-blue-700"
				onclick={submitEditUser}
				disabled={submitting || !hasCareerAdminAccess}
			>
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
				disabled={passwordSubmitting || !hasCareerAdminAccess}
			>
				{passwordSubmitting ? 'Guardando...' : 'Actualizar contraseña'}
			</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>
