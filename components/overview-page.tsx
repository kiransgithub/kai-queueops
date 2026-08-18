"use client";

import { useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  Boxes,
  ChevronDown,
  Cpu,
  HardDrive,
  MemoryStick,
  Search,
  TrendingUp,
  Zap,
} from "lucide-react";
import { Area, AreaChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { AuditEvent } from "@/lib/mock-data";
import { resourceHistory } from "@/lib/mock-data";
import type { KaiQueue, ResourceKey, ResourceSample } from "@/lib/domain/queue";
import { RESOURCE_META, formatResource, isOverQuota, percent } from "@/lib/domain/queue";
import type { ClusterCapacity } from "@/lib/kai/capacity";
import { QueueTable } from "@/components/queue-table";
import { AuditPage } from "@/components/audit-page";

export function OverviewPage({
  queues,
  auditEvents,
  capacity,
  live,
  metricsAvailable,
  usageHistory,
  showRecentChanges,
  selectedQueue,
  onSelectQueue,
  onEdit,
  onDelete,
  onViewQueues,
  onViewAudit,
}: {
  queues: KaiQueue[];
  auditEvents: AuditEvent[];
  capacity: ClusterCapacity;
  live: boolean;
  metricsAvailable: boolean;
  usageHistory: ResourceSample[];
  showRecentChanges: boolean;
  selectedQueue?: KaiQueue;
  onSelectQueue: (name: string) => void;
  onEdit: (queue: KaiQueue) => void;
  onDelete: (queue: KaiQueue) => void;
  onViewQueues: () => void;
  onViewAudit: () => void;
}) {
  const [query, setQuery] = useState("");
  const [health, setHealth] = useState("all");
  const filteredQueues = useMemo(() => queues.filter((queue) => {
    const matchesQuery = `${queue.name} ${queue.displayName}`.toLowerCase().includes(query.toLowerCase());
    return matchesQuery && (health === "all" || queue.health === health);
  }), [queues, query, health]);
  const leaves = queues.filter((queue) => queue.childQueues.length === 0);
  const overQuota = leaves.filter((queue) => Object.values(queue.resources).some(isOverQuota));
  const totals = leaves.reduce(
    (acc, queue) => ({ cpu: acc.cpu + queue.resources.cpu.allocated, memory: acc.memory + queue.resources.memory.allocated, gpu: acc.gpu + queue.resources.gpu.allocated }),
    { cpu: 0, memory: 0, gpu: 0 },
  );
  const guarantees = leaves.reduce(
    (acc, queue) => ({ cpu: acc.cpu + Math.max(queue.resources.cpu.quota, 0), memory: acc.memory + Math.max(queue.resources.memory.quota, 0), gpu: acc.gpu + Math.max(queue.resources.gpu.quota, 0) }),
    { cpu: 0, memory: 0, gpu: 0 },
  );
  const borrowed = leaves.reduce(
    (acc, queue) => ({ cpu: acc.cpu + borrowedAmount(queue.resources.cpu), memory: acc.memory + borrowedAmount(queue.resources.memory), gpu: acc.gpu + borrowedAmount(queue.resources.gpu) }),
    { cpu: 0, memory: 0, gpu: 0 },
  );
  const overByResource = (resource: ResourceKey) => leaves.filter((queue) => isOverQuota(queue.resources[resource])).length;
  const dominantBorrowed = Math.max(...RESOURCE_KEYS_LOCAL.map((resource) => guarantees[resource] > 0 ? Math.round((borrowed[resource] / guarantees[resource]) * 100) : 0));
  const chartData = live
    ? usageHistory.length === 1 ? [{ ...usageHistory[0], time: "Start" }, { ...usageHistory[0], time: "Now" }] : usageHistory
    : resourceHistory;
  const firstOverQueue = overQuota[0];
  const today = new Date().toDateString();
  const changedToday = auditEvents.filter((event) => new Date(event.occurredAt).toDateString() === today).length;
  return (
    <div className="overview-stack">
      <section className="kpi-grid">
        <KpiCard icon={Boxes} tone="blue" label="Managed queues" value={`${queues.length}`} detail={`${leaves.length} schedulable leaves`} delta={`${changedToday} changed today`} />
        <KpiCard icon={Zap} tone="lime" label="GPU allocated" value={`${totals.gpu}`} suffix={`/ ${capacity.gpu}`} detail={capacity.gpu ? `${percent(totals.gpu, capacity.gpu)}% of cluster` : "No GPUs discovered"} delta={live ? "Live allocation" : "+6.5 today"} />
        <KpiCard icon={Cpu} tone="violet" label="CPU allocated" value={`${Number(totals.cpu.toFixed(1))}`} suffix={`/ ${capacity.cpu}`} detail={`${percent(totals.cpu, capacity.cpu)}% of cluster`} delta={live ? `${capacity.nodes} ready nodes` : "Stable demand"} />
        <KpiCard icon={AlertTriangle} tone="amber" label="Oversubscribed" value={`${overQuota.length}`} detail="queues above guarantee" delta={`${overQuota.reduce((sum, queue) => sum + queue.workloads.pending, 0)} pending workloads`} attention />
      </section>

      <section className="analytics-grid">
        <div className="panel allocation-chart-panel">
          <div className="panel-heading">
            <div><span className="section-kicker">UTILIZATION</span><h2>Resource pressure</h2><p>{live ? metricsAvailable ? "Measured CPU and memory · 10-second dashboard refresh" : "Allocation only · Metrics Server unavailable" : "Allocated share of cluster capacity"}</p></div>
            <span className={metricsAvailable ? "live-chip" : "muted-pill"}>{metricsAvailable ? <><i />METRICS API</> : "ALLOCATION"}</span>
          </div>
          <div className="chart-legend"><span><i className="legend-gpu" />GPU allocated</span><span><i className="legend-cpu" />CPU {metricsAvailable ? "measured" : "allocated"}</span><span><i className="legend-memory" />Memory {metricsAvailable ? "measured" : "allocated"}</span><span><i className="legend-quota" />70% pressure line</span></div>
          <div className="chart-wrap">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 10, right: 8, left: -22, bottom: 0 }}>
                <defs>
                  <linearGradient id="gpuGradient" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#9cd86c" stopOpacity={0.25} /><stop offset="100%" stopColor="#9cd86c" stopOpacity={0} /></linearGradient>
                  <linearGradient id="cpuGradient" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#49bcd0" stopOpacity={0.16} /><stop offset="100%" stopColor="#49bcd0" stopOpacity={0} /></linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 4" vertical={false} stroke="#e4e8ed" />
                <XAxis dataKey="time" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: "#78838f" }} />
                <YAxis domain={[0, 100]} tickFormatter={(value) => `${value}%`} axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: "#8a949e" }} />
                <Tooltip contentStyle={{ borderRadius: 10, border: "1px solid #dfe4e9", boxShadow: "0 12px 30px rgba(28,39,49,.12)", fontSize: 12 }} formatter={(value) => [`${value}%`]} />
                <ReferenceLine y={70} stroke="#e1a846" strokeDasharray="5 4" />
                <Area type="monotone" dataKey="memory" stroke="#8777d9" strokeWidth={2} fill="transparent" />
                <Area type="monotone" dataKey="cpu" stroke="#3da9bd" strokeWidth={2} fill="url(#cpuGradient)" />
                <Area type="monotone" dataKey="gpu" stroke="#70ae42" strokeWidth={2.4} fill="url(#gpuGradient)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="panel oversub-panel">
          <div className="panel-heading"><div><span className="section-kicker">FAIR SHARE</span><h2>Oversubscription</h2><p>Borrowed beyond guaranteed quota</p></div><span className="live-chip"><i />LIVE</span></div>
          <div className="oversub-summary"><div><small>DOMINANT BORROWED SHARE</small><strong>{dominantBorrowed}%</strong></div><span><TrendingUp size={14} />{live ? "live status" : "+3.2% vs 24h"}</span></div>
          <div className="oversub-resources">
            <OversubRow resource="gpu" value={formatResource("gpu", borrowed.gpu)} percent={percent(borrowed.gpu, Math.max(guarantees.gpu, 1))} queues={overByResource("gpu")} />
            <OversubRow resource="cpu" value={formatResource("cpu", borrowed.cpu)} percent={percent(borrowed.cpu, Math.max(guarantees.cpu, 1))} queues={overByResource("cpu")} />
            <OversubRow resource="memory" value={formatResource("memory", borrowed.memory)} percent={percent(borrowed.memory, Math.max(guarantees.memory, 1))} queues={overByResource("memory")} />
            <div className="oversub-row io-row"><span className="resource-icon resource-disk"><HardDrive size={16} /></span><div><span><strong>Disk I/O</strong><em className="muted-pill">Telemetry only</em></span><small>Not governed by KAI Queue CRD</small></div></div>
          </div>
          <div className={`oversub-note ${firstOverQueue ? "" : "oversub-ok"}`}>{firstOverQueue ? <AlertTriangle size={15} /> : <Zap size={15} />}<p>{firstOverQueue ? <><strong>{firstOverQueue.displayName || firstOverQueue.name}</strong> is using borrowed capacity that may be reclaimed when guaranteed demand rises.</> : <><strong>All queues are within guarantee.</strong> No resource is currently oversubscribed.</>}</p></div>
        </div>
      </section>

      <section className="panel queue-overview-panel">
        <div className="panel-heading queue-panel-heading">
          <div><span className="section-kicker">QUEUE HIERARCHY</span><h2>Capacity by queue</h2></div>
          <div className="panel-actions"><label className="inline-search"><Search size={15} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Find a queue" /></label><label className="select-control">Health<select value={health} onChange={(event) => setHealth(event.target.value)}><option value="all">All</option><option value="healthy">Healthy</option><option value="over-quota">Over quota</option><option value="orphaned">Orphaned</option></select><ChevronDown size={14} /></label></div>
        </div>
        <QueueTable
          queues={filteredQueues}
          selectedName={selectedQueue?.name}
          onSelect={(queue) => onSelectQueue(queue.name)}
          onEdit={onEdit}
          onDelete={onDelete}
          compact
        />
        <button className="panel-link" onClick={onViewQueues}>Manage all queues <ArrowRight size={14} /></button>
      </section>

      {showRecentChanges && <div className="overview-audit">
        <AuditPage events={auditEvents} compact />
        <button className="audit-view-all" onClick={onViewAudit}>View complete audit log <ArrowRight size={14} /></button>
      </div>}
    </div>
  );
}

