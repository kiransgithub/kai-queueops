import type { KaiQueue } from "@/lib/domain/queue";

export const mockQueues: KaiQueue[] = [
  {
    name: "platform",
    displayName: "Platform engineering",
    priority: 200,
    labels: { "kai.scheduler/node-pool": "gpu-prod", owner: "platform" },
    health: "healthy",
    conditions: [],
    childQueues: ["foundation-models", "research"],
    workloads: { running: 29, pending: 7 },
    resources: {
      cpu: { quota: 180, limit: 280, overQuotaWeight: 2, allocated: 143, requested: 214 },
      memory: { quota: 640, limit: 900, overQuotaWeight: 2, allocated: 521, requested: 708 },
      gpu: { quota: 40, limit: 54, overQuotaWeight: 3, allocated: 35.5, requested: 49 },
    },
    updatedAt: "2026-08-17T15:42:00Z",
    resourceVersion: "18420391",
  },
  {
    name: "foundation-models",
    displayName: "Foundation models",
    parentQueue: "platform",
    priority: 300,
    labels: { "kai.scheduler/node-pool": "gpu-prod", owner: "genai" },
    health: "over-quota",
    conditions: [
      { type: "OverQuota", status: "True", reason: "GpuQuotaExceeded", message: "GPU allocation is 3.5 above deserved quota." },
    ],
    childQueues: [],
    workloads: { running: 16, pending: 4 },
    resources: {
      cpu: { quota: 80, limit: 150, overQuotaWeight: 3, allocated: 92, requested: 131 },
      memory: { quota: 320, limit: 520, overQuotaWeight: 3, allocated: 348, requested: 477 },
      gpu: { quota: 20, limit: 30, overQuotaWeight: 5, allocated: 23.5, requested: 29 },
    },
    updatedAt: "2026-08-17T15:41:00Z",
    resourceVersion: "18420240",
  },
  {
    name: "research",
    displayName: "Research",
    parentQueue: "platform",
    priority: 140,
    labels: { "kai.scheduler/node-pool": "gpu-prod", owner: "research" },
    health: "healthy",
    conditions: [],
    childQueues: [],
    workloads: { running: 13, pending: 3 },
    resources: {
      cpu: { quota: 100, limit: 130, overQuotaWeight: 2, allocated: 51, requested: 83 },
      memory: { quota: 320, limit: 380, overQuotaWeight: 2, allocated: 173, requested: 231 },
      gpu: { quota: 20, limit: 24, overQuotaWeight: 2, allocated: 12, requested: 20 },
    },
    updatedAt: "2026-08-17T15:39:00Z",
    resourceVersion: "18419821",
  },
  {
    name: "customer-ai",
    displayName: "Customer AI",
    priority: 180,
    labels: { "kai.scheduler/node-pool": "gpu-prod", owner: "product" },
    health: "attention",
    conditions: [],
    childQueues: ["inference-prod", "evaluation"],
    workloads: { running: 21, pending: 2 },
    resources: {
      cpu: { quota: 120, limit: 220, overQuotaWeight: 2, allocated: 106, requested: 139 },
      memory: { quota: 500, limit: 760, overQuotaWeight: 2, allocated: 411, requested: 556 },
      gpu: { quota: 18, limit: 28, overQuotaWeight: 2, allocated: 14, requested: 21 },
    },
    updatedAt: "2026-08-17T15:38:00Z",
    resourceVersion: "18419510",
  },
  {
    name: "inference-prod",
    displayName: "Production inference",
    parentQueue: "customer-ai",
    priority: 400,
    labels: { "kai.scheduler/node-pool": "gpu-prod", owner: "serving" },
    health: "healthy",
    conditions: [],
    childQueues: [],
    workloads: { running: 18, pending: 0 },
    resources: {
      cpu: { quota: 90, limit: 160, overQuotaWeight: 4, allocated: 78, requested: 82 },
      memory: { quota: 360, limit: 560, overQuotaWeight: 4, allocated: 302, requested: 318 },
      gpu: { quota: 14, limit: 20, overQuotaWeight: 4, allocated: 12, requested: 13 },
    },
    updatedAt: "2026-08-17T15:36:00Z",
    resourceVersion: "18419003",
  },
  {
    name: "evaluation",
    displayName: "Evaluation & QA",
    parentQueue: "customer-ai",
    priority: 110,
    labels: { "kai.scheduler/node-pool": "gpu-prod", owner: "ml-quality" },
    health: "over-quota",
    conditions: [{ type: "OverQuota", status: "True", reason: "CpuQuotaExceeded" }],
    childQueues: [],
    workloads: { running: 3, pending: 2 },
    resources: {
      cpu: { quota: 30, limit: 60, overQuotaWeight: 1, allocated: 37, requested: 57 },
      memory: { quota: 140, limit: 200, overQuotaWeight: 1, allocated: 109, requested: 178 },
      gpu: { quota: 4, limit: 8, overQuotaWeight: 1, allocated: 2, requested: 8 },
    },
    updatedAt: "2026-08-17T15:35:00Z",
    resourceVersion: "18418842",
  },
  {
    name: "sandbox",
    displayName: "Shared sandbox",
    priority: 50,
    labels: { "kai.scheduler/node-pool": "mixed", owner: "developer-experience" },
    health: "healthy",
    conditions: [],
    childQueues: [],
    workloads: { running: 7, pending: 6 },
    resources: {
      cpu: { quota: 20, limit: 80, overQuotaWeight: 1, allocated: 16, requested: 62 },
      memory: { quota: 80, limit: 240, overQuotaWeight: 1, allocated: 63, requested: 218 },
      gpu: { quota: 2, limit: 8, overQuotaWeight: 1, allocated: 1.5, requested: 7 },
    },
    updatedAt: "2026-08-17T15:29:00Z",
    resourceVersion: "18417944",
  },
  {
    name: "legacy-training",
    displayName: "Legacy training",
    parentQueue: "retired-platform",
    priority: 75,
    labels: { "kai.scheduler/node-pool": "gpu-prod", owner: "migration" },
    health: "orphaned",
    conditions: [
      { type: "Orphan", status: "True", reason: "ParentQueueNotFound", message: "Parent queue retired-platform does not exist." },
    ],
    childQueues: [],
    workloads: { running: 0, pending: 2 },
    resources: {
      cpu: { quota: 24, limit: 48, overQuotaWeight: 1, allocated: 0, requested: 20 },
      memory: { quota: 96, limit: 192, overQuotaWeight: 1, allocated: 0, requested: 84 },
      gpu: { quota: 4, limit: 6, overQuotaWeight: 1, allocated: 0, requested: 4 },
    },
    updatedAt: "2026-08-17T14:57:00Z",
    resourceVersion: "18412271",
  },
];

