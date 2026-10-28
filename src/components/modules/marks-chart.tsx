"use client";

import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export type MarksPoint = { label: string; you: number; avg: number | null };

/** Percentage per assessment over time, with the class average when it was actually provided. */
export function MarksChart({ data }: { data: MarksPoint[] }) {
  const hasAvg = data.some((d) => d.avg != null);
  if (data.length < 2) return <p className="text-sm text-muted-foreground">A trend appears after two graded assessments.</p>;
  return (
    <figure>
      <div className="h-56 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: 12, bottom: 4, left: -16 }}>
            <CartesianGrid stroke="var(--border)" strokeDasharray="0" vertical={false} />
            <XAxis dataKey="label" tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
            <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} tickLine={false} axisLine={false} unit="%" width={48} />
            <Tooltip
              cursor={{ stroke: "var(--muted-foreground)", strokeWidth: 1 }}
              contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12, color: "var(--popover-foreground)" }}
              formatter={(v, name) => [v == null ? "—" : `${Number(v).toFixed(1)}%`, name === "you" ? "You" : "Class average"]}
            />
            {hasAvg ? <Legend formatter={(v) => <span className="text-xs text-muted-foreground">{v === "you" ? "You" : "Class average"}</span>} iconType="plainline" /> : null}
            <Line type="monotone" dataKey="you" stroke="var(--viz-you)" strokeWidth={2} dot={{ r: 4, strokeWidth: 2, stroke: "var(--card)", fill: "var(--viz-you)" }} activeDot={{ r: 5 }} isAnimationActive={false} />
            {hasAvg ? (
              <Line type="monotone" dataKey="avg" stroke="var(--viz-avg)" strokeWidth={2} strokeDasharray="5 4" connectNulls dot={{ r: 4, strokeWidth: 2, stroke: "var(--card)", fill: "var(--viz-avg)" }} isAnimationActive={false} />
            ) : null}
          </LineChart>
        </ResponsiveContainer>
      </div>
      <details className="mt-2 text-xs">
        <summary className="cursor-pointer text-muted-foreground">Table view</summary>
        <table className="mt-1 w-full text-left">
          <thead>
            <tr className="text-muted-foreground">
              <th className="font-normal">Assessment</th>
              <th className="font-normal">You</th>
              <th className="font-normal">Class avg</th>
            </tr>
          </thead>
          <tbody>
            {data.map((d) => (
              <tr key={d.label}>
                <td>{d.label}</td>
                <td className="tabular-nums">{d.you.toFixed(1)}%</td>
                <td className="tabular-nums">{d.avg == null ? "—" : `${d.avg.toFixed(1)}%`}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}
