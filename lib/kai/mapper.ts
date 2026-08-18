import type { KaiQueue, QueueHealth, QueueInput, ResourceKey } from "@/lib/domain/queue";

export type RawQueue = {
  apiVersion?: string;
  kind?: string;
  metadata: {
    name: string;
    labels?: Record<string, string>;
    resourceVersion?: string;
    creationTimestamp?: string;
  };
  spec?: {
    displayName?: string;
    parentQueue?: string;
    priority?: number;
    preemptMinRuntime?: string;
    reclaimMinRuntime?: string;
    resources?: Record<ResourceKey, { quota?: number; limit?: number; overQuotaWeight?: number }>;
  };
  status?: {
    conditions?: Array<{ type: string; status: string; reason?: string; message?: string }>;
    childQueues?: string[];
    allocated?: Record<string, string | number>;
    requested?: Record<string, string | number>;
  };
};

export type RawPodGroup = {
  spec?: { queue?: string };
  status?: { phase?: string; running?: number; pending?: number };
};

export type RawPod = {
  metadata?: { name?: string; namespace?: string; labels?: Record<string, string> };
  status?: { phase?: string };
};

export type RawPodMetric = {
  metadata?: { name?: string; namespace?: string };
  timestamp?: string;
  containers?: Array<{ usage?: { cpu?: string; memory?: string } }>;
};

const MEBIBYTES_PER_GIBIBYTE = 1024;
const MEGABYTES_PER_GIBIBYTE = 1073.741824;

export function fromRawQueue(raw: RawQueue, podGroups: RawPodGroup[], pods: RawPod[] = [], podMetrics: RawPodMetric[] = [], metricsAvailable = false): KaiQueue {
  const conditions = raw.status?.conditions ?? [];
  const resources = {
    cpu: resourceFromRaw("cpu", raw),
    memory: resourceFromRaw("memory", raw),
    gpu: resourceFromRaw("gpu", raw),
  };
  const health: QueueHealth = conditions.some((item) => item.type === "Orphan" && item.status === "True")
    ? "orphaned"
    : conditions.some((item) => item.type === "OverQuota" && item.status === "True") || Object.values(resources).some((resource) => resource.quota >= 0 && resource.allocated > resource.quota)
      ? "over-quota"
      : "healthy";
  const matchingGroups = podGroups.filter((group) => group.spec?.queue === raw.metadata.name);
  const matchingPods = pods.filter((pod) => pod.metadata?.labels?.["kai.scheduler/queue"] === raw.metadata.name);
  const running = matchingPods.length
    ? matchingPods.filter((pod) => pod.status?.phase === "Running").length
    : matchingGroups.reduce((total, group) => total + (group.status?.running ?? (group.status?.phase === "Running" ? 1 : 0)), 0);
  const pending = matchingPods.length
    ? matchingPods.filter((pod) => pod.status?.phase === "Pending").length
    : matchingGroups.reduce((total, group) => total + (group.status?.pending ?? (!["Running", "Completed", "Succeeded", "Failed"].includes(group.status?.phase ?? "") ? 1 : 0)), 0);
  const matchingPodKeys = new Set(matchingPods.map((pod) => `${pod.metadata?.namespace ?? "default"}/${pod.metadata?.name ?? ""}`));
  const matchingMetrics = podMetrics.filter((metric) => matchingPodKeys.has(`${metric.metadata?.namespace ?? "default"}/${metric.metadata?.name ?? ""}`));
  const observedUsage = {
    available: metricsAvailable,
    cpu: matchingMetrics.reduce((total, metric) => total + (metric.containers ?? []).reduce((sum, container) => sum + cpuQuantityToCores(container.usage?.cpu), 0), 0),
    memory: matchingMetrics.reduce((total, metric) => total + (metric.containers ?? []).reduce((sum, container) => sum + memoryQuantityToGiB(container.usage?.memory), 0), 0),
    sampledAt: matchingMetrics.map((metric) => metric.timestamp).filter(Boolean).sort().at(-1),
  };
  return {
    name: raw.metadata.name,
    displayName: raw.spec?.displayName ?? "",
    parentQueue: raw.spec?.parentQueue,
    priority: raw.spec?.priority ?? 100,
    preemptMinRuntime: raw.spec?.preemptMinRuntime,
    reclaimMinRuntime: raw.spec?.reclaimMinRuntime,
    labels: raw.metadata.labels ?? {},
    health,
    conditions,
    childQueues: raw.status?.childQueues ?? [],
    workloads: { running, pending },
    observedUsage,
    resources,
    updatedAt: raw.metadata.creationTimestamp ?? new Date().toISOString(),
    resourceVersion: raw.metadata.resourceVersion,
  };
}

