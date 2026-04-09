// BLE Heart Rate Scanner — auto-detects registered Polar devices and streams HR
import { BleManager, Device, State, Subscription } from "react-native-ble-plx";
import { Platform, PermissionsAndroid } from "react-native";
import { lookupDevice, checkIn, updateHeartRate } from "./api";

const HR_SERVICE_UUID = "0000180d-0000-1000-8000-00805f9b34fb";
const HR_MEASUREMENT_UUID = "00002a37-0000-1000-8000-00805f9b34fb";

export interface DetectedDevice {
  id: string; // BLE MAC address
  name: string;
  rssi: number;
  isRegistered: boolean;
  patientName?: string;
  patientId?: string;
}

class BLEScanner {
  private manager: BleManager;
  private connectedDevices: Map<string, Device> = new Map();
  private hrSubscriptions: Map<string, Subscription> = new Map();
  private isScanning = false;

  // Callbacks
  private onDeviceDetected?: (device: DetectedDevice) => void;
  private onSessionStarted?: (deviceId: string, sessionId: string, patientInitials: string) => void;
  private onHeartRateUpdate?: (deviceId: string, bpm: number) => void;
  private onDeviceDisconnected?: (deviceId: string) => void;

  constructor() {
    this.manager = new BleManager();
  }

  // ─── Permissions ─────────────────────────────────────

