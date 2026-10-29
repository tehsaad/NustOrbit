import "server-only";
import { db } from "./db";
import { log, redact } from "./log";
import type { Prisma } from "@/generated/prisma/client";

export async function recordAudit(input: {
  userId?: string | null;
  action: string;
  targetType?: string;
  targetId?: string;
  ip?: string | null;
  userAgent?: string | null;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  try {
    await db.auditEvent.create({
      data: {
        userId: input.userId ?? null,
        action: input.action,
        targetType: input.targetType,
        targetId: input.targetId,
        ip: input.ip ?? null,
        userAgent: input.userAgent?.slice(0, 300) ?? null,
        metadata: input.metadata ? (redact(input.metadata) as Prisma.InputJsonValue) : undefined,
      },
    });
  } catch (error) {
    // Auditing must never break the primary action.
    log.error("audit.write_failed", { action: input.action, error });
  }
}
