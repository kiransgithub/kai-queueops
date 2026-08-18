"use client";

import { useMemo, useState, type CSSProperties } from "react";
import {
  AlertTriangle,
  ArrowUpRight,
  Boxes,
  ChevronDown,
  CircleHelp,
  Clock3,
  Copy,
  FileCode2,
  GitBranch,
  Info,
  List,
  Pencil,
  Search,
  ShieldAlert,
  Trash2,
  Users,
  Workflow,
  X,
} from "lucide-react";
import type { KaiQueue, ResourceKey } from "@/lib/domain/queue";
import { RESOURCE_KEYS, RESOURCE_META, formatResource, isOverQuota, percent } from "@/lib/domain/queue";
import { QueueTable } from "@/components/queue-table";
import { Button, HealthBadge, ResourceMeter } from "@/components/ui";
import { cleanResourceNumber, manifestResourceValue } from "@/lib/kai/mapper";

export function QueuesPage({ queues, selectedQueue, onSelectQueue, onEdit, onDelete, queueDocsUrl }: { queues: KaiQueue[]; selectedQueue?: KaiQueue; onSelectQueue: (name: string) => void; onEdit: (queue: KaiQueue) => void; onDelete: (queue: KaiQueue) => void; queueDocsUrl: string }) {
  const [query, setQuery] = useState("");
  const [health, setHealth] = useState("all");
  const [layout, setLayout] = useState<"table" | "hierarchy">("table");
  const filtered = useMemo(() => queues.filter((queue) => {
    const matchesSearch = `${queue.displayName} ${queue.name} ${queue.parentQueue ?? ""}`.toLowerCase().includes(query.toLowerCase());
    return matchesSearch && (health === "all" || queue.health === health);
  }), [queues, query, health]);
  return (
    <div className={`queues-workspace ${selectedQueue ? "has-detail" : ""}`}>
      <section className="panel queues-list-panel">
        <div className="queue-toolbar">
          <label className="inline-search queue-search"><Search size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search by name, parent, or owner" /></label>
          <div className="queue-filters">
            <label className="select-control">Health<select value={health} onChange={(event) => setHealth(event.target.value)}><option value="all">All</option><option value="healthy">Healthy</option><option value="over-quota">Over quota</option><option value="orphaned">Orphaned</option></select><ChevronDown size={14} /></label>
            <button className={`button button-secondary ${layout === "hierarchy" ? "button-active" : ""}`} aria-pressed={layout === "hierarchy"} onClick={() => setLayout((current) => current === "table" ? "hierarchy" : "table")}>{layout === "table" ? <GitBranch size={15} /> : <List size={15} />}{layout === "table" ? "Hierarchy" : "Table"}</button>
          </div>
        </div>
        <div className="queue-list-summary"><span><strong>{filtered.length}</strong> queues</span><span><i className="summary-dot healthy" />{queues.filter((queue) => queue.health === "healthy").length} healthy</span><span><i className="summary-dot warning" />{queues.filter((queue) => queue.health !== "healthy").length} need attention</span></div>
        {layout === "table"
          ? <QueueTable queues={filtered} selectedName={selectedQueue?.name} onSelect={(queue) => onSelectQueue(queue.name)} onEdit={onEdit} onDelete={onDelete} />
          : <QueueHierarchy queues={filtered} selectedName={selectedQueue?.name} onSelect={(queue) => onSelectQueue(queue.name)} onEdit={onEdit} onDelete={onDelete} />}
      </section>
      {selectedQueue && <QueueDetail queue={selectedQueue} queueDocsUrl={queueDocsUrl} onEdit={() => onEdit(selectedQueue)} onDelete={() => onDelete(selectedQueue)} onClose={() => onSelectQueue("")} />}
    </div>
  );
}