  async requestPermissions(): Promise<boolean> {
    if (Platform.OS === "android") {
      const apiLevel = Platform.Version;
      if (apiLevel >= 31) {
        const result = await PermissionsAndroid.requestMultiple([
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
          PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
        ]);
        return Object.values(result).every((v) => v === PermissionsAndroid.RESULTS.GRANTED);
      } else {
        const result = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
        );
        return result === PermissionsAndroid.RESULTS.GRANTED;
      }
    }
    return true;
  }

  async ensureBluetoothOn(): Promise<boolean> {
    const state = await this.manager.state();
    if (state === State.PoweredOn) return true;
    return new Promise((resolve) => {
      const sub = this.manager.onStateChange((s) => {
        if (s === State.PoweredOn) { sub.remove(); resolve(true); }
      }, true);
      setTimeout(() => { sub.remove(); resolve(false); }, 10000);
    });
  }

  // ─── Scanning ────────────────────────────────────────

  async startAutoScan(params: {
    clinicId: string;
    token: string;
    onDeviceDetected: (device: DetectedDevice) => void;
    onSessionStarted: (deviceId: string, sessionId: string, patientInitials: string) => void;
    onHeartRateUpdate: (deviceId: string, bpm: number) => void;
    onDeviceDisconnected: (deviceId: string) => void;
  }): Promise<void> {
    this.onDeviceDetected = params.onDeviceDetected;
    this.onSessionStarted = params.onSessionStarted;
    this.onHeartRateUpdate = params.onHeartRateUpdate;
    this.onDeviceDisconnected = params.onDeviceDisconnected;

    const hasPerms = await this.requestPermissions();
    if (!hasPerms) throw new Error("Bluetooth permissions denied");

    const btOn = await this.ensureBluetoothOn();
    if (!btOn) throw new Error("Bluetooth is not enabled");

    if (this.isScanning) return;
    this.isScanning = true;

    console.log("[BLE] Starting auto-scan for HR devices...");

    this.manager.startDeviceScan(
      [HR_SERVICE_UUID],
      { allowDuplicates: false },
      async (error, device) => {
        if (error) {
          console.error("[BLE] Scan error:", error.message);
          return;
        }
        if (!device || !device.id) return;

        // Check if already connected
        if (this.connectedDevices.has(device.id)) return;

        // Lookup device in backend
        try {
          const registered = await lookupDevice(device.id, params.token);

          const detected: DetectedDevice = {
            id: device.id,
            name: device.name || device.localName || "Unknown",
            rssi: device.rssi ?? -100,
            isRegistered: !!registered,
            patientName: registered ? `${registered.patient.first_name} ${registered.patient.last_name}` : undefined,
            patientId: registered?.patient.id,
          };

          this.onDeviceDetected?.(detected);

          // Auto-connect if registered
          if (registered && detected.patientId) {
            console.log(`[BLE] Registered device found: ${detected.name} → ${detected.patientName}`);
            await this.connectAndStream(device, {
              clinicId: params.clinicId,
              patientId: detected.patientId,
              token: params.token,
            });
          }
        } catch (err) {
          // Lookup failed — device not registered, ignore
        }
      },
    );
  }

  stopScan(): void {
    if (this.isScanning) {
      this.manager.stopDeviceScan();
      this.isScanning = false;
      console.log("[BLE] Scan stopped");
    }
  }

  // ─── Connect & Stream HR ─────────────────────────────

  private async connectAndStream(
    device: Device,
    params: { clinicId: string; patientId: string; token: string },
  ): Promise<void> {
    try {
      // Connect
      const connected = await this.manager.connectToDevice(device.id, { requestMTU: 512 });
      await connected.discoverAllServicesAndCharacteristics();
      this.connectedDevices.set(device.id, connected);

      // Check in patient
      const session = await checkIn(
        {
          clinicId: params.clinicId,
          patientId: params.patientId,
          checkInMethod: "IPAD_BLE",
          hrDeviceId: device.id,
          hrDeviceName: device.name || device.localName || "HR Monitor",
        },
        params.token,
      );

      console.log(`[BLE] Session started: ${session.patientInitials} (${session.sessionId})`);
      this.onSessionStarted?.(device.id, session.sessionId, session.patientInitials);

      // Monitor disconnection
      connected.onDisconnected(() => {
        console.log(`[BLE] Device disconnected: ${device.id}`);
        this.connectedDevices.delete(device.id);
        this.hrSubscriptions.get(device.id)?.remove();
        this.hrSubscriptions.delete(device.id);
        this.onDeviceDisconnected?.(device.id);
      });

      // Start HR stream
      const sub = connected.monitorCharacteristicForService(
        HR_SERVICE_UUID,
        HR_MEASUREMENT_UUID,
        async (error, characteristic) => {
          if (error) {
            console.error("[BLE] HR read error:", error.message);
            return;
          }
          if (!characteristic?.value) return;

          const bpm = parseHeartRate(characteristic.value);
          if (bpm > 0) {
            this.onHeartRateUpdate?.(device.id, bpm);

            // Push to backend
            try {
              await updateHeartRate(session.sessionId, bpm, params.token);
            } catch {
              // Silently fail — don't disrupt the stream
            }
          }
        },
      );

      this.hrSubscriptions.set(device.id, sub);
    } catch (error: any) {
      console.error(`[BLE] Failed to connect ${device.id}:`, error.message);
      this.connectedDevices.delete(device.id);
    }
  }

  // ─── Disconnect ──────────────────────────────────────

  async disconnectDevice(deviceId: string): Promise<void> {
    this.hrSubscriptions.get(deviceId)?.remove();
    this.hrSubscriptions.delete(deviceId);
    try {
      await this.manager.cancelDeviceConnection(deviceId);
    } catch {}
    this.connectedDevices.delete(deviceId);
  }

  async disconnectAll(): Promise<void> {
    for (const [id] of this.connectedDevices) {
      await this.disconnectDevice(id);
    }
  }

  // ─── Cleanup ─────────────────────────────────────────

  destroy(): void {
    this.stopScan();
    this.disconnectAll();
    this.manager.destroy();
  }

  getConnectedCount(): number {
    return this.connectedDevices.size;
  }

  isDeviceConnected(deviceId: string): boolean {
    return this.connectedDevices.has(deviceId);
  }
}

// Parse BLE Heart Rate Measurement per GATT spec (0x2A37)
function parseHeartRate(base64Value: string): number {
  try {
    const bytes = Uint8Array.from(atob(base64Value), (c) => c.charCodeAt(0));
    if (bytes.length < 2) return 0;
    const flags = bytes[0];
    const is16Bit = (flags & 0x01) !== 0;
    if (is16Bit) {
      return bytes.length >= 3 ? bytes[1] | (bytes[2] << 8) : 0;
    }
    return bytes[1];
  } catch {
    return 0;
  }
}

// Singleton
export const bleScanner = new BLEScanner();