export const resourceHistory = [
  { time: "00:00", cpu: 42, memory: 48, gpu: 51, quota: 70 },
  { time: "03:00", cpu: 46, memory: 50, gpu: 55, quota: 70 },
  { time: "06:00", cpu: 53, memory: 57, gpu: 63, quota: 70 },
  { time: "09:00", cpu: 61, memory: 64, gpu: 71, quota: 70 },
  { time: "12:00", cpu: 67, memory: 69, gpu: 78, quota: 70 },
  { time: "15:00", cpu: 63, memory: 65, gpu: 74, quota: 70 },
  { time: "Now", cpu: 58, memory: 61, gpu: 72, quota: 70 },
];

export type AuditEvent = {
  id: string;
  occurredAt: string;
  actor: string;
  action: "CREATE" | "UPDATE" | "DELETE";
  queueName: string;
  outcome: "SUCCESS" | "FAILED";
  summary: string;
};

export const mockAuditEvents: AuditEvent[] = [
  { id: "evt-1042", occurredAt: "2026-08-17T15:42:00Z", actor: "sarah.chen@acme.io", action: "UPDATE", queueName: "foundation-models", outcome: "SUCCESS", summary: "GPU limit 28 → 30; over-quota weight 4 → 5" },
  { id: "evt-1041", occurredAt: "2026-08-17T14:19:00Z", actor: "platform-bot", action: "UPDATE", queueName: "inference-prod", outcome: "SUCCESS", summary: "Reclaim minimum runtime 10m → 15m" },
  { id: "evt-1040", occurredAt: "2026-08-17T12:08:00Z", actor: "mateo@acme.io", action: "CREATE", queueName: "evaluation", outcome: "SUCCESS", summary: "Queue created under customer-ai" },
  { id: "evt-1039", occurredAt: "2026-08-17T10:31:00Z", actor: "alex@acme.io", action: "DELETE", queueName: "research-vision-old", outcome: "FAILED", summary: "Blocked: queue still had 2 running workloads" },
];
