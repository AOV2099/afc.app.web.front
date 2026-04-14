<script>
	import { onMount, onDestroy, tick } from 'svelte';
	import { goto } from '$app/navigation';
	import QrScanner from 'qr-scanner';
	import { toast } from 'svelte-sonner';
	import { authApi, clearClientRole } from '$lib/services/api';
	import { scanEventCheckin } from '$lib/services/adminEventsApi';

	import { Button } from '$lib/components/ui/button';
	import * as Dialog from '$lib/components/ui/dialog';
	import { ScrollArea } from '$lib/components/ui/scroll-area';
	import { Separator } from '$lib/components/ui/separator';

	import { Camera, SwitchCamera, Video, LogOut, CheckCircle2, XCircle, ScanLine, AlertTriangle } from 'lucide-svelte';

	let videoElement;
	let qrScanner;

	let cameras = [];
	let currentCameraId = '';
	let currentCameraLabel = '';
	let dialogOpen = false;

	let isStarting = false;
	let loggingOut = false;
	let staffUserId = '';
	let loadingAssignedSessions = false;
	let assignedSessionsError = '';
	let scanInFlight = false;
	let successfulScans = 0;
	let failedScans = 0;
	let lastScanResult = null;

	const warn = (msg) => toast.warning(msg, { duration: 2500 });
	const err = (msg) => toast.error(msg, { duration: 3000 });
	const ok = (msg) => toast.success(msg, { duration: 2000 });

	// Evita spam de lecturas en consola
	let lastScanAt = 0;
	const SCAN_COOLDOWN_MS = 1500;

	// ✅ Lock/cola: si spameas cambios, solo gana el último
	let switchSeq = 0;

	function parsePositiveInt(value) {
		const n = Number(value);
		return Number.isInteger(n) && n > 0 ? n : null;
	}

	function resolveCurrentUserId(payload) {
		return parsePositiveInt(
			payload?.user?.id ??
				payload?.user?.user_id ??
				payload?.data?.user?.id ??
				payload?.data?.id ??
				payload?.id
		);
	}

	async function loadAssignedSessions() {
		loadingAssignedSessions = true;
		assignedSessionsError = '';

		try {
			const me = await authApi.me();
			const currentUserId = resolveCurrentUserId(me);
			if (!currentUserId) {
				throw new Error('No se pudo identificar al usuario staff autenticado.');
			}
			staffUserId = String(currentUserId);
		} catch (e) {
			assignedSessionsError = e?.message || 'No se pudo cargar la configuración del escáner.';
		} finally {
			loadingAssignedSessions = false;
		}
	}

	function extractTicketCodeFromQr(raw) {
		const text = String(raw || '').trim();
		if (!text) return '';

		try {
			const parsed = JSON.parse(text);
			return String(
				parsed?.ticket_code ??
					parsed?.ticketCode ??
					parsed?.code ??
					parsed?.ticket ??
					text
			).trim();
		} catch {
			return text;
		}
	}

	function formatScanMessage(res, fallback = 'Check-in procesado.') {
		return (
			res?.message ||
			res?.result?.message ||
			res?.checkin?.message ||
			fallback
		);
	}

	function isDuplicateCheckinError(error) {
		const status = Number(error?.status || 0);
		const code = String(error?.details?.code || '').toUpperCase();
		const result = String(error?.details?.result || '').toLowerCase();
		const msg = String(error?.message || '').toLowerCase();
		if (status === 409) return true;
		if (code === 'TICKET_ALREADY_SCANNED' || result === 'duplicate') return true;
		return (
			msg.includes('ya tiene check-in') ||
			msg.includes('duplicate') ||
			msg.includes('duplicado') ||
			msg.includes('ya se ha usado')
		);
	}

	function getReadableScanError(error) {
		const status = Number(error?.status || 0);
		const details = error?.details || {};
		const code = String(details?.code || '').trim().toUpperCase();
		const result = String(details?.result || '').trim().toLowerCase();
		const reason = String(details?.reason || '').trim();
		const message = String(error?.message || '').trim();

		if (reason) return reason;
		if (code === 'TICKET_ALREADY_SCANNED' || result === 'duplicate') {
			return 'Este ticket ya fue utilizado para esta sesión.';
		}
		if (result === 'invalid_ticket') return 'El ticket no es válido para este evento.';
		if (result === 'cancelled_ticket') return 'El ticket está cancelado o no está activo.';
		if (result === 'rejected') return 'Check-in rechazado por reglas del evento (geocerca/GPS).';
		if (status === 400) return 'Datos inválidos para registrar check-in (evento/sesión/ticket).';
		if (status === 401) return 'Sesión inválida. Inicia sesión nuevamente.';
		if (status === 403) return 'No tienes permisos para registrar check-ins.';
		if (status === 404) return 'Evento o sesión no encontrados.';
		if (status >= 500) return 'No se pudo procesar el check-in. Intenta de nuevo.';
		if (message && !message.toLowerCase().includes('request failed')) return message;

		return 'No se pudo registrar el check-in.';
	}

	async function processQrScan(rawData) {
		if (scanInFlight) return;
		const resolvedStaffUserId = parsePositiveInt(staffUserId);
		if (!resolvedStaffUserId) {
			warn('No se encontró un usuario staff válido para registrar check-in.');
			return;
		}

		const ticketCode = extractTicketCodeFromQr(rawData);
		if (!ticketCode) {
			warn('No se pudo obtener el código del ticket desde el QR.');
			return;
		}

		scanInFlight = true;

		try {
				const res = await scanEventCheckin({
				staff_user_id: resolvedStaffUserId,
				staffUserId: resolvedStaffUserId,
				ticket_code: ticketCode,
				code: ticketCode,
				qr_data: String(rawData || ''),
				qr: String(rawData || '')
			});

			successfulScans += 1;
			const responseEventId = parsePositiveInt(res?.event_id ?? res?.eventId);
			const responseSessionId = parsePositiveInt(res?.session_id ?? res?.sessionId);

			lastScanResult = {
				ok: true,
				type: 'success',
				ticketCode,
				eventId: responseEventId,
				sessionId: responseSessionId,
				message: formatScanMessage(res),
				at: new Date().toLocaleTimeString('es-MX')
			};
			ok(lastScanResult.message);
		} catch (e) {
			failedScans += 1;
			const duplicateUsed = isDuplicateCheckinError(e);
			const readableMessage = getReadableScanError(e);
			lastScanResult = {
				ok: false,
				type: duplicateUsed ? 'warning' : 'error',
				ticketCode,
				eventId: parsePositiveInt(e?.details?.event_id ?? e?.details?.eventId),
				sessionId: parsePositiveInt(e?.details?.session_id ?? e?.details?.sessionId),
				message: readableMessage,
				at: new Date().toLocaleTimeString('es-MX')
			};
			if (duplicateUsed) {
				warn(lastScanResult.message);
			} else {
				err(lastScanResult.message);
			}
		} finally {
			scanInFlight = false;
		}
	}

	function choosePreferredCamera(found) {
		return (
			found.find((c) => (c.label || '').toLowerCase().includes('back')) ||
			found.find((c) => (c.label || '').toLowerCase().includes('rear')) ||
			found.find((c) => (c.label || '').toLowerCase().includes('trasera')) ||
			found.find((c) => (c.label || '').toLowerCase().includes('environment')) ||
			found[0]
		)?.id;
	}

	async function listCameras() {
		try {
			const found = await QrScanner.listCameras(true);
			cameras = found;

			if (!cameras.length) {
				err('No se detectaron cámaras');
				return;
			}

			if (!currentCameraId) currentCameraId = choosePreferredCamera(cameras) || cameras[0]?.id || '';
			currentCameraLabel = cameras.find((c) => c.id === currentCameraId)?.label || 'Cámara';
		} catch (e) {
			console.error(e);
			err('No se pudieron listar las cámaras (revisa permisos/HTTPS)');
		}
	}

	async function destroyScanner() {
		if (!qrScanner) {
			// por si quedó srcObject pegado
			try {
				videoElement?.pause?.();
				videoElement.srcObject = null;
			} catch {}
			return;
		}

		// 1) Detener loop interno
		try {
			qrScanner.stop();
		} catch {}

		// 2) Liberar tracks del stream
		try {
			const vid = qrScanner?.$video;
			const tracks = vid?.srcObject?.getTracks?.() || [];
			for (const t of tracks) {
				try {
					t.stop();
				} catch {}
			}
			if (vid) vid.srcObject = null;
		} catch {}

		// 3) Destroy (overlay/timers internos)
		try {
			qrScanner.destroy?.();
		} catch {}

		qrScanner = null;

		// 4) Limpieza extra del video
		try {
			videoElement?.pause?.();
			videoElement.srcObject = null;
			videoElement.load?.();
		} catch {}
	}

	function computeScanRegion(video) {
		const size = Math.min(video.videoWidth, video.videoHeight) * 0.65;
		return {
			x: (video.videoWidth - size) / 2,
			y: (video.videoHeight - size) / 2,
			width: size,
			height: size
		};
	}

	// ✅ Encolar cambio de cámara (solo ejecuta el último)
	async function requestCameraSwitch(cameraId) {
		const mySeq = ++switchSeq;

		// si ya hay un start en curso, solo dejamos que termine y el último gana
		if (isStarting) return;

		while (switchSeq === mySeq) {
			// si nadie lo pisó, ejecuta este cambio y sal
			await createAndStartScanner(cameraId, mySeq);
			return;
		}
	}

	async function createAndStartScanner(cameraId, mySeq) {
		if (!videoElement) return;
		isStarting = true;

		try {
			// Si ya hubo una petición nueva, aborta esta
			if (mySeq !== switchSeq) return;

			await destroyScanner();

			// Si ya hubo una petición nueva, aborta esta
			if (mySeq !== switchSeq) return;

			// 🔥 evita AbortError: limpia + deja respirar DOM/video
			try {
				videoElement.pause?.();
				videoElement.srcObject = null;
				videoElement.load?.();
			} catch {}

			await tick();
			await new Promise((r) => requestAnimationFrame(r));

			// Si ya hubo una petición nueva, aborta esta
			if (mySeq !== switchSeq) return;

			// Reinicia cooldown
			lastScanAt = 0;

			qrScanner = new QrScanner(
				videoElement,
				async (result) => {
					const now = Date.now();
					if (now - lastScanAt < SCAN_COOLDOWN_MS) return;
					lastScanAt = now;
					await processQrScan(result?.data);
				},
				{
					highlightScanRegion: true,
					highlightCodeOutline: true,
					calculateScanRegion: computeScanRegion
				}
			);

			await qrScanner.setCamera(cameraId);

			// Si ya hubo una petición nueva, aborta esta
			if (mySeq !== switchSeq) return;

			await qrScanner.start();

			// ✅ intenta play, pero ignora AbortError
			try {
				await videoElement.play?.();
			} catch (e) {
				if (e?.name !== 'AbortError') console.warn('video.play() error:', e);
			}

			// Si ya hubo una petición nueva, no actualices estado
			if (mySeq !== switchSeq) return;

			currentCameraId = cameraId;
			currentCameraLabel = cameras.find((c) => c.id === cameraId)?.label || 'Cámara';
		} catch (e) {
			console.error(e);
			if (mySeq === switchSeq) err('No se pudo iniciar/cambiar la cámara');
		} finally {
			isStarting = false;

			// Si mientras iniciaba alguien pidió otra cámara, lánzala
			if (switchSeq !== mySeq) {
				const latestId = currentCameraId || cameraId;
				// Ojo: si currentCameraId aún no se actualizó, intentamos con cameraId;
				// pero idealmente, el caller ya traerá el ID correcto.
			}
		}
	}

	async function selectCamera(cameraId) {
		dialogOpen = false;
		await requestCameraSwitch(cameraId);
	}

	async function switchCameraQuick() {
		if (!cameras.length) return warn('No hay cámaras para alternar');
		const idx = cameras.findIndex((c) => c.id === currentCameraId);
		const next = cameras[(idx + 1) % cameras.length];
		await requestCameraSwitch(next.id);
	}

	async function onLogout() {
		if (loggingOut) return;
		loggingOut = true;

		try {
			await authApi.logout();
			clearClientRole();
			await goto('/login');
		} catch (e) {
			err(e?.message || 'No se pudo cerrar sesión.');
		} finally {
			loggingOut = false;
		}
	}

	onMount(async () => {
		await loadAssignedSessions();

		await listCameras();
		if (currentCameraId) await requestCameraSwitch(currentCameraId);
	});

	onDestroy(async () => {
		switchSeq++; // invalida cualquier start en curso
		await destroyScanner();
	});

