import "server-only";

import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import type { AuditEvent } from "@/lib/mock-data";
import { mockAuditEvents } from "@/lib/mock-data";

export type AuditWrite = {
  actor: string;
  action: "CREATE" | "UPDATE" | "DELETE";
  queueName: string;
  outcome: "SUCCESS" | "FAILED";
  summary: string;
  requestId: string;
  clusterName: string;
  before?: unknown;
  after?: unknown;
  errorCode?: string;
  sourceIp?: string;
};

let pool: Pool | undefined;
const memoryEvents = structuredClone(mockAuditEvents);

function database() {
  if (!process.env.DATABASE_URL) return undefined;
  pool ??= new Pool({ connectionString: process.env.DATABASE_URL, max: 8, idleTimeoutMillis: 30_000, connectionTimeoutMillis: 4_000 });
  return pool;
}

export async function assertAuditReady() {
  const db = database();
  if (db) await db.query("select 1");
}

export async function appendAuditEvent(event: AuditWrite) {
  const id = randomUUID();
  const occurredAt = new Date().toISOString();
  const db = database();
  if (db) {
    await db.query(
      `insert into audit_events
        (id, occurred_at, actor, action, queue_name, cluster_name, outcome, summary, request_id, source_ip, before_state, after_state, error_code)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,$12::jsonb,$13)`,
      [id, occurredAt, event.actor, event.action, event.queueName, event.clusterName, event.outcome, event.summary, event.requestId, event.sourceIp ?? null, event.before === undefined ? null : JSON.stringify(event.before), event.after === undefined ? null : JSON.stringify(event.after), event.errorCode ?? null],
    );
  } else {
    memoryEvents.unshift({ id, occurredAt, actor: event.actor, action: event.action, queueName: event.queueName, outcome: event.outcome, summary: event.summary });
  }
}

export async function listAuditEvents(limit = 100): Promise<AuditEvent[]> {
  const db = database();
  if (!db) return memoryEvents.slice(0, limit);
  const result = await db.query(
    `select id, occurred_at, actor, action, queue_name, outcome, summary
       from audit_events order by occurred_at desc limit $1`,
    [Math.min(limit, 500)],
  );
  return result.rows.map((row) => ({
    id: row.id,
    occurredAt: new Date(row.occurred_at).toISOString(),
    actor: row.actor,
    action: row.action,
    queueName: row.queue_name,
    outcome: row.outcome,
    summary: row.summary,
  }));
}
