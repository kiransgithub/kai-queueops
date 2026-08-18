"use client";

import { ChevronRight, GitBranch, Pencil, Trash2 } from "lucide-react";
import type { KaiQueue } from "@/lib/domain/queue";
import { HealthBadge, ResourceMeter } from "@/components/ui";

export function QueueTable({
  queues,
  selectedName,
  onSelect,
  onEdit,
  onDelete,
  compact = false,
}: {
  queues: KaiQueue[];
  selectedName?: string;
  onSelect: (queue: KaiQueue) => void;
  onEdit: (queue: KaiQueue) => void;
  onDelete: (queue: KaiQueue) => void;
  compact?: boolean;
}) {
  const ordered = orderQueues(queues);
  return (
    <div className="table-scroll">
      <table className={`queue-table ${compact ? "queue-table-compact" : ""}`}>
        <thead>
          <tr>
            <th>Queue</th>
            <th>Health</th>
            <th>GPU allocation</th>
            <th>CPU allocation</th>
            {!compact && <th>Workloads</th>}
            <th>Priority</th>
            <th><span className="sr-only">Actions</span></th>
          </tr>
        </thead>
        <tbody>
          {ordered.map(({ queue, depth }) => (
            <tr
              key={queue.name}
              className={selectedName === queue.name ? "row-selected" : ""}
              onClick={() => onSelect(queue)}
            >
              <td>
                <div className="queue-name-cell" style={{ paddingLeft: `${depth * 22}px` }}>
                  {depth > 0 ? <GitBranch className="tree-icon" size={14} /> : queue.childQueues.length > 0 ? <ChevronRight size={15} /> : <span className="leaf-spacer" />}
                  <span className={`queue-glyph queue-glyph-${queue.health}`} />
                  <span>
                    <strong>{queue.displayName || queue.name}</strong>
                    <small>{queue.name}{queue.childQueues.length > 0 ? ` · ${queue.childQueues.length} children` : " · leaf queue"}</small>
                  </span>
                </div>
              </td>
              <td><HealthBadge health={queue.health} /></td>
              <td className="allocation-cell">
                <ResourceMeter resource="gpu" allocated={queue.resources.gpu.allocated} quota={queue.resources.gpu.quota} limit={queue.resources.gpu.limit} compact />
              </td>
              <td className="allocation-cell">
                <ResourceMeter resource="cpu" allocated={queue.resources.cpu.allocated} quota={queue.resources.cpu.quota} limit={queue.resources.cpu.limit} compact />
              </td>
              {!compact && (
                <td>
                  <div className="workload-count"><strong>{queue.workloads.running}</strong><span>running</span>{queue.workloads.pending > 0 && <em>{queue.workloads.pending} pending</em>}</div>
                </td>
              )}
              <td><span className="priority-value">P{queue.priority}</span></td>
              <td>
                <div className="row-actions">
                  <button aria-label={`Edit ${queue.name}`} onClick={(event) => { event.stopPropagation(); onEdit(queue); }}><Pencil size={15} /></button>
                  <button aria-label={`Delete ${queue.name}`} onClick={(event) => { event.stopPropagation(); onDelete(queue); }}><Trash2 size={15} /></button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function orderQueues(queues: KaiQueue[]) {
  const queueNames = new Set(queues.map((queue) => queue.name));
  const children = new Map<string, KaiQueue[]>();
  for (const queue of queues) {
    if (!queue.parentQueue || !queueNames.has(queue.parentQueue)) continue;
    children.set(queue.parentQueue, [...(children.get(queue.parentQueue) ?? []), queue]);
  }
  const result: Array<{ queue: KaiQueue; depth: number }> = [];
  const visit = (queue: KaiQueue, depth: number) => {
    result.push({ queue, depth });
    for (const child of children.get(queue.name) ?? []) visit(child, depth + 1);
  };
  for (const queue of queues) {
    if (!queue.parentQueue || !queueNames.has(queue.parentQueue)) visit(queue, 0);
  }
  return result;
}
