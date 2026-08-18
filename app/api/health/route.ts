import { NextResponse } from "next/server";
import { assertAuditReady } from "@/lib/audit/repository";
import { getQueueRepository } from "@/lib/kai/repository";

export const dynamic = "force-dynamic";

export async function GET() {
  const checks = { application: "ok", kubernetes: "unknown", postgres: "unknown" };
  try { await getQueueRepository().list(); checks.kubernetes = "ok"; } catch { checks.kubernetes = "error"; }
  try { await assertAuditReady(); checks.postgres = process.env.DATABASE_URL ? "ok" : "not-configured"; } catch { checks.postgres = "error"; }
  const healthy = checks.kubernetes !== "error" && checks.postgres !== "error";
  return NextResponse.json({ status: healthy ? "ok" : "degraded", checks }, { status: healthy ? 200 : 503 });
}
