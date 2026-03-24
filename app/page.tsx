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

function monthKey(y: number, m: number) {
  return `${y}-${String(m + 1).padStart(2, "0")}`;
}

function getEmptyMonthEntries(year: number, month: number): DayEntry[] {
  const days = daysInMonth(year, month);
  const arr: DayEntry[] = [];
  for (let d = 1; d <= days; d++) {
    arr.push({
      date: formatDate(year, month, d),
      morningIn: "",
      morningOut: "",
      afternoonIn: "",
      afternoonOut: "",
    });
  }
  return arr;
}

function isValidMonthEntries(entries: DayEntry[], year: number, month: number) {
  const prefix = `${year}-${String(month + 1).padStart(2, "0")}`;
  return entries.every((e) => e.date.startsWith(prefix));
}

function cloneEntries(entries: DayEntry[]) {
  return entries.map((e) => ({ ...e }));
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
  const STORAGE_KEY = "dtr-calcu-v1";
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());

  const totalDays = daysInMonth(year, month);

  const storageMapRef = useRef<Record<string, DayEntry[]>>({});

  const [entries, setEntries] = useState<DayEntry[]>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);

        if (parsed && typeof parsed === "object") {
          // new shape
          if (parsed.map && typeof parsed.map === "object") {
            storageMapRef.current = parsed.map;
            const initialYear = typeof parsed.lastYear === "number" ? parsed.lastYear : today.getFullYear();
            const initialMonth = typeof parsed.lastMonth === "number" ? parsed.lastMonth : today.getMonth();
            const initialKey = monthKey(initialYear, initialMonth);

            if (Array.isArray(parsed.map[initialKey]) && isValidMonthEntries(parsed.map[initialKey], initialYear, initialMonth)) {
              return cloneEntries(parsed.map[initialKey]);
            }

            // If last-year/last-month isn't provided (old data shape), keep today’s month entry if available.
            if (typeof parsed.lastYear !== "number" || typeof parsed.lastMonth !== "number") {
              const todayKey = monthKey(today.getFullYear(), today.getMonth());
              if (Array.isArray(parsed.map[todayKey]) && isValidMonthEntries(parsed.map[todayKey], today.getFullYear(), today.getMonth())) {
                return cloneEntries(parsed.map[todayKey]);
              }
            }

            return getEmptyMonthEntries(initialYear, initialMonth);
          }

          // legacy shape
          if (
            typeof parsed.year === "number" &&
            typeof parsed.month === "number" &&
            Array.isArray(parsed.entries)
          ) {
            storageMapRef.current[monthKey(parsed.year, parsed.month)] = cloneEntries(parsed.entries);
            return cloneEntries(parsed.entries);
          }
        }
      }
    } catch {
      // ignore parse errors
    }

    return getEmptyMonthEntries(today.getFullYear(), today.getMonth());
  });

  const hasLoadedRef = useRef(false);

  // Header metadata state
  const [personName, setPersonName] = useState("");
  const [course, setCourse] = useState("");
  const [school, setSchool] = useState("");
  const [area, setArea] = useState("");
  const [requiredHours, setRequiredHours] = useState<number | "">("");

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

            const restoredYear = typeof parsed.lastYear === "number" ? parsed.lastYear : year;
            const restoredMonth = typeof parsed.lastMonth === "number" ? parsed.lastMonth : month;

            setYear(restoredYear);
            setMonth(restoredMonth);

            const key = monthKey(restoredYear, restoredMonth);
            const candidate = Array.isArray(storageMapRef.current[key]) ? storageMapRef.current[key] : null;
            if (candidate && isValidMonthEntries(candidate, restoredYear, restoredMonth)) {
              setEntries(cloneEntries(candidate));
            } else {
              setEntries(getEmptyMonthEntries(restoredYear, restoredMonth));
            }

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
    } finally {
      hasLoadedRef.current = true;
    }
    // if no saved entries, initialize current month entries (already default via useState)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function refreshMapFromLocalStorage() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (parsed && parsed.map && typeof parsed.map === "object") {
        storageMapRef.current = parsed.map;
      }
    } catch {
      // ignore
    }
  }

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
    refreshMapFromLocalStorage();

    const curKey = monthKey(year, month);
    storageMapRef.current[curKey] = cloneEntries(entries);

    const nextKey = monthKey(year, newMonth);
    const candidate = Array.isArray(storageMapRef.current[nextKey]) ? storageMapRef.current[nextKey] : null;

    const nextEntries =
      candidate && isValidMonthEntries(candidate, year, newMonth)
        ? cloneEntries(candidate)
        : getEmptyMonthEntries(year, newMonth);

    storageMapRef.current[nextKey] = cloneEntries(nextEntries);

    setMonth(newMonth);
    setEntries(nextEntries);

    saveMapToLocalStorage(storageMapRef.current, year, newMonth, {
      personName,
      course,
      school,
      area,
      requiredHours,
    });
  }

  function handleYearChange(newYear: number) {
    refreshMapFromLocalStorage();

    const curKey = monthKey(year, month);
    storageMapRef.current[curKey] = cloneEntries(entries);

    const nextKey = monthKey(newYear, month);
    const candidate = Array.isArray(storageMapRef.current[nextKey]) ? storageMapRef.current[nextKey] : null;

    const nextEntries =
      candidate && isValidMonthEntries(candidate, newYear, month)
        ? cloneEntries(candidate)
        : getEmptyMonthEntries(newYear, month);

    storageMapRef.current[nextKey] = cloneEntries(nextEntries);

    setYear(newYear);
    setEntries(nextEntries);

    saveMapToLocalStorage(storageMapRef.current, newYear, month, {
      personName,
      course,
      school,
      area,
      requiredHours,
    });
  }

  // Persist edits to the current month's slot whenever entries change
  useEffect(() => {
    if (!hasLoadedRef.current) return;

    const key = monthKey(year, month);
    storageMapRef.current[key] = cloneEntries(entries);

    saveMapToLocalStorage(storageMapRef.current, year, month, {
      personName,
      course,
      school,
      area,
      requiredHours,
    });
  }, [
    entries,
    year,
    month,
    personName,
    course,
    school,
    area,
    requiredHours,
  ]);

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

  // Overall taken minutes across all months (based on in-memory map).
  // Initialize from `monthlyTotalMinutes` for SSR hydration parity.
  const [overallTakenMinutes, setOverallTakenMinutes] = useState<number>(monthlyTotalMinutes);

  useEffect(() => {
    let total = 0;

    const mapSnapshot = storageMapRef.current;

    if (Object.keys(mapSnapshot).length === 0) {
      // no persisted data yet; use current month total until storage map is populated.
      setOverallTakenMinutes(monthlyTotalMinutes);
      return;
    }

    for (const monthArr of Object.values(mapSnapshot)) {
      if (!Array.isArray(monthArr)) continue;
      for (const e of monthArr) {
        total += entryTotalMinutes(e);
      }
    }

    setOverallTakenMinutes(total);
  }, [monthlyTotalMinutes, year, month, entries]);

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

  function clearCurrentMonth() {
    const key = monthKey(year, month);
    const cleaned = getEmptyMonthEntries(year, month);
    storageMapRef.current[key] = cloneEntries(cleaned);
    setEntries(cleaned);
    saveMapToLocalStorage(storageMapRef.current, year, month, {
      personName,
      course,
      school,
      area,
      requiredHours,
    });
  }

  return (
    <div className="min-h-screen bg-black p-6 font-sans text-white selection:bg-slate-700">
      <div className="mx-auto max-w-5xl space-y-8">
        {/* Header Section */}
        <div className="rounded-2xl border border-white/20 bg-black p-8 shadow-sm">
          <h1 className="mb-8 text-center text-3xl font-bold tracking-tight text-white">
            DARPO-BENGUET
          </h1>
          <h2 className="mb-8 text-center text-2xl text-white">
           NTERNS DTR 
          </h2>

          <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
            {/* Metadata Inputs */}
            <div className="grid gap-5 lg:col-span-2 sm:grid-cols-2">
              <label className="block">
                <span className="mb-1 block text-sm font-medium text-slate-300">Name</span>
                <input
                  type="text"
                  className="w-full rounded-md border border-slate-700 bg-black px-3 py-2 text-sm text-white shadow-sm transition-colors focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  value={personName}
                  onChange={(e) => {
                    setPersonName(e.target.value);
                    saveMapToLocalStorage(storageMapRef.current, year, month, { personName: e.target.value, course, school, area, requiredHours });
                  }}
                />
              </label>

              <label className="block">
                <span className="mb-1 block text-sm font-medium text-slate-300">School</span>
                <input
                  type="text"
                  className="w-full rounded-md border border-slate-700 bg-black px-3 py-2 text-sm text-white shadow-sm transition-colors focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  value={school}
                  onChange={(e) => {
                    setSchool(e.target.value);
                    saveMapToLocalStorage(storageMapRef.current, year, month, { personName, course, school: e.target.value, area, requiredHours });
                  }}
                />
              </label>

              <label className="block">
                <span className="mb-1 block text-sm font-medium text-slate-300">Course</span>
                <input
                  type="text"
                  className="w-full rounded-md border border-slate-700 bg-black px-3 py-2 text-sm text-white shadow-sm transition-colors focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  value={course}
                  onChange={(e) => {
                    setCourse(e.target.value);
                    saveMapToLocalStorage(storageMapRef.current, year, month, { personName, course: e.target.value, school, area, requiredHours });
                  }}
                />
              </label>

              <label className="block">
                <span className="mb-1 block text-sm font-medium text-slate-300">Area of Assignment</span>
                <input
                  type="text"
                  className="w-full rounded-md border border-slate-700 bg-black px-3 py-2 text-sm text-white shadow-sm transition-colors focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  value={area}
                  onChange={(e) => {
                    setArea(e.target.value);
                    saveMapToLocalStorage(storageMapRef.current, year, month, { personName, course, school, area: e.target.value, requiredHours });
                  }}
                />
              </label>
            </div>

            {/* Summary Card */}
            <div className="rounded-xl border border-white/20 bg-slate-900 p-6 text-white shadow-md lg:col-span-1">
              <h3 className="mb-4 text-lg font-semibold text-slate-300">Progress Summary</h3>
              <div className="space-y-3">
                <div className="flex justify-between border-b border-slate-700 pb-2">
                  <span className="text-slate-400">Required Hours</span>
                  <span className="font-medium">{REMAIN_BASE_HOURS} hrs</span>
                </div>
                <div className="flex justify-between border-b border-slate-700 pb-2">
                  <span className="text-slate-400">Total Rendered</span>
                  <span className="font-bold">{formatMinutesToHM(overallTakenMinutes)}</span>
                </div>
                <div className="flex justify-between pt-1">
                  <span className="text-slate-400">Remaining</span>
                  <span className="font-bold text-yellow-400">{formatMinutesToHM(remainFrom486Minutes)}</span>
                </div>
                {remainRequiredMinutes !== null && (
                  <div className="flex justify-between pt-1 text-sm text-slate-500">
                    <span>Required Left</span>
                    <span>{formatMinutesToHM(remainRequiredMinutes)}</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Controls */}
          <div className="mt-8 flex flex-col items-center justify-between gap-4 border-t border-white/20 pt-6 sm:flex-row">
            <div className="flex items-center gap-3">
              <label className="text-sm font-medium text-slate-300">Select Month:</label>
              <select
                value={month}
                onChange={(e) => handleMonthChange(Number(e.target.value))}
                className="rounded-md border border-slate-700 bg-black py-2 pl-3 pr-8 text-sm text-white shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              >
                {Array.from({ length: 12 }).map((_, i) => (
                  <option key={i} value={i}>
                    {new Date(0, i).toLocaleString(undefined, { month: "long" })}
                  </option>
                ))}
              </select>
              <select
                value={year}
                onChange={(e) => handleYearChange(Number(e.target.value))}
                className="rounded-md border border-slate-700 bg-black py-2 pl-3 pr-8 text-sm text-white shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              >
                {Array.from({ length: 5 }).map((_, i) => {
                  const y = 2024 + i;
                  return <option key={y} value={y}>{y}</option>
                })}
              </select>
              <button
                onClick={clearCurrentMonth}
                className="rounded-md border border-red-500 bg-red-600/20 px-3 py-2 text-sm text-red-300 hover:bg-red-500/25"
                type="button"
              >
                Clear Month
              </button>
            </div>

            <div className="flex items-center gap-2 rounded-lg border border-white/20 bg-slate-900 px-4 py-2">
              <span className="text-sm text-slate-400">Monthly Total:</span>
              <span className="text-lg font-bold text-white">{formatMinutesToHM(monthlyTotalMinutes)}</span>
            </div>
          </div>
        </div>

        {/* Data Table */}
        <div className="overflow-hidden rounded-xl border border-white/20 bg-black shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-white/20 bg-slate-900">
                <tr>
                  <th className="px-6 py-4 font-semibold text-white">Date</th>
                  <th className="px-6 py-4 text-center font-semibold text-white">Morning Shift</th>
                  <th className="px-6 py-4 text-center font-semibold text-white">Afternoon Shift</th>
                  <th className="px-6 py-4 text-right font-semibold text-white">Daily Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {entries.map((e, i) => (
                  <tr key={e.date} className="transition-colors hover:bg-slate-900">
                    <td className="whitespace-nowrap px-6 py-3 font-medium text-slate-300">
                      {formatDateWithDay(e.date)}
                    </td>

                    <td className="px-6 py-3 text-center">
                      <div className="inline-flex items-center gap-2 rounded-md bg-slate-800 p-1 ring-1 ring-slate-700">
                        <input
                          type="time"
                          value={e.morningIn}
                          onChange={(ev) => updateEntry(i, "morningIn", ev.target.value)}
                          className="w-24 border-0 bg-transparent p-0 text-center text-sm text-white focus:ring-0"
                        />
                        <span className="text-slate-400">-</span>
                        <input
                          type="time"
                          value={e.morningOut}
                          onChange={(ev) => updateEntry(i, "morningOut", ev.target.value)}
                          className="w-24 border-0 bg-transparent p-0 text-center text-sm text-white focus:ring-0"
                        />
                      </div>
                    </td>

                    <td className="px-6 py-3 text-center">
                      <div className="inline-flex items-center gap-2 rounded-md bg-slate-800 p-1 ring-1 ring-slate-700">
                        <input
                          type="time"
                          value={e.afternoonIn}
                          onChange={(ev) => updateEntry(i, "afternoonIn", ev.target.value)}
                          className="w-24 border-0 bg-transparent p-0 text-center text-sm text-white focus:ring-0"
                        />
                        <span className="text-slate-400">-</span>
                        <input
                          type="time"
                          value={e.afternoonOut}
                          onChange={(ev) => updateEntry(i, "afternoonOut", ev.target.value)}
                          className="w-24 border-0 bg-transparent p-0 text-center text-sm text-white focus:ring-0"
                        />
                      </div>
                    </td>

                    <td className="px-6 py-3 text-right font-semibold text-blue-400">
                      {formatMinutesToHM(dailyTotalsMinutes[i])}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
