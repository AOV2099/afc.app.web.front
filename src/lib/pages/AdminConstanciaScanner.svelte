<script>
	import { pushState } from '$app/navigation';
	import { page } from '$app/stores';
	import QrScanner from 'qr-scanner';
	import { toast } from 'svelte-sonner';

	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { adminConstanciasApi } from '$lib/services/api';
	import { extractConstanciaCode } from '$lib/services/constanciaCode.js';
	import { screenSlide } from '$lib/utils/motion.js';

	import {
		ArrowLeft,
		BadgeCheck,
		CameraOff,
		Loader2,
		RefreshCw,
		ScanQrCode,
		AlertTriangle
	} from 'lucide-svelte';

	const TIMEZONE = 'America/Mexico_City';
	const SAME_CODE_PAUSE_MS = 3000;

	let result = null;
	let verifying = false;
	let cameraError = '';
	let cameraKey = 0;
	let manualCode = '';
	let lastWarningAt = 0;
	let resumeAt = 0;
	let rejectedCode = '';
	let rejectedUntil = 0;

	// La vista de detalle vive en el historial (shallow routing): «atrás» del navegador o del celular regresa a la cámara.
	$: showDetail = Boolean(result) && $page.state?.constanciaCode === result?.constancia?.code;
	$: progress = result ? Math.min(100, (Number(result.hours.total) / Math.max(1, Number(result.hours.goal))) * 100) : 0;
	// Al volver a la cámara el mismo QR suele seguir enfocado; se ignora un momento para no regresar a la ficha.
	$: if (!showDetail && result) resumeAt = Date.now() + SAME_CODE_PAUSE_MS;

	function formatDate(value) {
		if (!value) return '—';
		return new Date(value).toLocaleString('es-MX', { dateStyle: 'long', timeZone: TIMEZONE });
	}

	function formatHours(value) {
		return Number(value ?? 0).toLocaleString('es-MX', { maximumFractionDigits: 2 });
	}

	function describeCameraError(error) {
		const name = error?.name || String(error || '');
		if (/NotAllowed|Permission/i.test(name)) return 'Permite el acceso a la cámara en tu navegador para escanear.';
		if (/NotFound|Camera not found/i.test(name)) return 'No se encontró una cámara en este dispositivo.';
		return 'No se pudo iniciar la cámara.';
	}

	function camera(video) {
		let active = true;
		const scanner = new QrScanner(video, (scan) => handleDecoded(scan?.data), {
			preferredCamera: 'environment',
			highlightScanRegion: true,
			highlightCodeOutline: true,
			maxScansPerSecond: 8
		});
		cameraError = '';
		scanner.start().catch((error) => {
			if (active) cameraError = describeCameraError(error);
		});
		return {
			destroy() {
				active = false;
				scanner.stop();
				scanner.destroy();
			}
		};
	}

	function retryCamera() {
		cameraError = '';
		cameraKey += 1;
	}

	function handleDecoded(text) {
		if (verifying || showDetail) return;
		const code = extractConstanciaCode(text);
		if (code && code === result?.constancia?.code && Date.now() < resumeAt) return;
		// Un folio rechazado se queda frente a la cámara: no se vuelve a consultar en cada cuadro.
		if (code && code === rejectedCode && Date.now() < rejectedUntil) return;
		if (code) return verify(code);
		const now = Date.now();
		if (now - lastWarningAt > 2500) {
			lastWarningAt = now;
			toast.warning('Este QR no corresponde a una constancia AFC.');
		}
	}

	async function verify(code) {
		if (verifying) return;
		verifying = true;
		try {
			result = await adminConstanciasApi.verify(code);
			manualCode = '';
			navigator.vibrate?.(60);
			pushState('', { constanciaCode: result.constancia.code });
		} catch (e) {
			rejectedCode = code;
			rejectedUntil = Date.now() + SAME_CODE_PAUSE_MS;
			toast.error(e?.message || 'No se pudo verificar la constancia.');
		} finally {
			verifying = false;
		}
	}

	function submitManual(event) {
		event.preventDefault();
		const code = extractConstanciaCode(manualCode);
		if (!code) {
			toast.warning('Escribe un folio con el formato AFC-XXXX-XXXX-XXXX.');
			return;
		}
		verify(code);
	}

	function backToCamera() {
		history.back();
	}
</script>

