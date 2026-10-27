<script>
	import { SESSION_STATE_META, attendanceMeter, describeHoursRelease } from '$lib/utils/eventSessions.js';

	/** @type {{ attended: number, total: number, required: number, met: boolean, reachable?: boolean } | null} */
	export let attendance = null;
	/** @type {{ id: number|string, starts_at: string, ends_at: string, state: string }[]} */
	export let sessions = [];
	export let hoursValue = null;
	// Solo encabezado y barra, para tarjetas.
	export let compact = false;

	$: meter = attendanceMeter(attendance);
	$: release = describeHoursRelease(attendance, hoursValue);
	$: barClass = attendance?.met ? 'bg-emerald-500' : attendance?.reachable === false ? 'bg-red-400' : 'bg-blue-600';
	// Las sesiones pasadas y la de hoy se muestran todas; de las futuras solo la más inmediata.
	$: visibleSessions = sessions.filter(
		(session) => session.state !== 'upcoming' || session === sessions.find((item) => item.state === 'upcoming')
	);

	function sessionLabel(session) {
		const start = new Date(session.starts_at);
		const end = new Date(session.ends_at);
		if (Number.isNaN(start.getTime())) return 'Sin fecha';
		const day = start.toLocaleDateString('es-MX', { weekday: 'short', day: '2-digit', month: 'short' });
		const time = (value) => value.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
		return `${day} · ${time(start)}–${Number.isNaN(end.getTime()) ? '' : time(end)}`;
	}
</script>

{#if meter.total > 1 && compact}
	<div class="space-y-1.5 text-left" data-testid="attendance-progress">
		<div class="flex items-baseline justify-between gap-2 text-xs font-semibold">
			<span>Asistencia: {meter.attended} de {meter.total}</span>
			<span class="text-blue-700">{meter.progressPercent} %</span>
		</div>
		<div class="relative">
			<div
				class="h-2 w-full overflow-hidden rounded-full bg-slate-200"
				role="progressbar"
				aria-valuemin="0"
				aria-valuemax="100"
				aria-valuenow={meter.progressPercent}
				aria-label="Avance de asistencia"
			>
				<div class={`h-full rounded-full transition-all ${barClass}`} style={`width:${meter.progressPercent}%`}></div>
			</div>
			<div
				class="absolute -top-0.5 h-3 w-0.5 bg-slate-900"
				style={`left:calc(${meter.thresholdPercent}% - 1px)`}
				title={`Mínimo ${meter.thresholdPercent} %`}
			></div>
		</div>
	</div>
{:else if meter.total > 1}
	<div class="space-y-3 text-left" data-testid="attendance-progress">
		<div class="flex items-baseline justify-between gap-2">
			<div class="text-sm font-semibold">Asistencia: {meter.attended} de {meter.total} sesiones</div>
			<div class="text-sm font-semibold text-blue-700">{meter.progressPercent} %</div>
		</div>
		<div class="relative pt-1 pb-5">
			<div
				class="h-3 w-full overflow-hidden rounded-full bg-slate-200"
				role="progressbar"
				aria-valuemin="0"
				aria-valuemax="100"
				aria-valuenow={meter.progressPercent}
				aria-label="Avance de asistencia"
			>
				<div class={`h-full rounded-full transition-all ${barClass}`} style={`width:${meter.progressPercent}%`}></div>
			</div>
			<div
				class="absolute top-0 h-5 w-0.5 bg-slate-900"
				style={`left:calc(${meter.thresholdPercent}% - 1px)`}
				title="Mínimo para liberar las horas AFC"
			></div>
			<div
				class="absolute top-5 -translate-x-1/2 whitespace-nowrap text-[11px] font-semibold text-slate-700"
				style={`left:${Math.min(Math.max(meter.thresholdPercent, 12), 88)}%`}
			>
				Mínimo {meter.thresholdPercent} %
			</div>
		</div>
		{#if release}
			<div
				class={`rounded-xl px-3 py-2 text-xs font-semibold ${attendance?.met ? 'bg-emerald-50 text-emerald-800' : attendance?.reachable === false ? 'bg-red-50 text-red-700' : 'bg-blue-50 text-blue-800'}`}
				data-testid="hours-release"
			>
				{release}
			</div>
		{/if}
		{#if visibleSessions.length}
			<ul class="flex flex-wrap gap-1.5" aria-label="Asistencia por sesión">
				{#each visibleSessions as session (session.id)}
					{@const meta = SESSION_STATE_META[session.state] || SESSION_STATE_META.upcoming}
					<li class={`rounded-lg border px-2 py-1 text-[11px] ${meta.className}`} title={meta.label}>
						<span class="font-semibold first-letter:uppercase">{sessionLabel(session)}</span> · {meta.label}
					</li>
				{/each}
			</ul>
		{/if}
	</div>
{/if}
