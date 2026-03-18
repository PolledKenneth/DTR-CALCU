"use client";

import { useMemo, useState, useEffect, useRef } from "react";

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

  if (totalMinutes === 0) return `0hr and 0mins`;
  if (h === 0) return `${m} mins`;
  if (m === 0) return `${h} hrs`;

  return `${h} hrs & ${m} mins`;
}

// New: format integer minutes to string
function formatMinutesToHM(totalMinutes: number) {
  const mTotal = Math.round(totalMinutes);
  const h = Math.floor(mTotal / 60);
  const m = mTotal % 60;

  if (mTotal === 0) return `0hr and 0mins`;
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

  const STORAGE_KEY = "dtr-calcu-v1";

  const storageMapRef = useRef<Record<string, DayEntry[]>>({});

  // Header metadata state
  const [personName, setPersonName] = useState("");
  const [course, setCourse] = useState("");
  const [school, setSchool] = useState("");
  const [area, setArea] = useState("");
  const [requiredHours, setRequiredHours] = useState<number | "">("");

  function monthKey(y: number, m: number) {
    return `${y}-${String(m + 1).padStart(2, "0")}`;
  }

  // Load saved map once on mount; support legacy shape too.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);

        if (parsed && typeof parsed === "object") {
          // new shape: { map: { '2026-03': [...] }, lastYear, lastMonth }
          if (parsed.map && typeof parsed.map === "object") {
            storageMapRef.current = parsed.map;
            if (parsed.meta) {
              setPersonName(parsed.meta.personName || "");
              setCourse(parsed.meta.course || "");
              setSchool(parsed.meta.school || "");
              setArea(parsed.meta.area || "");
              setRequiredHours(parsed.meta.requiredHours ?? "");
            }
            if (typeof parsed.lastYear === "number") setYear(parsed.lastYear);
            if (typeof parsed.lastMonth === "number") setMonth(parsed.lastMonth);
            const key = monthKey(parsed.lastYear ?? year, parsed.lastMonth ?? month);
            if (storageMapRef.current[key]) setEntries(storageMapRef.current[key]);
            return;
          }

          // legacy shape: { year, month, entries }
          if (
            typeof parsed.year === "number" &&
            typeof parsed.month === "number" &&
            Array.isArray(parsed.entries)
          ) {
            const k = monthKey(parsed.year, parsed.month);
            storageMapRef.current[k] = parsed.entries;
            setYear(parsed.year);
            setMonth(parsed.month);
            setEntries(parsed.entries);
            if (parsed.meta) {
              setPersonName(parsed.meta.personName || "");
              setCourse(parsed.meta.course || "");
              setSchool(parsed.meta.school || "");
              setArea(parsed.meta.area || "");
              setRequiredHours(parsed.meta.requiredHours ?? "");
            }
            return;
          }
        }
      }
    } catch (e) {
      // ignore parse errors
    }
    // if no saved entries, initialize current month entries (already default via useState)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Save current month entries into storage map and localStorage
  function saveMapToLocalStorage(
    map: Record<string, DayEntry[]>,
    lastY: number,
    lastM: number,
    meta?: {
      personName?: string;
      course?: string;
      school?: string;
      area?: string;
      requiredHours?: number | "";
    }
  ) {
    try {
      const payload = { map, lastYear: lastY, lastMonth: lastM, meta } as any;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    } catch (e) {
      // ignore
    }
  }

  // When switching months/years we save current entries and load saved entries for target month if present.
  function handleMonthChange(newMonth: number) {
    const curKey = monthKey(year, month);
    storageMapRef.current[curKey] = entries;
    saveMapToLocalStorage(storageMapRef.current, year, newMonth, {
      personName,
      course,
      school,
      area,
      requiredHours,
    });

    setMonth(newMonth);
    const nextKey = monthKey(year, newMonth);
    if (storageMapRef.current[nextKey]) {
      setEntries(storageMapRef.current[nextKey]);
    } else {
      const arr: DayEntry[] = [];
      const nextTotalDays = daysInMonth(year, newMonth);
      for (let d = 1; d <= nextTotalDays; d++) {
        arr.push({
          date: formatDate(year, newMonth, d),
          morningIn: "",
          morningOut: "",
          afternoonIn: "",
          afternoonOut: "",
        });
      }
      setEntries(arr);
    }
  }

  function handleYearChange(newYear: number) {
    const curKey = monthKey(year, month);
    storageMapRef.current[curKey] = entries;
    saveMapToLocalStorage(storageMapRef.current, newYear, month, {
      personName,
      course,
      school,
      area,
      requiredHours,
    });

    setYear(newYear);
    const nextKey = monthKey(newYear, month);
    if (storageMapRef.current[nextKey]) {
      setEntries(storageMapRef.current[nextKey]);
    } else {
      const arr: DayEntry[] = [];
      const nextTotalDays = daysInMonth(newYear, month);
      for (let d = 1; d <= nextTotalDays; d++) {
        arr.push({
          date: formatDate(newYear, month, d),
          morningIn: "",
          morningOut: "",
          afternoonIn: "",
          afternoonOut: "",
        });
      }
      setEntries(arr);
    }
  }

  // Persist edits to the current month's slot whenever entries change
  useEffect(() => {
    const key = monthKey(year, month);
    storageMapRef.current[key] = entries;
    saveMapToLocalStorage(storageMapRef.current, year, month, {
      personName,
      course,
      school,
      area,
      requiredHours,
    });
  }, [entries, year, month]);

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

  function timeDiffMinutes(start: string, end: string) {
    const s = parseTime(start);
    const e = parseTime(end);
    if (!s || !e) return 0;

    const startMinutes = s.h * 60 + s.m;
    let endMinutes = e.h * 60 + e.m;

    if (endMinutes < startMinutes) endMinutes += 24 * 60;

    const diff = Math.max(0, endMinutes - startMinutes);
    return diff; // integer minutes
  }

  const morningMinutes = useMemo(
    () => entries.map((e) => timeDiffMinutes(e.morningIn, e.morningOut)),
    [entries]
  );

  const afternoonMinutes = useMemo(
    () => entries.map((e) => timeDiffMinutes(e.afternoonIn, e.afternoonOut)),
    [entries]
  );

  // If user only clocks in in the morning and clocks out in the afternoon
  // (no explicit morningOut / afternoonIn), treat it as a single continuous shift.
  const combinedMinutes = useMemo(() => {
    return entries.map((e) => {
      if (e.morningIn && e.afternoonOut && !e.morningOut && !e.afternoonIn) {
        return timeDiffMinutes(e.morningIn, e.afternoonOut);
      }
      return 0;
    });
  }, [entries]);

  const dailyTotalsMinutes = useMemo(() => {
    return entries.map((_, i) => {
      return combinedMinutes[i] > 0 ? combinedMinutes[i] : morningMinutes[i] + afternoonMinutes[i];
    });
  }, [entries, morningMinutes, afternoonMinutes, combinedMinutes]);


  const monthlyTotalMinutes = useMemo(
    () => dailyTotalsMinutes.reduce((a, b) => a + b, 0),
    [dailyTotalsMinutes]
  );

  // helper to compute minutes for a DayEntry (for stored maps)
  function entryTotalMinutes(e: DayEntry) {
    if (e.morningIn && e.afternoonOut && !e.morningOut && !e.afternoonIn) {
      return timeDiffMinutes(e.morningIn, e.afternoonOut);
    }
    return (
      timeDiffMinutes(e.morningIn, e.morningOut) +
      timeDiffMinutes(e.afternoonIn, e.afternoonOut)
    );
  }

  // Overall taken minutes across all saved months (reads localStorage snapshot)
  // overallTakenMinutes is derived from localStorage (client-only). Initialize
  // from `monthlyTotalMinutes` to ensure server and initial client renders match,
  // then update on mount to read the real snapshot from localStorage.
  const [overallTakenMinutes, setOverallTakenMinutes] = useState<number>(monthlyTotalMinutes);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        setOverallTakenMinutes(monthlyTotalMinutes);
        return;
      }
      const parsed = JSON.parse(raw);
      let total = 0;
      if (parsed && parsed.map && typeof parsed.map === "object") {
        for (const key of Object.keys(parsed.map)) {
          const arr = parsed.map[key];
          if (Array.isArray(arr)) {
            for (const e of arr) {
              total += entryTotalMinutes(e);
            }
          }
        }
      } else if (parsed && Array.isArray(parsed.entries)) {
        for (const e of parsed.entries) total += entryTotalMinutes(e);
      }

      // NOTE: intentionally do NOT include the current in-memory `entries` here
      // — only compute the overall total from what's stored in localStorage.
      setOverallTakenMinutes(total);
    } catch (e) {
      setOverallTakenMinutes(monthlyTotalMinutes);
    }
    // run when monthly total changes so UI updates after saves
  }, [monthlyTotalMinutes]);

  const REMAIN_BASE_HOURS = 486; // base for the /486 metric
  const remainFrom486Minutes = Math.max(0, REMAIN_BASE_HOURS * 60 - overallTakenMinutes);
  const remainRequiredMinutes =
    typeof requiredHours === "number" ? Math.max(0, requiredHours * 60 - monthlyTotalMinutes) : null;

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
      

      <div style={{ marginBottom: 16, display: "flex", flexDirection: "column", gap: 12 }}>
        <h1 style={{ margin: 0, fontSize: 28, textAlign: "center", width: "100%" }}>ON THE JOB TRAINING 2026</h1>

        <div style={{ display: "flex", gap: 12, alignItems: "flex-start", width: "100%" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, flex: 1 }}>
            <label style={{ display: "flex", flexDirection: "column" }}>
              Name
              <input value={personName} onChange={(e) => { setPersonName(e.target.value); saveMapToLocalStorage(storageMapRef.current, year, month, { personName: e.target.value, course, school, area, requiredHours }); }} />
            </label>

            <label style={{ display: "flex", flexDirection: "column" }}>
              School
              <input value={school} onChange={(e) => { setSchool(e.target.value); saveMapToLocalStorage(storageMapRef.current, year, month, { personName, course, school: e.target.value, area, requiredHours }); }} />
            </label>

            <label style={{ display: "flex", flexDirection: "column" }}>
              Course
              <input value={course} onChange={(e) => { setCourse(e.target.value); saveMapToLocalStorage(storageMapRef.current, year, month, { personName, course: e.target.value, school, area, requiredHours }); }} />
            </label>

            <label style={{ display: "flex", flexDirection: "column" }}>
              Area of assignment
              <input value={area} onChange={(e) => { setArea(e.target.value); saveMapToLocalStorage(storageMapRef.current, year, month, { personName, course, school, area: e.target.value, requiredHours }); }} />
            </label>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 12, alignItems: "flex-end" }}>
            <label style={{ display: "flex", flexDirection: "column", minWidth: 200 }}>
              No of hours required 486 HRS:
              <div style={{ fontSize: 15, color: "#ffffff", marginTop: 6 }}>
                Overall taken: <strong>{formatMinutesToHM(overallTakenMinutes)}</strong> / {REMAIN_BASE_HOURS} hrs
                <br />
                Remaining (of {REMAIN_BASE_HOURS}): <strong>{formatMinutesToHM(remainFrom486Minutes)}</strong>
                {remainRequiredMinutes !== null && (
                  <><br />Remaining (required): <strong>{formatMinutesToHM(remainRequiredMinutes)}</strong></>
                )}
              </div>
            </label>
          </div>
        </div>
        
          <div style={{ display: "flex", alignItems: "center", gap: 12, justifyContent: "center", width: "100%", marginTop: 8 }}>
          <div style={{ fontSize: 16 }}>Month:</div>
          <select
            value={month}
            onChange={(e) => handleMonthChange(Number(e.target.value))}
            style={{ backgroundColor: "#000", color: "#fff", border: "1px solid #fff", padding: "6px 8px" }}
          >
            {Array.from({ length: 12 }).map((_, i) => (
              <option key={i} value={i}>
                {new Date(0, i).toLocaleString(undefined, { month: "long" })}
              </option>
            ))}
          </select>

          <div style={{ marginLeft: 8, fontSize: 16 }}>
            Total: <strong>{formatMinutesToHM(monthlyTotalMinutes)}</strong>
          </div>
        </div>
        
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
              </td>

              <td style={td}>
                <strong>{formatMinutesToHM(dailyTotalsMinutes[i])}</strong>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      
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