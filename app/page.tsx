"use client";

import { useMemo, useState, useEffect, useRef, useCallback } from "react";
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
  const userIdRef = useRef(userId);
  
  // Keep userIdRef in sync
  useEffect(() => {
    userIdRef.current = userId;
    console.log("🆔 userId updated:", userId);
  }, [userId]);

  const totalDays = daysInMonth(year, month);

  const [entries, setEntries] = useState<DayEntry[]>(() => {
    const initialEntries = getEmptyMonthEntries(year, month);
    console.log("🆕 Entries initialized:", { year, month, count: initialEntries.length });
    return initialEntries;
  });

  // Track the last saved entries to prevent duplicate saves and false triggers
  const lastSavedEntriesRef = useRef<DayEntry[]>(JSON.parse(JSON.stringify(getEmptyMonthEntries(year, month))));
  
  // Wrapper to track all setEntries calls
  const setEntriesTracked = useCallback((newEntriesOrFn: DayEntry[] | ((prev: DayEntry[]) => DayEntry[])) => {
    console.log("🔄 setEntries called");
    if (typeof newEntriesOrFn === 'function') {
      setEntries((prev) => {
        const newEntries = newEntriesOrFn(prev);
        const hasData = newEntries.some(e => e.morningIn || e.morningOut || e.afternoonIn || e.afternoonOut);
        console.log("🔄 Entries updated via function:", { 
          prevCount: prev.length, 
          newCount: newEntries.length,
          hasData,
          sampleEntry: newEntries[0]
        });
        return newEntries;
      });
    } else {
      const hasData = newEntriesOrFn.some(e => e.morningIn || e.morningOut || e.afternoonIn || e.afternoonOut);
      console.log("🔄 Entries set directly:", { 
        count: newEntriesOrFn.length,
        hasData,
        sampleEntry: newEntriesOrFn[0]
      });
      setEntries(newEntriesOrFn);
    }
  }, []);

  // Debouncing for saves
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [isDirty, setIsDirty] = useState(false);
  const isLoadingRef = useRef(false);
  const [fieldLoading, setFieldLoading] = useState<string[]>([]);
  const [showSaved, setShowSaved] = useState(false);

  // Debounced save function
  const debouncedSave = useCallback((year: number, month: number, entries: DayEntry[], meta: any) => {
    console.log("⏳ debouncedSave called, clearing old timeout and setting new one");
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }
    
    saveTimeoutRef.current = setTimeout(() => {
      console.log("⏰ Timeout fired, calling saveToFirebase");
      saveToFirebase(year, month, entries, meta);
      setIsDirty(false);
    }, 1000); // Wait 1 second after user stops typing
  }, []);

  // Header metadata state
  const [personName, setPersonName] = useState("");
  const [course, setCourse] = useState("");
  const [school, setSchool] = useState("");
  const [area, setArea] = useState("");
  const [requiredHours, setRequiredHours] = useState<number | "">("");
  const [firebaseStatus, setFirebaseStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');

  // Initialize userId and personName from localStorage
  const [isPersonNameLoaded, setIsPersonNameLoaded] = useState(false);
  const [isInitialDataLoaded, setIsInitialDataLoaded] = useState(false);
  const loadAttemptedRef = useRef(false);
  
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

    // Load the last used person name
    const storedPersonName = localStorage.getItem("dtr-last-person-name");
    if (storedPersonName) {
      console.log("📋 Loading stored person name:", storedPersonName);
      setPersonName(storedPersonName);
      setIsPersonNameLoaded(true);
      
      // Also restore last viewed month/year for this person (CRITICAL FIX #2: convert 1-based to 0-based)
      const storedYear = localStorage.getItem(`dtr-last-year-${storedPersonName}`);
      const storedMonth = localStorage.getItem(`dtr-last-month-${storedPersonName}`);
      
      console.log("📅 Stored month/year:", { storedYear, storedMonth });
      
      if (storedYear && storedMonth) {
        const yearNum = parseInt(storedYear);
        const monthNum = parseInt(storedMonth) - 1; // Convert 1-based to 0-based
        if (!isNaN(yearNum) && !isNaN(monthNum) && monthNum >= 0 && monthNum <= 11) {
          console.log("📅 Restoring month/year:", { yearNum, monthNum });
          setYear(yearNum);
          setMonth(monthNum);
        }
      }
    } else {
      console.log("📋 No stored person name found");
      setIsPersonNameLoaded(true); // Mark as loaded even if empty
      setIsInitialDataLoaded(true); // No data to load, allow saves immediately
    }
  }, []);

  // Save personName to localStorage when it changes
  useEffect(() => {
    if (personName) {
      localStorage.setItem("dtr-last-person-name", personName);
    }
  }, [personName]);

  // Save current month/year when they change (CRITICAL FIX #2: store 1-based month)
  useEffect(() => {
    if (personName) {
      localStorage.setItem(`dtr-last-year-${personName}`, year.toString());
      localStorage.setItem(`dtr-last-month-${personName}`, (month + 1).toString()); // Store as 1-based
    }
  }, [personName, year, month]);

  // Load data from Firebase when component mounts or when year/month changes
  useEffect(() => {
    console.log("🔄 Checking data load conditions:", {
      userId,
      isPersonNameLoaded,
      personName,
      hasDB: !!db,
      year,
      month
    });
    
    if (userId && isPersonNameLoaded && personName && db) {
      console.log("✅ All conditions met, will load data in 50ms");
      // Use a small delay to ensure all state is updated
      setTimeout(() => {
        console.log("🚀 Now loading data...");
        loadFromFirebase(year, month);
      }, 50);
    } else {
      console.log("❌ Load conditions not met:", {
        hasUserId: !!userId,
        isPersonNameLoaded,
        hasPersonName: !!personName,
        hasDB: !!db
      });
    }
  }, [userId, isPersonNameLoaded, personName, year, month, db]);

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
    // CRITICAL FIX #1: Block save if no personName
    // Use ref for userId to ensure we have the latest value
    const currentUserId = userIdRef.current;
    if (!currentUserId || !meta?.personName?.trim()) {
      console.log("❌ SAVE BLOCKED: No userId or personName", { userId: currentUserId, personName: meta?.personName });
      return;
    }
    
    // CRITICAL FIX #2: Use correct month format (0-based to 1-based)
    const monthForSave = month + 1;
    
    console.log("🚀 SAVING TO FIREBASE:", {
      userId: currentUserId,
      personName: meta?.personName,
      isNewPerson: meta?.personName ? `Will create/update document: "${meta.personName}"` : 'No person name',
      year,
      month: monthForSave,
      originalMonth: month,
      entriesCount: entries.length,
      // Show actual time entries with data
      timeEntries: entries.filter(e => e.morningIn || e.morningOut || e.afternoonIn || e.afternoonOut).map(e => ({
        date: e.date,
        morning: `${e.morningIn}-${e.morningOut}`,
        afternoon: `${e.afternoonIn}-${e.afternoonOut}`
      })),
      // Show complete metadata being saved
      metadata: {
        personName: meta?.personName,
        course: meta?.course,
        school: meta?.school,
        area: meta?.area,
        requiredHours: meta?.requiredHours
      }
    });
    
    try {
      setFirebaseStatus('saving');
      // CRITICAL FIX #2: Pass correct month (1-based) to saveDTRData
      await saveDTRData(currentUserId, meta.personName.trim(), year, monthForSave, entries, meta);
      setFirebaseStatus('saved');
      setShowSaved(true);
      console.log("✅ SAVED SUCCESSFULLY");
      setTimeout(() => {
        setFirebaseStatus('idle');
        setShowSaved(false);
      }, 2000);
    } catch (error) {
      console.error("❌ FAILED TO SAVE:", error);
      setFirebaseStatus('error');
      setTimeout(() => setFirebaseStatus('idle'), 3000);
    }
  }

