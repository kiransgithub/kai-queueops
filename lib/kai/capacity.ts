import "server-only";

import { CoreV1Api, KubeConfig } from "@kubernetes/client-node";

export type ClusterCapacity = { cpu: number; memory: number; gpu: number; nodes: number };

export async function getClusterCapacity(): Promise<ClusterCapacity> {
  if (process.env.KAI_DATA_MODE !== "kubernetes") return { cpu: 480, memory: 1900, gpu: 72, nodes: 64 };
  const kubeConfig = new KubeConfig();
  kubeConfig.loadFromDefault();
  const core = kubeConfig.makeApiClient(CoreV1Api);
  const response = await core.listNode();
  const readyNodes = response.items.filter((node) => !node.spec?.unschedulable && node.status?.conditions?.some((condition) => condition.type === "Ready" && condition.status === "True"));
  return readyNodes.reduce<ClusterCapacity>((total, node) => {
    const allocatable = node.status?.allocatable ?? {};
    const gpuKey = Object.keys(allocatable).find((key) => key === "gpu" || key.endsWith("/gpu"));
    return {
      cpu: total.cpu + parseCpu(allocatable.cpu),
      memory: total.memory + parseMemoryGiB(allocatable.memory),
      gpu: total.gpu + Number.parseFloat(gpuKey ? allocatable[gpuKey] : "0"),
      nodes: total.nodes + 1,
    };
  }, { cpu: 0, memory: 0, gpu: 0, nodes: 0 });
}

function parseCpu(value?: string) {
  if (!value) return 0;
  const numeric = Number.parseFloat(value);
  return value.endsWith("m") ? numeric / 1000 : numeric;
}

function parseMemoryGiB(value?: string) {
  if (!value) return 0;
  const numeric = Number.parseFloat(value);
  if (value.endsWith("Ki")) return numeric / 1024 / 1024;
  if (value.endsWith("Mi")) return numeric / 1024;
  if (value.endsWith("Gi")) return numeric;
  return numeric / 1024 / 1024 / 1024;
}