</script>

<div class="relative min-h-screen">
	<!-- Video + overlay (estilo demo oficial custom style 2) -->
	<div id="video-container" class="example-style-2 fixed inset-0 z-0">
		<video
			bind:this={videoElement}
			id="qr-video"
			class="h-full w-full object-cover"
			playsinline
			muted
			autoplay
		></video>
	</div>

	<!-- UI encima del video -->
	<div class="relative z-10">
		<!-- Top bar -->
		<div class="sticky top-0 z-20 backdrop-blur bg-white/70 border-b">
			<div class="mx-auto max-w-3xl px-4 py-3 flex items-center justify-between">
				<div class="flex items-center gap-2">
					<div class="h-9 w-9 rounded-xl bg-black text-white grid place-items-center">
						<Video size={18} />
					</div>
					<div class="leading-tight">
						<div class="font-semibold">Cámara</div>
						<div class="text-xs text-muted-foreground">AFC Aragón</div>
					</div>
				</div>

				<div class="flex items-center gap-2">
					<span
						class="hidden sm:inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold bg-secondary text-secondary-foreground"
					>
						{currentCameraLabel || 'Cámara'}
					</span>

					<Button
						size="icon"
						variant="secondary"
						on:click={switchCameraQuick}
						disabled={isStarting}
						title="Alternar cámara"
					>
						<SwitchCamera size={18} />
					</Button>

					<Dialog.Root bind:open={dialogOpen}>
						<Dialog.Trigger asChild>
							<Button class="gap-2" disabled={isStarting}>
								<Camera size={18} />
								Cámaras
							</Button>
						</Dialog.Trigger>

						<Dialog.Content class="sm:max-w-lg mx-2">
							<Dialog.Header>
								<Dialog.Title>Seleccionar cámara</Dialog.Title>
								<Dialog.Description>
									Si no ves nombres, concede permisos y vuelve a abrir.
								</Dialog.Description>
							</Dialog.Header>

							<Separator class="my-3" />

							<ScrollArea class="h-[300px] pr-2">
								<div class="space-y-2">
									{#each cameras as cam (cam.id)}
										<button
											type="button"
											class="w-full text-left rounded-md border bg-background/70 hover:bg-muted/70 transition p-3 disabled:opacity-60"
											disabled={isStarting}
											on:click={() => selectCamera(cam.id)}
										>
											<div class="flex items-center justify-between gap-2">
												<span class="truncate">{cam.label || 'Cámara'}</span>
												{#if cam.id === currentCameraId}
													<span class="rounded-full bg-primary px-2 py-0.5 text-xs text-primary-foreground">
														Activa
													</span>
												{/if}
											</div>
										</button>
									{/each}
								</div>
							</ScrollArea>

							<Dialog.Footer class="mt-4">
								<Button variant="secondary" on:click={() => (dialogOpen = false)}>Cerrar</Button>
							</Dialog.Footer>
						</Dialog.Content>
					</Dialog.Root>

					<Button
						variant="outline"
						class="gap-2"
						onclick={onLogout}
						disabled={loggingOut}
						title="Cerrar sesión"
					>
						<LogOut size={16} />
						{loggingOut ? 'Saliendo…' : 'Salir'}
					</Button>
				</div>
			</div>
		</div>

		<!-- Estado (opcional) -->
		 {#if isStarting}
		<div class="mx-auto max-w-3xl px-4 pt-4">
			<span class="inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs bg-white/70 backdrop-blur">
				Iniciando cámara...	
			</span>
		</div>
		{/if}

			<div class="mx-auto max-w-3xl px-4 pt-4 space-y-3">
				<div class="rounded-xl border bg-white/80 backdrop-blur p-3">
					<div class="text-xs font-medium text-muted-foreground mb-2">Escáner staff (auto)</div>
					<div class="flex items-center gap-2 flex-wrap">
						<div class="text-xs rounded-md border bg-background px-2 py-1 whitespace-nowrap">
							Staff #{staffUserId || '—'}
						</div>
						<Button
							variant="outline"
							class="h-10"
							onclick={loadAssignedSessions}
							disabled={loadingAssignedSessions}
						>
							Revalidar staff
						</Button>
						{#if assignedSessionsError}
							<span class="text-xs text-red-600">{assignedSessionsError}</span>
						{/if}
						<div class="text-xs text-muted-foreground whitespace-nowrap">Escaneos OK: {successfulScans}</div>
					<div class="text-xs text-muted-foreground whitespace-nowrap">Fallidos: {failedScans}</div>
				</div>
			</div>

			{#if lastScanResult}
				<div class={`rounded-xl border p-3 ${lastScanResult.type === 'success' ? 'bg-emerald-50/90 border-emerald-200' : lastScanResult.type === 'warning' ? 'bg-amber-50/90 border-amber-200' : 'bg-red-50/90 border-red-200'}`}>
					<div class="flex items-start gap-2">
						{#if lastScanResult.type === 'success'}
							<CheckCircle2 class="h-4 w-4 mt-0.5 text-emerald-700" />
						{:else if lastScanResult.type === 'warning'}
							<AlertTriangle class="h-4 w-4 mt-0.5 text-amber-700" />
						{:else}
							<XCircle class="h-4 w-4 mt-0.5 text-red-700" />
						{/if}
						<div class="min-w-0">
							<div class={`text-sm font-medium ${lastScanResult.type === 'success' ? 'text-emerald-800' : lastScanResult.type === 'warning' ? 'text-amber-800' : 'text-red-800'}`}>
								{lastScanResult.message}
							</div>
							<div class="text-xs text-muted-foreground mt-1">
								Evento #{lastScanResult.eventId ?? '—'} · Sesión #{lastScanResult.sessionId ?? '—'} · Ticket: {lastScanResult.ticketCode} · {lastScanResult.at}
							</div>
						</div>
						{#if scanInFlight}
							<ScanLine class="h-4 w-4 mt-0.5 text-muted-foreground animate-pulse" />
						{/if}
					</div>
				</div>
			{/if}
		</div>
	</div>
</div>

<style>
	/* ===== Basado en el demo oficial: Custom style 2 ===== */
	#video-container {
		line-height: 0;
	}

	#video-container.example-style-2 {
		position: fixed;
		inset: 0;
		overflow: hidden;
	}

	/* QrScanner inyecta .scan-region-highlight + svgs */
	#video-container.example-style-2 :global(.scan-region-highlight) {
		border-radius: 30px;
		outline: rgba(0, 0, 0, 0.25) solid 50vmax; /* sombreado fuera del cuadro */
	}

	#video-container.example-style-2 :global(.scan-region-highlight-svg) {
		display: none;
	}

	/* ✅ Contorno del QR detectado (se conserva) */
	#video-container.example-style-2 :global(.code-outline-highlight) {
		stroke: rgba(255, 255, 255, 0.5) !important;
		stroke-width: 15 !important;
		stroke-dasharray: none !important;
	}
</style>
