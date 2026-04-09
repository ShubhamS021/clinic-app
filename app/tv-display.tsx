// Clinic Mode — TV Display (Polar Club-style group HR monitor)
// Full-screen, color-coded HR zones, designed for gym TV casting

import { useEffect, useState, useCallback, useRef } from "react";
import { View, Text, FlatList, Dimensions, StyleSheet, Animated } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuthStore } from "../src/store/auth";
import { useClinicStore, type ClinicSession } from "../src/store/clinic";
import { getClinicSessions } from "../src/api";

const POLL_INTERVAL = 2000;

// ─── HR Zones (matches Polar Club zones) ─────────────────
const ZONES = [
  { name: "REST",     color: "#6B7280", min: 0,   max: 49  },
  { name: "VERY LIGHT", color: "#6B7280", min: 50,  max: 59  },
  { name: "LIGHT",    color: "#3B82F6", min: 60,  max: 69  },
  { name: "MODERATE", color: "#22C55E", min: 70,  max: 79  },
  { name: "HARD",     color: "#F59E0B", min: 80,  max: 89  },
  { name: "MAXIMUM",  color: "#EF4444", min: 90,  max: 200 },
];

function getZone(currentHR: number, targetHR: number) {
  if (currentHR <= 0 || targetHR <= 0) return ZONES[0];
  const pct = Math.round((currentHR / targetHR) * 100);
  return ZONES.find((z) => pct >= z.min && pct <= z.max) || ZONES[5];
}

function getHRPercent(currentHR: number, targetHR: number) {
  if (currentHR <= 0 || targetHR <= 0) return 0;
  return Math.round((currentHR / targetHR) * 100);
}

