"use client";

import { useMemo, useState, type FormEvent } from "react";
import { AlertTriangle, Check, ChevronLeft, ChevronRight, CircleHelp, Code2, Info, Settings2, SlidersHorizontal, Sparkles, X } from "lucide-react";
import type { KaiQueue, QueueInput, ResourceKey } from "@/lib/domain/queue";
import { RESOURCE_KEYS, RESOURCE_META, queueInputSchema } from "@/lib/domain/queue";
import { Button } from "@/components/ui";
import type { ClusterCapacity } from "@/lib/kai/capacity";
import { cleanResourceNumber, manifestResourceValue } from "@/lib/kai/mapper";

function defaultsFor(capacity: ClusterCapacity): QueueInput {
  const cpuQuota = Math.max(0, Math.min(4, Math.floor(capacity.cpu * 0.25)));
  const memoryQuota = Math.max(0, Math.min(4, Math.floor(capacity.memory * 0.25)));
  const gpuQuota = capacity.gpu > 0 ? 1 : 0;
  return {
  name: "",
  displayName: "",
  parentQueue: "",
  priority: 100,
  labels: { "kai.scheduler/node-pool": "", owner: "" },
    resources: {
      cpu: { quota: cpuQuota, limit: Math.min(capacity.cpu, Math.max(cpuQuota, cpuQuota * 2)), overQuotaWeight: 1 },
      memory: { quota: memoryQuota, limit: Math.min(capacity.memory, Math.max(memoryQuota, memoryQuota * 2)), overQuotaWeight: 1 },
      gpu: { quota: gpuQuota, limit: Math.min(capacity.gpu, Math.max(gpuQuota, gpuQuota * 2)), overQuotaWeight: 1 },
    },
  };
}

