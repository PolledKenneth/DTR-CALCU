"use client";

import { useMemo, useState } from "react";

type DayEntry = {
  date: string;
  morningIn: string;
  morningOut: string;
  afternoonIn: string;
  afternoonOut: string;
};

function daysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate();
}

function formatDate(year: number, month: number, day: number) {
  const m = String(month + 1).padStart(2, "0");
  const d = String(day).padStart(2, "0");
  return `${year}-${m}-${d}`;
}

function formatDateWithDay(dateStr: string) {
  try {
    const d = new Date(dateStr + "T00:00");
    const weekday = d.toLocaleDateString(undefined, { weekday: "short" });
    return `${dateStr} (${weekday})`;
  } catch {
    return dateStr;
  }
}

// ✅ NEW: convert decimal hours → hrs & mins
function formatHoursToHM(hours: number) {
  const totalMinutes = Math.round(hours * 60);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;

  if (h === 0) return `${m} mins`;
  if (m === 0) return `${h} hrs`;

  return `${h} hrs & ${m} mins`;
}

export default function Home() {
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());

  const totalDays = daysInMonth(year, month);

  const [entries, setEntries] = useState<DayEntry[]>(() => {
    const arr: DayEntry[] = [];
    for (let d = 1; d <= totalDays; d++) {
      arr.push({
        date: formatDate(year, month, d),
        morningIn: "",
        morningOut: "",
        afternoonIn: "",
        afternoonOut: "",
      });
    }
    return arr;
  });

  useMemo(() => {
    const arr: DayEntry[] = [];
    for (let d = 1; d <= totalDays; d++) {
      arr.push({
        date: formatDate(year, month, d),
        morningIn: "",
        morningOut: "",
        afternoonIn: "",
        afternoonOut: "",
      });
    }
    setEntries(arr);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [year, month]);

  function updateEntry(
    index: number,
    field: "morningIn" | "morningOut" | "afternoonIn" | "afternoonOut",
    value: string
  ) {
    setEntries((prev) => {
      const copy = prev.slice();
      copy[index] = { ...copy[index], [field]: value };
      return copy;
    });
  }

  function parseTime(t: string) {
    if (!t) return null;
    const parts = t.split(":");
    if (parts.length < 2) return null;

    const h = Number(parts[0]);
    const m = Number(parts[1]);

    if (Number.isNaN(h) || Number.isNaN(m)) return null;
    if (h < 0 || h > 23) return null;
    if (m < 0 || m > 59) return null;

    return { h, m };
  }

  function timeDiffHours(start: string, end: string) {
    const s = parseTime(start);
    const e = parseTime(end);
    if (!s || !e) return 0;

    const startMinutes = s.h * 60 + s.m;
    let endMinutes = e.h * 60 + e.m;

    if (endMinutes < startMinutes) endMinutes += 24 * 60;

    const diff = Math.max(0, endMinutes - startMinutes);
    return diff / 60;
  }

  const morningHours = useMemo(
    () => entries.map((e) => timeDiffHours(e.morningIn, e.morningOut)),
    [entries]
  );

  const afternoonHours = useMemo(
    () => entries.map((e) => timeDiffHours(e.afternoonIn, e.afternoonOut)),
    [entries]
  );

  const dailyTotals = useMemo(
    () => entries.map((_, i) => morningHours[i] + afternoonHours[i]),
    [entries, morningHours, afternoonHours]
  );

  const weeklyTotals = useMemo(() => {
    const firstDay = new Date(year, month, 1).getDay();
    const weeks: number[] = [];

    for (let i = 0; i < entries.length; i++) {
      const day = i + 1;
      const weekIndex = Math.floor((day + firstDay - 1) / 7);
      weeks[weekIndex] = (weeks[weekIndex] || 0) + dailyTotals[i];
    }

    return weeks;
  }, [entries, dailyTotals, year, month]);

  const monthlyTotal = useMemo(
    () => dailyTotals.reduce((a, b) => a + b, 0),
    [dailyTotals]
  );

  function reset() {
    setEntries((prev) =>
      prev.map((e) => ({
        ...e,
        morningIn: "",
        morningOut: "",
        afternoonIn: "",
        afternoonOut: "",
      }))
    );
  }

  return (
    <div style={{ padding: 24, fontFamily: "Inter, sans-serif" }}>
      <h1>DTR Calculator</h1>

      <div style={{ display: "flex", gap: 10, marginBottom: 16 }}>
        <input
          type="number"
          value={year}
          onChange={(e) => setYear(Number(e.target.value))}
        />

        <select value={month} onChange={(e) => setMonth(Number(e.target.value))}>
          {Array.from({ length: 12 }).map((_, i) => (
            <option key={i} value={i}>
              {new Date(0, i).toLocaleString(undefined, { month: "long" })}
            </option>
          ))}
        </select>

        <button onClick={reset}>Reset</button>
      </div>

      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            <th style={th}>Date</th>
            <th style={th}>Morning</th>
            <th style={th}>Afternoon</th>
            <th style={th}>Total</th>
          </tr>
        </thead>

        <tbody>
          {entries.map((e, i) => (
            <tr key={e.date}>
              <td style={td}>{formatDateWithDay(e.date)}</td>

              <td style={td}>
                <input
                  type="time"
                  value={e.morningIn}
                  onChange={(ev) => updateEntry(i, "morningIn", ev.target.value)}
                />
                {" - "}
                <input
                  type="time"
                  value={e.morningOut}
                  onChange={(ev) => updateEntry(i, "morningOut", ev.target.value)}
                />
                <div>{formatHoursToHM(morningHours[i])}</div>
              </td>

              <td style={td}>
                <input
                  type="time"
                  value={e.afternoonIn}
                  onChange={(ev) => updateEntry(i, "afternoonIn", ev.target.value)}
                />
                {" - "}
                <input
                  type="time"
                  value={e.afternoonOut}
                  onChange={(ev) => updateEntry(i, "afternoonOut", ev.target.value)}
                />
                <div>{formatHoursToHM(afternoonHours[i])}</div>
              </td>

              <td style={td}>
                <strong>{formatHoursToHM(dailyTotals[i])}</strong>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div style={{ marginTop: 20 }}>
        <h3>Weekly Totals</h3>
        {weeklyTotals.map((w, i) => (
          <div key={i}>
            Week {i + 1}: {formatHoursToHM(w)}
          </div>
        ))}
      </div>

      <div style={{ marginTop: 20 }}>
        <h2>Monthly Total: {formatHoursToHM(monthlyTotal)}</h2>
      </div>
    </div>
  );
}

const th: React.CSSProperties = {
  borderBottom: "2px solid #ccc",
  padding: 8,
};

const td: React.CSSProperties = {
  borderBottom: "1px solid #eee",
  padding: 8,
};