// Load from Firebase function
  async function loadFromFirebase(
    year: number,
    month: number
  ): Promise<void> {
    // CRITICAL FIX #5: Extra guard - don't load without proper data
    if (!userId || !personName?.trim()) {
      console.log("❌ LOAD BLOCKED: No userId or personName", { userId, personName });
      // For first-time users with no name, still allow data entry
      if (!personName?.trim()) {
        setIsInitialDataLoaded(true);
        console.log("✅ First-time user - allowing data entry without load");
      }
      return;
    }
    
    // CRITICAL FIX #2: Use correct month format (0-based to 1-based)
    const monthForLoad = month + 1;
    
    console.log("📥 LOADING FROM FIREBASE:", { userId, personName, year, month: monthForLoad, originalMonth: month });
    isLoadingRef.current = true;
    setFieldLoading(['all']);
    
    try {
      // CRITICAL FIX #2: Pass correct month (1-based) to getDTRData
      const data = await getDTRData(userId, personName.trim(), year, monthForLoad);
      console.log("📊 FIREBASE DATA RECEIVED:", data);
      
      if (data) {
        console.log("✅ Person data found:", {
          metadata: data.metadata,
          months: Object.keys(data.months || {})
        });
        
        // Load metadata
        setCourse(data.metadata.course || "");
        setSchool(data.metadata.school || "");
        setArea(data.metadata.area || "");
        setRequiredHours(data.metadata.requiredHours || "");
        
        // CRITICAL FIX #2: Use correct month format for lookup
        const monthKey = `${year}-${String(monthForLoad).padStart(2, "0")}`;
        const monthData = data.months?.[monthKey];
        
        console.log("🔍 Month data check:", { monthKey, monthData });
        
        if (monthData?.entries && monthData.entries.length > 0) {
          const hasAnyData = monthData.entries.some(e => 
            e.morningIn || e.morningOut || e.afternoonIn || e.afternoonOut
          );
          
          if (hasAnyData) {
            console.log("✅ Loading entries with data:", monthData.entries);
            setEntries(cloneEntries(monthData.entries));
            // Update lastSavedEntriesRef so we don't trigger save immediately after load
            lastSavedEntriesRef.current = JSON.parse(JSON.stringify(monthData.entries));
            console.log("✅ Entries state updated with loaded data");
          } else {
            console.log("⚠️ Entries exist but all empty, loading empty template");
            const emptyEntries = getEmptyMonthEntries(year, month);
            setEntries(emptyEntries);
            lastSavedEntriesRef.current = JSON.parse(JSON.stringify(emptyEntries));
          }
        } else {
          console.log("⚠️ No entries in Firebase for this month, loading empty template");
          // Load empty entries for this month
          const emptyEntries = getEmptyMonthEntries(year, month);
          setEntries(emptyEntries);
          lastSavedEntriesRef.current = JSON.parse(JSON.stringify(emptyEntries));
        }
      } else {
        console.log("⚠️ No person data found in Firebase, loading empty template");
        // No data found, load empty entries
        const emptyEntries = getEmptyMonthEntries(year, month);
        setEntries(emptyEntries);
        lastSavedEntriesRef.current = JSON.parse(JSON.stringify(emptyEntries));
      }
    } catch (error) {
      console.error("❌ FAILED TO LOAD:", error);
      const emptyEntries = getEmptyMonthEntries(year, month);
      setEntries(emptyEntries);
      lastSavedEntriesRef.current = JSON.parse(JSON.stringify(emptyEntries));
    } finally {
      setTimeout(() => {
        isLoadingRef.current = false;
        setFieldLoading([]);
        setIsInitialDataLoaded(true); // Mark initial load as complete
        console.log("🏁 Loading complete - initial data loaded");
      }, 100);
    }
  }

  // When switching months/years we save current entries and load saved entries for target month if present.
  function handleMonthChange(newMonth: number) {
    // Save current month data to Firebase
    saveToFirebase(year, month, entries, { personName, course, school, area, requiredHours });
    
    // Reset initial data loaded flag for new month
    setIsInitialDataLoaded(false);
    
    // Load new month data
    setMonth(newMonth);
    loadFromFirebase(year, newMonth);
  }

  function handleYearChange(newYear: number) {
    // Save current month data to Firebase
    saveToFirebase(year, month, entries, { personName, course, school, area, requiredHours });
    
    // Reset initial data loaded flag for new year
    setIsInitialDataLoaded(false);
    
    // Load new year data
    setYear(newYear);
    loadFromFirebase(newYear, month);
  }

  // Persist edits to Firebase whenever entries change (with debouncing)
  useEffect(() => {
    // CRITICAL: Block saves until initial data load is complete
    if (!personName || !isPersonNameLoaded || !isInitialDataLoaded || isLoadingRef.current) {
      console.log("📝 Save useEffect - blocked:", {
        personName: !!personName,
        isPersonNameLoaded,
        isInitialDataLoaded,
        isLoading: isLoadingRef.current
      });
      return;
    }
    
    // Check if entries actually changed from last save
    const currentEntriesStr = JSON.stringify(entries);
    const lastSavedStr = JSON.stringify(lastSavedEntriesRef.current);
    const entriesChanged = currentEntriesStr !== lastSavedStr;
    const hasData = entries.some(e => e.morningIn || e.morningOut || e.afternoonIn || e.afternoonOut);
    
    console.log("📝 Save useEffect - checking:", {
      entriesChanged,
      hasData,
      entriesLength: entries.length,
      lastSavedLength: lastSavedEntriesRef.current.length
    });
    
    if (!entriesChanged || !hasData) {
      return;
    }
    
    console.log("📝 Entries changed with data, triggering debounced save");
    
    // Update last saved ref
    lastSavedEntriesRef.current = JSON.parse(currentEntriesStr);
    
    // Trigger debounced save
    debouncedSave(year, month, entries, { personName, course, school, area, requiredHours });
    
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entries, isInitialDataLoaded]);

  // CRITICAL FIX #4: Force save on page unload if dirty
  useEffect(() => {
    const handleBeforeUnload = () => {
      if (isDirty && personName) {
        console.log("⚡ EMERGENCY SAVE: Page unloading with unsaved changes");
        // Use sync-ish approach for beforeunload
        saveToFirebase(year, month, entries, { personName, course, school, area, requiredHours });
      }
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [isDirty, entries, year, month, personName, course, school, area, requiredHours]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, []);

  function updateEntry(
    index: number,
    field: "morningIn" | "morningOut" | "afternoonIn" | "afternoonOut",
    value: string
  ) {
    console.log(`✏️ updateEntry: row ${index}, field ${field}, value "${value}"`);
    const fieldId = `${index}-${field}`;
    setFieldLoading(prev => [...prev.filter(id => id !== fieldId), fieldId]);
    setEntries((prev) => {
      const copy = prev.slice();
      copy[index] = { ...copy[index], [field]: value };
      console.log(`📝 Entry ${index} updated:`, copy[index]);
      return copy;
    });
    
    // Clear loading state after a short delay
    setTimeout(() => {
      setFieldLoading(prev => prev.filter(id => id !== fieldId));
    }, 500);
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
    console.log("🗑️ Reset called - clearing all entries");
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
    console.log("🗑️ clearCurrentMonth called");
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
                <div className="relative">
                  <input
                    type="text"
                    className={`w-full rounded-md border border-slate-700 bg-black px-3 py-2 text-sm text-white shadow-sm transition-colors focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 ${
                      fieldLoading.includes('personName') ? 'pl-8' : ''
                    }`}
                    value={personName}
                    onChange={(e) => {
                      const newName = e.target.value;
                      setPersonName(newName);
                      setIsDirty(true);
                      // Clear entries if name is empty
                      if (!newName.trim()) {
                        const emptyEntries = getEmptyMonthEntries(year, month);
                        setEntries(emptyEntries);
                        setCourse("");
                        setSchool("");
                        setArea("");
                        setRequiredHours("");
                      }
                    }}
                    onBlur={() => {
                      if (isDirty) {
                        setFieldLoading(['personName']);
                        saveToFirebase(year, month, entries, { personName, course, school, area, requiredHours });
                        setIsDirty(false);
                        setTimeout(() => setFieldLoading([]), 500);
                      }
                    }}
                  />
                  {fieldLoading.includes('personName') && (
                    <div className="absolute left-3 top-2.5">
                      <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent border-r-transparent animate-spin rounded-full border-l-blue-500 border-b-blue-500"></div>
                    </div>
                  )}
                </div>
              </label>

              <label className="block">
                <span className="mb-1 block text-sm font-medium text-slate-300">School</span>
                <div className="relative">
                  <input
                    type="text"
                    className={`w-full rounded-md border border-slate-700 bg-black px-3 py-2 text-sm text-white shadow-sm transition-colors focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 ${
                      fieldLoading.includes('school') ? 'pl-8' : ''
                    }`}
                    value={school}
                    onChange={(e) => {
                      setSchool(e.target.value);
                      setIsDirty(true);
                    }}
                    onBlur={() => {
                      if (isDirty) {
                        setFieldLoading(['school']);
                        saveToFirebase(year, month, entries, { personName, course, school, area, requiredHours });
                        setIsDirty(false);
                        setTimeout(() => setFieldLoading([]), 500);
                      }
                    }}
                  />
                  {fieldLoading.includes('school') && (
                    <div className="absolute left-3 top-2.5">
                      <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent border-r-transparent animate-spin rounded-full border-l-blue-500 border-b-blue-500"></div>
                    </div>
                  )}
                </div>
              </label>

              <label className="block">
                <span className="mb-1 block text-sm font-medium text-slate-300">Course</span>
                <div className="relative">
                  <input
                    type="text"
                    className={`w-full rounded-md border border-slate-700 bg-black px-3 py-2 text-sm text-white shadow-sm transition-colors focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 ${
                      fieldLoading.includes('course') ? 'pl-8' : ''
                    }`}
                    value={course}
                    onChange={(e) => {
                      setCourse(e.target.value);
                      setIsDirty(true);
                    }}
                    onBlur={() => {
                      if (isDirty) {
                        setFieldLoading(['course']);
                        saveToFirebase(year, month, entries, { personName, course, school, area, requiredHours });
                        setIsDirty(false);
                        setTimeout(() => setFieldLoading([]), 500);
                      }
                    }}
                  />
                  {fieldLoading.includes('course') && (
                    <div className="absolute left-3 top-2.5">
                      <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent border-r-transparent animate-spin rounded-full border-l-blue-500 border-b-blue-500"></div>
                    </div>
                  )}
                </div>
              </label>

              <label className="block">
                <span className="mb-1 block text-sm font-medium text-slate-300">Area of Assignment</span>
                <div className="relative">
                  <input
                    type="text"
                    className={`w-full rounded-md border border-slate-700 bg-black px-3 py-2 text-sm text-white shadow-sm transition-colors focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 ${
                      fieldLoading.includes('area') ? 'pl-8' : ''
                    }`}
                    value={area}
                    onChange={(e) => {
                      setArea(e.target.value);
                      setIsDirty(true);
                    }}
                    onBlur={() => {
                      if (isDirty) {
                        setFieldLoading(['area']);
                        saveToFirebase(year, month, entries, { personName, course, school, area, requiredHours });
                        setIsDirty(false);
                        setTimeout(() => setFieldLoading([]), 500);
                      }
                    }}
                  />
                  {fieldLoading.includes('area') && (
                    <div className="absolute left-3 top-2.5">
                      <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent border-r-transparent animate-spin rounded-full border-l-blue-500 border-b-blue-500"></div>
                    </div>
                  )}
                </div>
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
              {/* Saved Indicator */}
              {showSaved && (
                <div className="flex items-center gap-2 rounded-lg border border-green-500 bg-green-600/20 px-4 py-2">
                  <svg className="w-5 h-5 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  <span className="text-sm text-green-400 font-medium">Saved!</span>
                </div>
              )}

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
        <div className="overflow-hidden rounded-xl border border-white/20 bg-black shadow-sm relative">
          {/* Loading Overlay */}
          {fieldLoading.includes('all') && (
            <div className="absolute inset-0 bg-black/80 flex items-center justify-center z-10">
              <div className="flex flex-col items-center gap-4">
                <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent border-r-transparent animate-spin rounded-full border-l-blue-500 border-b-blue-500"></div>
                <span className="text-white text-sm font-medium">Loading time entries...</span>
              </div>
            </div>
          )}
          
          <div className={`overflow-x-auto ${fieldLoading.includes('all') ? 'opacity-50' : ''}`}>
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
                        <div className="relative">
                          <input
                            type="time"
                            value={e.morningIn}
                            onChange={(ev) => updateEntry(i, "morningIn", ev.target.value)}
                            className={`w-24 border-0 bg-transparent p-0 text-center text-sm text-white focus:ring-0 ${
                              fieldLoading.includes(`${i}-morningIn`) ? 'text-blue-400' : ''
                            }`}
                          />
                          {fieldLoading.includes(`${i}-morningIn`) && (
                            <div className="absolute right-1 top-1/2 -translate-y-1/2">
                              <div className="w-3 h-3 border border-blue-400 border-t-transparent border-r-transparent animate-spin rounded-full border-l-blue-400 border-b-blue-400"></div>
                            </div>
                          )}
                        </div>
                        <span className="text-slate-400">-</span>
                        <div className="relative">
                          <input
                            type="time"
                            value={e.morningOut}
                            onChange={(ev) => updateEntry(i, "morningOut", ev.target.value)}
                            className={`w-24 border-0 bg-transparent p-0 text-center text-sm text-white focus:ring-0 ${
                              fieldLoading.includes(`${i}-morningOut`) ? 'text-blue-400' : ''
                            }`}
                          />
                          {fieldLoading.includes(`${i}-morningOut`) && (
                            <div className="absolute right-1 top-1/2 -translate-y-1/2">
                              <div className="w-3 h-3 border border-blue-400 border-t-transparent border-r-transparent animate-spin rounded-full border-l-blue-400 border-b-blue-400"></div>
                            </div>
                          )}
                        </div>
                      </div>
                    </td>

                    <td className="px-6 py-3 text-center">
                      <div className="inline-flex items-center gap-2 rounded-md bg-slate-800 p-1 ring-1 ring-slate-700">
                        <div className="relative">
                          <input
                            type="time"
                            value={e.afternoonIn}
                            onChange={(ev) => updateEntry(i, "afternoonIn", ev.target.value)}
                            className={`w-24 border-0 bg-transparent p-0 text-center text-sm text-white focus:ring-0 ${
                              fieldLoading.includes(`${i}-afternoonIn`) ? 'text-blue-400' : ''
                            }`}
                          />
                          {fieldLoading.includes(`${i}-afternoonIn`) && (
                            <div className="absolute right-1 top-1/2 -translate-y-1/2">
                              <div className="w-3 h-3 border border-blue-400 border-t-transparent border-r-transparent animate-spin rounded-full border-l-blue-400 border-b-blue-400"></div>
                            </div>
                          )}
                        </div>
                        <span className="text-slate-400">-</span>
                        <div className="relative">
                          <input
                            type="time"
                            value={e.afternoonOut}
                            onChange={(ev) => updateEntry(i, "afternoonOut", ev.target.value)}
                            className={`w-24 border-0 bg-transparent p-0 text-center text-sm text-white focus:ring-0 ${
                              fieldLoading.includes(`${i}-afternoonOut`) ? 'text-blue-400' : ''
                            }`}
                          />
                          {fieldLoading.includes(`${i}-afternoonOut`) && (
                            <div className="absolute right-1 top-1/2 -translate-y-1/2">
                              <div className="w-3 h-3 border border-blue-400 border-t-transparent border-r-transparent animate-spin rounded-full border-l-blue-400 border-b-blue-400"></div>
                            </div>
                          )}
                        </div>
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