const RESOURCE_KEYS_LOCAL: ResourceKey[] = ["cpu", "memory", "gpu"];

function borrowedAmount(resource: KaiQueue["resources"][ResourceKey]) {
  return resource.quota < 0 ? 0 : Math.max(resource.allocated - resource.quota, 0);
}

function KpiCard({ icon: Icon, tone, label, value, suffix, detail, delta, attention = false }: { icon: typeof Boxes; tone: string; label: string; value: string; suffix?: string; detail: string; delta: string; attention?: boolean }) {
  return (
    <div className={`kpi-card ${attention ? "kpi-attention" : ""}`}>
      <div className={`kpi-icon kpi-${tone}`}><Icon size={18} /></div>
      <div className="kpi-label"><span>{label}</span></div>
      <div className="kpi-value">{value} <small>{suffix}</small></div>
      <div className="kpi-footer"><span>{detail}</span><em>{delta}</em></div>
    </div>
  );
}

const resourceIcons = { cpu: Cpu, memory: MemoryStick, gpu: Zap };

function OversubRow({ resource, value, percent, queues }: { resource: ResourceKey; value: string; percent: number; queues: number }) {
  const Icon = resourceIcons[resource];
  return (
    <div className="oversub-row">
      <span className={`resource-icon resource-${resource}`}><Icon size={16} /></span>
      <div>
        <span><strong>{RESOURCE_META[resource].label}</strong><b>{value}</b></span>
        <div className="oversub-track"><i style={{ width: `${percent}%` }} /></div>
        <small>{queues} {queues === 1 ? "queue" : "queues"} above guarantee</small>
      </div>
    </div>
  );
}
