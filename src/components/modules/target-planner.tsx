"use client";

import { useState } from "react";
import { planForTarget, type CourseStanding } from "@/domain/grades";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

export function TargetPlanner({ standing, initialTarget, id }: { standing: CourseStanding; initialTarget: number | null; id: string }) {
  const [target, setTarget] = useState<string>(initialTarget != null ? String(initialTarget) : "");
  const t = Number(target);
  const valid = target !== "" && t > 0 && t <= 100;
  const plan = valid ? planForTarget(standing, t) : null;
  return (
    <div className="rounded-lg bg-muted/40 p-3">
      <div className="flex items-end gap-3">
        <div className="grid gap-1">
          <Label htmlFor={`target-${id}`} className="text-xs">
            Target course %
          </Label>
          <Input id={`target-${id}`} type="number" min={1} max={100} step="0.5" value={target} onChange={(e) => setTarget(e.target.value)} className="h-8 w-24" />
        </div>
        {plan && plan.kind === "required" ? (
          <p className="text-sm">
            Need <span className="text-lg font-semibold tabular-nums">{plan.requiredPctOnRemaining}%</span> avg on remaining {plan.remainingWeight}%
          </p>
        ) : null}
      </div>
      {plan ? (
        <p className={cn("mt-2 text-xs", plan.kind === "impossible" ? "text-destructive" : plan.kind === "achieved" ? "text-success" : "text-muted-foreground")}>{plan.message}</p>
      ) : (
        <p className="mt-2 text-xs text-muted-foreground">Enter a target to see what you need on the remaining work.</p>
      )}
      <p className="mt-1 text-[11px] text-muted-foreground">
        Assumes the listed weights total 100% and remaining work is scored evenly. Letter grades depend on your instructor&apos;s grading policy and are not predicted.
      </p>
    </div>
  );
}