function getSessionDuration(startedAt: string) {
  const ms = Date.now() - new Date(startedAt).getTime();
  const mins = Math.floor(ms / 60000);
  const secs = Math.floor((ms % 60000) / 1000);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

// ─── Main Screen ─────────────────────────────────────────

export default function TVDisplayScreen() {
  const { accessToken } = useAuthStore();
  const { selectedClinic } = useClinicStore();
  const [sessions, setSessions] = useState<ClinicSession[]>([]);
  const [time, setTime] = useState(new Date());
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchData = useCallback(async () => {
    if (!selectedClinic || !accessToken) return;
    try {
      const d = await getClinicSessions(selectedClinic.id, accessToken);
      setSessions(d.data);
    } catch {}
  }, [selectedClinic, accessToken]);

  useEffect(() => {
    fetchData();
    pollRef.current = setInterval(fetchData, POLL_INTERVAL);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [fetchData]);

  useEffect(() => {
    const t = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const active = sessions.filter((s) => s.status !== "ENDED");
  const cols = getCols();

  // Zone distribution for summary bar
  const zoneCounts = ZONES.map((z) => ({
    ...z,
    count: active.filter((s) => getZone(s.currentHR, s.targetHR).name === z.name).length,
  }));

  return (
    <SafeAreaView style={s.container} edges={["top", "left", "right"]}>
      {/* Header */}
      <View style={s.header}>
        <View style={s.hLeft}>
          <Text style={s.logo}>3PT</Text>
          <View style={s.headerDivider} />
          <Text style={s.clinic}>{selectedClinic?.name || "Clinic Mode"}</Text>
        </View>
        <View style={s.hRight}>
          <View style={s.activeBadge}>
            <Text style={s.activeNum}>{active.length}</Text>
            <Text style={s.activeLabel}>ACTIVE</Text>
          </View>
          <Text style={s.clock}>
            {time.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
          </Text>
        </View>
      </View>

      {/* Zone Distribution Bar */}
      {active.length > 0 && (
        <View style={s.zoneBar}>
          {zoneCounts.filter((z) => z.count > 0).map((z) => (
            <View key={z.name} style={[s.zoneSegment, { backgroundColor: z.color, flex: z.count }]}>
              <Text style={s.zoneSegText}>{z.count}</Text>
            </View>
          ))}
        </View>
      )}

      {/* Patient Tiles */}
      {active.length > 0 ? (
        <FlatList
          data={active}
          keyExtractor={(i) => i.id}
          renderItem={({ item }) => <Tile session={item} />}
          numColumns={cols}
          key={cols}
          contentContainerStyle={s.grid}
          columnWrapperStyle={cols > 1 ? s.gridRow : undefined}
        />
      ) : (
        <View style={s.empty}>
          <Text style={s.emptyIcon}>♥</Text>
          <Text style={s.emptyTitle}>Waiting for patients</Text>
          <Text style={s.emptyHint}>Check in patients to see live heart rates</Text>
        </View>
      )}

      {/* Footer Zone Legend */}
      <View style={s.footer}>
        {ZONES.slice(2).map((z) => (
          <View key={z.name} style={s.legendItem}>
            <View style={[s.legendDot, { backgroundColor: z.color }]} />
            <Text style={s.legendText}>{z.name}</Text>
          </View>
        ))}
        <Text style={s.footerBrand}>3PT CLINIC MODE</Text>
      </View>
    </SafeAreaView>
  );
}

// ─── Patient Tile (Polar Club style) ─────────────────────

function Tile({ session }: { session: ClinicSession }) {
  const pulse = useRef(new Animated.Value(1)).current;
  const hr = session.currentHR > 0 ? session.currentHR : 0;
  const zone = getZone(hr, session.targetHR);
  const pct = getHRPercent(hr, session.targetHR);
  const duration = getSessionDuration(session.startedAt);

  useEffect(() => {
    if (hr < 30) return;
    const dur = 60000 / hr;
    const a = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1.04, duration: Math.max(dur * 0.12, 50), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1, duration: Math.max(dur * 0.88, 100), useNativeDriver: true }),
      ]),
    );
    a.start();
    return () => a.stop();
  }, [hr]);

  const { width } = Dimensions.get("window");
  const tileWidth = width >= 1280 ? 230 : width >= 768 ? 190 : 160;

  return (
    <View style={[s.tile, { width: tileWidth, borderLeftColor: zone.color, borderLeftWidth: 5 }]}>
      {/* Zone color strip at top */}
      <View style={[s.tileZoneStrip, { backgroundColor: zone.color }]}>
        <Text style={s.tileZoneName}>{zone.name}</Text>
        <Text style={s.tileDuration}>{duration}</Text>
      </View>

      {/* Patient initials */}
      <Text style={s.tileInitials}>{session.patientInitials}</Text>

      {/* Big HR number */}
      <Animated.View style={{ transform: [{ scale: pulse }] }}>
        <Text style={[s.tileHR, { color: zone.color }]}>
          {session.currentHR > 0 ? session.currentHR : "--"}
        </Text>
      </Animated.View>
      <Text style={s.tileBPM}>BPM</Text>

      {/* % of Target */}
      {pct > 0 && (
        <View style={[s.tilePctBadge, { backgroundColor: zone.color + "30" }]}>
          <Text style={[s.tilePctText, { color: zone.color }]}>{pct}%</Text>
          <Text style={s.tilePctLabel}>of target</Text>
        </View>
      )}

      {/* Stats row */}
      <View style={s.tileStats}>
        <View style={s.tileStat}>
          <Text style={s.tileStatVal}>{session.averageHR > 0 ? session.averageHR : "--"}</Text>
          <Text style={s.tileStatLbl}>AVG</Text>
        </View>
        <View style={[s.tileStatDiv, { backgroundColor: zone.color + "40" }]} />
        <View style={s.tileStat}>
          <Text style={s.tileStatVal}>{session.targetHR > 0 ? session.targetHR : "--"}</Text>
          <Text style={s.tileStatLbl}>TARGET</Text>
        </View>
      </View>

      {/* Device indicator */}
      {session.hrDeviceName && (
        <Text style={s.tileDevice}>♥ {session.hrDeviceName}</Text>
      )}
    </View>
  );
}

function getCols() {
  const w = Dimensions.get("window").width;
  if (w >= 1920) return 6;
  if (w >= 1280) return 5;
  if (w >= 1024) return 4;
  if (w >= 768) return 3;
  return 2;
}

