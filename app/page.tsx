"use client";

import { useMemo, useState, useEffect, useRef } from "react";
import { saveDTRData, getDTRData, getAllDTRData, type DTRData } from "../lib/firebase-service";
import { db } from "../lib/firebase";

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
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());
  const [userId, setUserId] = useState<string>(""); // Firebase user ID

  const totalDays = daysInMonth(year, month);

  const [entries, setEntries] = useState<DayEntry[]>(() => {
    return getEmptyMonthEntries(today.getFullYear(), today.getMonth());
  });

  // Header metadata state
  const [personName, setPersonName] = useState("");
  const [course, setCourse] = useState("");
  const [school, setSchool] = useState("");
  const [area, setArea] = useState("");
  const [requiredHours, setRequiredHours] = useState<number | "">("");
  const [firebaseStatus, setFirebaseStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');

  // Initialize userId (for demo, using a simple ID - in production use Firebase Auth)
  useEffect(() => {
    const storedUserId = localStorage.getItem("dtr-user-id");
    if (storedUserId) {
      setUserId(storedUserId);
    } else {
      // Generate a simple user ID for demo purposes
      const newUserId = "user_" + Date.now().toString(36);
      localStorage.setItem("dtr-user-id", newUserId);
      setUserId(newUserId);
    }
  }, []);

  // Load data from Firebase when component mounts or when year/month changes
  useEffect(() => {
    if (userId && personName && db) {
      loadFromFirebase(year, month);
    }
  }, [userId, personName, year, month, db]);

  // Save to Firebase function
  async function saveToFirebase(
    year: number,
    month: number,
    entries: DayEntry[],
    meta?: {
      personName?: string;
      course?: string;
      school?: string;
      area?: string;
      requiredHours?: number | "";
    }
  ) {
    if (!userId) return;
    
    try {
      setFirebaseStatus('saving');
      await saveDTRData(userId, meta?.personName || '', year, month, entries, meta || {});
      setFirebaseStatus('saved');
      setTimeout(() => setFirebaseStatus('idle'), 2000);
    } catch (error) {
      console.error("Failed to save to Firebase:", error);
      setFirebaseStatus('error');
      setTimeout(() => setFirebaseStatus('idle'), 3000);
    }
  }

// Load from Firebase function
  async function loadFromFirebase(
    year: number,
    month: number
  ): Promise<void> {
    if (!userId) return;
    
    try {
      const data = await getDTRData(userId, personName, year, month);
      if (data) {
        // Load metadata
        setCourse(data.metadata.course || "");
        setSchool(data.metadata.school || "");
        setArea(data.metadata.area || "");
        setRequiredHours(data.metadata.requiredHours || "");
        
        // Load current month entries if available
        const monthKey = `${year}-${month}`;
        const monthData = data.months[monthKey];
        if (monthData && monthData.entries) {
          setEntries(cloneEntries(monthData.entries));
        } else {
          // If no data for current month, load empty entries
          setEntries(getEmptyMonthEntries(year, month));
        }
      } else {
        // No data found, load empty entries
        setEntries(getEmptyMonthEntries(year, month));
      }
    } catch (error) {
      console.error("Failed to load from Firebase:", error);
      setEntries(getEmptyMonthEntries(year, month));
    }
  }

  // When switching months/years we save current entries and load saved entries for target month if present.
  function handleMonthChange(newMonth: number) {
    // Save current month data to Firebase
    saveToFirebase(year, month, entries, { personName, course, school, area, requiredHours });
    
    // Load new month data
    setMonth(newMonth);
    loadFromFirebase(year, newMonth);
  }

  function handleYearChange(newYear: number) {
    // Save current month data to Firebase
    saveToFirebase(year, month, entries, { personName, course, school, area, requiredHours });
    
    // Load new year data
    setYear(newYear);
    loadFromFirebase(newYear, month);
  }

  // Persist edits to Firebase whenever entries change
  useEffect(() => {
    if (personName) {
      saveToFirebase(year, month, entries, { personName, course, school, area, requiredHours });
    }
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

  // Overall taken minutes across all months (based on Firebase data).
  // Initialize from `monthlyTotalMinutes` for SSR hydration parity.
  const [overallTakenMinutes, setOverallTakenMinutes] = useState<number>(monthlyTotalMinutes);

  useEffect(() => {
    // For now, just use current month total
    // In the future, we could fetch all months data from Firebase
    setOverallTakenMinutes(monthlyTotalMinutes);
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
    const cleaned = getEmptyMonthEntries(year, month);
    setEntries(cleaned);
    saveToFirebase(year, month, cleaned, { personName, course, school, area, requiredHours });
  }

  return (
    <div className="min-h-screen bg-black p-6 font-sans text-white selection:bg-slate-700">
      <div className="mx-auto max-w-5xl space-y-8">
        {/* Header Section */}
        <div className="rounded-2xl border border-white/20 bg-black p-8 shadow-sm">
          <h1 className="mb-8 text-center text-3xl font-bold tracking-tight text-white">
            DARPO-BENGUET INTERNS DTR
          </h1>
         

          <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
            {/* Metadata Inputs */}
            <div className="grid gap-5 lg:col-span-2 sm:grid-cols-2">
              <label className="block">
                <span className="mb-1 block text-sm font-medium text-slate-300">Name</span>
                <input
                  type="text"
                  className="w-full rounded-md border border-slate-700 bg-black px-3 py-2 text-sm text-white shadow-sm transition-colors focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  value={personName}
                  onChange={(e) => setPersonName(e.target.value)}
                  onBlur={() => {
                    saveToFirebase(year, month, entries, { personName, course, school, area, requiredHours });
                  }}
                />
              </label>

              <label className="block">
                <span className="mb-1 block text-sm font-medium text-slate-300">School</span>
                <input
                  type="text"
                  className="w-full rounded-md border border-slate-700 bg-black px-3 py-2 text-sm text-white shadow-sm transition-colors focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  value={school}
                  onChange={(e) => setSchool(e.target.value)}
                  onBlur={() => {
                    saveToFirebase(year, month, entries, { personName, course, school, area, requiredHours });
                  }}
                />
              </label>

              <label className="block">
                <span className="mb-1 block text-sm font-medium text-slate-300">Course</span>
                <input
                  type="text"
                  className="w-full rounded-md border border-slate-700 bg-black px-3 py-2 text-sm text-white shadow-sm transition-colors focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  value={course}
                  onChange={(e) => setCourse(e.target.value)}
                  onBlur={() => {
                    saveToFirebase(year, month, entries, { personName, course, school, area, requiredHours });
                  }}
                />
              </label>

              <label className="block">
                <span className="mb-1 block text-sm font-medium text-slate-300">Area of Assignment</span>
                <input
                  type="text"
                  className="w-full rounded-md border border-slate-700 bg-black px-3 py-2 text-sm text-white shadow-sm transition-colors focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  value={area}
                  onChange={(e) => setArea(e.target.value)}
                  onBlur={() => {
                    saveToFirebase(year, month, entries, { personName, course, school, area, requiredHours });
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
                  return <option key={y} value={y}>{y}</option>;
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

            <div className="flex items-center gap-4">
              {/* Firebase Status Indicator */}
              <div className="flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full ${
                  firebaseStatus === 'saving' ? 'bg-yellow-400 animate-pulse' :
                  firebaseStatus === 'saved' ? 'bg-green-400' :
                  firebaseStatus === 'error' ? 'bg-red-400' :
                  'bg-gray-600'
                }`} />
                <span className="text-xs text-slate-400">
                  {firebaseStatus === 'saving' ? 'Saving to cloud...' :
                   firebaseStatus === 'saved' ? 'Saved to cloud' :
                   firebaseStatus === 'error' ? 'Save failed' :
                   'Ready'}
                </span>
              </div>


              <div className="flex items-center gap-2 rounded-lg border border-white/20 bg-slate-900 px-4 py-2">
                <span className="text-sm text-slate-400">Monthly Total:</span>
                <span className="text-lg font-bold text-white">{formatMinutesToHM(monthlyTotalMinutes)}</span>
              </div>
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
