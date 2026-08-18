import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { appendAuditEvent, assertAuditReady } from "@/lib/audit/repository";
import { queueInputSchema } from "@/lib/domain/queue";
import { getQueueRepository, statusCode } from "@/lib/kai/repository";
import { getClusterCapacity } from "@/lib/kai/capacity";
import { actorFrom, RequestSecurityError, sourceIpFrom, verifyMutationRequest } from "@/lib/security/request";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const repository = getQueueRepository();
    const [items, capacity] = await Promise.all([repository.list(), getClusterCapacity()]);
    const csrfToken = request.cookies.get("kai_csrf")?.value ?? randomUUID();
    const sampledAt = items.map((queue) => queue.observedUsage?.sampledAt).filter(Boolean).sort().at(-1);
    const response = NextResponse.json({
      items,
      capacity,
      cluster: repository.clusterName,
      mode: process.env.KAI_DATA_MODE ?? "mock",
      csrfToken,
      telemetry: { metricsServer: items.some((queue) => queue.observedUsage?.available), sampledAt },
    });
    response.cookies.set("kai_csrf", csrfToken, { httpOnly: false, sameSite: "strict", secure: process.env.NODE_ENV === "production", path: "/" });
    return response;
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: NextRequest) {
  const requestId = randomUUID();
  let queueName = "unknown";
  try {
    verifyMutationRequest(request);
    const parsed = queueInputSchema.parse(await request.json());
    queueName = parsed.name;
    const repository = getQueueRepository();
    if (parsed.parentQueue && !(await repository.get(parsed.parentQueue))) {
      return NextResponse.json({ error: `Parent queue ${parsed.parentQueue} does not exist`, requestId }, { status: 422 });
    }
    await assertAuditReady();
    const created = await repository.create(parsed);
    await appendAuditEvent({
      actor: actorFrom(request), action: "CREATE", queueName, outcome: "SUCCESS",
      summary: parsed.parentQueue ? `Queue created under ${parsed.parentQueue}` : "Top-level queue created",
      requestId, clusterName: repository.clusterName, after: created, sourceIp: sourceIpFrom(request),
    });
    return NextResponse.json({ item: created, requestId }, { status: 201 });
  } catch (error) {
    await appendFailedAudit(request, "CREATE", queueName, requestId, error);
    return apiError(error, requestId);
  }
}

async function appendFailedAudit(request: NextRequest, action: "CREATE", queueName: string, requestId: string, error: unknown) {
  try {
    const repository = getQueueRepository();
    await appendAuditEvent({ actor: actorFrom(request), action, queueName, outcome: "FAILED", summary: errorMessage(error), requestId, clusterName: repository.clusterName, errorCode: `${statusCode(error) ?? "VALIDATION"}`, sourceIp: sourceIpFrom(request) });
  } catch { /* Keep the original API error. */ }
}

export function apiError(error: unknown, requestId = randomUUID()) {
  const code = statusCode(error);
  const status = error instanceof RequestSecurityError ? 403 : code && code >= 400 && code < 600 ? code : 500;
  return NextResponse.json({ error: errorMessage(error), requestId }, { status });
}

export function errorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === "object" && error !== null && "body" in error) return JSON.stringify((error as { body: unknown }).body);
  return "Unexpected server error";
}