// ─── Styles ──────────────────────────────────────────────

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#111318" },

  // Header
  header: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
    paddingHorizontal: 24, paddingVertical: 12, backgroundColor: "#1A1D24",
  },
  hLeft: { flexDirection: "row", alignItems: "center", gap: 12 },
  logo: { fontSize: 32, fontWeight: "900", color: "#EF4444", letterSpacing: 1 },
  headerDivider: { width: 2, height: 24, backgroundColor: "#333", borderRadius: 1 },
  clinic: { fontSize: 18, fontWeight: "700", color: "#E2E8F0" },
  hRight: { flexDirection: "row", alignItems: "center", gap: 20 },
  activeBadge: { flexDirection: "row", alignItems: "baseline", gap: 6 },
  activeNum: { fontSize: 32, fontWeight: "900", color: "#22C55E" },
  activeLabel: { fontSize: 11, fontWeight: "800", color: "#64748B", letterSpacing: 2 },
  clock: { fontSize: 18, fontWeight: "600", color: "#64748B", fontVariant: ["tabular-nums"] as any },

  // Zone distribution bar
  zoneBar: { flexDirection: "row", height: 6, marginHorizontal: 16, marginTop: 8, borderRadius: 3, overflow: "hidden" },
  zoneSegment: { justifyContent: "center", alignItems: "center" },
  zoneSegText: { fontSize: 1, color: "transparent" }, // hidden, just for flex sizing

  // Grid
  grid: { padding: 12, flexGrow: 1 },
  gridRow: { justifyContent: "center" },

  // Empty
  empty: { flex: 1, justifyContent: "center", alignItems: "center" },
  emptyIcon: { fontSize: 80, color: "#1E2028", marginBottom: 16 },
  emptyTitle: { fontSize: 28, fontWeight: "700", color: "#333" },
  emptyHint: { fontSize: 16, color: "#444", marginTop: 6 },

  // Footer
  footer: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    paddingVertical: 10, paddingHorizontal: 24, backgroundColor: "#1A1D24", gap: 16,
  },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 5 },
  legendDot: { width: 10, height: 10, borderRadius: 5 },
  legendText: { fontSize: 10, fontWeight: "700", color: "#64748B", letterSpacing: 0.5 },
  footerBrand: { fontSize: 10, fontWeight: "800", color: "#333", letterSpacing: 2, marginLeft: "auto" },

  // Tile (Polar Club style)
  tile: {
    backgroundColor: "#1A1D24", borderRadius: 12, margin: 6, overflow: "hidden",
    alignItems: "center", paddingBottom: 12,
  },
  tileZoneStrip: {
    width: "100%", paddingVertical: 5, paddingHorizontal: 10,
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
  },
  tileZoneName: { fontSize: 10, fontWeight: "900", color: "#FFF", letterSpacing: 1.5 },
  tileDuration: { fontSize: 10, fontWeight: "700", color: "rgba(255,255,255,0.7)", fontVariant: ["tabular-nums"] as any },
  tileInitials: { fontSize: 16, fontWeight: "800", color: "#94A3B8", marginTop: 10, letterSpacing: 1 },
  tileHR: { fontSize: 56, fontWeight: "900", letterSpacing: -2, marginTop: -2 },
  tileBPM: { fontSize: 12, fontWeight: "700", color: "#4B5563", letterSpacing: 3, marginTop: -6, marginBottom: 6 },
  tilePctBadge: { paddingHorizontal: 12, paddingVertical: 3, borderRadius: 10, flexDirection: "row", alignItems: "baseline", gap: 4, marginBottom: 8 },
  tilePctText: { fontSize: 18, fontWeight: "900" },
  tilePctLabel: { fontSize: 9, fontWeight: "600", color: "#64748B" },
  tileStats: { flexDirection: "row", alignItems: "center", width: "85%", justifyContent: "center", marginBottom: 6 },
  tileStat: { alignItems: "center", flex: 1 },
  tileStatVal: { fontSize: 16, fontWeight: "800", color: "#CBD5E1" },
  tileStatLbl: { fontSize: 8, fontWeight: "700", color: "#4B5563", letterSpacing: 1, marginTop: 1 },
  tileStatDiv: { width: 1, height: 22 },
  tileDevice: { fontSize: 9, color: "#4B5563", fontWeight: "600", marginTop: 2 },
});