export function QueueFormDialog({ mode, initialValue, queues, capacity, onClose, onSave }: { mode: "create" | "edit"; initialValue?: QueueInput; queues: KaiQueue[]; capacity: ClusterCapacity; onClose: () => void; onSave: (value: QueueInput) => void | Promise<void> }) {
  const [step, setStep] = useState(1);
  const [value, setValue] = useState<QueueInput>(initialValue ?? defaultsFor(capacity));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [advanced, setAdvanced] = useState(Boolean(initialValue?.preemptMinRuntime || initialValue?.reclaimMinRuntime));
  const [saving, setSaving] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const parentOptions = queues.filter((queue) => queue.name !== value.name && !queue.parentQueue);
  const yaml = useMemo(() => buildYaml(value), [value]);

  function patchField<K extends keyof QueueInput>(key: K, next: QueueInput[K]) {
    setValue((current) => ({ ...current, [key]: next }));
    setErrors((current) => ({ ...current, [key]: "" }));
  }

  function patchResource(resource: ResourceKey, field: "quota" | "limit" | "overQuotaWeight", next: string) {
    setValue((current) => ({
      ...current,
      resources: { ...current.resources, [resource]: { ...current.resources[resource], [field]: Number(next) } },
    }));
    setErrors({});
  }

  function moveNext() {
    if (step === 1) {
      const nextErrors: Record<string, string> = {};
      if (!value.name) nextErrors.name = "Queue name is required";
      else if (!/^[a-z0-9]([-a-z0-9]*[a-z0-9])?$/.test(value.name)) nextErrors.name = "Use lowercase letters, numbers, and hyphens";
      if (queues.some((queue) => queue.name === value.name) && mode === "create") nextErrors.name = "A queue with this name already exists";
      if (Object.keys(nextErrors).length) { setErrors(nextErrors); return; }
    }
    setStep((current) => Math.min(3, current + 1));
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (step < 3) { moveNext(); return; }
    const parsed = queueInputSchema.safeParse(value);
    if (!parsed.success) {
      const nextErrors: Record<string, string> = {};
      for (const issue of parsed.error.issues) nextErrors[issue.path.join(".")] = issue.message;
      setErrors(nextErrors);
      const isResourceIssue = Object.keys(nextErrors).some((key) => key.startsWith("resources"));
      setStep(isResourceIssue ? 2 : 1);
      return;
    }
    setSaving(true);
    setSubmitError(null);
    try {
      await onSave(parsed.data);
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : "The queue could not be saved");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="modal-layer" role="presentation">
      <button className="modal-backdrop" onClick={onClose} aria-label="Close dialog" />
      <form className="queue-form-dialog" onSubmit={handleSubmit} aria-label={mode === "create" ? "Create queue" : `Edit ${value.name}`}>
        <header className="form-header">
          <div><span className="form-icon"><SlidersHorizontal size={19} /></span><span><small>{mode === "create" ? "NEW SCHEDULING QUEUE" : "QUEUE SETTINGS"}</small><h2>{mode === "create" ? "Create queue" : `Edit ${initialValue?.displayName || initialValue?.name}`}</h2></span></div>
          <button type="button" onClick={onClose} aria-label="Close"><X size={20} /></button>
        </header>
        <div className="form-stepper">
          <Step number={1} label="Identity & policy" active={step === 1} complete={step > 1} />
          <i />
          <Step number={2} label="Resources" active={step === 2} complete={step > 2} />
          <i />
          <Step number={3} label="Review" active={step === 3} complete={false} />
        </div>
        <div className="form-body">
          {step === 1 && (
            <div className="form-section">
              <div className="form-section-title"><span><Settings2 size={16} /><strong>Queue identity</strong></span><p>Choose a stable Kubernetes name and place the queue in the scheduling hierarchy.</p></div>
              <div className="field-grid">
                <Field label="Display name" hint="Friendly name shown to administrators" error={errors.displayName}><input autoFocus value={value.displayName ?? ""} onChange={(event) => patchField("displayName", event.target.value)} placeholder="Foundation models" /></Field>
                <Field label="Kubernetes name" hint="Immutable after creation" required error={errors.name}><input value={value.name} onChange={(event) => patchField("name", event.target.value.toLowerCase())} placeholder="foundation-models" disabled={mode === "edit"} /></Field>
                <Field label="Parent queue" hint="Only leaf queues can accept workloads" error={errors.parentQueue}><select value={value.parentQueue ?? ""} onChange={(event) => patchField("parentQueue", event.target.value)}><option value="">None · top-level queue</option>{parentOptions.map((queue) => <option key={queue.name} value={queue.name}>{queue.displayName || queue.name}</option>)}</select></Field>
                <Field label="Over-quota priority" hint="Higher values receive borrowed capacity first" error={errors.priority}><input type="number" value={value.priority} onChange={(event) => patchField("priority", Number(event.target.value))} /></Field>
                <Field label="Node pool / shard" hint="Queue label: kai.scheduler/node-pool"><select value={value.labels["kai.scheduler/node-pool"] ?? ""} onChange={(event) => patchField("labels", { ...value.labels, "kai.scheduler/node-pool": event.target.value })}><option value="">All nodes</option><option value="gpu-prod">gpu-prod</option><option value="gpu-h100">gpu-h100</option><option value="mixed">mixed</option></select></Field>
                <Field label="Owner" hint="Audit and cost-attribution label"><input value={value.labels.owner ?? ""} onChange={(event) => patchField("labels", { ...value.labels, owner: event.target.value })} placeholder="genai-platform" /></Field>
              </div>
              <button className="advanced-toggle" type="button" onClick={() => setAdvanced((current) => !current)}><Sparkles size={15} />Advanced runtime protection <ChevronRight size={15} className={advanced ? "rotate" : ""} /></button>
              {advanced && (
                <div className="field-grid advanced-fields">
                  <Field label="Preempt minimum runtime" hint="Examples: 10m, 1h"><input value={value.preemptMinRuntime ?? ""} onChange={(event) => patchField("preemptMinRuntime", event.target.value || undefined)} placeholder="10m" /></Field>
                  <Field label="Reclaim minimum runtime" hint="Protect borrowed workloads for this duration"><input value={value.reclaimMinRuntime ?? ""} onChange={(event) => patchField("reclaimMinRuntime", event.target.value || undefined)} placeholder="5m" /></Field>
                </div>
              )}
              <div className="form-callout"><Info size={16} /><p><strong>Hierarchy rule:</strong> parent queues distribute resources but cannot schedule workloads. Add a parent only when this should be a schedulable leaf.</p></div>
            </div>
          )}
          {step === 2 && (
            <div className="form-section resource-form-section">
              <div className="form-section-title"><span><SlidersHorizontal size={16} /><strong>Resource policy</strong></span><p>Define guarantees, hard caps, and each resource&apos;s share of burst capacity.</p></div>
              <div className="resource-form-table">
                <div className="resource-form-head"><span>RESOURCE</span><span>GUARANTEED QUOTA <CircleHelp size={13} /></span><span>HARD LIMIT <CircleHelp size={13} /></span><span>OVER-QUOTA WEIGHT <CircleHelp size={13} /></span></div>
                {RESOURCE_KEYS.map((resource) => (
                  <div className="resource-form-row" key={resource}>
                    <div><span className={`resource-monogram monogram-${resource}`}>{RESOURCE_META[resource].short}</span><span><strong>{RESOURCE_META[resource].label}</strong><small>{RESOURCE_META[resource].unit}</small></span></div>
                    <NumericField value={value.resources[resource].quota} onChange={(next) => patchResource(resource, "quota", next)} suffix={RESOURCE_META[resource].unit} error={errors[`resources.${resource}.quota`]} />
                    <NumericField value={value.resources[resource].limit} onChange={(next) => patchResource(resource, "limit", next)} suffix={RESOURCE_META[resource].unit} error={errors[`resources.${resource}.limit`]} />
                    <NumericField value={value.resources[resource].overQuotaWeight} onChange={(next) => patchResource(resource, "overQuotaWeight", next)} suffix="weight" error={errors[`resources.${resource}.overQuotaWeight`]} />
                  </div>
                ))}
              </div>
              <div className="special-values"><AlertTriangle size={16} /><div><strong>KAI special values</strong><p><code>-1</code> quota means unlimited guarantee; <code>-1</code> limit means no hard cap. <code>0</code> means no guarantee or no additional capacity. Use unlimited settings deliberately—they can defeat cluster-level governance.</p></div></div>
              <div className="resource-projection"><span><strong>Capacity check</strong><small>Against active cluster allocatable resources</small></span><div><CapacitySignal label="CPU" quota={value.resources.cpu.quota} capacity={capacity.cpu} /><CapacitySignal label="Memory" quota={value.resources.memory.quota} capacity={capacity.memory} /><CapacitySignal label="GPU" quota={value.resources.gpu.quota} capacity={capacity.gpu} /></div></div>
            </div>
          )}
          {step === 3 && (
            <div className="form-section review-section">
              <div className="form-section-title"><span><Check size={16} /><strong>Review and apply</strong></span><p>Confirm the resulting KAI Queue resource before writing it to the cluster.</p></div>
              <div className="review-grid">
                <div className="review-summary">
                  <div className="review-identity"><span className="queue-glyph queue-glyph-healthy" /><span><small>{value.parentQueue ? "LEAF QUEUE" : "TOP-LEVEL QUEUE"}</small><strong>{value.displayName || value.name}</strong><code>{value.name}</code></span></div>
                  <dl><div><dt>Parent</dt><dd>{value.parentQueue || "None"}</dd></div><div><dt>Priority</dt><dd>{value.priority}</dd></div><div><dt>Node pool</dt><dd>{value.labels["kai.scheduler/node-pool"] || "All nodes"}</dd></div><div><dt>Owner</dt><dd>{value.labels.owner || "Unassigned"}</dd></div></dl>
                  <div className="review-resources">{RESOURCE_KEYS.map((resource) => <div key={resource}><span className={`resource-monogram monogram-${resource}`}>{RESOURCE_META[resource].short}</span><span><small>{RESOURCE_META[resource].label}</small><strong>{cleanResourceNumber(value.resources[resource].quota)} <em>quota</em></strong><span>{cleanResourceNumber(value.resources[resource].limit)} limit · {cleanResourceNumber(value.resources[resource].overQuotaWeight)}× weight</span></span></div>)}</div>
                </div>
                <div className="review-yaml"><div><span><Code2 size={15} />Generated manifest</span><small>API v2</small></div><pre><code>{yaml}</code></pre></div>
              </div>
              <div className="apply-notice"><Check size={16} /><p>Server-side validation and optimistic concurrency will run before this change is applied. The complete before/after diff will be written to the audit log.</p></div>
              {submitError && <div className="submit-error"><AlertTriangle size={16} /><p>{submitError}</p></div>}
            </div>
          )}
        </div>
        <footer className="form-footer">
          <span>{step === 1 ? "Queue names follow Kubernetes DNS rules." : step === 2 ? "All resource values use KAI Queue v2 units." : "Ready to apply to the active cluster."}</span>
          <div>{step > 1 && <Button type="button" disabled={saving} onClick={() => setStep((current) => current - 1)}><ChevronLeft size={15} />Back</Button>}<Button type={step === 3 ? "submit" : "button"} loading={saving} kind="primary" onClick={step < 3 ? moveNext : undefined}>{step === 3 ? (mode === "create" ? "Create queue" : "Apply changes") : "Continue"}{step < 3 && <ChevronRight size={15} />}</Button></div>
        </footer>
      </form>
    </div>
  );
}

