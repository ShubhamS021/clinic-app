import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import AsyncStorage from "@react-native-async-storage/async-storage";

export interface Clinic {
  id: string;
  name: string;
  address: string | null;
}

export interface ClinicSession {
  id: string;
  clinicId: string;
  patientId: string;
  patientInitials: string;
  status: "ACTIVE" | "CHECKING_OUT" | "ENDED";
  checkInMethod: "IPAD_BLE" | "MOBILE_APP";
  currentHR: number;
  averageHR: number;
  targetHR: number;
  startedAt: string;
  hrDeviceId: string | null;
  hrDeviceName: string | null;
  workoutId: string | null;
}

interface ClinicStore {
  selectedClinic: Clinic | null;
  sessions: ClinicSession[];
  setSelectedClinic: (c: Clinic | null) => void;
  setSessions: (s: ClinicSession[]) => void;
  reset: () => void;
}

export const useClinicStore = create<ClinicStore>()(
  persist(
    (set) => ({
      selectedClinic: null, sessions: [],
      setSelectedClinic: (c) => set({ selectedClinic: c }),
      setSessions: (s) => set({ sessions: s }),
      reset: () => set({ selectedClinic: null, sessions: [] }),
    }),
    { name: "clinic-store", storage: createJSONStorage(() => AsyncStorage) },
  ),
);
