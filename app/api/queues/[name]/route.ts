import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { apiError, errorMessage } from "@/app/api/queues/route";
import { appendAuditEvent, assertAuditReady } from "@/lib/audit/repository";
import { queueInputSchema } from "@/lib/domain/queue";
import { getQueueRepository, QueueConflictError, statusCode } from "@/lib/kai/repository";
import { actorFrom, sourceIpFrom, verifyMutationRequest } from "@/lib/security/request";

type Context = { params: Promise<{ name: string }> };

export async function PUT(request: NextRequest, context: Context) {
  const { name } = await context.params;
  const requestId = randomUUID();
  let before: unknown;
  try {
    verifyMutationRequest(request);
    const parsed = queueInputSchema.parse({ ...(await request.json()), name });
    const repository = getQueueRepository();
    before = await repository.get(name);
    if (!before) return NextResponse.json({ error: `Queue ${name} was not found`, requestId }, { status: 404 });
    if (parsed.parentQueue && parsed.parentQueue === name) return NextResponse.json({ error: "A queue cannot be its own parent", requestId }, { status: 422 });
    if (parsed.parentQueue && !(await repository.get(parsed.parentQueue))) return NextResponse.json({ error: `Parent queue ${parsed.parentQueue} does not exist`, requestId }, { status: 422 });
    await assertAuditReady();
    const updated = await repository.update(name, parsed);
    await appendAuditEvent({ actor: actorFrom(request), action: "UPDATE", queueName: name, outcome: "SUCCESS", summary: "Queue resources and scheduling policy updated", requestId, clusterName: repository.clusterName, before, after: updated, sourceIp: sourceIpFrom(request) });
    return NextResponse.json({ item: updated, requestId });
  } catch (error) {
    await appendFailure(request, "UPDATE", name, requestId, error, before);
    if (error instanceof QueueConflictError) return NextResponse.json({ error: error.message, requestId }, { status: 409 });
    return apiError(error, requestId);
  }
}

export async function DELETE(request: NextRequest, context: Context) {
  const { name } = await context.params;
  const requestId = randomUUID();
  let before: unknown;
  try {
    verifyMutationRequest(request);
    const repository = getQueueRepository();
    const queues = await repository.list();
    const queue = queues.find((item) => item.name === name);
    before = queue;
    if (!queue) return NextResponse.json({ error: `Queue ${name} was not found`, requestId }, { status: 404 });
    if (queue.childQueues.length) return NextResponse.json({ error: "Move or delete child queues before deleting this parent", requestId }, { status: 409 });
    if (queue.workloads.running + queue.workloads.pending > 0) return NextResponse.json({ error: "Drain or reassign all workloads before deleting this queue", requestId }, { status: 409 });
    await assertAuditReady();
    await repository.delete(name, queue.resourceVersion);
    await appendAuditEvent({ actor: actorFrom(request), action: "DELETE", queueName: name, outcome: "SUCCESS", summary: "Queue permanently deleted after safety preflight", requestId, clusterName: repository.clusterName, before, sourceIp: sourceIpFrom(request) });
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    await appendFailure(request, "DELETE", name, requestId, error, before);
    return apiError(error, requestId);
  }
}

async function appendFailure(request: NextRequest, action: "UPDATE" | "DELETE", queueName: string, requestId: string, error: unknown, before?: unknown) {
  try {
    const repository = getQueueRepository();
    await appendAuditEvent({ actor: actorFrom(request), action, queueName, outcome: "FAILED", summary: errorMessage(error), requestId, clusterName: repository.clusterName, before, errorCode: `${statusCode(error) ?? "VALIDATION"}`, sourceIp: sourceIpFrom(request) });
  } catch { /* Keep the original API error. */ }
}
