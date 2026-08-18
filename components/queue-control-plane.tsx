"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import {
  Activity,
  AlertTriangle,
  Bell,
  BookOpen,
  Boxes,
  CheckCircle2,
  CircleHelp,
  ClipboardList,
  Command,
  ExternalLink,
  Gauge,
  Hexagon,
  LayoutDashboard,
  Menu,
  Plus,
  Search,
  ServerCog,
  ShieldCheck,
  Sparkles,
  UserRound,
  X,
} from "lucide-react";
import { mockAuditEvents, mockQueues, type AuditEvent } from "@/lib/mock-data";
import { percent, type KaiQueue, type QueueInput, type ResourceSample } from "@/lib/domain/queue";
import { OverviewPage } from "@/components/overview-page";
import { QueuesPage } from "@/components/queues-page";
import { AuditPage } from "@/components/audit-page";
import { QueueFormDialog } from "@/components/queue-form-dialog";
import { DeleteQueueDialog } from "@/components/delete-queue-dialog";
import type { ClusterCapacity } from "@/lib/kai/capacity";
import { DEFAULT_UI_CONFIG, type UiBootstrap, type UiConfig, type UiIdentity } from "@/lib/ui-config";

type View = "overview" | "queues" | "audit" | "cluster";

const navItems: Array<{ id: View; label: string; icon: typeof Gauge }> = [
  { id: "overview", label: "Overview", icon: LayoutDashboard },
  { id: "queues", label: "Queues", icon: Boxes },
  { id: "audit", label: "Audit log", icon: ClipboardList },
  { id: "cluster", label: "Cluster", icon: ServerCog },
];

type TelemetryState = { metricsServer: boolean; sampledAt?: string };
type ShellPanel = "help" | "notifications" | "user" | null;

function queueToInput(queue: KaiQueue): QueueInput {
  return {
    name: queue.name,
    displayName: queue.displayName,
    parentQueue: queue.parentQueue,
    priority: queue.priority,
    preemptMinRuntime: queue.preemptMinRuntime,
    reclaimMinRuntime: queue.reclaimMinRuntime,
    labels: queue.labels,
    resourceVersion: queue.resourceVersion,
    resources: {
      cpu: { quota: queue.resources.cpu.quota, limit: queue.resources.cpu.limit, overQuotaWeight: queue.resources.cpu.overQuotaWeight },
      memory: { quota: queue.resources.memory.quota, limit: queue.resources.memory.limit, overQuotaWeight: queue.resources.memory.overQuotaWeight },
      gpu: { quota: queue.resources.gpu.quota, limit: queue.resources.gpu.limit, overQuotaWeight: queue.resources.gpu.overQuotaWeight },
    },
  };
}

