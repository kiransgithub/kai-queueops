import "server-only";

import { CoreV1Api, CustomObjectsApi, KubeConfig, V1DeleteOptions } from "@kubernetes/client-node";
import type { KaiQueue, QueueInput } from "@/lib/domain/queue";
import { mockQueues } from "@/lib/mock-data";
import { fromRawQueue, toRawQueue, type RawPod, type RawPodGroup, type RawPodMetric, type RawQueue } from "@/lib/kai/mapper";

const QUEUE_API = { group: "scheduling.run.ai", version: "v2", plural: "queues" } as const;
const POD_GROUP_API = { group: "scheduling.run.ai", version: "v2alpha2", plural: "podgroups" } as const;
const POD_METRICS_API = { group: "metrics.k8s.io", version: "v1beta1", plural: "pods" } as const;

export interface QueueRepository {
  readonly clusterName: string;
  list(): Promise<KaiQueue[]>;
  get(name: string): Promise<KaiQueue | undefined>;
  create(input: QueueInput): Promise<KaiQueue>;
  update(name: string, input: QueueInput): Promise<KaiQueue>;
  delete(name: string, resourceVersion?: string): Promise<void>;
}

class KubernetesQueueRepository implements QueueRepository {
  private readonly api: CustomObjectsApi;
  private readonly coreApi: CoreV1Api;
  readonly clusterName: string;

  constructor() {
    const kubeConfig = new KubeConfig();
    kubeConfig.loadFromDefault();
    this.clusterName = kubeConfig.getCurrentContext() || "in-cluster";
    this.api = kubeConfig.makeApiClient(CustomObjectsApi);
    this.coreApi = kubeConfig.makeApiClient(CoreV1Api);
  }

  async list() {
    const [queueList, podGroupList, podList, podMetricList] = await Promise.all([
      this.api.listClusterCustomObject(QUEUE_API),
      this.api.listClusterCustomObject(POD_GROUP_API).catch(() => ({ items: [] })),
      this.coreApi.listPodForAllNamespaces({ labelSelector: "kai.scheduler/queue" }).catch(() => ({ items: [] })),
      this.api.listClusterCustomObject(POD_METRICS_API).catch(() => undefined),
    ]);
    const podGroups = ((podGroupList as { items?: RawPodGroup[] }).items ?? []);
    const pods = ((podList as { items?: RawPod[] }).items ?? []);
    const podMetrics = ((podMetricList as { items?: RawPodMetric[] } | undefined)?.items ?? []);
    return ((queueList as { items?: RawQueue[] }).items ?? []).map((queue) => fromRawQueue(queue, podGroups, pods, podMetrics, podMetricList !== undefined));
  }

  async get(name: string) {
    const raw = await this.api.getClusterCustomObject({ ...QUEUE_API, name }).catch((error: unknown) => {
      if (statusCode(error) === 404) return undefined;
      throw error;
    });
    return raw ? fromRawQueue(raw as RawQueue, []) : undefined;
  }

  async create(input: QueueInput) {
    const created = await this.api.createClusterCustomObject({ ...QUEUE_API, body: toRawQueue(input), fieldManager: "kai-queueops", fieldValidation: "Strict" });
    return fromRawQueue(created as RawQueue, []);
  }

  async update(name: string, input: QueueInput) {
    const current = await this.api.getClusterCustomObject({ ...QUEUE_API, name }) as RawQueue;
    if (input.resourceVersion && current.metadata.resourceVersion !== input.resourceVersion) {
      throw new QueueConflictError("This queue changed in the cluster. Refresh before applying your edits.");
    }
    const updated = await this.api.replaceClusterCustomObject({
      ...QUEUE_API,
      name,
      body: toRawQueue({ ...input, name }, current.metadata.resourceVersion),
      fieldManager: "kai-queueops",
      fieldValidation: "Strict",
    });
    return fromRawQueue(updated as RawQueue, []);
  }

  async delete(name: string, resourceVersion?: string) {
    const body = new V1DeleteOptions();
    body.preconditions = resourceVersion ? { resourceVersion } : undefined;
    body.propagationPolicy = "Foreground";
    await this.api.deleteClusterCustomObject({ ...QUEUE_API, name, body });
  }
}

let mutableMockQueues = structuredClone(mockQueues);

class MockQueueRepository implements QueueRepository {
  readonly clusterName = "demo-cluster";

  async list() { return structuredClone(mutableMockQueues); }
  async get(name: string) { return structuredClone(mutableMockQueues.find((queue) => queue.name === name)); }
  async create(input: QueueInput) {
    const now = new Date().toISOString();
    const raw = toRawQueue(input);
    const queue = fromRawQueue({ ...raw, metadata: { ...raw.metadata, resourceVersion: "1", creationTimestamp: now } }, []);
    mutableMockQueues.push(queue);
    return structuredClone(queue);
  }
  async update(name: string, input: QueueInput) {
    const index = mutableMockQueues.findIndex((queue) => queue.name === name);
    if (index < 0) throw new Error(`Queue ${name} was not found`);
    const current = mutableMockQueues[index];
    const queue: KaiQueue = {
      ...current,
      ...input,
      displayName: input.displayName ?? "",
      parentQueue: input.parentQueue || undefined,
      labels: input.labels,
      resourceVersion: `${Number(current.resourceVersion ?? 0) + 1}`,
      updatedAt: new Date().toISOString(),
      resources: {
        cpu: { ...current.resources.cpu, ...input.resources.cpu },
        memory: { ...current.resources.memory, ...input.resources.memory },
        gpu: { ...current.resources.gpu, ...input.resources.gpu },
      },
    };
    mutableMockQueues[index] = queue;
    return structuredClone(queue);
  }
  async delete(name: string) { mutableMockQueues = mutableMockQueues.filter((queue) => queue.name !== name); }
}

export class QueueConflictError extends Error {}

export function getQueueRepository(): QueueRepository {
  return process.env.KAI_DATA_MODE === "kubernetes" ? new KubernetesQueueRepository() : new MockQueueRepository();
}

export function statusCode(error: unknown) {
  if (typeof error !== "object" || error === null) return undefined;
  const candidate = error as { code?: number; statusCode?: number; response?: { statusCode?: number; status?: number } };
  return candidate.code ?? candidate.statusCode ?? candidate.response?.statusCode ?? candidate.response?.status;
}
