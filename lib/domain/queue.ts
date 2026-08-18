import { z } from "zod";

export const RESOURCE_KEYS = ["cpu", "memory", "gpu"] as const;
export type ResourceKey = (typeof RESOURCE_KEYS)[number];

export type QueueResource = {
  quota: number;
  limit: number;
  overQuotaWeight: number;
  allocated: number;
  requested: number;
};

export type QueueHealth = "healthy" | "over-quota" | "orphaned" | "attention";

export type ObservedUsage = {
  available: boolean;
  cpu: number;
  memory: number;
  sampledAt?: string;
};

export type ResourceSample = {
  time: string;
  sampledAt: string;
  cpu: number;
  memory: number;
  gpu: number;
  quota: number;
};

export type KaiQueue = {
  name: string;
  displayName: string;
  parentQueue?: string;
  priority: number;
  preemptMinRuntime?: string;
  reclaimMinRuntime?: string;
  labels: Record<string, string>;
  resources: Record<ResourceKey, QueueResource>;
  health: QueueHealth;
  conditions: Array<{ type: string; status: string; reason?: string; message?: string }>;
  childQueues: string[];
  workloads: { running: number; pending: number };
  observedUsage?: ObservedUsage;
  updatedAt: string;
  resourceVersion?: string;
};

const resourceInputSchema = z
  .object({
    quota: z.number().min(-1),
    limit: z.number().min(-1),
    overQuotaWeight: z.number().nonnegative(),
  })
  .superRefine((resource, ctx) => {
    if (resource.quota !== -1 && resource.limit !== -1 && resource.quota > resource.limit) {
      ctx.addIssue({
        code: "custom",
        path: ["limit"],
        message: "Limit must be greater than or equal to quota",
      });
    }
  });

export const queueInputSchema = z.object({
  name: z
    .string()
    .min(1)
    .max(253)
    .regex(/^[a-z0-9]([-a-z0-9]*[a-z0-9])?$/, "Use a Kubernetes DNS-compatible name"),
  displayName: z.string().trim().max(128).optional().default(""),
  parentQueue: z.string().max(253).optional(),
  priority: z.number().int().min(-2_147_483_648).max(2_147_483_647).default(100),
  preemptMinRuntime: z.string().regex(/^([0-9]+(ms|s|m|h))+$/, "Use a duration such as 10m or 1h").optional(),
  reclaimMinRuntime: z.string().regex(/^([0-9]+(ms|s|m|h))+$/, "Use a duration such as 5m or 1h").optional(),
  labels: z.record(z.string(), z.string()).default({}),
  resources: z.object({
    cpu: resourceInputSchema,
    memory: resourceInputSchema,
    gpu: resourceInputSchema,
  }),
  resourceVersion: z.string().optional(),
});

export type QueueInput = z.infer<typeof queueInputSchema>;

export function percent(value: number, total: number) {
  if (total <= 0) return 0;
  return Math.min(100, Math.round((value / total) * 100));
}

export function isOverQuota(resource: QueueResource) {
  return resource.quota >= 0 && resource.allocated > resource.quota;
}

export function isOverLimit(resource: QueueResource) {
  return resource.limit >= 0 && resource.allocated > resource.limit;
}

export const RESOURCE_META: Record<
  ResourceKey,
  { label: string; short: string; unit: string; color: string; decimals: number }
> = {
  cpu: { label: "CPU", short: "CPU", unit: "cores", color: "var(--cyan)", decimals: 1 },
  memory: { label: "Memory", short: "MEM", unit: "GiB", color: "var(--violet)", decimals: 0 },
  gpu: { label: "GPU", short: "GPU", unit: "GPUs", color: "var(--lime)", decimals: 1 },
};

export function formatResource(key: ResourceKey, value: number) {
  if (value === -1) return "Unlimited";
  const meta = RESOURCE_META[key];
  return `${value.toLocaleString(undefined, {
    maximumFractionDigits: meta.decimals,
  })} ${meta.unit}`;
}