export function QueueControlPlane() {
  const [view, setView] = useState<View>("overview");
  const [queues, setQueues] = useState<KaiQueue[]>(mockQueues);
  const [auditEvents, setAuditEvents] = useState<AuditEvent[]>(mockAuditEvents);
  const [selectedName, setSelectedName] = useState("");
  const [form, setForm] = useState<{ mode: "create" | "edit"; queue?: KaiQueue } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<KaiQueue | null>(null);
  const [mobileNav, setMobileNav] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [clusterName, setClusterName] = useState("connecting…");
  const [dataMode, setDataMode] = useState<"mock" | "kubernetes">("mock");
  const [csrfToken, setCsrfToken] = useState("");
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [capacity, setCapacity] = useState<ClusterCapacity>({ cpu: 480, memory: 1900, gpu: 72, nodes: 64 });
  const [uiConfig, setUiConfig] = useState<UiConfig>(DEFAULT_UI_CONFIG);
  const [identity, setIdentity] = useState<UiIdentity>({ username: "local-admin", displayName: DEFAULT_UI_CONFIG.identity.fallbackDisplayName, role: DEFAULT_UI_CONFIG.identity.fallbackRole, source: "local-development" });
  const [telemetry, setTelemetry] = useState<TelemetryState>({ metricsServer: false });
  const [usageHistory, setUsageHistory] = useState<ResourceSample[]>([]);
  const [shellPanel, setShellPanel] = useState<ShellPanel>(null);
  const [globalQuery, setGlobalQuery] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);
  const selectedQueue = useMemo(() => queues.find((queue) => queue.name === selectedName), [queues, selectedName]);
  const visibleNavItems = navItems.filter((item) => item.id !== "audit" || uiConfig.features.showAudit).filter((item) => item.id !== "cluster" || uiConfig.features.showCluster);
  const effectiveView: View = (!uiConfig.features.showAudit && view === "audit") || (!uiConfig.features.showCluster && view === "cluster") ? "overview" : view;
  const alerts = useMemo(() => buildAlerts(queues, connectionError, telemetry.metricsServer), [queues, connectionError, telemetry.metricsServer]);
  const globalMatches = useMemo(() => {
    const normalized = globalQuery.trim().toLowerCase();
    if (normalized.length < 2) return { queues: [] as KaiQueue[], audit: [] as AuditEvent[] };
    return {
      queues: queues.filter((queue) => `${queue.name} ${queue.displayName} ${queue.parentQueue ?? ""}`.toLowerCase().includes(normalized)).slice(0, 5),
      audit: auditEvents.filter((event) => `${event.actor} ${event.queueName} ${event.action} ${event.summary}`.toLowerCase().includes(normalized)).slice(0, 3),
    };
  }, [globalQuery, queues, auditEvents]);

  useEffect(() => {
    const controller = new AbortController();
    async function loadBootstrap() {
      try {
        const [configResponse, auditResponse] = await Promise.all([
          fetch("/api/config", { signal: controller.signal, cache: "no-store" }),
          fetch("/api/audit?limit=100", { signal: controller.signal, cache: "no-store" }),
        ]);
        if (!configResponse.ok) throw new Error((await configResponse.json()).error ?? "Could not load application configuration");
        const bootstrap = await configResponse.json() as UiBootstrap;
        setUiConfig(bootstrap.config);
        setIdentity(bootstrap.identity);
        if (auditResponse.ok) setAuditEvents(((await auditResponse.json()) as { items: AuditEvent[] }).items);
      } catch (error) {
        if ((error as Error).name === "AbortError") return;
        setConnectionError(error instanceof Error ? error.message : "Connection failed");
      }
    }
    void loadBootstrap();
    return () => controller.abort();
  }, []);

  useEffect(() => {
    document.title = uiConfig.branding.appName;
  }, [uiConfig.branding.appName]);

  useEffect(() => {
    const controller = new AbortController();
    let loading = false;
    async function loadQueues() {
      if (loading) return;
      loading = true;
      try {
        const queueResponse = await fetch("/api/queues", { signal: controller.signal, cache: "no-store" });
        if (!queueResponse.ok) throw new Error((await queueResponse.json()).error ?? "Could not connect to the queue API");
        const queuePayload = await queueResponse.json() as { items: KaiQueue[]; capacity: ClusterCapacity; cluster: string; mode: "mock" | "kubernetes"; csrfToken: string; telemetry?: TelemetryState };
        setQueues(queuePayload.items);
        setClusterName(queuePayload.cluster);
        setDataMode(queuePayload.mode);
        setCsrfToken(queuePayload.csrfToken);
        const nextTelemetry = queuePayload.telemetry ?? { metricsServer: false };
        setTelemetry(nextTelemetry);
        if (queuePayload.capacity) setCapacity(queuePayload.capacity);
        setUsageHistory((current) => appendResourceSample(current, queuePayload.items, queuePayload.capacity, nextTelemetry));
        setSelectedName((current) => queuePayload.items.some((queue) => queue.name === current) ? current : queuePayload.items[0]?.name ?? "");
        setConnectionError(null);
      } catch (error) {
        if ((error as Error).name !== "AbortError") setConnectionError(error instanceof Error ? error.message : "Connection failed");
      } finally {
        loading = false;
      }
    }
    void loadQueues();
    const timer = window.setInterval(() => void loadQueues(), uiConfig.behavior.refreshIntervalSeconds * 1000);
    return () => { controller.abort(); window.clearInterval(timer); };
  }, [uiConfig.behavior.refreshIntervalSeconds]);

  useEffect(() => {
    function focusSearch(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        searchRef.current?.focus();
      }
      if (event.key === "Escape") {
        setShellPanel(null);
        setGlobalQuery("");
      }
    }
    window.addEventListener("keydown", focusSearch);
    return () => window.removeEventListener("keydown", focusSearch);
  }, []);

  function showToast(message: string) {
    setToast(message);
    window.setTimeout(() => setToast(null), 3200);
  }

  async function handleSave(input: QueueInput) {
    const now = new Date().toISOString();
    if (csrfToken) {
      const editing = form?.mode === "edit" && form.queue;
      const response = await fetch(editing ? `/api/queues/${encodeURIComponent(form.queue!.name)}` : "/api/queues", {
        method: editing ? "PUT" : "POST",
        headers: { "content-type": "application/json", "x-csrf-token": csrfToken },
        body: JSON.stringify(input),
      });
      const payload = await response.json().catch(() => ({})) as { item?: KaiQueue; error?: string };
      if (!response.ok || !payload.item) throw new Error(payload.error ?? "The cluster rejected this change");
      if (editing) setQueues((current) => current.map((queue) => queue.name === payload.item!.name ? payload.item! : queue));
      else setQueues((current) => [...current, payload.item!]);
      setSelectedName(payload.item.name);
      const auditResponse = await fetch("/api/audit?limit=100", { cache: "no-store" });
      if (auditResponse.ok) setAuditEvents(((await auditResponse.json()) as { items: AuditEvent[] }).items);
      setForm(null);
      showToast(`${payload.item.displayName || payload.item.name} ${editing ? "updated" : "created"}`);
      return;
    }
    if (form?.mode === "edit" && form.queue) {
      const original = form.queue;
      const updated: KaiQueue = {
        ...original,
        displayName: input.displayName ?? "",
        parentQueue: input.parentQueue || undefined,
        priority: input.priority,
        preemptMinRuntime: input.preemptMinRuntime,
        reclaimMinRuntime: input.reclaimMinRuntime,
        labels: input.labels,
        updatedAt: now,
        resourceVersion: `${Number(original.resourceVersion ?? 0) + 1}`,
        resources: {
          cpu: { ...original.resources.cpu, ...input.resources.cpu },
          memory: { ...original.resources.memory, ...input.resources.memory },
          gpu: { ...original.resources.gpu, ...input.resources.gpu },
        },
      };
      setQueues((current) => current.map((queue) => (queue.name === original.name ? updated : queue)));
      setAuditEvents((events) => [
        {
          id: crypto.randomUUID(),
          occurredAt: now,
          actor: identity.username,
          action: "UPDATE",
          queueName: original.name,
          outcome: "SUCCESS",
          summary: "Queue resources and scheduling policy updated",
        },
        ...events,
      ]);
      showToast(`${original.displayName || original.name} updated`);
    } else {
      const created: KaiQueue = {
        name: input.name,
        displayName: input.displayName ?? "",
        parentQueue: input.parentQueue || undefined,
        priority: input.priority,
        preemptMinRuntime: input.preemptMinRuntime,
        reclaimMinRuntime: input.reclaimMinRuntime,
        labels: input.labels,
        resourceVersion: "1",
        resources: {
          cpu: { ...input.resources.cpu, allocated: 0, requested: 0 },
          memory: { ...input.resources.memory, allocated: 0, requested: 0 },
          gpu: { ...input.resources.gpu, allocated: 0, requested: 0 },
        },
        health: "healthy",
        conditions: [],
        childQueues: [],
        workloads: { running: 0, pending: 0 },
        updatedAt: now,
      };
      setQueues((current) => [...current, created]);
      setSelectedName(created.name);
      setAuditEvents((events) => [
        {
          id: crypto.randomUUID(),
          occurredAt: now,
          actor: "sarah.chen@acme.io",
          action: "CREATE",
          queueName: created.name,
          outcome: "SUCCESS",
          summary: created.parentQueue ? `Queue created under ${created.parentQueue}` : "Top-level queue created",
        },
        ...events,
      ]);
      showToast(`${created.displayName || created.name} created`);
    }
    setForm(null);
  }

  async function handleDelete(queue: KaiQueue) {
    if (csrfToken) {
      const response = await fetch(`/api/queues/${encodeURIComponent(queue.name)}`, { method: "DELETE", headers: { "x-csrf-token": csrfToken } });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({})) as { error?: string };
        throw new Error(payload.error ?? "The cluster rejected this deletion");
      }
    }
    setQueues((current) => current.filter((item) => item.name !== queue.name));
    if (!csrfToken) setAuditEvents((events) => [
      {
        id: crypto.randomUUID(),
        occurredAt: new Date().toISOString(),
        actor: identity.username,
        action: "DELETE",
        queueName: queue.name,
        outcome: "SUCCESS",
        summary: "Queue permanently deleted after confirmation",
      },
      ...events,
    ]);
    else {
      const auditResponse = await fetch("/api/audit?limit=100", { cache: "no-store" });
      if (auditResponse.ok) setAuditEvents(((await auditResponse.json()) as { items: AuditEvent[] }).items);
    }
    setDeleteTarget(null);
    setSelectedName(queues.find((item) => item.name !== queue.name)?.name ?? "");
    showToast(`${queue.displayName || queue.name} deleted`);
  }

  const pageTitle = { overview: "Queue control plane", queues: "Queues", audit: "Audit log", cluster: "Cluster capacity" }[effectiveView];

  return (
    <div className="app-shell" style={{ "--lime": uiConfig.branding.accentColor } as CSSProperties}>
      <aside className={`sidebar ${mobileNav ? "sidebar-open" : ""}`}>
        <div className="brand">
          <span className="brand-mark"><Hexagon size={22} fill="currentColor" /></span>
          <span><strong>{uiConfig.branding.shortName}</strong><small>{uiConfig.branding.productLabel}</small></span>
          <button className="mobile-close" onClick={() => setMobileNav(false)} aria-label="Close navigation"><X size={19} /></button>
        </div>
        <div className="cluster-switcher">
          <span className="cluster-dot" />
          <span><small>ACTIVE CLUSTER</small><strong>{clusterName}</strong></span>
        </div>
        <nav className="sidebar-nav" aria-label="Primary navigation">
          <span className="nav-heading">OPERATIONS</span>
          {visibleNavItems.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                className={effectiveView === item.id ? "nav-active" : ""}
                onClick={() => { setView(item.id); setMobileNav(false); }}
              >
                <Icon size={18} />
                {item.label}
                {item.id === "queues" && <span className="nav-count">{queues.length}</span>}
              </button>
            );
          })}
        </nav>
        <div className="sidebar-health">
          <div><span className={connectionError ? "health-pulse health-pulse-error" : "health-pulse"} /><strong>{connectionError ? "API unavailable" : dataMode === "kubernetes" ? "Live cluster" : "Demo data"}</strong></div>
          <span>{connectionError ? "Showing safe local fallback" : dataMode === "kubernetes" ? "KAI Scheduler · connected" : "Interactive preview mode"}</span>
        </div>
        <div className="sidebar-user-wrap">
          {shellPanel === "user" && <UserPanel identity={identity} onClose={() => setShellPanel(null)} />}
          <button className="sidebar-user" onClick={() => setShellPanel((current) => current === "user" ? null : "user")} aria-expanded={shellPanel === "user"}>
            <span className="avatar">{initials(identity.displayName)}</span>
            <span><strong>{identity.displayName}</strong><small>{identity.role}</small></span>
            <UserRound size={15} />
          </button>
        </div>
      </aside>

      {mobileNav && <button className="sidebar-backdrop" aria-label="Close navigation" onClick={() => setMobileNav(false)} />}

      <main className="main-area">
        <header className="topbar">
          <button className="mobile-menu" onClick={() => setMobileNav(true)} aria-label="Open navigation"><Menu size={20} /></button>
          <div className="global-search-shell">
            <div className="global-search">
              <Search size={17} />
              <input ref={searchRef} value={globalQuery} onChange={(event) => setGlobalQuery(event.target.value)} aria-label="Search" placeholder="Search queues and audit events…" />
              <kbd><Command size={11} /> K</kbd>
            </div>
            {globalQuery.trim().length >= 2 && <GlobalSearchResults matches={globalMatches} auditVisible={uiConfig.features.showAudit} onQueue={(queue) => { setSelectedName(queue.name); setView("queues"); setGlobalQuery(""); }} onAudit={() => { setView("audit"); setGlobalQuery(""); }} />}
          </div>
          <div className="topbar-actions">
            <button aria-label="Help" aria-expanded={shellPanel === "help"} className={shellPanel === "help" ? "topbar-action-active" : ""} onClick={() => setShellPanel((current) => current === "help" ? null : "help")}><CircleHelp size={19} /></button>
            <button aria-label={`Notifications${alerts.length ? `, ${alerts.length} active` : ""}`} aria-expanded={shellPanel === "notifications"} className={`notification-button ${shellPanel === "notifications" ? "topbar-action-active" : ""}`} onClick={() => setShellPanel((current) => current === "notifications" ? null : "notifications")}><Bell size={19} />{alerts.length > 0 && <span />}</button>
            {shellPanel === "help" && <HelpPanel config={uiConfig} onClose={() => setShellPanel(null)} />}
            {shellPanel === "notifications" && <NotificationPanel alerts={alerts} onClose={() => setShellPanel(null)} onOpenQueue={(name) => { setSelectedName(name); setView("queues"); setShellPanel(null); }} />}
            <span className="topbar-divider" />
            <div className="connection-state"><ShieldCheck size={16} /><span><small>ACCESS</small><strong>{identity.role}</strong></span></div>
          </div>
        </header>

        <div className="page-wrap">
          <div className="page-heading">
            <div>
              <div className="eyebrow"><span>{clusterName.toUpperCase()}</span><span>/</span><span>{effectiveView.toUpperCase()}</span></div>
              <h1>{pageTitle}</h1>
              <p>{effectiveView === "overview" ? "Capacity, fairness, and queue health across your KAI Scheduler hierarchy." : effectiveView === "queues" ? "Create and govern scheduling guarantees across every team." : effectiveView === "audit" ? "An immutable record of every queue lifecycle change." : "Understand allocatable capacity and scheduler demand."}</p>
            </div>
            {(effectiveView === "overview" || effectiveView === "queues") && (
              <button className="button button-primary create-button" onClick={() => setForm({ mode: "create" })}>
                <Plus size={17} /> Create queue
              </button>
            )}
          </div>

          {effectiveView === "overview" && (
            <OverviewPage
              queues={queues}
              auditEvents={auditEvents}
              capacity={capacity}
              live={dataMode === "kubernetes"}
              metricsAvailable={telemetry.metricsServer}
              usageHistory={usageHistory}
              showRecentChanges={uiConfig.features.showRecentChanges && uiConfig.features.showAudit}
              selectedQueue={selectedQueue}
              onSelectQueue={setSelectedName}
              onEdit={(queue) => setForm({ mode: "edit", queue })}
              onDelete={setDeleteTarget}
              onViewQueues={() => setView("queues")}
              onViewAudit={() => setView("audit")}
            />
          )}
          {effectiveView === "queues" && (
            <QueuesPage
              queues={queues}
              selectedQueue={selectedQueue}
              onSelectQueue={setSelectedName}
              onEdit={(queue) => setForm({ mode: "edit", queue })}
              onDelete={setDeleteTarget}
              queueDocsUrl={uiConfig.links.queueDocsUrl}
            />
          )}
          {effectiveView === "audit" && <AuditPage events={auditEvents} />}
          {effectiveView === "cluster" && <ClusterPage capacity={capacity} clusterName={clusterName} telemetry={telemetry} showExtendedTelemetry={uiConfig.features.showExtendedTelemetry} />}
        </div>
      </main>

      {form && (
        <QueueFormDialog
          mode={form.mode}
          initialValue={form.queue ? queueToInput(form.queue) : undefined}
          queues={queues}
          capacity={capacity}
          onClose={() => setForm(null)}
          onSave={handleSave}
        />
      )}
      {deleteTarget && <DeleteQueueDialog queue={deleteTarget} clusterName={clusterName} onClose={() => setDeleteTarget(null)} onDelete={handleDelete} />}
      {toast && <div className="toast"><CheckToastIcon />{toast}</div>}
    </div>
  );
}

