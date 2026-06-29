import { db } from "@workspace/db";
import { systemLogsTable } from "@workspace/db";

type LogLevel = "info" | "warn" | "error";

export async function logActivity(
  message: string,
  context?: Record<string, any>,
  level: LogLevel = "info"
): Promise<void> {
  try {
    await db.insert(systemLogsTable).values({
      level,
      message,
      context: context ?? null,
    });
  } catch (err) {
    console.error("Failed to write activity log:", err);
  }
}