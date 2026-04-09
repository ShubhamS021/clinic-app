import { useState, useEffect } from "react";
import { View, Text, TextInput, TouchableOpacity, Alert, ActivityIndicator, ScrollView, StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useAuthStore } from "../src/store/auth";
import { useClinicStore, type Clinic } from "../src/store/clinic";
import { login, listClinics } from "../src/api";

export default function IndexScreen() {
  const router = useRouter();
  const { isAuthenticated, accessToken, authenticate, logout } = useAuthStore();
  const { setSelectedClinic } = useClinicStore();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [clinics, setClinics] = useState<Clinic[]>([]);
  const [isLoadingClinics, setIsLoadingClinics] = useState(false);

  useEffect(() => {
    if (isAuthenticated && accessToken) loadClinics();
  }, [isAuthenticated]);

  const handleLogin = async () => {
    if (!email || !password) { Alert.alert("Error", "Enter email and password."); return; }
    setIsLoggingIn(true);
    try {
      const data = await login(email, password);
      authenticate(data.accessToken, data.user.email, data.user.id, data.user.role);
    } catch (e: any) {
      const msg = e?.response?.data?.cause || e?.message || "Unknown error";
      Alert.alert("Login Failed", `${msg}\n\nAPI: ${process.env.EXPO_PUBLIC_API_URL || "http://192.168.1.4:3000"}\nStatus: ${e?.response?.status || "no response"}`);
    } finally { setIsLoggingIn(false); }
  };

  const loadClinics = async () => {
    if (!accessToken) return;
    setIsLoadingClinics(true);
    try {
      const data = await listClinics(accessToken);
      setClinics(data.data);
    } catch { Alert.alert("Error", "Failed to load clinics."); }
    finally { setIsLoadingClinics(false); }
  };

  const handleSelectClinic = (clinic: Clinic) => {
    setSelectedClinic(clinic);
    router.push("/dashboard");
  };

  if (!isAuthenticated) {
    return (
      <SafeAreaView style={s.center}>
        <View style={s.card}>
          <Text style={s.logo}>3PT</Text>
          <Text style={s.title}>Clinic Mode</Text>
          <Text style={s.subtitle}>Sign in with your staff account</Text>
          <TextInput style={s.input} placeholder="Email" placeholderTextColor="#64748B" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" />
          <TextInput style={s.input} placeholder="Password" placeholderTextColor="#64748B" value={password} onChangeText={setPassword} secureTextEntry />
          <TouchableOpacity style={[s.btn, isLoggingIn && s.btnOff]} onPress={handleLogin} disabled={isLoggingIn}>
            {isLoggingIn ? <ActivityIndicator color="#FFF" /> : <Text style={s.btnText}>Sign In</Text>}
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  if (isLoadingClinics) {
    return <SafeAreaView style={s.center}><ActivityIndicator size="large" color="#3B82F6" /><Text style={s.loadingText}>Loading clinics...</Text></SafeAreaView>;
  }

  return (
    <SafeAreaView style={s.scrollBg}>
    <ScrollView contentContainerStyle={s.scrollContent}>
      <Text style={s.logo}>3PT</Text>
      <Text style={s.title}>Select Clinic</Text>
      <Text style={s.subtitle}>Choose which clinic this device is running for</Text>
      {clinics.map((c) => (
        <TouchableOpacity key={c.id} style={s.clinicItem} onPress={() => handleSelectClinic(c)}>
          <View><Text style={s.clinicName}>{c.name}</Text>{c.address && <Text style={s.clinicAddr}>{c.address}</Text>}</View>
          <Text style={s.arrow}>›</Text>
        </TouchableOpacity>
      ))}
      {clinics.length === 0 && <Text style={s.empty}>No clinics assigned to your account.</Text>}
      <TouchableOpacity style={s.logout} onPress={logout}><Text style={s.logoutText}>Sign Out</Text></TouchableOpacity>
    </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  center: { flex: 1, backgroundColor: "#0F172A", justifyContent: "center", alignItems: "center", padding: 32 },
  scrollBg: { flex: 1, backgroundColor: "#0F172A" },
  scrollContent: { padding: 32 },
  card: { width: "100%", maxWidth: 400, alignItems: "center" },
  logo: { fontSize: 36, fontWeight: "900", color: "#3B82F6", letterSpacing: 3 },
  title: { fontSize: 28, fontWeight: "800", color: "#F1F5F9", marginTop: 8 },
  subtitle: { fontSize: 15, color: "#94A3B8", marginTop: 4, marginBottom: 28 },
  input: { width: "100%", backgroundColor: "#1E293B", borderRadius: 12, padding: 16, fontSize: 16, color: "#E2E8F0", borderWidth: 1, borderColor: "#334155", marginBottom: 12 },
  btn: { width: "100%", backgroundColor: "#3B82F6", borderRadius: 14, padding: 18, alignItems: "center", marginTop: 8 },
  btnOff: { opacity: 0.5 },
  btnText: { color: "#FFF", fontSize: 17, fontWeight: "800" },
  loadingText: { color: "#94A3B8", marginTop: 12, fontSize: 15 },
  clinicItem: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", backgroundColor: "#1E293B", borderRadius: 16, padding: 20, marginBottom: 12, borderWidth: 1, borderColor: "#334155" },
  clinicName: { fontSize: 18, fontWeight: "700", color: "#E2E8F0" },
  clinicAddr: { fontSize: 13, color: "#64748B", marginTop: 3 },
  arrow: { fontSize: 28, color: "#3B82F6", fontWeight: "300" },
  empty: { color: "#64748B", fontSize: 15, textAlign: "center", marginTop: 32 },
  logout: { marginTop: 32, alignItems: "center", padding: 12 },
  logoutText: { color: "#EF4444", fontSize: 15, fontWeight: "600" },
});