export function cpuQuantityToCores(value?: string) {
  if (!value) return 0;
  const amount = Number.parseFloat(value);
  if (!Number.isFinite(amount)) return 0;
  if (value.endsWith("n")) return amount / 1_000_000_000;
  if (value.endsWith("u")) return amount / 1_000_000;
  if (value.endsWith("m")) return amount / 1_000;
  return amount;
}

export function memoryQuantityToGiB(value?: string) {
  if (!value) return 0;
  const amount = Number.parseFloat(value);
  if (!Number.isFinite(amount)) return 0;
  if (value.endsWith("Ki")) return amount / 1024 / 1024;
  if (value.endsWith("Mi")) return amount / 1024;
  if (value.endsWith("Gi")) return amount;
  if (value.endsWith("Ti")) return amount * 1024;
  if (value.endsWith("K")) return amount * 1000 / 1024 ** 3;
  if (value.endsWith("M")) return amount * 1_000_000 / 1024 ** 3;
  if (value.endsWith("G")) return amount * 1_000_000_000 / 1024 ** 3;
  return amount / 1024 ** 3;
}

function resourceFromRaw(resource: ResourceKey, raw: RawQueue) {
  const policy = raw.spec?.resources?.[resource] ?? {};
  return {
    quota: policyToUi(resource, policy.quota ?? 0),
    limit: policyToUi(resource, policy.limit ?? 0),
    overQuotaWeight: policy.overQuotaWeight ?? 0,
    allocated: statusToUi(resource, findStatusValue(raw.status?.allocated, resource)),
    requested: statusToUi(resource, findStatusValue(raw.status?.requested, resource)),
  };
}

function findStatusValue(list: Record<string, string | number> | undefined, resource: ResourceKey) {
  if (!list) return 0;
  if (resource === "cpu") return list.cpu ?? 0;
  if (resource === "memory") return list.memory ?? 0;
  const key = Object.keys(list).find((name) => name === "gpu" || name.endsWith("/gpu"));
  return key ? list[key] : 0;
}

export function policyToUi(resource: ResourceKey, value: number) {
  if (value === -1) return -1;
  if (resource === "cpu") return roundForDisplay(value / 1000);
  if (resource === "memory") return roundForDisplay(value / MEGABYTES_PER_GIBIBYTE);
  return roundForDisplay(value);
}

function statusToUi(resource: ResourceKey, value: string | number) {
  if (typeof value === "number") return value;
  const parsed = Number.parseFloat(value);
  if (!Number.isFinite(parsed)) return 0;
  if (resource === "cpu") return value.endsWith("m") ? parsed / 1000 : parsed;
  if (resource === "memory") {
    if (value.endsWith("Ki")) return parsed / 1024 / 1024;
    if (value.endsWith("Mi")) return parsed / MEBIBYTES_PER_GIBIBYTE;
    if (value.endsWith("Gi")) return parsed;
    if (value.endsWith("Ti")) return parsed * 1024;
    return parsed / 1024 / 1024 / 1024;
  }
  return parsed;
}

export function uiToPolicy(resource: ResourceKey, value: number) {
  if (value === -1) return -1;
  if (resource === "cpu") return Math.round(value * 1000);
  if (resource === "memory") return Math.round(value * MEGABYTES_PER_GIBIBYTE);
  return roundForDisplay(value);
}

export function manifestResourceValue(resource: ResourceKey, value: number) {
  const policyValue = uiToPolicy(resource, value);
  if (value === -1) return `${policyValue} # unlimited`;
  if (resource === "cpu") return `${policyValue} # ${cleanResourceNumber(value)} cores`;
  if (resource === "memory") return `${policyValue} # ${cleanResourceNumber(value)} GiB`;
  return `${policyValue}`;
}

export function cleanResourceNumber(value: number) {
  return Number(value.toFixed(3)).toString();
}

function roundForDisplay(value: number) {
  return Math.round((value + Number.EPSILON) * 1000) / 1000;
}

export function toRawQueue(input: QueueInput, resourceVersion?: string): RawQueue {
  const labels = Object.fromEntries(Object.entries(input.labels).filter(([, value]) => value));
  return {
    apiVersion: "scheduling.run.ai/v2",
    kind: "Queue",
    metadata: {
      name: input.name,
      labels,
      ...(resourceVersion ? { resourceVersion } : {}),
    },
    spec: {
      displayName: input.displayName || undefined,
      parentQueue: input.parentQueue || undefined,
      priority: input.priority,
      preemptMinRuntime: input.preemptMinRuntime,
      reclaimMinRuntime: input.reclaimMinRuntime,
      resources: {
        cpu: mapPolicy("cpu", input),
        memory: mapPolicy("memory", input),
        gpu: mapPolicy("gpu", input),
      },
    },
  };
}

function mapPolicy(resource: ResourceKey, input: QueueInput) {
  const policy = input.resources[resource];
  return {
    quota: uiToPolicy(resource, policy.quota),
    limit: uiToPolicy(resource, policy.limit),
    overQuotaWeight: policy.overQuotaWeight,
  };
}
