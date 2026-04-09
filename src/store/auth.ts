import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import AsyncStorage from "@react-native-async-storage/async-storage";

interface AuthStore {
  isAuthenticated: boolean;
  accessToken: string | null;
  userEmail: string | null;
  userId: string | null;
  userRole: string | null;
  authenticate: (token: string, email: string, userId: string, role: string) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthStore>()(
  persist(
    (set) => ({
      isAuthenticated: false, accessToken: null, userEmail: null, userId: null, userRole: null,
      authenticate: (token, email, userId, role) =>
        set({ isAuthenticated: true, accessToken: token, userEmail: email, userId, userRole: role }),
      logout: () =>
        set({ isAuthenticated: false, accessToken: null, userEmail: null, userId: null, userRole: null }),
    }),
    { name: "clinic-auth", storage: createJSONStorage(() => AsyncStorage) },
  ),
);
