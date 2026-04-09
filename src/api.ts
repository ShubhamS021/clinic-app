import axios from "axios";

const API_URL = process.env.EXPO_PUBLIC_API_URL || "http://192.168.1.4:3000";
const api = axios.create({ baseURL: API_URL });

export async function login(email: string, password: string) {
  try {
    const trimmedEmail = email.trim().toLowerCase();
    const trimmedPassword = password.trim();
    console.log("[API] Login attempt:", trimmedEmail, "→", API_URL);
    const res = await api.post("/auth/sign-in", { email: trimmedEmail, password: trimmedPassword });
    const data = res.data;
    console.log("[API] Login success:", data.user?.email);
    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      user: data.user,
    };
  } catch (err: any) {
    console.log("[API] Login error:", err?.response?.status, err?.response?.data, err?.message);
    throw err;
  }
}

export async function listClinics(token: string) {
  const res = await api.get("/clinic", { headers: { "x-api-key": token } });
  return res.data;
}

export async function getClinicSessions(clinicId: string, token: string) {
  const res = await api.get(`/clinic/${clinicId}/sessions`, { headers: { "x-api-key": token } });
  return res.data;
}

export async function checkIn(
  params: { clinicId: string; patientId: string; checkInMethod: "IPAD_BLE" | "MOBILE_APP"; hrDeviceId?: string; hrDeviceName?: string },
  token: string,
) {
  const res = await api.post("/clinic/check-in", params, { headers: { "x-api-key": token } });
  return res.data;
}

export async function updateHeartRate(sessionId: string, bpm: number, token: string) {
  const res = await api.post("/clinic/heart-rate", { sessionId, bpm }, { headers: { "x-api-key": token } });
  return res.data;
}

export async function endSession(sessionId: string, token: string) {
  const res = await api.put(`/clinic/${sessionId}/end`, null, { headers: { "x-api-key": token } });
  return res.data;
}

export async function searchPatients(query: string, token: string) {
  const res = await api.get("/admin/users", { headers: { "x-api-key": token } });
  // API returns { users: [...] }, filter client-side by name
  const users = res.data.users || res.data.data || [];
  const q = query.toLowerCase();
  const filtered = users.filter((u: any) =>
    `${u.first_name} ${u.last_name}`.toLowerCase().includes(q) ||
    u.email?.toLowerCase().includes(q)
  );
  return { data: filtered.slice(0, 10) };
}

// ─── Device Management ───────────────────────────────────

export async function registerDevice(params: { patientId: string; bleDeviceId: string; deviceName: string; deviceType?: string }, token: string) {
  const res = await api.post("/clinic/devices", params, { headers: { "x-api-key": token } });
  return res.data;
}

export async function listDevices(token: string) {
  const res = await api.get("/clinic/devices", { headers: { "x-api-key": token } });
  return res.data;
}

export async function lookupDevice(bleDeviceId: string, token: string) {
  const res = await api.get(`/clinic/devices/lookup/${encodeURIComponent(bleDeviceId)}`, { headers: { "x-api-key": token } });
  return res.data;
}

export async function removeDevice(deviceId: string, token: string) {
  const res = await api.delete(`/clinic/devices/${deviceId}`, { headers: { "x-api-key": token } });
  return res.data;
}