<div class="mx-auto grid w-full max-w-xl grid-cols-[minmax(0,1fr)] overflow-x-hidden px-4 pb-10 pt-2 sm:px-0">
	{#if showDetail}
		<section
			class="col-start-1 row-start-1 space-y-4"
			in:screenSlide={{ x: 360 }}
			out:screenSlide={{ x: 360, duration: 240 }}
			data-testid="constancia-detail"
		>
			<div class="flex items-center gap-2">
				<Button variant="ghost" size="icon" class="rounded-full" onclick={backToCamera} aria-label="Volver a la cámara">
					<ArrowLeft class="h-5 w-5" />
				</Button>
				<div class="text-sm font-medium text-muted-foreground">Constancia escaneada</div>
			</div>

			<div class="rounded-3xl border bg-white shadow-sm">
				<div class="space-y-4 p-5">
					{#if result.hours.completed}
						<div class="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
							<BadgeCheck class="h-4 w-4" />
							Constancia válida
						</div>
					{:else}
						<div class="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700">
							<AlertTriangle class="h-4 w-4" />
							Registrada, pero las horas actuales no cubren la meta
						</div>
					{/if}

					<div>
						<div class="text-xl font-semibold leading-tight text-[#152B4D]">{result.student.full_name || 'Sin nombre registrado'}</div>
						<div class="mt-1 text-sm text-muted-foreground">{result.student.career || 'Sin carrera'}</div>
					</div>

					<dl class="grid grid-cols-2 gap-3 text-sm">
						<div class="rounded-2xl bg-slate-50 p-3">
							<dt class="text-[11px] font-semibold tracking-wide text-slate-500">NÚMERO DE CUENTA</dt>
							<dd class="mt-0.5 font-semibold tabular-nums">{result.student.student_id}</dd>
						</div>
						<div class="rounded-2xl bg-slate-50 p-3">
							<dt class="text-[11px] font-semibold tracking-wide text-slate-500">EXPEDIDA</dt>
							<dd class="mt-0.5 font-medium">{formatDate(result.constancia.issued_at)}</dd>
						</div>
						<div class="col-span-2 rounded-2xl bg-slate-50 p-3">
							<dt class="text-[11px] font-semibold tracking-wide text-slate-500">FOLIO</dt>
							<dd class="mt-0.5 font-mono font-semibold tracking-wide">{result.constancia.code}</dd>
						</div>
						<div class="col-span-2 rounded-2xl bg-slate-50 p-3">
							<dt class="text-[11px] font-semibold tracking-wide text-slate-500">NOMBRE REGISTRADO</dt>
							<dd class="mt-0.5 font-medium uppercase">{result.student.full_name || 'Sin nombre registrado'}</dd>
						</div>
					</dl>
				</div>
			</div>

			<div class="rounded-3xl border bg-white p-5 shadow-sm">
				<div class="flex items-end justify-between gap-3">
					<div>
						<div class="text-[11px] font-semibold tracking-wide text-slate-500">TOTAL DE HORAS</div>
						<div class="text-3xl font-semibold tabular-nums text-[#152B4D]">
							{formatHours(result.hours.total)}
							<span class="text-base font-medium text-muted-foreground">/ {formatHours(result.hours.goal)}</span>
						</div>
					</div>
					<div class="text-sm font-semibold tabular-nums text-muted-foreground">{Math.round(progress)}%</div>
				</div>
				<div class="mt-3 h-2 overflow-hidden rounded-full bg-slate-100">
					<div class="h-full rounded-full bg-[#BA914D]" style={`width: ${progress}%`}></div>
				</div>

				<div class="mt-5 text-[11px] font-semibold tracking-wide text-slate-500">DESGLOSE POR RUBRO</div>
				<ul class="mt-2 divide-y">
					{#each result.hours.categories as item (item.key)}
						<li class="flex items-center justify-between gap-3 py-2.5 text-sm">
							<span class={Number(item.hours) > 0 ? 'font-medium' : 'text-muted-foreground'}>{item.label}</span>
							<span class={`tabular-nums ${Number(item.hours) > 0 ? 'font-semibold text-[#152B4D]' : 'text-muted-foreground'}`}>
								{formatHours(item.hours)} h
							</span>
						</li>
					{/each}
				</ul>
			</div>

			<Button class="h-12 w-full rounded-2xl bg-[#152B4D] text-white hover:bg-[#1d3a66]" onclick={backToCamera}>
				<ScanQrCode class="h-5 w-5" />
				Escanear otra constancia
			</Button>
		</section>
	{:else}
		<section
			class="col-start-1 row-start-1 space-y-4"
			in:screenSlide={{ x: -120 }}
			out:screenSlide={{ x: -120, duration: 240 }}
			data-testid="constancia-scanner"
		>
			<div>
				<h1 class="text-xl font-semibold">Verificar constancia</h1>
				<p class="text-sm text-muted-foreground">Apunta la cámara al QR de firma digital de la constancia.</p>
			</div>

			<div class="relative aspect-square overflow-hidden rounded-3xl bg-slate-900 shadow-sm">
				{#key cameraKey}
					<video use:camera class="h-full w-full object-cover" playsinline muted autoplay></video>
				{/key}

				{#if cameraError}
					<div class="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-slate-900 p-6 text-center text-white">
						<CameraOff class="h-10 w-10 text-white/70" />
						<p class="text-sm text-white/80">{cameraError}</p>
						<Button variant="secondary" class="rounded-full" onclick={retryCamera}>
							<RefreshCw class="h-4 w-4" />
							Reintentar
						</Button>
					</div>
				{/if}

				{#if verifying}
					<div class="absolute inset-0 flex items-center justify-center bg-slate-900/60 text-white backdrop-blur-sm">
						<div class="flex items-center gap-2 rounded-full bg-white/10 px-4 py-2 text-sm font-medium">
							<Loader2 class="h-4 w-4 animate-spin" />
							Verificando…
						</div>
					</div>
				{/if}
			</div>

			<form class="flex gap-2" onsubmit={submitManual}>
				<Input
					class="h-11 rounded-2xl font-mono uppercase"
					placeholder="AFC-XXXX-XXXX-XXXX"
					aria-label="Folio de la constancia"
					autocomplete="off"
					bind:value={manualCode}
				/>
				<Button type="submit" class="h-11 rounded-2xl" disabled={verifying || !manualCode.trim()}>Verificar</Button>
			</form>
		</section>
	{/if}
</div>