type ShellAlert = { id: string; title: string; detail: string; tone: "warning" | "danger" | "info"; queueName?: string };

function appendResourceSample(current: ResourceSample[], queues: KaiQueue[], capacity: ClusterCapacity, telemetry: TelemetryState) {
  const leaves = queues.filter((queue) => queue.childQueues.length === 0);
  const totals = leaves.reduce((result, queue) => ({
    allocatedCpu: result.allocatedCpu + queue.resources.cpu.allocated,
    allocatedMemory: result.allocatedMemory + queue.resources.memory.allocated,
    allocatedGpu: result.allocatedGpu + queue.resources.gpu.allocated,
    measuredCpu: result.measuredCpu + (queue.observedUsage?.cpu ?? 0),
    measuredMemory: result.measuredMemory + (queue.observedUsage?.memory ?? 0),
  }), { allocatedCpu: 0, allocatedMemory: 0, allocatedGpu: 0, measuredCpu: 0, measuredMemory: 0 });
  const sampledAt = telemetry.sampledAt || new Date().toISOString();
  if (current.at(-1)?.sampledAt === sampledAt) return current;
  const sample: ResourceSample = {
    sampledAt,
    time: new Date(sampledAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
    cpu: percent(telemetry.metricsServer ? totals.measuredCpu : totals.allocatedCpu, capacity.cpu),
    memory: percent(telemetry.metricsServer ? totals.measuredMemory : totals.allocatedMemory, capacity.memory),
    gpu: percent(totals.allocatedGpu, capacity.gpu),
    quota: 70,
  };
  return [...current, sample].slice(-60);
}

function buildAlerts(queues: KaiQueue[], connectionError: string | null, metricsAvailable: boolean): ShellAlert[] {
  const alerts: ShellAlert[] = [];
  if (connectionError) alerts.push({ id: "connection", title: "Control plane connection degraded", detail: connectionError, tone: "danger" });
  for (const queue of queues) {
    if (queue.health === "orphaned") alerts.push({ id: `orphan-${queue.name}`, title: `${queue.displayName || queue.name} is orphaned`, detail: "Its configured parent queue does not exist.", tone: "danger", queueName: queue.name });
    if (queue.health === "over-quota") alerts.push({ id: `quota-${queue.name}`, title: `${queue.displayName || queue.name} is over quota`, detail: "The queue is consuming reclaimable borrowed capacity.", tone: "warning", queueName: queue.name });
    if (queue.workloads.pending > 0) alerts.push({ id: `pending-${queue.name}`, title: `${queue.workloads.pending} pending in ${queue.displayName || queue.name}`, detail: "Open the queue to inspect its demand and policy.", tone: "warning", queueName: queue.name });
  }
  if (!metricsAvailable) alerts.push({ id: "metrics", title: "Measured utilization unavailable", detail: "The dashboard is falling back to scheduler allocation data.", tone: "info" });
  return alerts;
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return (parts.length > 1 ? `${parts[0][0]}${parts.at(-1)?.[0]}` : name.slice(0, 2)).toUpperCase();
}

function GlobalSearchResults({ matches, auditVisible, onQueue, onAudit }: { matches: { queues: KaiQueue[]; audit: AuditEvent[] }; auditVisible: boolean; onQueue: (queue: KaiQueue) => void; onAudit: () => void }) {
  const empty = matches.queues.length === 0 && (!auditVisible || matches.audit.length === 0);
  return (
    <div className="global-results" role="listbox" aria-label="Search results">
      {matches.queues.length > 0 && <><span>QUEUES</span>{matches.queues.map((queue) => <button key={queue.name} onClick={() => onQueue(queue)}><Boxes size={15} /><span><strong>{queue.displayName || queue.name}</strong><small>{queue.name}</small></span></button>)}</>}
      {auditVisible && matches.audit.length > 0 && <><span>AUDIT EVENTS</span>{matches.audit.map((event) => <button key={event.id} onClick={onAudit}><ClipboardList size={15} /><span><strong>{event.action} · {event.queueName}</strong><small>{event.summary}</small></span></button>)}</>}
      {empty && <div className="popover-empty"><Search size={17} /><span>No matching queues or audit events</span></div>}
    </div>
  );
}

function PopoverHeader({ title, onClose }: { title: string; onClose: () => void }) {
  return <div className="shell-popover-header"><strong>{title}</strong><button onClick={onClose} aria-label={`Close ${title}`}><X size={16} /></button></div>;
}

function HelpPanel({ config, onClose }: { config: UiConfig; onClose: () => void }) {
  return (
    <div className="shell-popover help-popover" role="dialog" aria-label="Help and documentation">
      <PopoverHeader title="Help & documentation" onClose={onClose} />
      <p>Manage leaf and parent queues, scheduling guarantees, limits, priority, and borrowed capacity.</p>
      <a href={config.links.queueDocsUrl} target="_blank" rel="noreferrer"><BookOpen size={16} /><span><strong>KAI Queue API</strong><small>Fields, units, and hierarchy rules</small></span><ExternalLink size={14} /></a>
      <a href={config.links.helpUrl} target="_blank" rel="noreferrer"><CircleHelp size={16} /><span><strong>KAI documentation</strong><small>Scheduler concepts and operations</small></span><ExternalLink size={14} /></a>
      {config.links.supportEmail && <a href={`mailto:${config.links.supportEmail}`}><UserRound size={16} /><span><strong>Contact support</strong><small>{config.links.supportEmail}</small></span></a>}
      <div className="keyboard-hint"><kbd>Ctrl/⌘ K</kbd><span>Search queues and audit events</span></div>
    </div>
  );
}

function NotificationPanel({ alerts, onClose, onOpenQueue }: { alerts: ShellAlert[]; onClose: () => void; onOpenQueue: (name: string) => void }) {
  return (
    <div className="shell-popover notification-popover" role="dialog" aria-label="Active alerts">
      <PopoverHeader title={`Alerts${alerts.length ? ` · ${alerts.length}` : ""}`} onClose={onClose} />
      {alerts.length === 0 ? <div className="popover-empty"><CheckCircle2 size={20} /><strong>All clear</strong><span>No active queue or connection alerts.</span></div> : <div className="notification-list">{alerts.map((alert) => <button key={alert.id} onClick={() => alert.queueName && onOpenQueue(alert.queueName)} disabled={!alert.queueName} className={`notification-${alert.tone}`}>{alert.tone === "info" ? <CircleHelp size={16} /> : <AlertTriangle size={16} />}<span><strong>{alert.title}</strong><small>{alert.detail}</small></span></button>)}</div>}
    </div>
  );
}

function UserPanel({ identity, onClose }: { identity: UiIdentity; onClose: () => void }) {
  return (
    <div className="shell-popover user-popover" role="dialog" aria-label="Current identity">
      <PopoverHeader title="Current identity" onClose={onClose} />
      <div className="identity-card"><span className="avatar">{initials(identity.displayName)}</span><span><strong>{identity.displayName}</strong><small>{identity.username}</small></span></div>
      <dl><div><dt>Access</dt><dd>{identity.role}</dd></div><div><dt>Source</dt><dd>{identity.source === "trusted-proxy" ? "Trusted identity proxy" : identity.source === "local-development" ? "Local development fallback" : "Not configured"}</dd></div></dl>
      {identity.source !== "trusted-proxy" && <p>Production deployments should supply identity through an OIDC-aware trusted reverse proxy.</p>}
    </div>
  );
}

function CheckToastIcon() {
  return <span className="toast-icon"><Sparkles size={14} /></span>;
}

function ClusterPage({ capacity, clusterName, telemetry, showExtendedTelemetry }: { capacity: ClusterCapacity; clusterName: string; telemetry: TelemetryState; showExtendedTelemetry: boolean }) {
  return (
    <div className={`cluster-grid ${showExtendedTelemetry ? "" : "cluster-grid-single"}`}>
      <section className="panel cluster-hero">
        <div className="panel-heading"><div><span className="section-kicker">ALLOCATABLE CAPACITY</span><h2>{clusterName}</h2></div><span className="health-badge health-healthy"><span className="cluster-dot" />{capacity.nodes} nodes ready</span></div>
        <div className="cluster-capacity-cards">
          <div><small>CPU</small><strong>{capacity.cpu.toLocaleString()} <span>cores allocatable</span></strong><div className="meter-track"><span className="meter-fill meter-cpu" style={{ width: "100%" }} /></div></div>
          <div><small>MEMORY</small><strong>{capacity.memory.toFixed(1)} <span>GiB allocatable</span></strong><div className="meter-track"><span className="meter-fill meter-memory" style={{ width: "100%" }} /></div></div>
          <div><small>GPU</small><strong>{capacity.gpu.toLocaleString()} <span>{capacity.gpu ? "devices allocatable" : "devices discovered"}</span></strong><div className="meter-track"><span className="meter-fill meter-gpu" style={{ width: capacity.gpu ? "100%" : "0%" }} /></div></div>
        </div>
      </section>
      {showExtendedTelemetry && <section className="panel telemetry-panel">
        <div className="panel-heading"><div><span className="section-kicker">OBSERVABILITY</span><h2>Extended telemetry</h2></div></div>
        <div className="telemetry-row"><Activity size={18} /><span><strong>CPU and memory usage</strong><small>Aggregated from Kubernetes Metrics API</small></span><span className={telemetry.metricsServer ? "live-chip" : "muted-pill"}>{telemetry.metricsServer ? "LIVE" : "Unavailable"}</span></div>
        <div className="telemetry-row"><Gauge size={18} /><span><strong>Disk I/O</strong><small>Telemetry only · not a KAI queue quota resource</small></span><span className="muted-pill">Prometheus required</span></div>
        <div className="telemetry-row"><Activity size={18} /><span><strong>Network throughput</strong><small>Node and workload attribution</small></span><span className="muted-pill">Prometheus required</span></div>
      </section>}
    </div>
  );
}
