import { useEffect, useCallback, useRef, useState } from "react";
import { View, Text, FlatList, TouchableOpacity, Alert, StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useAuthStore } from "../src/store/auth";
import { useClinicStore, type ClinicSession } from "../src/store/clinic";
import { getClinicSessions, endSession } from "../src/api";
import { bleScanner } from "../src/ble";

const POLL_INTERVAL = 2000;

export default function DashboardScreen() {
  const router = useRouter();
  const { accessToken } = useAuthStore();
  const { selectedClinic, sessions, setSessions, setSelectedClinic } = useClinicStore();
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [bleStatus, setBleStatus] = useState<"off" | "scanning" | "error">("off");
  const [connectedCount, setConnectedCount] = useState(0);

  const fetchSessions = useCallback(async () => {
    if (!selectedClinic || !accessToken) return;
    try { const d = await getClinicSessions(selectedClinic.id, accessToken); setSessions(d.data); } catch {}
  }, [selectedClinic, accessToken, setSessions]);

  // Poll sessions
  useEffect(() => {
    fetchSessions();
    pollRef.current = setInterval(fetchSessions, POLL_INTERVAL);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [fetchSessions]);

  // Start BLE auto-scan
  useEffect(() => {
    if (!selectedClinic || !accessToken) return;

    const startBLE = async () => {
      try {
        await bleScanner.startAutoScan({
          clinicId: selectedClinic.id,
          token: accessToken,
          onDeviceDetected: (device) => {
            if (device.isRegistered) {
              console.log(`[Dashboard] Registered device nearby: ${device.name} → ${device.patientName}`);
            }
          },
          onSessionStarted: (deviceId, sessionId, initials) => {
            setConnectedCount(bleScanner.getConnectedCount());
            fetchSessions();
          },
          onHeartRateUpdate: (deviceId, bpm) => {
            setConnectedCount(bleScanner.getConnectedCount());
          },
          onDeviceDisconnected: (deviceId) => {
            setConnectedCount(bleScanner.getConnectedCount());
          },
        });
        setBleStatus("scanning");
      } catch (err: any) {
        console.error("[Dashboard] BLE error:", err.message);
        setBleStatus("error");
      }
    };

    startBLE();

    return () => {
      bleScanner.stopScan();
      bleScanner.disconnectAll();
    };
  }, [selectedClinic, accessToken]);

  const handleEnd = (session: ClinicSession) => {
    Alert.alert("End Session", `End session for ${session.patientInitials}?`, [
      { text: "Cancel", style: "cancel" },
      { text: "End", style: "destructive", onPress: async () => {
        if (!accessToken) return;
        try {
          await endSession(session.id, accessToken);
          // Disconnect BLE device if connected
          if (session.hrDeviceId) await bleScanner.disconnectDevice(session.hrDeviceId);
          fetchSessions();
        } catch { Alert.alert("Error", "Failed to end session."); }
      }},
    ]);
  };

  if (!selectedClinic) { router.replace("/"); return null; }
  const active = sessions.filter((s) => s.status === "ACTIVE" || s.status === "CHECKING_OUT");

  return (
    <SafeAreaView style={s.container}>
      <View style={s.header}>
        <View>
          <Text style={s.logo}>3PT Clinic Mode</Text>
          <Text style={s.clinicName}>{selectedClinic.name}</Text>
        </View>
        <View style={s.headerR}>
          <TouchableOpacity onPress={() => router.push("/devices")} style={s.devBtn}><Text style={s.devBtnText}>Devices</Text></TouchableOpacity>
          <TouchableOpacity onPress={() => router.push("/tv-display")} style={s.tvBtn}><Text style={s.tvBtnText}>TV Display</Text></TouchableOpacity>
          <TouchableOpacity onPress={() => { setSelectedClinic(null); bleScanner.destroy(); router.replace("/"); }}><Text style={s.changeText}>Change</Text></TouchableOpacity>
        </View>
      </View>

      {/* BLE Status Bar */}
      <View style={s.bleBar}>
        <View style={[s.bleDot, { backgroundColor: bleStatus === "scanning" ? "#22C55E" : bleStatus === "error" ? "#EF4444" : "#64748B" }]} />
        <Text style={s.bleText}>
          {bleStatus === "scanning" ? `BLE Scanning · ${connectedCount} device${connectedCount !== 1 ? "s" : ""} connected` :
           bleStatus === "error" ? "BLE Error — check Bluetooth permissions" :
           "BLE Off"}
        </Text>
      </View>

      <View style={s.stats}><Text style={s.statNum}>{active.length}</Text><Text style={s.statLabel}>Active Sessions</Text></View>

      <FlatList
        data={active}
        keyExtractor={(i) => i.id}
        contentContainerStyle={{ padding: 16, paddingBottom: 100 }}
        renderItem={({ item }) => (
          <View style={s.row}>
            <View style={s.rowLeft}>
              <View style={s.circle}><Text style={s.initials}>{item.patientInitials}</Text></View>
              <View>
                <Text style={s.pName}>{item.patientInitials}</Text>
                <Text style={s.meta}>
                  {item.checkInMethod === "IPAD_BLE" ? "BLE" : "Mobile"} · {item.hrDeviceName || "No device"}
                  {item.hrDeviceId && bleScanner.isDeviceConnected(item.hrDeviceId) ? " · Live" : ""}
                </Text>
              </View>
            </View>
            <View style={s.hrCol}><Text style={s.hrVal}>{item.currentHR > 0 ? item.currentHR : "--"}</Text><Text style={s.hrLbl}>BPM</Text></View>
            <View style={s.hrCol}><Text style={s.tgtVal}>{item.targetHR > 0 ? item.targetHR : "--"}</Text><Text style={s.hrLbl}>TARGET</Text></View>
            <TouchableOpacity style={s.endBtn} onPress={() => handleEnd(item)}><Text style={s.endText}>End</Text></TouchableOpacity>
          </View>
        )}
        ListEmptyComponent={
          <View style={s.empty}>
            <Text style={s.emptyTitle}>No active sessions</Text>
            <Text style={s.emptyHint}>
              {bleStatus === "scanning"
                ? "Scanning for registered HR devices... Put on a Polar strap to auto-connect"
                : "Check in a patient or register a device to get started"}
            </Text>
          </View>
        }
      />

      <TouchableOpacity style={s.fab} onPress={() => router.push("/check-in")}><Text style={s.fabText}>+ Check In Patient</Text></TouchableOpacity>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0F172A" },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: 20, backgroundColor: "#1E293B", borderBottomWidth: 1, borderBottomColor: "#334155" },
  logo: { fontSize: 20, fontWeight: "900", color: "#3B82F6" },
  clinicName: { fontSize: 14, color: "#94A3B8", marginTop: 2 },
  headerR: { flexDirection: "row", alignItems: "center", gap: 12 },
  devBtn: { backgroundColor: "#334155", paddingHorizontal: 14, paddingVertical: 7, borderRadius: 10 },
  devBtnText: { color: "#E2E8F0", fontWeight: "700", fontSize: 13 },
  tvBtn: { backgroundColor: "#3B82F6", paddingHorizontal: 14, paddingVertical: 7, borderRadius: 10 },
  tvBtnText: { color: "#FFF", fontWeight: "700", fontSize: 13 },
  changeText: { color: "#3B82F6", fontWeight: "600", fontSize: 14 },
  bleBar: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 20, paddingVertical: 8, backgroundColor: "#0F172A", borderBottomWidth: 1, borderBottomColor: "#1E293B" },
  bleDot: { width: 8, height: 8, borderRadius: 4 },
  bleText: { fontSize: 12, color: "#64748B", fontWeight: "600" },
  stats: { flexDirection: "row", alignItems: "baseline", gap: 8, padding: 20, borderBottomWidth: 1, borderBottomColor: "#1E293B" },
  statNum: { fontSize: 32, fontWeight: "900", color: "#22C55E" },
  statLabel: { fontSize: 14, color: "#64748B", fontWeight: "600" },
  row: { flexDirection: "row", alignItems: "center", backgroundColor: "#1E293B", borderRadius: 14, padding: 16, marginBottom: 8, borderWidth: 1, borderColor: "#334155" },
  rowLeft: { flex: 1, flexDirection: "row", alignItems: "center", gap: 12 },
  circle: { width: 40, height: 40, borderRadius: 20, backgroundColor: "#3B82F6", justifyContent: "center", alignItems: "center" },
  initials: { fontSize: 14, fontWeight: "800", color: "#FFF" },
  pName: { fontSize: 15, fontWeight: "700", color: "#E2E8F0" },
  meta: { fontSize: 11, color: "#64748B", marginTop: 2 },
  hrCol: { alignItems: "center", marginHorizontal: 12 },
  hrVal: { fontSize: 22, fontWeight: "900", color: "#22C55E" },
  tgtVal: { fontSize: 17, fontWeight: "700", color: "#94A3B8" },
  hrLbl: { fontSize: 10, color: "#64748B", fontWeight: "700" },
  endBtn: { backgroundColor: "rgba(239,68,68,0.15)", paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8 },
  endText: { color: "#EF4444", fontWeight: "700", fontSize: 13 },
  empty: { alignItems: "center", paddingVertical: 48 },
  emptyTitle: { fontSize: 18, fontWeight: "600", color: "#475569" },
  emptyHint: { fontSize: 14, color: "#64748B", marginTop: 4, textAlign: "center", paddingHorizontal: 32 },
  fab: { position: "absolute", bottom: 32, alignSelf: "center", backgroundColor: "#3B82F6", borderRadius: 16, paddingVertical: 16, paddingHorizontal: 32 },
  fabText: { color: "#FFF", fontSize: 17, fontWeight: "800" },
});
