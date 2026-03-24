import { 
  collection, 
  doc, 
  setDoc, 
  getDoc, 
  getDocs, 
  updateDoc, 
  deleteDoc,
  query, 
  where,
  orderBy,
  Timestamp 
} from "firebase/firestore";
import { db } from "./firebase";

export interface DTRData {
  userId: string;
  metadata: {
    personName?: string;
    course?: string;
    school?: string;
    area?: string;
    requiredHours?: number | "";
  };
  months: {
    [monthKey: string]: {
      year: number;
      month: number;
      entries: DayEntry[];
      createdAt: Timestamp;
      updatedAt: Timestamp;
    };
  };
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface DayEntry {
  date: string;
  morningIn: string;
  morningOut: string;
  afternoonIn: string;
  afternoonOut: string;
}

const DTR_COLLECTION = "dtr_entries";

// Save or update DTR data for a specific month
export async function saveDTRData(
  userId: string,
  personName: string,
  year: number,
  month: number,
  entries: DayEntry[],
  metadata: DTRData['metadata']
): Promise<void> {
  try {
    // Use personName as document name, fallback to userId if no name provided
    const documentName = personName.trim() || userId;
    const docRef = doc(db, DTR_COLLECTION, documentName);
    const docSnap = await getDoc(docRef);

    const monthKey = `${year}-${month}`;
    const now = Timestamp.now();

    if (docSnap.exists()) {
      // Update existing document
      const existingData = docSnap.data() as DTRData;
      const updatedData: DTRData = {
        ...existingData,
        metadata: { ...existingData.metadata, ...metadata },
        months: {
          ...existingData.months,
          [monthKey]: {
            year,
            month,
            entries,
            createdAt: existingData.months[monthKey]?.createdAt || now,
            updatedAt: now
          }
        },
        updatedAt: now
      };
      await setDoc(docRef, updatedData);
    } else {
      // Create new document
      const newData: DTRData = {
        userId,
        metadata,
        months: {
          [monthKey]: {
            year,
            month,
            entries,
            createdAt: now,
            updatedAt: now
          }
        },
        createdAt: now,
        updatedAt: now
      };
      await setDoc(docRef, newData);
    }

    console.log("DTR data saved successfully");
  } catch (error) {
    console.error("Error saving DTR data:", error);
    throw error;
  }
}

// Get DTR data for a specific month
export async function getDTRData(
  userId: string,
  personName: string,
  year: number,
  month: number
): Promise<DTRData | null> {
  try {
    // Use personName as document name, fallback to userId if no name provided
    const documentName = personName.trim() || userId;
    const docRef = doc(db, DTR_COLLECTION, documentName);
    const docSnap = await getDoc(docRef);
    
    if (docSnap.exists()) {
      const data = docSnap.data() as DTRData;
      const monthKey = `${year}-${month}`;
      
      // Check if the specific month exists
      if (data.months[monthKey]) {
        return data;
      }
    }
    return null;
  } catch (error) {
    console.error("Error getting DTR data:", error);
    throw error;
  }
}

// Get all DTR data for a user
export async function getAllDTRData(userId: string): Promise<DTRData[]> {
  try {
    const q = query(
      collection(db, DTR_COLLECTION),
      where("userId", "==", userId)
    );
    
    const querySnapshot = await getDocs(q);
    const data: DTRData[] = [];
    
    querySnapshot.forEach((doc) => {
      data.push(doc.data() as DTRData);
    });
    
    return data;
  } catch (error) {
    console.error("Error getting all DTR data:", error);
    throw error;
  }
}

// Delete DTR data for a specific month
export async function deleteDTRData(
  userId: string,
  personName: string,
  year: number,
  month: number
): Promise<void> {
  try {
    // Use personName as document name, fallback to userId if no name provided
    const documentName = personName.trim() || userId;
    const docRef = doc(db, DTR_COLLECTION, documentName);
    const docSnap = await getDoc(docRef);
    
    if (docSnap.exists()) {
      const existingData = docSnap.data() as DTRData;
      const monthKey = `${year}-${month}`;
      
      // Remove the specific month
      const { [monthKey]: removedMonth, ...remainingMonths } = existingData.months;
      
      if (Object.keys(remainingMonths).length === 0) {
        // If no months left, delete the entire document
        await deleteDoc(docRef);
      } else {
        // Update document with remaining months
        const updatedData: DTRData = {
          ...existingData,
          months: remainingMonths,
          updatedAt: Timestamp.now()
        };
        await setDoc(docRef, updatedData);
      }
    }
    
    console.log("DTR data deleted successfully");
  } catch (error) {
    console.error("Error deleting DTR data:", error);
    throw error;
  }
}
