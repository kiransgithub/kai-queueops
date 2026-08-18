import { z } from "zod";

const httpUrl = z.string().url().refine((value) => value.startsWith("https://") || value.startsWith("http://"), "Use an HTTP(S) URL");

export const uiConfigSchema = z.object({
  branding: z.object({
    appName: z.string().trim().min(1).max(80).default("KAI QueueOps"),
    shortName: z.string().trim().min(1).max(16).default("KAI"),
    productLabel: z.string().trim().min(1).max(32).default("QUEUEOPS"),
    accentColor: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Use a six-digit hex color").default("#8fcb58"),
  }).default({ appName: "KAI QueueOps", shortName: "KAI", productLabel: "QUEUEOPS", accentColor: "#8fcb58" }),
  identity: z.object({
    fallbackDisplayName: z.string().trim().min(1).max(80).default("Local Administrator"),
    fallbackRole: z.string().trim().min(1).max(80).default("Cluster administrator"),
  }).default({ fallbackDisplayName: "Local Administrator", fallbackRole: "Cluster administrator" }),
  links: z.object({
    helpUrl: httpUrl.default("https://github.com/kai-scheduler/KAI-Scheduler/tree/main/docs"),
    queueDocsUrl: httpUrl.default("https://github.com/kai-scheduler/KAI-Scheduler/blob/main/docs/queues/README.md"),
    supportEmail: z.union([z.literal(""), z.string().email()]).default(""),
  }).default({ helpUrl: "https://github.com/kai-scheduler/KAI-Scheduler/tree/main/docs", queueDocsUrl: "https://github.com/kai-scheduler/KAI-Scheduler/blob/main/docs/queues/README.md", supportEmail: "" }),
  features: z.object({
    showAudit: z.boolean().default(true),
    showCluster: z.boolean().default(true),
    showRecentChanges: z.boolean().default(true),
    showExtendedTelemetry: z.boolean().default(true),
  }).default({ showAudit: true, showCluster: true, showRecentChanges: true, showExtendedTelemetry: true }),
  behavior: z.object({
    refreshIntervalSeconds: z.number().int().min(5).max(300).default(10),
  }).default({ refreshIntervalSeconds: 10 }),
}).strict();

export const DEFAULT_UI_CONFIG = uiConfigSchema.parse({});
export type UiConfig = z.infer<typeof uiConfigSchema>;

export type UiIdentity = {
  username: string;
  displayName: string;
  role: string;
  source: "trusted-proxy" | "local-development" | "unconfigured";
};

export type UiBootstrap = { config: UiConfig; identity: UiIdentity };
