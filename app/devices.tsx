// Device Management — Register/view/remove Polar devices linked to patients
import { useState, useEffect } from "react";
import { View, Text, TextInput, TouchableOpacity, Alert, FlatList, StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useAuthStore } from "../src/store/auth";
import { listDevices, registerDevice, removeDevice, searchPatients } from "../src/api";

interface Device {
  id: string;
  bleDeviceId: string;
  deviceName: string;
  deviceType: string;
  patient: { id: string; first_name: string; last_name: string; prescribedExerciseHR: number | null };
}

export default function DevicesScreen() {
  const router = useRouter();
  const { accessToken } = useAuthStore();
  const [devices, setDevices] = useState<Device[]>([]);
  const [showRegister, setShowRegister] = useState(false);

  // Register form
  const [patientQuery, setPatientQuery] = useState("");
  const [patientResults, setPatientResults] = useState<any[]>([]);
  const [selectedPatient, setSelectedPatient] = useState<{ id: string; name: string } | null>(null);
  const [bleId, setBleId] = useState("");
  const [deviceName, setDeviceName] = useState("Polar H10");
  const [saving, setSaving] = useState(false);

  useEffect(() => { loadDevices(); }, []);

  const loadDevices = async () => {
    if (!accessToken) return;
    try {
      const data = await listDevices(accessToken);
      setDevices(data.data);
    } catch {}
  };

  const handleSearchPatient = async (text: string) => {
    setPatientQuery(text);
    if (text.length < 2 || !accessToken) return;
    try {
      const data = await searchPatients(text, accessToken);
      setPatientResults((data.data || data || []).map((u: any) => ({
        id: u.id, name: `${u.first_name} ${u.last_name}`,
      })));
    } catch { setPatientResults([]); }
  };

  const handleRegister = async () => {
    if (!selectedPatient || !bleId || !accessToken) {
      Alert.alert("Error", "Select a patient and enter the device ID.");
      return;
    }
    setSaving(true);
    try {
      await registerDevice({ patientId: selectedPatient.id, bleDeviceId: bleId.trim(), deviceName, deviceType: "POLAR_H10" }, accessToken);
      Alert.alert("Success", `${deviceName} registered to ${selectedPatient.name}`);
      setShowRegister(false);
      setSelectedPatient(null); setBleId(""); setPatientQuery("");
      loadDevices();
    } catch (e: any) {
      Alert.alert("Error", e?.response?.data?.cause || "Failed to register device.");
    } finally { setSaving(false); }
  };

  const handleRemove = (device: Device) => {
    Alert.alert("Remove Device", `Remove ${device.deviceName} (${device.bleDeviceId}) from ${device.patient.first_name}?`, [
      { text: "Cancel", style: "cancel" },
      { text: "Remove", style: "destructive", onPress: async () => {
        if (!accessToken) return;
        try { await removeDevice(device.id, accessToken); loadDevices(); } catch { Alert.alert("Error", "Failed to remove."); }
      }},
    ]);
  };

  return (
    <SafeAreaView style={s.container}>
      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()}><Text style={s.back}>‹ Back</Text></TouchableOpacity>
        <Text style={s.title}>Registered Devices</Text>
        <Text style={s.subtitle}>Polar HR monitors linked to patients</Text>
      </View>

      {/* Device List */}
      <FlatList
        data={devices}
        keyExtractor={(i) => i.id}
        contentContainerStyle={{ padding: 16, paddingBottom: 100 }}
        renderItem={({ item }) => (
          <View style={s.deviceRow}>
            <View style={s.deviceIcon}><Text style={s.deviceIconText}>♥</Text></View>
            <View style={s.deviceInfo}>
              <Text style={s.devicePatient}>{item.patient.first_name} {item.patient.last_name}</Text>
              <Text style={s.deviceId}>{item.deviceName} · {item.bleDeviceId}</Text>
              {item.patient.prescribedExerciseHR && (
                <Text style={s.deviceHR}>Target HR: {item.patient.prescribedExerciseHR}</Text>
              )}
            </View>
            <TouchableOpacity onPress={() => handleRemove(item)} style={s.removeBtn}>
              <Text style={s.removeText}>Remove</Text>
            </TouchableOpacity>
          </View>
        )}
        ListEmptyComponent={
          <View style={s.empty}><Text style={s.emptyText}>No devices registered yet</Text><Text style={s.emptyHint}>Tap + to link a Polar device to a patient</Text></View>
        }
      />

      {/* Register Modal */}
      {showRegister && (
        <View style={s.modal}>
          <View style={s.modalCard}>
            <Text style={s.modalTitle}>Register Device</Text>

            {/* Patient search */}
            <Text style={s.label}>Patient</Text>
            {selectedPatient ? (
              <View style={s.selectedRow}>
                <Text style={s.selectedName}>{selectedPatient.name}</Text>
                <TouchableOpacity onPress={() => { setSelectedPatient(null); setPatientQuery(""); }}>
                  <Text style={s.changeText}>Change</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <>
                <TextInput style={s.input} placeholder="Search patient name..." placeholderTextColor="#64748B" value={patientQuery} onChangeText={handleSearchPatient} />
                {patientResults.map((p) => (
                  <TouchableOpacity key={p.id} style={s.resultRow} onPress={() => { setSelectedPatient(p); setPatientResults([]); }}>
                    <Text style={s.resultName}>{p.name}</Text>
                  </TouchableOpacity>
                ))}
              </>
            )}

            {/* Device ID */}
            <Text style={[s.label, { marginTop: 16 }]}>Polar Device ID</Text>
            <Text style={s.hint}>Found on the sensor strap or in Polar app settings (e.g. A0:9E:1A:XX:XX:XX)</Text>
            <TextInput style={s.input} placeholder="Device ID or MAC address" placeholderTextColor="#64748B" value={bleId} onChangeText={setBleId} autoCapitalize="characters" />

            {/* Device name */}
            <Text style={[s.label, { marginTop: 16 }]}>Device Model</Text>
            <View style={s.typeRow}>
              {["Polar H10", "Garmin HRM-Pro", "Wahoo TICKR", "Other"].map((t) => (
                <TouchableOpacity key={t} onPress={() => setDeviceName(t)}
                  style={[s.typeChip, deviceName === t && s.typeChipActive]}>
                  <Text style={[s.typeChipText, deviceName === t && s.typeChipTextActive]}>{t}</Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Buttons */}
            <View style={s.modalBtns}>
              <TouchableOpacity style={s.cancelBtn} onPress={() => setShowRegister(false)}>
                <Text style={s.cancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[s.saveBtn, saving && { opacity: 0.5 }]} onPress={handleRegister} disabled={saving}>
                <Text style={s.saveText}>{saving ? "Saving..." : "Register"}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}

      {/* FAB */}
      {!showRegister && (
        <TouchableOpacity style={s.fab} onPress={() => setShowRegister(true)}>
          <Text style={s.fabText}>+ Register Device</Text>
        </TouchableOpacity>
      )}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0F172A" },
  header: { padding: 20, borderBottomWidth: 1, borderBottomColor: "#1E293B" },
  back: { fontSize: 18, color: "#3B82F6", fontWeight: "600", marginBottom: 12 },
  title: { fontSize: 24, fontWeight: "800", color: "#F1F5F9" },
  subtitle: { fontSize: 14, color: "#64748B", marginTop: 4 },
  deviceRow: { flexDirection: "row", alignItems: "center", backgroundColor: "#1E293B", borderRadius: 14, padding: 16, marginBottom: 8, borderWidth: 1, borderColor: "#334155" },
  deviceIcon: { width: 44, height: 44, borderRadius: 22, backgroundColor: "#EF4444" + "20", justifyContent: "center", alignItems: "center", marginRight: 12 },
  deviceIconText: { fontSize: 20, color: "#EF4444" },
  deviceInfo: { flex: 1 },
  devicePatient: { fontSize: 16, fontWeight: "700", color: "#E2E8F0" },
  deviceId: { fontSize: 12, color: "#64748B", marginTop: 2 },
  deviceHR: { fontSize: 11, color: "#3B82F6", marginTop: 2 },
  removeBtn: { backgroundColor: "rgba(239,68,68,0.15)", paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8 },
  removeText: { color: "#EF4444", fontWeight: "700", fontSize: 12 },
  empty: { alignItems: "center", paddingVertical: 48 },
  emptyText: { fontSize: 16, fontWeight: "600", color: "#475569" },
  emptyHint: { fontSize: 13, color: "#64748B", marginTop: 4 },
  // Modal
  modal: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.7)", justifyContent: "center", alignItems: "center", padding: 24 },
  modalCard: { backgroundColor: "#1E293B", borderRadius: 20, padding: 24, width: "100%", maxWidth: 460 },
  modalTitle: { fontSize: 22, fontWeight: "800", color: "#F1F5F9", marginBottom: 16 },
  label: { fontSize: 13, fontWeight: "700", color: "#94A3B8", marginBottom: 6 },
  hint: { fontSize: 11, color: "#475569", marginBottom: 8 },
  input: { backgroundColor: "#0F172A", borderRadius: 10, padding: 14, fontSize: 15, color: "#E2E8F0", borderWidth: 1, borderColor: "#334155" },
  resultRow: { backgroundColor: "#0F172A", borderRadius: 8, padding: 12, marginTop: 6, borderWidth: 1, borderColor: "#334155" },
  resultName: { color: "#E2E8F0", fontSize: 15, fontWeight: "600" },
  selectedRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", backgroundColor: "#0F172A", borderRadius: 10, padding: 14, borderWidth: 1, borderColor: "#22C55E" },
  selectedName: { color: "#E2E8F0", fontSize: 15, fontWeight: "600" },
  changeText: { color: "#3B82F6", fontWeight: "600", fontSize: 13 },
  typeRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  typeChip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, borderWidth: 1, borderColor: "#334155" },
  typeChipActive: { borderColor: "#3B82F6", backgroundColor: "#3B82F6" + "20" },
  typeChipText: { color: "#64748B", fontWeight: "600", fontSize: 13 },
  typeChipTextActive: { color: "#3B82F6" },
  modalBtns: { flexDirection: "row", gap: 12, marginTop: 20 },
  cancelBtn: { flex: 1, padding: 14, borderRadius: 12, borderWidth: 1, borderColor: "#334155", alignItems: "center" },
  cancelText: { color: "#94A3B8", fontWeight: "700", fontSize: 15 },
  saveBtn: { flex: 1, padding: 14, borderRadius: 12, backgroundColor: "#3B82F6", alignItems: "center" },
  saveText: { color: "#FFF", fontWeight: "700", fontSize: 15 },
  fab: { position: "absolute", bottom: 32, alignSelf: "center", backgroundColor: "#3B82F6", borderRadius: 16, paddingVertical: 16, paddingHorizontal: 32 },
  fabText: { color: "#FFF", fontSize: 16, fontWeight: "800" },
});
