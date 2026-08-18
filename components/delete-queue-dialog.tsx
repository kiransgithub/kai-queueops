"use client";

import { useState } from "react";
import { AlertOctagon, AlertTriangle, ArrowRight, Boxes, GitBranch, ShieldAlert, Trash2, X } from "lucide-react";
import type { KaiQueue } from "@/lib/domain/queue";
import { Button } from "@/components/ui";

export function DeleteQueueDialog({ queue, clusterName, onClose, onDelete }: { queue: KaiQueue; clusterName: string; onClose: () => void; onDelete: (queue: KaiQueue) => void | Promise<void> }) {
  const [confirmation, setConfirmation] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const hasChildren = queue.childQueues.length > 0;
  const hasWorkloads = queue.workloads.running + queue.workloads.pending > 0;
  const blocked = hasChildren || hasWorkloads;
  const confirmed = confirmation === queue.name;
  return (
    <div className="modal-layer danger-modal-layer">
      <button className="modal-backdrop" onClick={onClose} aria-label="Close dialog" />
      <div className="delete-dialog" role="alertdialog" aria-label={`Delete ${queue.name}`}>
        <header><span><AlertOctagon size={23} /></span><div><small>DANGER ZONE</small><h2>Delete queue?</h2></div><button onClick={onClose} aria-label="Close"><X size={20} /></button></header>
        <div className="delete-body">
          <p>You are about to permanently delete <strong>{queue.displayName || queue.name}</strong> from <code>{clusterName}</code>.</p>
          <div className="delete-target"><span className={`queue-glyph queue-glyph-${queue.health}`} /><div><strong>{queue.displayName || queue.name}</strong><code>{queue.name}</code></div><span>{queue.childQueues.length === 0 ? "Leaf queue" : "Parent queue"}</span></div>
          <div className="preflight-checks">
            <div className={hasChildren ? "check-blocked" : "check-ok"}><GitBranch size={16} /><span><strong>{hasChildren ? `${queue.childQueues.length} child queues must be moved` : "No child queues"}</strong><small>{hasChildren ? queue.childQueues.join(", ") : "Hierarchy is safe to modify"}</small></span>{hasChildren ? <AlertTriangle size={16} /> : <span className="checkmark">✓</span>}</div>
            <div className={hasWorkloads ? "check-blocked" : "check-ok"}><Boxes size={16} /><span><strong>{hasWorkloads ? "Queue still owns workloads" : "No active workloads"}</strong><small>{queue.workloads.running} running · {queue.workloads.pending} pending</small></span>{hasWorkloads ? <AlertTriangle size={16} /> : <span className="checkmark">✓</span>}</div>
          </div>
          {blocked ? (
            <div className="deletion-blocked"><ShieldAlert size={17} /><div><strong>Deletion is blocked by safety policy</strong><p>Move child queues and drain or reassign all workloads before retrying. The API will enforce this preflight check.</p></div></div>
          ) : (
            <label className="delete-confirm"><span>Type <code>{queue.name}</code> to confirm</span><input autoFocus value={confirmation} onChange={(event) => setConfirmation(event.target.value)} placeholder={queue.name} /></label>
          )}
          <div className="delete-consequence"><AlertTriangle size={15} /><p>This removes the Queue CRD and its scheduling policy. The audit record is retained and cannot be deleted.</p></div>
          {error && <div className="submit-error"><AlertTriangle size={16} /><p>{error}</p></div>}
        </div>
        <footer><Button onClick={onClose} disabled={deleting}>Cancel</Button>{blocked ? <Button kind="secondary" onClick={onClose}>Review queue <ArrowRight size={15} /></Button> : <Button kind="danger" loading={deleting} disabled={!confirmed} onClick={async () => { setDeleting(true); setError(null); try { await onDelete(queue); } catch (deleteError) { setError(deleteError instanceof Error ? deleteError.message : "Deletion failed"); setDeleting(false); } }}><Trash2 size={15} />Permanently delete</Button>}</footer>
      </div>
    </div>
  );
}
