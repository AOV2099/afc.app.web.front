<script>
  import { onMount, tick } from "svelte";
  import { goto } from "$app/navigation";
  import { Button } from "$lib/components/ui/button";
  import { Card, CardContent } from "$lib/components/ui/card";
  import { Badge } from "$lib/components/ui/badge";
  import * as Chart from "$lib/components/ui/chart/index.js";
  import { AreaChart } from "layerchart";
  import { scaleTime } from "d3-scale";
  import {
    getEventDashboard,
    getEventTimeline,
  } from "$lib/services/adminEventsApi";
  import {
    ArrowLeft,
    RefreshCcw,
    Users,
    UserCheck,
    Clock3,
    CheckCircle2,
    XCircle,
    Copy,
    AlertTriangle,
    ScanLine,
    UserPlus,
    UserMinus,
  } from "lucide-svelte";

  const AUTO_REFRESH_MS = 60_000;

  const EVENT_TYPE_CATALOG = Object.freeze({
    inscription: "Inscripción",
    inscription_request: "Solicitud de inscripción",
    unregistration: "Baja",
    unregistration_request: "Solicitud de baja",
    checkin_accepted: "Check-in exitoso",
    checkin_rejected: "Check-in rechazado",
    checkin_duplicate: "Check-in duplicado",
    checkin_invalid_ticket: "Check-in inválido",
    checkin_cancelled_ticket: "Check-in con ticket cancelado",
    checkin_failed: "Check-in fallido",
  });

  const EVENT_TYPE_ICON_CATALOG = Object.freeze({
    inscription: { icon: UserPlus, iconClass: "text-emerald-600" },
    inscription_request: { icon: Clock3, iconClass: "text-amber-600" },
    unregistration: { icon: UserMinus, iconClass: "text-rose-600" },
    unregistration_request: { icon: Clock3, iconClass: "text-orange-600" },
    checkin_accepted: { icon: CheckCircle2, iconClass: "text-emerald-600" },
    checkin_rejected: { icon: XCircle, iconClass: "text-red-600" },
    checkin_duplicate: { icon: Copy, iconClass: "text-orange-500" },
    checkin_invalid_ticket: { icon: AlertTriangle, iconClass: "text-rose-600" },
    checkin_cancelled_ticket: {
      icon: AlertTriangle,
      iconClass: "text-orange-600",
    },
    checkin_failed: { icon: XCircle, iconClass: "text-red-700" },
  });

  function normalizeEventType(value) {
    const raw = String(value || "").trim().toLowerCase();

    if (raw === "registration") return "inscription";
    if (raw === "registration_request") return "inscription_request";
    if (raw === "unregistration") return "unregistration";
    if (raw === "unregistration_request") return "unregistration_request";

    if (raw.includes("inscrip") && raw.includes("request"))
      return "inscription_request";
    if (raw.includes("inscrip")) return "inscription";
    if (raw.includes("baja") && raw.includes("request"))
      return "unregistration_request";
    if (raw.includes("baja") || raw.includes("cancel"))
      return "unregistration";

    return raw;
  }

  function getEventTypeMeta(eventType) {
    return {
      label: EVENT_TYPE_CATALOG[eventType] || eventType || "Actividad",
      ...(EVENT_TYPE_ICON_CATALOG[eventType] || {
        icon: ScanLine,
        iconClass: "text-slate-600",
      }),
    };
  }

  function createEmptyDashboard() {
    return {
      event: null,
      registration_stats: {
        registrations_count: 0,
        approved_count: 0,
        pending_count: 0,
      },
      live: {
        session: null,
        stats: {
          accepted: 0,
          rejected: 0,
          duplicate: 0,
          invalid_ticket: 0,
          cancelled_ticket: 0,
          total: 0,
          present_users: 0,
        },
      },
      activity_series: {
        views: [],
        inscriptions: [],
        checkins: [],
      },
      recent_activity_stack: [],
    };
  }

  export let eventId = null;
  let loading = false;
  let refreshing = false;
  let error = "";
  let dashboard = createEmptyDashboard();
  let dashboardRegistrationStats = {};
  let dashboardLiveStats = {};
  let timelineSeries = {
    inscriptions: [],
    views: [],
    checkins: [],
  };
  let rawInscriptionsTimeline = [];
  let rawViewsTimeline = [];
  let rawCheckinsTimeline = [];
  let hourlyLineData = [];
  let inscriptionsLineData = [];
  let viewsLineData = [];
  let checkinsLineData = [];
  let recentActivityItems = [];
  let viewGranularity = "minutes";
  let selectedSessionId = null;
  let lastViewsDebugSignature = "";
  let refreshCooldownSeconds = 0;
  let hasDashboardLoaded = false;
  let intervalId;
  let cooldownIntervalId;
  const DEBUG_DASHBOARD_LOGS = true;

  function goBack() {
    goto("/admin/events");
  }

  function startRefreshCooldown(seconds = 10) {
    refreshCooldownSeconds = seconds;
    if (cooldownIntervalId) clearInterval(cooldownIntervalId);
    cooldownIntervalId = setInterval(() => {
      refreshCooldownSeconds = Math.max(0, refreshCooldownSeconds - 1);
      if (refreshCooldownSeconds <= 0 && cooldownIntervalId) {
        clearInterval(cooldownIntervalId);
        cooldownIntervalId = null;
      }
    }, 1000);
  }

  function handleManualRefresh() {
    if (loading || refreshCooldownSeconds > 0) return;
    loadDashboard(true);
    startRefreshCooldown(10);
  }

  function eventTitle() {
    return dashboard?.event?.title || `Evento ${eventId || ""}`;
  }

  function eventDateRange() {
    const startsAt = dashboard?.event?.starts_at
      ? new Date(dashboard.event.starts_at)
      : null;
    const endsAt = dashboard?.event?.ends_at
      ? new Date(dashboard.event.ends_at)
      : null;

    const startsLabel =
      startsAt && !Number.isNaN(startsAt.getTime())
        ? startsAt.toLocaleString("es-MX")
        : "Sin fecha inicio";
    const endsLabel =
      endsAt && !Number.isNaN(endsAt.getTime())
        ? endsAt.toLocaleString("es-MX")
        : "Sin fecha fin";

    return `${startsLabel} · ${endsLabel}`;
  }

  function getErrorMessage(e) {
    if (e?.status === 400)
      return e?.message || "Solicitud inválida para consultar métricas.";
    if (e?.status === 401)
      return e?.message || "Tu sesión expiró. Inicia sesión nuevamente.";
    if (e?.status === 403)
      return e?.message || "No tienes permisos para ver este dashboard.";
    if (e?.status === 404) return e?.message || "Evento no encontrado.";
    if (e?.status >= 500)
      return e?.message || "Error del servidor al cargar métricas.";
    return e?.message || "No se pudo cargar el dashboard del evento.";
  }

  function normalizeDashboardResponse(payload) {
    console.log("payload", payload);
    
    if (
      payload?.event ||
      payload?.registration_stats ||
      payload?.recent_activity_stack
    )
      return payload;
    if (
      payload?.data &&
      (payload.data?.event ||
        payload.data?.registration_stats ||
        payload.data?.recent_activity_stack)
    )
      return payload.data;
    if (
      payload?.dashboard &&
      (payload.dashboard?.event ||
        payload.dashboard?.registration_stats ||
        payload.dashboard?.recent_activity_stack)
    )
      return payload.dashboard;
    return payload || {};
  }

  function syncDashboardDerivedState(source) {
    const toNumber = (value) => Number(value ?? 0) || 0;
    const pickPreferredCount = (primaryValue, ...fallbackValues) => {
      const primary = toNumber(primaryValue);
      if (primary > 0) return primary;

      for (const fallback of fallbackValues) {
        const candidate = toNumber(fallback);
        if (candidate > 0) return candidate;
      }

      return primary;
    };

    const rawRegistrationStats = source?.registration_stats || {};
    const rawLiveStats =
      source?.live?.stats || source?.live_stats || source?.checkin_stats || {};
    const rawActivitySeries = source?.activity_series || {};
    const rawCheckinsBreakdown = rawActivitySeries?.checkins_breakdown || {};
    const rawRegistrationsBreakdown =
      rawActivitySeries?.registrations_breakdown || {};

    dashboardRegistrationStats = {
      registrations_count: pickPreferredCount(
        rawRegistrationStats?.registrations_count,
        rawRegistrationStats?.count,
        rawActivitySeries?.inscriptions_count,
        rawRegistrationsBreakdown?.inscripciones,
        rawRegistrationsBreakdown?.inscription,
        rawRegistrationsBreakdown?.inscriptions,
        rawRegistrationStats?.total_registrations,
        rawRegistrationStats?.total,
      ),
      approved_count: pickPreferredCount(
        rawRegistrationStats?.approved_count,
        rawRegistrationStats?.approved,
        rawRegistrationStats?.accepted,
        rawRegistrationsBreakdown?.inscripciones,
      ),
      pending_count: pickPreferredCount(
        rawRegistrationStats?.pending_count,
        rawRegistrationStats?.pending,
        rawRegistrationStats?.in_review,
        rawRegistrationsBreakdown?.solicitudes_inscripcion,
        rawRegistrationsBreakdown?.inscription_request,
        rawRegistrationsBreakdown?.inscription_requests,
      ),
    };

    dashboardLiveStats = {
      accepted: pickPreferredCount(
        rawLiveStats?.accepted,
        rawLiveStats?.accepted_count,
        rawCheckinsBreakdown?.exitosos,
        rawCheckinsBreakdown?.accepted,
        rawCheckinsBreakdown?.accepted_count,
      ),
      rejected: pickPreferredCount(
        rawLiveStats?.rejected,
        rawLiveStats?.rejected_count,
        rawCheckinsBreakdown?.rechazados,
        rawCheckinsBreakdown?.rejected,
        rawCheckinsBreakdown?.rejected_count,
      ),
      duplicate: pickPreferredCount(
        rawLiveStats?.duplicate,
        rawLiveStats?.duplicates,
        rawLiveStats?.duplicate_count,
        rawCheckinsBreakdown?.duplicados,
        rawCheckinsBreakdown?.duplicate,
        rawCheckinsBreakdown?.duplicates,
      ),
      invalid_ticket: pickPreferredCount(
        rawLiveStats?.invalid_ticket,
        rawLiveStats?.invalid,
        rawLiveStats?.invalid_count,
        rawCheckinsBreakdown?.ticket_invalido,
        rawCheckinsBreakdown?.invalid_ticket,
        rawCheckinsBreakdown?.invalid,
      ),
      cancelled_ticket: pickPreferredCount(
        rawLiveStats?.cancelled_ticket,
        rawLiveStats?.cancelled,
        rawLiveStats?.canceled,
        rawLiveStats?.cancelled_count,
        rawCheckinsBreakdown?.ticket_cancelado,
        rawCheckinsBreakdown?.cancelled_ticket,
        rawCheckinsBreakdown?.canceled_ticket,
      ),
      total: pickPreferredCount(
        rawLiveStats?.total,
        rawLiveStats?.total_attempts,
        rawLiveStats?.scans_total,
        rawActivitySeries?.checkins_count,
      ),
      present_users: pickPreferredCount(
        rawLiveStats?.present_users,
        rawLiveStats?.present,
        rawLiveStats?.checked_in_users,
      ),
    };
  }

  function normalizeSeries(list = []) {
    return (Array.isArray(list) ? list : []).map((row, index) => {
      const label =
        row?.bucket ||
        row?.bucket_start ||
        row?.label ||
        row?.time ||
        row?.hour ||
        row?.day ||
        String(index);
      const value = Number(row?.count ?? row?.value ?? row?.total ?? 0) || 0;

      return { label: String(label), value };
    });
  }

  function parseBucketLabelToDate(label, bucket = "hour") {
    if (!label) return null;

    if (bucket === "day") {
      const d = new Date(`${label}T00:00:00`);
      return Number.isNaN(d.getTime()) ? null : d;
    }

    const d = new Date(label.replace(" ", "T") + ":00");
    return Number.isNaN(d.getTime()) ? null : d;
  }

  function parseTimelineTsToMs(value) {
    if (value === null || value === undefined) return null;

    if (typeof value === "number" && Number.isFinite(value)) {
      return value < 1_000_000_000_000 ? value * 1000 : value;
    }

    if (typeof value === "string") {
      const trimmed = value.trim();
      if (!trimmed) return null;

      const numeric = Number(trimmed);
      if (Number.isFinite(numeric)) {
        return numeric < 1_000_000_000_000 ? numeric * 1000 : numeric;
      }

      const parsed = Date.parse(trimmed);
      if (!Number.isNaN(parsed)) return parsed;
    }

    return null;
  }

  function aggregateTimelineByBucket(list = [], bucket = "hour") {
    const grouped = new Map();

    for (const row of Array.isArray(list) ? list : []) {
      const rawTs = row?.ts || row?.timestamp || row?.created_at || row?.at;
      const tsMs = parseTimelineTsToMs(rawTs);
      const dt = Number.isFinite(tsMs) ? new Date(tsMs) : null;
      if (!dt || Number.isNaN(dt.getTime())) continue;

      const key =
        bucket === "day"
          ? `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`
          : `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")} ${String(dt.getHours()).padStart(2, "0")}:00`;

      grouped.set(key, (grouped.get(key) || 0) + 1);
    }

    return [...grouped.entries()]
      .sort((a, b) => (a[0] > b[0] ? 1 : -1))
      .map(([label, value]) => ({ label, value }));
  }

  function buildHourlySeries() {
    const dashboardSeries = dashboard?.activity_series || {};
    const inscriptions =
      timelineSeries.inscriptions.length > 0
        ? timelineSeries.inscriptions
        : normalizeSeries(dashboardSeries?.inscriptions);
    const views =
      timelineSeries.views.length > 0
        ? timelineSeries.views
        : normalizeSeries(dashboardSeries?.views);
    const checkins =
      timelineSeries.checkins.length > 0
        ? timelineSeries.checkins
        : normalizeSeries(dashboardSeries?.checkins);

    const labels = [
      ...new Set([
        ...inscriptions.map((x) => x.label),
        ...views.map((x) => x.label),
        ...checkins.map((x) => x.label),
      ]),
    ];

    return labels.map((label, idx) => ({
      hourLabel: label,
      bucketDate:
        parseBucketLabelToDate(label, "hour") ||
        new Date(Date.now() + idx * 3600000),
      inscriptions: inscriptions.find((x) => x.label === label)?.value || 0,
      views: views.find((x) => x.label === label)?.value || 0,
      registrations: checkins.find((x) => x.label === label)?.value || 0,
    }));
  }

  function buildViewsLineData() {
    const granularity = viewGranularity === "hours" ? "hours" : "minutes";
    const fromRaw = buildLineDataFromRaw(
      rawViewsTimeline,
      granularity,
      "views",
    );
    if (fromRaw.length > 0) return fromRaw;

    const directViews = Array.isArray(timelineSeries?.views)
      ? timelineSeries.views
      : [];
    if (directViews.length > 0) {
      return directViews
        .map((row, idx) => ({
          hourLabel: row?.label || String(idx),
          bucketDate:
            parseBucketLabelToDate(row?.label || "", "hour") ||
            new Date(Date.now() + idx * 3600000),
          views: Number(row?.value ?? 0) || 0,
        }))
        .sort((a, b) => a.bucketDate - b.bucketDate);
    }

    const fallbackViews = normalizeSeries(dashboard?.activity_series?.views);
    return fallbackViews
      .map((row, idx) => ({
        hourLabel: row?.label || String(idx),
        bucketDate:
          parseBucketLabelToDate(row?.label || "", "hour") ||
          new Date(Date.now() + idx * 3600000),
        views: Number(row?.value ?? 0) || 0,
      }))
      .sort((a, b) => a.bucketDate - b.bucketDate);
  }

  function buildInscriptionsLineData() {
    const granularity = viewGranularity === "hours" ? "hours" : "minutes";
    const fromRaw = buildLineDataFromRaw(
      rawInscriptionsTimeline,
      granularity,
      "inscriptions",
    );
    if (fromRaw.length > 0) return fromRaw;

    const direct = Array.isArray(timelineSeries?.inscriptions)
      ? timelineSeries.inscriptions
      : [];
    if (direct.length > 0) {
      return direct
        .map((row, idx) => ({
          hourLabel: row?.label || String(idx),
          bucketDate:
            parseBucketLabelToDate(row?.label || "", "hour") ||
            new Date(Date.now() + idx * 3600000),
          inscriptions: Number(row?.value ?? 0) || 0,
        }))
        .sort((a, b) => a.bucketDate - b.bucketDate);
    }

    const fallback = normalizeSeries(dashboard?.activity_series?.inscriptions);
    return fallback
      .map((row, idx) => ({
        hourLabel: row?.label || String(idx),
        bucketDate:
          parseBucketLabelToDate(row?.label || "", "hour") ||
          new Date(Date.now() + idx * 3600000),
        inscriptions: Number(row?.value ?? 0) || 0,
      }))
      .sort((a, b) => a.bucketDate - b.bucketDate);
  }

  function buildCheckinsLineData() {
    const granularity = viewGranularity === "hours" ? "hours" : "minutes";
    const fromRaw = buildLineDataFromRaw(
      rawCheckinsTimeline,
      granularity,
      "checkins",
    );
    if (fromRaw.length > 0) return fromRaw;

    const direct = Array.isArray(timelineSeries?.checkins)
      ? timelineSeries.checkins
      : [];
    if (direct.length > 0) {
      return direct
        .map((row, idx) => ({
          hourLabel: row?.label || String(idx),
          bucketDate:
            parseBucketLabelToDate(row?.label || "", "hour") ||
            new Date(Date.now() + idx * 3600000),
          checkins: Number(row?.value ?? 0) || 0,
        }))
        .sort((a, b) => a.bucketDate - b.bucketDate);
    }

    const fallback = normalizeSeries(dashboard?.activity_series?.checkins);
    return fallback
      .map((row, idx) => ({
        hourLabel: row?.label || String(idx),
        bucketDate:
          parseBucketLabelToDate(row?.label || "", "hour") ||
          new Date(Date.now() + idx * 3600000),
        checkins: Number(row?.value ?? 0) || 0,
      }))
      .sort((a, b) => a.bucketDate - b.bucketDate);
  }

  function buildLineDataFromRaw(
    rawRows = [],
    granularity = "minutes",
    valueKey = "views",
  ) {
    const bucketMs = granularity === "minutes" ? 60_000 : 3_600_000;
    const rangeMs = granularity === "minutes" ? 3_600_000 : 86_400_000;

    const rawTs = (Array.isArray(rawRows) ? rawRows : [])
      .map((row) =>
        parseTimelineTsToMs(
          row?.ts ?? row?.timestamp ?? row?.created_at ?? row?.at,
        ),
      )
      .filter((ts) => Number.isFinite(ts))
      .sort((a, b) => a - b);

    const end = Math.floor(Date.now() / bucketMs) * bucketMs;
    const start = end - rangeMs + bucketMs;
    const grouped = new Map();

    for (let t = start; t <= end; t += bucketMs) {
      grouped.set(t, 0);
    }

    for (const ts of rawTs) {
      if (ts < start || ts > end + bucketMs - 1) continue;
      const key = Math.floor(ts / bucketMs) * bucketMs;
      grouped.set(key, (grouped.get(key) || 0) + 1);
    }

    return [...grouped.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([ts, value]) => ({
        hourLabel: new Date(ts).toISOString(),
        bucketDate: new Date(ts),
        [valueKey]: value,
      }));
  }

  function formatXAxisValue(v) {
    const dt = v instanceof Date ? v : new Date(v);
    if (Number.isNaN(dt.getTime())) return v;
    if (viewGranularity === "minutes") {
      return dt.toLocaleTimeString("es-MX", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      });
    }
    return dt.toLocaleString("es-MX", {
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
  }

  function buildRecentActivityItems(stack = []) {
    const rows = Array.isArray(stack) ? stack : [];

    return rows.map((row, index) => {
      const sourceType = row?.event_type || row?.type || "activity";
      const type = normalizeEventType(sourceType);
      const status = String(row?.status || "ok");
      const tsMs = parseTimelineTsToMs(row?.ts ?? row?.timestamp ?? row?.at);
      const when = Number.isFinite(tsMs)
        ? new Date(tsMs).toLocaleString("es-MX")
        : "Sin fecha";
      const eventMeta = getEventTypeMeta(type);

      return {
        id: String(
          row?.id ||
            row?.event_id ||
            `${row?.registration_id ?? "reg"}-${row?.user_id ?? "user"}-${type}-${status}-${tsMs ?? "na"}-${index}`,
        ),
        title: eventMeta.label,
        type,
        status,
        when,
        icon: eventMeta.icon,
        iconClass: eventMeta.iconClass,
      };
    });
  }

  function logViewsDebug(reason = "update") {
    if (typeof window === "undefined") return;

    const granularity = viewGranularity === "hours" ? "hours" : "minutes";
    const bucketMs = granularity === "minutes" ? 60_000 : 3_600_000;
    const rangeMs = granularity === "minutes" ? 3_600_000 : 86_400_000;
    const rawRows = Array.isArray(rawViewsTimeline) ? rawViewsTimeline : [];

    const parsed = rawRows.map((row) => {
      const rawValue = row?.ts ?? row?.timestamp ?? row?.created_at ?? row?.at;
      return {
        rawValue,
        ts: parseTimelineTsToMs(rawValue),
      };
    });

    const validTs = parsed
      .map((x) => x.ts)
      .filter((ts) => Number.isFinite(ts))
      .sort((a, b) => a - b);
    const invalidRows = parsed.filter((x) => !Number.isFinite(x.ts));

    const maxTs = validTs.length ? validTs[validTs.length - 1] : null;
    const minTs = validTs.length ? validTs[0] : null;

    let rangeStart = null;
    let rangeEnd = null;
    let inRange = 0;

    if (Number.isFinite(maxTs)) {
      rangeEnd = Math.floor(maxTs / bucketMs) * bucketMs;
      rangeStart = rangeEnd - rangeMs + bucketMs;
      inRange = validTs.filter(
        (ts) => ts >= rangeStart && ts <= rangeEnd + bucketMs - 1,
      ).length;
    }

    const signature = [
      reason,
      granularity,
      rawRows.length,
      validTs.length,
      invalidRows.length,
      inRange,
      viewsLineData.length,
      rangeStart,
      rangeEnd,
    ].join("|");

    if (signature === lastViewsDebugSignature) return;
    lastViewsDebugSignature = signature;

    console.groupCollapsed(`[AdminMetrics] Views debug (${reason})`);
    console.log("granularity:", granularity);
    console.log("raw total:", rawRows.length);
    console.log("valid ts:", validTs.length);
    console.log("invalid ts:", invalidRows.length);
    console.log("events in range:", inRange);
    console.log("line points:", viewsLineData.length);
    console.log(
      "views total:",
      viewsLineData.reduce(
        (acc, row) => acc + (Number(row?.views ?? 0) || 0),
        0,
      ),
    );
    console.log(
      "range start:",
      rangeStart ? new Date(rangeStart).toISOString() : null,
    );
    console.log(
      "range end:",
      rangeEnd ? new Date(rangeEnd).toISOString() : null,
    );
    console.log("min ts:", minTs ? new Date(minTs).toISOString() : null);
    console.log("max ts:", maxTs ? new Date(maxTs).toISOString() : null);
    console.log(
      "invalid sample:",
      invalidRows.slice(0, 5).map((x) => x.rawValue),
    );
    console.table(
      (viewsLineData || []).slice(0, 12).map((row) => ({
        bucketDate:
          row?.bucketDate instanceof Date
            ? row.bucketDate.toISOString()
            : String(row?.bucketDate),
        views: Number(row?.views ?? 0) || 0,
      })),
    );
    console.groupEnd();
  }

  $: hourlyLineData = buildHourlySeries();
  $: syncDashboardDerivedState(dashboard);
  $: recentActivityItems = buildRecentActivityItems(
    dashboard?.recent_activity_stack,
  );
  $: {
    const granularity = viewGranularity === "hours" ? "hours" : "minutes";
    const fromRaw = buildLineDataFromRaw(
      rawViewsTimeline,
      granularity,
      "views",
    );
    viewsLineData = fromRaw.length ? fromRaw : buildViewsLineData();
    const fromRawInscriptions = buildLineDataFromRaw(
      rawInscriptionsTimeline,
      granularity,
      "inscriptions",
    );
    inscriptionsLineData = fromRawInscriptions.length
      ? fromRawInscriptions
      : buildInscriptionsLineData();
    const fromRawCheckins = buildLineDataFromRaw(
      rawCheckinsTimeline,
      granularity,
      "checkins",
    );
    checkinsLineData = fromRawCheckins.length
      ? fromRawCheckins
      : buildCheckinsLineData();
  }
  $: if (hasDashboardLoaded) {
    viewGranularity;
    logViewsDebug("granularity-change");
  }
  const lineChartConfig = {
    views: { label: "Visualizaciones", color: "var(--chart-2)" },
  };

  const inscriptionsChartConfig = {
    inscriptions: { label: "Inscripciones", color: "var(--chart-1)" },
  };

  const checkinsChartConfig = {
    checkins: { label: "Check-ins", color: "var(--chart-3)" },
  };

  async function loadDashboard(showLoading = true) {
    if (!eventId) return;
    if (showLoading) loading = true;
    if (!showLoading) refreshing = true;
    error = "";

    try {
      const [dashboardRes, insTimeline, viewTimeline, checkinTimeline] =
        await Promise.all([
          getEventDashboard(eventId, {
            sessionId: selectedSessionId,
            recentLimit: 30,
          }),
          getEventTimeline(eventId, {
            type: "inscriptions",
            limit: 2000,
          }).catch(() => ({ timeline: [] })),
          getEventTimeline(eventId, {
            type: "views",
            limit: 2000,
          }).catch(() => ({ timeline: [] })),
          getEventTimeline(eventId, {
            type: "checkins",
            limit: 2000,
          }).catch(() => ({ timeline: [] })),
        ]);

      const normalizedDashboard = normalizeDashboardResponse(dashboardRes);
      dashboard = {
        ...createEmptyDashboard(),
        ...normalizedDashboard,
        live: {
          ...createEmptyDashboard().live,
          ...(normalizedDashboard?.live || {}),
          stats: {
            ...createEmptyDashboard().live.stats,
            ...(normalizedDashboard?.live?.stats || {}),
          },
        },
        registration_stats: {
          ...createEmptyDashboard().registration_stats,
          ...(normalizedDashboard?.registration_stats || {}),
        },
      };
      syncDashboardDerivedState(dashboard);
      hasDashboardLoaded = true;
      if (
        selectedSessionId == null &&
        Number.isInteger(Number(normalizedDashboard?.live?.session?.id))
      ) {
        selectedSessionId = Number(normalizedDashboard.live.session.id);
      }
      rawInscriptionsTimeline = Array.isArray(insTimeline?.timeline)
        ? insTimeline.timeline
        : [];
      rawViewsTimeline = Array.isArray(viewTimeline?.timeline)
        ? viewTimeline.timeline
        : [];
      rawCheckinsTimeline = Array.isArray(checkinTimeline?.timeline)
        ? checkinTimeline.timeline
        : [];
      timelineSeries = {
        inscriptions: aggregateTimelineByBucket(
          insTimeline?.timeline || [],
          "hour",
        ),
        views: aggregateTimelineByBucket(viewTimeline?.timeline || [], "hour"),
        checkins: aggregateTimelineByBucket(
          checkinTimeline?.timeline || [],
          "hour",
        ),
      };

      const granularity = viewGranularity === "hours" ? "hours" : "minutes";
      const fromRaw = buildLineDataFromRaw(
        rawViewsTimeline,
        granularity,
        "views",
      );
      viewsLineData = fromRaw.length ? fromRaw : buildViewsLineData();
      const fromRawInscriptions = buildLineDataFromRaw(
        rawInscriptionsTimeline,
        granularity,
        "inscriptions",
      );
      inscriptionsLineData = fromRawInscriptions.length
        ? fromRawInscriptions
        : buildInscriptionsLineData();
      const fromRawCheckins = buildLineDataFromRaw(
        rawCheckinsTimeline,
        granularity,
        "checkins",
      );
      checkinsLineData = fromRawCheckins.length
        ? fromRawCheckins
        : buildCheckinsLineData();
      await tick();
      if (DEBUG_DASHBOARD_LOGS) {
        console.groupCollapsed("[AdminMetrics] Dashboard loaded");
        console.log("payload", dashboardRes);
        console.log("normalizedDashboard", normalizedDashboard);
        console.log("stack", dashboard?.recent_activity_stack || []);
        console.log(
          "stack length",
          Array.isArray(dashboard?.recent_activity_stack)
            ? dashboard.recent_activity_stack.length
            : 0,
        );
        console.log("recentActivityItems", recentActivityItems);
        console.groupEnd();
      }
      logViewsDebug("load-dashboard");
    } catch (e) {
      error = getErrorMessage(e);
      inscriptionsLineData = [];
      viewsLineData = [];
      checkinsLineData = [];
    } finally {
      if (showLoading) loading = false;
      if (!showLoading) refreshing = false;
    }
  }

  onMount(() => {
    loadDashboard(true);
    intervalId = setInterval(() => loadDashboard(false), AUTO_REFRESH_MS);

    return () => {
      if (intervalId) clearInterval(intervalId);
      if (cooldownIntervalId) clearInterval(cooldownIntervalId);
    };
  });
</script>

<div class="mx-auto w-full max-w-screen-xl px-4 pb-16 pt-6 sm:px-6 lg:px-8">
  <div class="flex items-center justify-between gap-3">
    <h1 class="text-2xl font-semibold tracking-tight sm:text-3xl">
      AdminMetrics · {eventTitle()}
    </h1>
    <div class="flex items-center gap-2">
      <Button
        variant="outline"
        class="rounded-xl"
        onclick={handleManualRefresh}
        disabled={loading || refreshCooldownSeconds > 0}
      >
        <RefreshCcw class="mr-2 h-4 w-4" />
        {refreshing
          ? "Actualizando..."
          : refreshCooldownSeconds > 0
            ? `Actualizar (${refreshCooldownSeconds}s)`
            : "Actualizar"}
      </Button>
      <Button variant="outline" class="rounded-xl" onclick={goBack}>
        <ArrowLeft class="mr-2 h-4 w-4" />
        Volver
      </Button>
    </div>
  </div>

  {#if dashboard?.event}
    <div
      class="mt-3 flex flex-wrap items-center gap-2 text-sm text-muted-foreground"
    >
      <Badge class="rounded-full bg-slate-100 text-slate-700 hover:bg-slate-100"
        >{dashboard.event.status || "unknown"}</Badge
      >
      <span>Modo de registro: {dashboard.event.registration_mode || "N/A"}</span
      >
      <span>•</span>
      <span>{eventDateRange()}</span>
    </div>
  {/if}

  {#if error}
    <div class="mt-3 text-sm font-semibold text-red-600">{error}</div>
  {/if}

  {#if loading}
    <div class="mt-4 text-sm text-muted-foreground">Cargando dashboard...</div>
  {:else if dashboard}
    <div class="mt-4 grid gap-4">
      <Card>
        <CardContent class="p-4">
          <div class="mb-3 text-sm font-semibold">
            Estado general del evento
          </div>
          <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div
              class="flex items-center justify-between rounded-lg border p-3"
            >
              <div
                class="flex items-center gap-2 text-sm text-muted-foreground"
              >
                <Users class="h-4 w-4 text-slate-600" />Inscritos
              </div>
              <div class="text-xl font-semibold">
                {dashboardRegistrationStats?.registrations_count ?? 0}
              </div>
            </div>
            <div
              class="flex items-center justify-between rounded-lg border p-3"
            >
              <div
                class="flex items-center gap-2 text-sm text-muted-foreground"
              >
                <UserCheck class="h-4 w-4 text-emerald-600" />Aprobados
              </div>
              <div class="text-xl font-semibold">
                {dashboardRegistrationStats?.approved_count ?? 0}
              </div>
            </div>
            <div
              class="flex items-center justify-between rounded-lg border p-3"
            >
              <div
                class="flex items-center gap-2 text-sm text-muted-foreground"
              >
                <Clock3 class="h-4 w-4 text-amber-600" />Pendientes
              </div>
              <div class="text-xl font-semibold">
                {dashboardRegistrationStats?.pending_count ?? 0}
              </div>
            </div>
            <div
              class="flex items-center justify-between rounded-lg border p-3"
            >
              <div
                class="flex items-center gap-2 text-sm text-muted-foreground"
              >
                <CheckCircle2 class="h-4 w-4 text-emerald-600" />Aceptados
              </div>
              <div class="text-xl font-semibold">
                {dashboardLiveStats?.accepted ?? 0}
              </div>
            </div>
            <div
              class="flex items-center justify-between rounded-lg border p-3"
            >
              <div
                class="flex items-center gap-2 text-sm text-muted-foreground"
              >
                <XCircle class="h-4 w-4 text-red-600" />Rechazados
              </div>
              <div class="text-xl font-semibold">
                {dashboardLiveStats?.rejected ?? 0}
              </div>
            </div>
            <div
              class="flex items-center justify-between rounded-lg border p-3"
            >
              <div
                class="flex items-center gap-2 text-sm text-muted-foreground"
              >
                <Copy class="h-4 w-4 text-orange-500" />Duplicados
              </div>
              <div class="text-xl font-semibold">
                {dashboardLiveStats?.duplicate ?? 0}
              </div>
            </div>
            <div
              class="flex items-center justify-between rounded-lg border p-3"
            >
              <div
                class="flex items-center gap-2 text-sm text-muted-foreground"
              >
                <AlertTriangle class="h-4 w-4 text-rose-600" />Inválidos
              </div>
              <div class="text-xl font-semibold">
                {(dashboardLiveStats?.invalid_ticket ?? 0) +
                  (dashboardLiveStats?.cancelled_ticket ?? 0)}
              </div>
            </div>
            <div
              class="flex items-center justify-between rounded-lg border p-3"
            >
              <div
                class="flex items-center gap-2 text-sm text-muted-foreground"
              >
                <ScanLine class="h-4 w-4 text-cyan-600" />Total intentos
              </div>
              <div class="text-xl font-semibold">
                {dashboardLiveStats?.total ?? 0}
              </div>
            </div>
            <div
              class="flex items-center justify-between rounded-lg border p-3"
            >
              <div
                class="flex items-center gap-2 text-sm text-muted-foreground"
              >
                <Users class="h-4 w-4 text-blue-600" />Presentes
              </div>
              <div class="text-xl font-semibold">
                {dashboardLiveStats?.present_users ?? 0}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <div class="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardContent class="p-4">
            <div class="mb-3 flex items-center justify-between gap-2">
              <div class="text-sm font-semibold">Visualizaciones</div>
              <div class="flex items-center gap-2">
                <select
                  id="views-granularity"
                  bind:value={viewGranularity}
                  class="h-9 rounded-md border border-input bg-background px-2 text-sm"
                >
                  <option value="minutes">Última hora</option>
                  <option value="hours">Últimas 24h</option>
                </select>
              </div>
            </div>
            <Chart.Container
              config={lineChartConfig}
              class="h-[350px] max-h-[350px] w-full"
            >
              <AreaChart
                data={viewsLineData}
                x="bucketDate"
                xScale={scaleTime()}
                y="views"
                yDomain={[0, null]}
                yNice
                axis="x"
                points={false}
                legend
                series={[
                  {
                    key: "views",
                    label: lineChartConfig.views.label,
                    color: lineChartConfig.views.color,
                    value: (d) => Number(d?.views ?? 0) || 0,
                  },
                ]}
                props={{
                  area: {
                    fillOpacity: 0.22,
                    line: {
                      //curve: curveNatural,
                      strokeWidth: 2.5,
                    },
                  },
                  xAxis: {
                    format: formatXAxisValue,
                  },
                }}
              >
                {#snippet tooltip()}
                  <Chart.Tooltip />
                {/snippet}
              </AreaChart>
            </Chart.Container>
          </CardContent>
        </Card>

        <Card>
          <CardContent class="p-4">
            <div class="mb-3 flex items-center justify-between gap-2">
              <div class="text-sm font-semibold">Inscripciones</div>
            </div>
            <Chart.Container
              config={inscriptionsChartConfig}
              class="h-[350px] max-h-[350px] w-full"
            >
              <AreaChart
                data={inscriptionsLineData}
                x="bucketDate"
                xScale={scaleTime()}
                y="inscriptions"
                yDomain={[0, null]}
                yNice
                axis="x"
                points={false}
                legend
                series={[
                  {
                    key: "inscriptions",
                    label: inscriptionsChartConfig.inscriptions.label,
                    color: inscriptionsChartConfig.inscriptions.color,
                    value: (d) => Number(d?.inscriptions ?? 0) || 0,
                  },
                ]}
                props={{
                  area: {
                    fillOpacity: 0.22,
                    line: {
                      //curve: curveNatural,
                      strokeWidth: 2.5,
                    },
                  },
                  xAxis: {
                    format: formatXAxisValue,
                  },
                }}
              >
                {#snippet tooltip()}
                  <Chart.Tooltip />
                {/snippet}
              </AreaChart>
            </Chart.Container>
          </CardContent>
        </Card>

        <Card>
          <CardContent class="p-4">
            <div class="mb-3 flex items-center justify-between gap-2">
              <div class="text-sm font-semibold">Check-ins</div>
            </div>
            <Chart.Container
              config={checkinsChartConfig}
              class="h-[350px] max-h-[350px] w-full"
            >
              <AreaChart
                data={checkinsLineData}
                x="bucketDate"
                xScale={scaleTime()}
                y="checkins"
                yDomain={[0, null]}
                yNice
                axis="x"
                points={false}
                legend
                series={[
                  {
                    key: "checkins",
                    label: checkinsChartConfig.checkins.label,
                    color: checkinsChartConfig.checkins.color,
                    value: (d) => Number(d?.checkins ?? 0) || 0,
                  },
                ]}
                props={{
                  area: {
                    fillOpacity: 0.22,
                    line: {
                      //curve: curveNatural,
                      strokeWidth: 2.5,
                    },
                  },
                  xAxis: {
                    format: formatXAxisValue,
                  },
                }}
              >
                {#snippet tooltip()}
                  <Chart.Tooltip />
                {/snippet}
              </AreaChart>
            </Chart.Container>
          </CardContent>
        </Card>

        <Card>
          <CardContent class="p-4 pt-0">
            <div class="mb-3 flex items-center justify-between gap-2">
              <div class="text-sm font-semibold mb-3">
                Stack de últimas actividades
              </div>
          
            </div>

            {#if !recentActivityItems.length}
              <div class="text-sm text-muted-foreground">
                Sin actividad reciente para mostrar.
              </div>
            {:else}
              <div
                class="h-[350px] max-h-[350px] space-y-2 overflow-y-auto pr-1"
              >
                {#each recentActivityItems as item (item.id)}
                  <div class="flex items-start gap-3 rounded-lg border p-3">
                    <div
                      class="mt-0.5 flex h-8 w-8 items-center justify-center rounded-full bg-slate-100"
                    >
                      <svelte:component
                        this={item.icon}
                        class={`h-4 w-4 ${item.iconClass}`}
                      />
                    </div>
                    <div class="min-w-0">
                      <div class="text-sm font-medium">{item.title}</div>
                      <div class="text-xs text-muted-foreground">
                        {item.when}
                      </div>
                    </div>
                  </div>
                {/each}
              </div>
            {/if}
          </CardContent>
        </Card>
      </div>
    </div>
  {/if}
</div>
