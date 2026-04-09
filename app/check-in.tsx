import { useState } from "react";
import { View, Text, TextInput, TouchableOpacity, Alert, ScrollView, StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useAuthStore } from "../src/store/auth";
import { useClinicStore } from "../src/store/clinic";
import { checkIn, searchPatients } from "../src/api";

export default function CheckInScreen() {
  const router = useRouter();
  const { accessToken } = useAuthStore();
  const { selectedClinic } = useClinicStore();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<any[]>([]);
  const [selected, setSelected] = useState<{ id: string; name: string; initials: string } | null>(null);
  const [starting, setStarting] = useState(false);

  const handleSearch = async (text: string) => {
    setQuery(text);
    if (text.length < 2 || !accessToken) return;
    try {
      const data = await searchPatients(text, accessToken);
      setResults((data.data || data || []).map((u: any) => ({
        id: u.id, name: `${u.first_name} ${u.last_name}`,
        initials: `${u.first_name?.[0] || ""}${u.last_name?.[0] || ""}`.toUpperCase(),
      })));
    } catch { setResults([]); }
  };

  const handleStart = async () => {
    if (!selected || !selectedClinic || !accessToken) return;
    setStarting(true);
    try {
      await checkIn({ clinicId: selectedClinic.id, patientId: selected.id, checkInMethod: "IPAD_BLE" }, accessToken);
      router.back();
    } catch (e: any) { Alert.alert("Error", e?.response?.data?.cause || "Failed to start session."); }
    finally { setStarting(false); }
  };

  return (
    <SafeAreaView style={s.scroll}>
    <ScrollView contentContainerStyle={s.content}>
      <TouchableOpacity onPress={() => router.back()}><Text style={s.back}>‹ Back</Text></TouchableOpacity>
      <Text style={s.title}>Check In Patient</Text>
      <Text style={s.badge}>{selectedClinic?.name}</Text>

      <Text style={s.step}>STEP 1</Text>
      <Text style={s.section}>Select Patient</Text>
      <TextInput style={s.input} placeholder="Search by name..." placeholderTextColor="#64748B" value={query} onChangeText={handleSearch} />

      {!selected && results.map((p) => (
        <TouchableOpacity key={p.id} style={s.result} onPress={() => { setSelected(p); setResults([]); }}>
          <View style={s.rCircle}><Text style={s.rInit}>{p.initials}</Text></View>
          <Text style={s.rName}>{p.name}</Text>
        </TouchableOpacity>
      ))}

      {selected && (
        <View style={s.selectedRow}>
          <View style={s.rCircle}><Text style={s.rInit}>{selected.initials}</Text></View>
          <Text style={s.rName}>{selected.name}</Text>
          <TouchableOpacity onPress={() => { setSelected(null); setQuery(""); }}><Text style={s.change}>Change</Text></TouchableOpacity>
        </View>
      )}

      <Text style={[s.step, { marginTop: 28 }]}>STEP 2</Text>
      <TouchableOpacity style={[s.startBtn, (!selected || starting) && s.off]} onPress={handleStart} disabled={!selected || starting}>
        <Text style={s.startText}>{starting ? "Starting..." : "Start Session"}</Text>
      </TouchableOpacity>
    </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: "#0F172A" },
  content: { padding: 32 },
  back: { fontSize: 18, color: "#3B82F6", fontWeight: "600", marginBottom: 16 },
  title: { fontSize: 28, fontWeight: "800", color: "#F1F5F9", marginBottom: 8 },
  badge: { fontSize: 14, color: "#3B82F6", fontWeight: "600", backgroundColor: "rgba(59,130,246,0.1)", alignSelf: "flex-start", paddingHorizontal: 12, paddingVertical: 4, borderRadius: 8, marginBottom: 24, overflow: "hidden" },
  step: { fontSize: 11, fontWeight: "800", color: "#3B82F6", letterSpacing: 2, marginBottom: 6 },
  section: { fontSize: 20, fontWeight: "700", color: "#E2E8F0", marginBottom: 12 },
  input: { backgroundColor: "#1E293B", borderRadius: 12, padding: 16, fontSize: 16, color: "#E2E8F0", borderWidth: 1, borderColor: "#334155" },
  result: { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: "#1E293B", borderRadius: 12, padding: 14, marginTop: 8, borderWidth: 1, borderColor: "#334155" },
  rCircle: { width: 40, height: 40, borderRadius: 20, backgroundColor: "#3B82F6", justifyContent: "center", alignItems: "center" },
  rInit: { color: "#FFF", fontWeight: "800", fontSize: 14 },
  rName: { color: "#E2E8F0", fontSize: 16, fontWeight: "600", flex: 1 },
  selectedRow: { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: "#1E293B", borderRadius: 12, padding: 14, marginTop: 12, borderWidth: 1, borderColor: "#22C55E" },
  change: { color: "#3B82F6", fontWeight: "600", fontSize: 14 },
  startBtn: { backgroundColor: "#3B82F6", borderRadius: 14, padding: 20, alignItems: "center" },
  off: { opacity: 0.4 },
  startText: { color: "#FFF", fontSize: 18, fontWeight: "800" },
});
