import { NextRequest, NextResponse } from "next/server";
import { identityFrom } from "@/lib/security/request";
import { loadUiConfig } from "@/lib/ui-config-server";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const config = await loadUiConfig();
    return NextResponse.json({ config, identity: identityFrom(request, config.identity) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not load UI configuration" }, { status: 500 });
  }
}
