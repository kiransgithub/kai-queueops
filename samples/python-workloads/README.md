# Python queue workload samples

These bounded jobs demonstrate both sides of the dashboard:

- KAI Queue status updates the requested and allocated values when the pods are admitted.
- Kubernetes Metrics Server updates measured CPU and memory after its next sample.

The defaults target the leaf queues created by `deploy/test-environment.yaml`:

| Job | Queue | Request | Measured load |
| --- | --- | --- | --- |
| `kai-sample-cpu-pressure` | `model-training` | 4 CPU, 96 MiB | Approximately 4 CPU cores for 10 minutes |
| `kai-sample-memory-pressure` | `batch-evaluation` | 250m CPU, 1 GiB | Approximately 768 MiB resident memory for 10 minutes |

Apply both jobs from the repository root:

```powershell
kubectl apply -k .\samples\python-workloads
kubectl get pods -n kai-queueops-test -l app.kubernetes.io/part-of=kai-queueops-workload-samples -w
```

Open the Overview and Queues pages. The application refreshes every 10 seconds. Metrics Server can take roughly one sampling interval before measured values appear.

To use different leaf queues, edit both occurrences of `kai.scheduler/queue` for the corresponding Job and pod template in `jobs.yaml`. Parent queues cannot accept workloads.

Run the samples again after they complete:

```powershell
kubectl delete jobs -n kai-queueops-test -l app.kubernetes.io/part-of=kai-queueops-workload-samples
kubectl apply -k .\samples\python-workloads
```

Stop them early:

```powershell
kubectl delete jobs -n kai-queueops-test -l app.kubernetes.io/part-of=kai-queueops-workload-samples
```

The jobs are intentionally bounded and use container resource limits. The Metrics API provides current CPU and memory samples, not durable history; Prometheus is still required for long-term retention, disk I/O, network throughput, and alert history.
