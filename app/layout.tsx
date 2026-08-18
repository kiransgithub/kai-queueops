import type { Metadata } from "next";
import { loadUiConfig } from "@/lib/ui-config-server";
import "./globals.css";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const config = await loadUiConfig();
  return { title: config.branding.appName, description: "Queue lifecycle management for KAI Scheduler" };
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
