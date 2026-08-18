import type { ReactNode } from "react";
import { AlertTriangle, Check, CircleAlert, CircleX, LoaderCircle } from "lucide-react";
import type { QueueHealth, ResourceKey } from "@/lib/domain/queue";
import { RESOURCE_META, formatResource, percent } from "@/lib/domain/queue";

export function HealthBadge({ health }: { health: QueueHealth }) {
  const content = {
    healthy: { icon: Check, label: "Healthy" },
    "over-quota": { icon: AlertTriangle, label: "Over quota" },
    orphaned: { icon: CircleX, label: "Orphaned" },
    attention: { icon: CircleAlert, label: "Attention" },
  }[health];
  const Icon = content.icon;
  return (
    <span className={`health-badge health-${health}`}>
      <Icon size={12} strokeWidth={2.4} />
      {content.label}
    </span>
  );
}

export function ResourceMeter({
  resource,
  allocated,
  quota,
  limit,
  compact = false,
}: {
  resource: ResourceKey;
  allocated: number;
  quota: number;
  limit: number;
  compact?: boolean;
}) {
  const visualMax = limit > 0 ? limit : Math.max(quota, allocated, 1);
  const usage = percent(allocated, visualMax);
  const quotaAt = quota > 0 && limit > 0 ? percent(quota, limit) : 100;
  const over = quota >= 0 && allocated > quota;
  return (
    <div className={`resource-meter ${compact ? "resource-meter-compact" : ""}`}>
      <div className="resource-meter-label">
        <span>{RESOURCE_META[resource].label}</span>
        <strong className={over ? "text-warning" : ""}>{formatResource(resource, allocated)}</strong>
      </div>
      <div className="meter-track" aria-label={`${RESOURCE_META[resource].label} ${usage}% of limit`}>
        <div
          className={`meter-fill meter-${resource} ${over ? "meter-over" : ""}`}
          style={{ width: `${Math.max(usage, allocated > 0 ? 2 : 0)}%` }}
        />
        {quota > 0 && limit > quota && <span className="quota-marker" style={{ left: `${quotaAt}%` }} />}
      </div>
      {!compact && (
        <div className="meter-caption">
          <span>Quota {formatResource(resource, quota)}</span>
          <span>Limit {formatResource(resource, limit)}</span>
        </div>
      )}
    </div>
  );
}

export function EmptyState({ icon, title, body }: { icon: ReactNode; title: string; body: string }) {
  return (
    <div className="empty-state">
      {icon}
      <strong>{title}</strong>
      <span>{body}</span>
    </div>
  );
}

export function Button({
  children,
  kind = "secondary",
  loading = false,
  className = "",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  kind?: "primary" | "secondary" | "ghost" | "danger";
  loading?: boolean;
}) {
  return (
    <button className={`button button-${kind} ${className}`} {...props} disabled={loading || props.disabled}>
      {loading && <LoaderCircle className="spin" size={15} />}
      {children}
    </button>
  );
}