function QueueDetail({ queue, queueDocsUrl, onEdit, onDelete, onClose }: { queue: KaiQueue; queueDocsUrl: string; onEdit: () => void; onDelete: () => void; onClose: () => void }) {
  const [tab, setTab] = useState<"overview" | "policy" | "yaml">("overview");
  const leafQueue = queue.childQueues.length === 0;
  return (
    <aside className="queue-detail panel" aria-label={`Details for ${queue.displayName || queue.name}`}>
      <div className="detail-header">
        <div className="queue-detail-title"><span className={`queue-glyph queue-glyph-${queue.health}`} /><div><small>{leafQueue ? "LEAF QUEUE" : "PARENT QUEUE"}</small><h2>{queue.displayName || queue.name}</h2><code>{queue.name}</code></div></div>
        <button className="icon-button detail-close" onClick={onClose} aria-label="Close detail"><X size={18} /></button>
      </div>
      <div className="detail-status"><HealthBadge health={queue.health} /><span><Clock3 size={13} />{queue.observedUsage?.available ? "Metrics API live" : "Queue status live"}</span><span><Users size={13} />{queue.workloads.running} running</span></div>
      {queue.health === "over-quota" && (
        <div className="detail-alert"><AlertTriangle size={17} /><div><strong>Queue is using borrowed capacity</strong><span>Reclaimable resources may be evicted when another queue requests its guarantee.</span></div></div>
      )}
      {queue.health === "orphaned" && (
        <div className="detail-alert danger"><ShieldAlert size={17} /><div><strong>Parent queue not found</strong><span>Workloads cannot be admitted until the hierarchy is repaired.</span></div></div>
      )}
      <div className="detail-tabs" role="tablist">
        {(["overview", "policy", "yaml"] as const).map((item) => <button role="tab" aria-selected={tab === item} className={tab === item ? "active" : ""} onClick={() => setTab(item)} key={item}>{item === "yaml" ? "YAML" : item[0].toUpperCase() + item.slice(1)}</button>)}
      </div>
      <div className="detail-body">
        {tab === "overview" && (
          <>
            <div className="detail-section-heading"><span>RESOURCE ALLOCATION</span><CircleHelp size={14} /></div>
            <div className="detail-resources">
              {RESOURCE_KEYS.map((key) => <DetailResource key={key} resource={key} queue={queue} />)}
            </div>
            <div className="observed-usage-card">
              <span><ActivityIcon available={queue.observedUsage?.available === true} /><strong>MEASURED USAGE</strong></span>
              {queue.observedUsage?.available ? <div><span>CPU <b>{queue.observedUsage.cpu.toFixed(2)} cores</b></span><span>Memory <b>{queue.observedUsage.memory.toFixed(2)} GiB</b></span></div> : <small>Kubernetes Metrics API unavailable</small>}
            </div>
            <div className="detail-section-heading"><span>DEMAND</span></div>
            <div className="demand-grid"><div><small>RUNNING</small><strong>{queue.workloads.running}</strong></div><div><small>PENDING</small><strong className={queue.workloads.pending > 0 ? "text-warning" : ""}>{queue.workloads.pending}</strong></div><div><small>REQUESTED GPU</small><strong>{queue.resources.gpu.requested}</strong></div></div>
            <div className="detail-section-heading"><span>HIERARCHY & PLACEMENT</span></div>
            <dl className="detail-definition-list">
              <div><dt><GitBranch size={14} />Parent</dt><dd>{queue.parentQueue ?? "Top level"}</dd></div>
              <div><dt><Boxes size={14} />Queue type</dt><dd>{leafQueue ? "Leaf · schedulable" : `Parent · ${queue.childQueues.length} children`}</dd></div>
              <div><dt><Workflow size={14} />Node pool</dt><dd>{queue.labels["kai.scheduler/node-pool"] ?? "All nodes"}</dd></div>
              <div><dt><Users size={14} />Owner</dt><dd>{queue.labels.owner ?? "Unassigned"}</dd></div>
            </dl>
          </>
        )}
        {tab === "policy" && (
          <div className="policy-content">
            <div className="policy-card"><small>OVER-QUOTA PRIORITY</small><strong>{queue.priority}</strong><p>Higher-priority queues receive borrowed capacity first and are reclaimed last.</p></div>
            <div className="policy-card"><small>PREEMPT MINIMUM RUNTIME</small><strong>{queue.preemptMinRuntime ?? "Inherited"}</strong><p>Minimum workload runtime before priority preemption is permitted.</p></div>
            <div className="policy-card"><small>RECLAIM MINIMUM RUNTIME</small><strong>{queue.reclaimMinRuntime ?? "Inherited"}</strong><p>Minimum runtime before over-quota capacity can be reclaimed.</p></div>
            <div className="policy-note"><Info size={16} /><p>Quota is guaranteed capacity. Over-quota weight only affects distribution after guarantees are satisfied.</p></div>
          </div>
        )}
        {tab === "yaml" && <YamlPreview queue={queue} queueDocsUrl={queueDocsUrl} />}
      </div>
      <div className="detail-actions"><Button onClick={onEdit} kind="primary"><Pencil size={15} />Edit queue</Button><Button onClick={onDelete} kind="danger"><Trash2 size={15} />Delete</Button></div>
    </aside>
  );
}

function ActivityIcon({ available }: { available: boolean }) {
  return <span className={`usage-pulse ${available ? "usage-pulse-live" : ""}`} aria-hidden="true" />;
}

function DetailResource({ resource, queue }: { resource: ResourceKey; queue: KaiQueue }) {
  const values = queue.resources[resource];
  const over = isOverQuota(values);
  return (
    <div className="detail-resource-card">
      <div><span className={`resource-monogram monogram-${resource}`}>{RESOURCE_META[resource].short}</span><span><strong>{RESOURCE_META[resource].label}</strong><small>{over ? `${formatResource(resource, values.allocated - values.quota)} borrowed` : `${percent(values.allocated, values.quota)}% of quota`}</small></span><b className={over ? "text-warning" : ""}>{formatResource(resource, values.allocated)}</b></div>
      <ResourceMeter resource={resource} allocated={values.allocated} quota={values.quota} limit={values.limit} />
    </div>
  );
}