function Step({ number, label, active, complete }: { number: number; label: string; active: boolean; complete: boolean }) {
  return <span className={`${active ? "active" : ""} ${complete ? "complete" : ""}`}><i>{complete ? <Check size={13} /> : number}</i>{label}</span>;
}

function Field({ label, hint, required, error, children }: { label: string; hint: string; required?: boolean; error?: string; children: React.ReactNode }) {
  return <label className={`form-field ${error ? "field-error" : ""}`}><span><strong>{label}{required && <em>*</em>}</strong><small>{hint}</small></span>{children}{error && <b>{error}</b>}</label>;
}

function NumericField({ value, onChange, suffix, error }: { value: number; onChange: (value: string) => void; suffix: string; error?: string }) {
  return <label className={`numeric-field ${error ? "field-error" : ""}`}><input type="number" min="-1" step="any" value={value} onChange={(event) => onChange(event.target.value)} /><span>{suffix}</span>{error && <b>{error}</b>}</label>;
}

function CapacitySignal({ label, quota, capacity }: { label: string; quota: number; capacity: number }) {
  const unavailable = capacity === 0;
  const exceeds = quota > capacity && quota !== -1;
  const message = unavailable ? `${label}: none discovered` : exceeds ? `${label} exceeds capacity` : `${label} within capacity`;
  return <span className={exceeds ? "capacity-warning" : ""}><i className={exceeds ? "projection-warning" : "projection-ok"}>{exceeds ? "!" : <Check size={12} />}</i>{message}</span>;
}

function buildYaml(value: QueueInput) {
  const labels = Object.entries(value.labels).filter(([, labelValue]) => labelValue);
  return `apiVersion: scheduling.run.ai/v2
kind: Queue
metadata:
  name: ${value.name || "queue-name"}${labels.length ? `\n  labels:\n${labels.map(([key, labelValue]) => `    ${key}: ${labelValue}`).join("\n")}` : ""}
spec:
  displayName: "${value.displayName ?? ""}"${value.parentQueue ? `\n  parentQueue: ${value.parentQueue}` : ""}
  priority: ${value.priority}
  resources:
${RESOURCE_KEYS.map((resource) => `    ${resource}:
      quota: ${manifestResourceValue(resource, value.resources[resource].quota)}
      limit: ${manifestResourceValue(resource, value.resources[resource].limit)}
      overQuotaWeight: ${cleanResourceNumber(value.resources[resource].overQuotaWeight)}`).join("\n")}`;
}
