"use client";

import { useMemo, useState } from "react";
import { CheckCircle2, Download, Filter, Search, ShieldCheck, XCircle } from "lucide-react";
import type { AuditEvent } from "@/lib/mock-data";

export function AuditPage({ events, compact = false }: { events: AuditEvent[]; compact?: boolean }) {
  const [query, setQuery] = useState("");
  const [action, setAction] = useState("all");
  const visible = useMemo(() => {
    const normalized = query.toLowerCase();
    return events.filter((event) => `${event.actor} ${event.queueName} ${event.action} ${event.summary}`.toLowerCase().includes(normalized) && (action === "all" || event.action === action));
  }, [events, query, action]);
  return (
    <section className={`panel audit-panel ${compact ? "audit-compact" : ""}`}>
      <div className="panel-heading audit-heading">
        <div>
          <span className="section-kicker">GOVERNANCE</span>
          <h2>{compact ? "Recent changes" : "Queue lifecycle events"}</h2>
          {!compact && <p>Append-only activity retained in PostgreSQL for compliance review.</p>}
        </div>
        {!compact && (
          <div className="panel-actions">
            <label className="inline-search"><Search size={15} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search audit log" /></label>
            <label className="select-control"><Filter size={14} />Action<select value={action} onChange={(event) => setAction(event.target.value)}><option value="all">All</option><option value="CREATE">Create</option><option value="UPDATE">Update</option><option value="DELETE">Delete</option></select></label>
            <button className="button button-secondary" onClick={() => exportCsv(visible)}><Download size={15} /> Export CSV</button>
          </div>
        )}
      </div>
      <div className="audit-list">
        {visible.slice(0, compact ? 4 : undefined).map((event) => (
          <div className="audit-event" key={event.id}>
            <span className={`audit-status audit-${event.outcome.toLowerCase()}`}>
              {event.outcome === "SUCCESS" ? <CheckCircle2 size={16} /> : <XCircle size={16} />}
            </span>
            <div className="audit-copy">
              <div><strong>{event.actor}</strong><span className={`action-tag action-${event.action.toLowerCase()}`}>{event.action}</span><code>{event.queueName}</code></div>
              <p>{event.summary}</p>
            </div>
            <time dateTime={event.occurredAt}>{formatRelativeTime(event.occurredAt)}</time>
          </div>
        ))}
      </div>
      {!compact && (
        <div className="audit-footer"><ShieldCheck size={14} /><span>Integrity policy active: update and delete operations are denied on audit rows.</span></div>
      )}
    </section>
  );
}

function exportCsv(events: AuditEvent[]) {
  const header = ["occurred_at", "actor", "action", "queue", "outcome", "summary"];
  const rows = events.map((event) => [event.occurredAt, event.actor, event.action, event.queueName, event.outcome, event.summary]);
  const csv = [header, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = `kai-queue-audit-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

function csvCell(value: string) {
  return `"${value.replaceAll('"', '""')}"`;
}

function formatRelativeTime(iso: string) {
  const date = new Date(iso);
  return date.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}
