import "server-only";

import { readFile } from "node:fs/promises";
import path from "node:path";
import { DEFAULT_UI_CONFIG, uiConfigSchema, type UiConfig } from "@/lib/ui-config";

export async function loadUiConfig(): Promise<UiConfig> {
  const configuredPath = process.env.APP_CONFIG_FILE;
  const filePath = configuredPath ? path.resolve(configuredPath) : path.join(process.cwd(), "config", "ui.config.json");
  try {
    const raw = JSON.parse(await readFile(filePath, "utf8")) as unknown;
    return uiConfigSchema.parse(raw);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT" && !configuredPath) return DEFAULT_UI_CONFIG;
    throw new Error(`Invalid UI configuration at ${filePath}: ${error instanceof Error ? error.message : "unknown error"}`);
  }
}
