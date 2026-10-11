"use client";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { rupees } from "@/lib/format";

interface Day { date: string; cash: number; credit: number }

const PEN = "#2f4fb0";
const MARGIN = "#d2553f";

export function SalesChart({ days }: { days: Day[] }) {
  const data = days.map((d, i) => ({
    ...d,
    label: i === days.length - 1 ? "Today" : new Date(d.date).toLocaleDateString("en-IN", { weekday: "short" }),
  }));
  return (
    <figure>
      <div className="flex items-center gap-4 text-sm text-muted mb-2" aria-hidden>
        <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-sm" style={{ background: PEN }} />Cash and UPI</span>
        <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-sm" style={{ background: MARGIN }} />Pattu</span>
      </div>
      <div className="h-56">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 4, right: 0, left: 0, bottom: 0 }} barCategoryGap="28%">
            <CartesianGrid vertical={false} stroke="#e4e8e6" />
            <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fill: "#5b6472", fontSize: 12 }} />
            <YAxis tickLine={false} axisLine={false} width={48} tick={{ fill: "#8a93a0", fontSize: 11 }} tickFormatter={(v) => `₹${v >= 1000 ? `${Math.round(v / 100) / 10}k` : v}`} />
            <Tooltip
              cursor={{ fill: "rgba(47,79,176,0.06)" }}
              contentStyle={{ borderRadius: 10, border: "1px solid #d9dedb", fontFamily: "inherit", fontSize: 13 }}
              formatter={(v, name) => [rupees(Number(v)), name === "cash" ? "Cash and UPI" : "Pattu"]}
              labelFormatter={(l, p) => {
                const row = p?.[0]?.payload as (Day & { label: string }) | undefined;
                return row ? `${l}: ${rupees(row.cash + row.credit)}` : l;
              }}
            />
            <Bar dataKey="cash" stackId="s" fill={PEN} stroke="#fcfcfb" strokeWidth={2} />
            <Bar dataKey="credit" stackId="s" fill={MARGIN} stroke="#fcfcfb" strokeWidth={2} radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <figcaption className="sr-only">
        Sales for the last 7 days: {data.map((d) => `${d.label} ${rupees(d.cash)} cash, ${rupees(d.credit)} pattu`).join("; ")}
      </figcaption>
    </figure>
  );
}