function YamlPreview({ queue, queueDocsUrl }: { queue: KaiQueue; queueDocsUrl: string }) {
  const yaml = `apiVersion: scheduling.run.ai/v2
kind: Queue
metadata:
  name: ${queue.name}
${Object.keys(queue.labels).length ? `  labels:\n${Object.entries(queue.labels).map(([key, value]) => `    ${key}: ${value}`).join("\n")}` : ""}
spec:
  displayName: "${queue.displayName}"
${queue.parentQueue ? `  parentQueue: ${queue.parentQueue}\n` : ""}  priority: ${queue.priority}
  resources:
${(["cpu", "memory", "gpu"] as ResourceKey[]).map((key) => `    ${key}:
      quota: ${manifestResourceValue(key, queue.resources[key].quota)}
      limit: ${manifestResourceValue(key, queue.resources[key].limit)}
      overQuotaWeight: ${cleanResourceNumber(queue.resources[key].overQuotaWeight)}`).join("\n")}`;
  return (
    <div className="yaml-card"><button aria-label="Copy YAML" onClick={() => navigator.clipboard?.writeText(yaml)}><Copy size={14} />Copy</button><pre><code>{yaml}</code></pre><a href={queueDocsUrl} target="_blank" rel="noreferrer"><FileCode2 size={14} />KAI Queue API reference <ArrowUpRight size={13} /></a></div>
  );
}

function QueueHierarchy({ queues, selectedName, onSelect, onEdit, onDelete }: { queues: KaiQueue[]; selectedName?: string; onSelect: (queue: KaiQueue) => void; onEdit: (queue: KaiQueue) => void; onDelete: (queue: KaiQueue) => void }) {
  const names = new Set(queues.map((queue) => queue.name));
  const children = new Map<string, KaiQueue[]>();
  for (const queue of queues) {
    if (queue.parentQueue && names.has(queue.parentQueue)) children.set(queue.parentQueue, [...(children.get(queue.parentQueue) ?? []), queue]);
  }
  const roots = queues.filter((queue) => !queue.parentQueue || !names.has(queue.parentQueue));
  if (queues.length === 0) return <div className="hierarchy-empty"><GitBranch size={22} /><strong>No queues match the filters</strong><span>Clear the search or health filter to restore the hierarchy.</span></div>;
  return <div className="hierarchy-view" aria-label="Queue hierarchy">{roots.map((queue) => <HierarchyNode key={queue.name} queue={queue} childMap={children} depth={0} selectedName={selectedName} onSelect={onSelect} onEdit={onEdit} onDelete={onDelete} />)}</div>;
}

function HierarchyNode({ queue, childMap, depth, selectedName, onSelect, onEdit, onDelete }: { queue: KaiQueue; childMap: Map<string, KaiQueue[]>; depth: number; selectedName?: string; onSelect: (queue: KaiQueue) => void; onEdit: (queue: KaiQueue) => void; onDelete: (queue: KaiQueue) => void }) {
  const childQueues = childMap.get(queue.name) ?? [];
  return (
    <div className="hierarchy-branch" style={{ "--tree-depth": depth } as CSSProperties}>
      <div className={`hierarchy-node ${selectedName === queue.name ? "hierarchy-node-selected" : ""}`}>
        <button className="hierarchy-node-main" onClick={() => onSelect(queue)}><span className={`queue-glyph queue-glyph-${queue.health}`} /><span><small>{childQueues.length ? `PARENT · ${childQueues.length} CHILDREN` : "LEAF · SCHEDULABLE"}</small><strong>{queue.displayName || queue.name}</strong><code>{queue.name}</code></span></button>
        <div className="hierarchy-node-stats"><span><small>CPU</small><strong>{formatResource("cpu", queue.resources.cpu.quota)}</strong></span><span><small>MEMORY</small><strong>{formatResource("memory", queue.resources.memory.quota)}</strong></span><span><small>PRIORITY</small><strong>P{queue.priority}</strong></span></div>
        <div className="hierarchy-node-actions"><button aria-label={`Edit ${queue.name}`} onClick={() => onEdit(queue)}><Pencil size={14} /></button><button aria-label={`Delete ${queue.name}`} onClick={() => onDelete(queue)}><Trash2 size={14} /></button></div>
      </div>
      {childQueues.length > 0 && <div className="hierarchy-children">{childQueues.map((child) => <HierarchyNode key={child.name} queue={child} childMap={childMap} depth={depth + 1} selectedName={selectedName} onSelect={onSelect} onEdit={onEdit} onDelete={onDelete} />)}</div>}
    </div>
  );
}
