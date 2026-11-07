<script>
  import { onMount, tick } from "svelte";
  import { dev } from "$app/environment";
  import { goto } from "$app/navigation";
  import { Button } from "$lib/components/ui/button";
  import { Card, CardContent } from "$lib/components/ui/card";
  import { Badge } from "$lib/components/ui/badge";
  import * as Chart from "$lib/components/ui/chart/index.js";
  import { AreaChart } from "layerchart";
  import { scaleTime } from "d3-scale";
  import {
    getEventDashboard,
    getEventReport,
    getEventTimeline,
  } from "$lib/services/adminEventsApi";
  import { isPastEvent } from "$lib/utils/events.js";
  import { downloadCsv } from "$lib/utils/csv.js";
  import { buildEventReportCsv, careerBreakdown, eventReportFilename, formatCheckinDateTime, summarizeEventReport } from "$lib/utils/eventReport.js";
  import {
    EVENT_REGISTRATION_MODE_CATALOG,
    EVENT_STATUS_CATALOG,
    catalogLabel,
  } from "../../routes/store";
  import {
    ArrowLeft,
    Download,
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
        pending_count: 0,
        rejected_checkins_count: 0,
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
  let lastViewsDebugSignature = "";
  let refreshCooldownSeconds = 0;
  let hasDashboardLoaded = false;
  let intervalId;
  let cooldownIntervalId;
  let downloadingReport = false;
  let reportRows = [];
  let reportFilter = "all";
  let reportSearch = "";
  const DEBUG_DASHBOARD_LOGS = dev;

  $: eventFinished = Boolean(dashboard?.event) && isPastEvent(dashboard.event);
  $: reportSummary = summarizeEventReport(reportRows);
  $: reportCareers = careerBreakdown(reportRows);
  $: visibleReportRows = filterReportRows(reportRows, reportFilter, reportSearch);

  function filterReportRows(rows, filter, search) {
    const term = search.trim().toLowerCase();
    return rows.filter((row) => {
      if (filter === "attended" && !row.check_in) return false;
      if (filter === "absent" && row.check_in) return false;
      if (!term) return true;
      return [row.numero_cuenta, row.correo, row.carrera].some((value) => String(value || "").toLowerCase().includes(term));
    });
  }

  async function downloadReport() {
    if (downloadingReport) return;
    downloadingReport = true;
    try {
      const res = await getEventReport(eventId);
      downloadCsv(buildEventReportCsv(res?.rows), eventReportFilename(eventId));
    } catch (e) {
      error = e?.message || "No se pudo descargar el reporte.";
    } finally {
      downloadingReport = false;
    }
  }

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

  function eventTitle(source) {
    return source?.event?.title || `Evento ${eventId || ""}`;
  }

  function eventDateRange(source) {
    const startsAt = source?.event?.starts_at
      ? new Date(source.event.starts_at)
      : null;
    const endsAt = source?.event?.ends_at
      ? new Date(source.event.ends_at)
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
      return e?.message || "No tienes permisos para ver estas métricas.";
    if (e?.status === 404) return e?.message || "Evento no encontrado.";
    if (e?.status >= 500)
      return e?.message || "Error del servidor al cargar métricas.";
    return e?.message || "No se pudo cargar el panel de métricas del evento.";
  }

  function normalizeDashboardResponse(payload) {
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
    const stats = source?.registration_stats || {};
    dashboardRegistrationStats = {
      pending_count: Number(stats.pending_count ?? 0) || 0,
      rejected_checkins_count: Number(stats.rejected_checkins_count ?? 0) || 0,
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

    if (!DEBUG_DASHBOARD_LOGS || signature === lastViewsDebugSignature) return;
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
      const [dashboardRes, insTimeline, viewTimeline, checkinTimeline, reportRes] =
        await Promise.all([
          getEventDashboard(eventId),
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
          getEventReport(eventId).catch(() => null),
        ]);

      if (reportRes) reportRows = Array.isArray(reportRes.rows) ? reportRes.rows : [];

      const normalizedDashboard = normalizeDashboardResponse(dashboardRes);
      dashboard = {
        ...createEmptyDashboard(),
        ...normalizedDashboard,
        registration_stats: {
          ...createEmptyDashboard().registration_stats,
          ...(normalizedDashboard?.registration_stats || {}),
        },
      };
      syncDashboardDerivedState(dashboard);
      hasDashboardLoaded = true;
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
  <div class="flex flex-wrap items-center justify-between gap-3">
    <h1 class="min-w-0 text-xl font-semibold tracking-tight [overflow-wrap:anywhere] sm:text-3xl">
      Métricas · {eventTitle(dashboard)}
    </h1>
    <div class="flex w-full items-center gap-2 sm:w-auto">
      <Button variant="outline" class="rounded-xl" onclick={goBack} aria-label="Volver">
        <ArrowLeft class="h-4 w-4 sm:mr-2" />
        <span class="hidden sm:inline">Volver</span>
      </Button>
      <Button
        variant="outline"
        class="rounded-xl"
        onclick={handleManualRefresh}
        disabled={loading || refreshCooldownSeconds > 0}
        aria-label="Actualizar"
      >
        <RefreshCcw class="h-4 w-4 sm:mr-2" />
        <span class="hidden sm:inline">
          {refreshing
            ? "Actualizando..."
            : refreshCooldownSeconds > 0
              ? `Actualizar (${refreshCooldownSeconds}s)`
              : "Actualizar"}
        </span>
      </Button>
      {#if eventFinished}
        <Button
          class="flex-1 rounded-xl bg-blue-600 text-white hover:bg-blue-700 sm:flex-none"
          onclick={downloadReport}
          disabled={downloadingReport}
        >
          <Download class="mr-2 h-4 w-4" />
          {downloadingReport ? "Descargando..." : "Descargar reporte"}
        </Button>
      {/if}
    </div>
  </div>

  {#if dashboard?.event}
    <div
      class="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground"
    >
      <Badge class="rounded-full bg-slate-100 text-slate-700 hover:bg-slate-100"
        >{catalogLabel(EVENT_STATUS_CATALOG, dashboard.event.status)}</Badge
      >
      <span>Modo de registro: {catalogLabel(EVENT_REGISTRATION_MODE_CATALOG, dashboard.event.registration_mode)}</span
      >
      <span class="hidden sm:inline">•</span>
      <span class="w-full sm:w-auto">{eventDateRange(dashboard)}</span>
    </div>
  {/if}

  {#if error}
    <div class="mt-3 text-sm font-semibold text-red-600">{error}</div>
  {/if}

  {#if loading}
    <div class="mt-4 text-sm text-muted-foreground">Cargando métricas...</div>
  {:else if dashboard}
    <div class="mt-4 grid grid-cols-[minmax(0,1fr)] gap-4">
      <div class="grid grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-2">
        <Card>
          <CardContent class="p-3 sm:p-4">
            <div class="mb-3 text-sm font-semibold">Estado general del evento</div>
            <div class="grid grid-cols-3 gap-2 sm:gap-3" data-testid="metrics-kpis">
              <div class="rounded-lg border p-2 sm:p-3">
                <div class="flex items-center gap-2 text-xs leading-tight text-muted-foreground sm:text-sm">
                  <Users class="hidden h-4 w-4 text-slate-600 sm:block" />Inscritos
                </div>
                <div class="mt-1 text-xl font-semibold sm:text-2xl">{reportSummary.registered}</div>
              </div>
              <div class="rounded-lg border border-emerald-200 bg-emerald-50 p-2 sm:p-3">
                <div class="flex items-center gap-2 text-xs leading-tight text-emerald-700 sm:text-sm">
                  <UserCheck class="hidden h-4 w-4 sm:block" />Asistieron
                </div>
                <div class="mt-1 text-xl font-semibold text-emerald-700 sm:text-2xl">{reportSummary.attended}</div>
              </div>
              <div class="rounded-lg border border-amber-200 bg-amber-50 p-2 sm:p-3">
                <div class="flex items-center gap-2 text-xs leading-tight text-amber-700 sm:text-sm">
                  <UserMinus class="hidden h-4 w-4 sm:block" />Sin asistencia
                </div>
                <div class="mt-1 text-xl font-semibold text-amber-700 sm:text-2xl">{reportSummary.absent}</div>
              </div>
              {#if dashboard?.event?.registration_mode === "manual_review"}
                <div class="rounded-lg border p-2 sm:p-3">
                  <div class="flex items-center gap-2 text-xs leading-tight text-muted-foreground sm:text-sm">
                    <Clock3 class="hidden h-4 w-4 text-amber-600 sm:block" />Pendientes de aprobación
                  </div>
                  <div class="mt-1 text-xl font-semibold sm:text-2xl">{dashboardRegistrationStats?.pending_count ?? 0}</div>
                </div>
              {/if}
              {#if (dashboardRegistrationStats?.rejected_checkins_count ?? 0) > 0}
                <div class="rounded-lg border p-2 sm:p-3">
                  <div class="flex items-center gap-2 text-xs leading-tight text-muted-foreground sm:text-sm">
                    <XCircle class="hidden h-4 w-4 text-red-600 sm:block" />Check-ins rechazados
                  </div>
                  <div class="mt-1 text-xl font-semibold sm:text-2xl">{dashboardRegistrationStats.rejected_checkins_count}</div>
                </div>
              {/if}
            </div>
            <div class="mt-4">
              <div class="mb-1 flex justify-between text-sm">
                <span class="text-muted-foreground">Asistencia</span>
                <span class="font-semibold">{reportSummary.rate}%</span>
              </div>
              <div class="h-3 overflow-hidden rounded-full bg-slate-100">
                <div class="h-full rounded-full bg-emerald-500 transition-all" style={`width: ${reportSummary.rate}%`}></div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent class="p-4">
            <div class="mb-3 text-sm font-semibold">Por carrera</div>
            {#if !reportCareers.length}
              <div class="text-sm text-muted-foreground">Sin inscritos todavía.</div>
            {:else}
              <div class="max-h-[220px] space-y-3 overflow-y-auto pr-1" data-testid="metrics-career-breakdown">
                {#each reportCareers as item (item.career)}
                  <div>
                    <div class="flex items-baseline justify-between gap-3 text-sm">
                      <span class="min-w-0 truncate" title={item.career}>{item.career}</span>
                      <span class="shrink-0 tabular-nums text-muted-foreground">
                        {item.attended} de {item.registered} · {item.rate}%
                      </span>
                    </div>
                    <div class="mt-1 h-2 overflow-hidden rounded-full bg-slate-100">
                      <div class="h-full rounded-full bg-blue-500" style={`width: ${item.rate}%`}></div>
                    </div>
                  </div>
                {/each}
              </div>
            {/if}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent class="p-4">
          <div class="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div class="text-sm font-semibold">Lista de inscritos</div>
            <div class="flex w-full items-center gap-2 sm:w-auto">
              <input
                type="search"
                bind:value={reportSearch}
                placeholder="Buscar cuenta, correo o carrera"
                aria-label="Buscar inscrito"
                class="h-9 min-w-0 flex-1 rounded-md border border-input bg-background px-3 text-sm sm:w-56 sm:flex-none"
              />
              <select
                bind:value={reportFilter}
                aria-label="Filtrar por asistencia"
                class="h-9 rounded-md border border-input bg-background px-2 text-sm"
              >
                <option value="all">Todos</option>
                <option value="attended">Asistieron</option>
                <option value="absent">Sin asistencia</option>
              </select>
            </div>
          </div>
          {#if !visibleReportRows.length}
            <div class="py-6 text-center text-sm text-muted-foreground">
              {reportRows.length ? "Ningún inscrito coincide con el filtro." : "Este evento aún no tiene inscritos."}
            </div>
          {:else}
            <ul class="max-h-[480px] divide-y overflow-y-auto rounded-lg border sm:hidden" data-testid="metrics-registrants-list">
              {#each visibleReportRows as row, index (`m-${row.correo}-${index}`)}
                <li class="space-y-1 p-3 text-sm">
                  <div class="flex items-center justify-between gap-2">
                    <span class="font-semibold tabular-nums">{row.numero_cuenta || "Sin número de cuenta"}</span>
                    {#if row.check_in}
                      <Badge class="rounded-full bg-emerald-100 text-emerald-800 hover:bg-emerald-100">Asistió</Badge>
                    {:else}
                      <Badge class="rounded-full bg-slate-100 text-slate-600 hover:bg-slate-100">Sin asistencia</Badge>
                    {/if}
                  </div>
                  <div class="text-muted-foreground [overflow-wrap:anywhere]">{row.correo || ""}</div>
                  {#if row.carrera}<div class="text-xs text-muted-foreground">{row.carrera}</div>{/if}
                  {#each row.checkins || [] as checkin}
                    <div class="text-xs tabular-nums text-emerald-700">Check-in: {formatCheckinDateTime(checkin)}</div>
                  {/each}
                </li>
              {/each}
            </ul>
            <div class="hidden max-h-[420px] overflow-auto rounded-lg border sm:block">
              <table class="w-full min-w-[720px] text-left text-sm" data-testid="metrics-registrants-table">
                <thead class="sticky top-0 border-b bg-slate-50 text-xs uppercase text-muted-foreground">
                  <tr>
                    <th class="px-3 py-2 font-medium">Número de cuenta</th>
                    <th class="px-3 py-2 font-medium">Correo</th>
                    <th class="px-3 py-2 font-medium">Carrera</th>
                    <th class="px-3 py-2 font-medium">Check-in</th>
                    <th class="px-3 py-2 font-medium">Fecha y hora</th>
                  </tr>
                </thead>
                <tbody>
                  {#each visibleReportRows as row, index (`${row.correo}-${index}`)}
                    <tr class="border-b last:border-0">
                      <td class="px-3 py-2 font-medium tabular-nums">{row.numero_cuenta || ""}</td>
                      <td class="px-3 py-2 [overflow-wrap:anywhere]">{row.correo || ""}</td>
                      <td class="px-3 py-2">{row.carrera || ""}</td>
                      <td class="px-3 py-2">
                        {#if row.check_in}
                          <Badge class="rounded-full bg-emerald-100 text-emerald-800 hover:bg-emerald-100">Sí</Badge>
                        {:else}
                          <Badge class="rounded-full bg-slate-100 text-slate-600 hover:bg-slate-100">No</Badge>
                        {/if}
                      </td>
                      <td class="whitespace-nowrap px-3 py-2 tabular-nums">
                        {#each row.checkins || [] as checkin}
                          <div>{formatCheckinDateTime(checkin)}</div>
                        {/each}
                      </td>
                    </tr>
                  {/each}
                </tbody>
              </table>
            </div>
          {/if}
        </CardContent>
      </Card>

      <div class="grid grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-2">
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
              class="h-[220px] max-h-[220px] w-full sm:h-[350px] sm:max-h-[350px]"
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
              class="h-[220px] max-h-[220px] w-full sm:h-[350px] sm:max-h-[350px]"
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
              class="h-[220px] max-h-[220px] w-full sm:h-[350px] sm:max-h-[350px]"
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
                class="max-h-[280px] space-y-2 overflow-y-auto pr-1 sm:h-[350px] sm:max-h-[350px]"
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
