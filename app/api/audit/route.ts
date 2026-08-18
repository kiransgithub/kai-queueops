import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/app/api/queues/route";
import { listAuditEvents } from "@/lib/audit/repository";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const requestedLimit = Number(request.nextUrl.searchParams.get("limit") ?? 100);
    const items = await listAuditEvents(Number.isFinite(requestedLimit) ? requestedLimit : 100);
    return NextResponse.json({ items });
  } catch (error) {
    return apiError(error);
  }
}
