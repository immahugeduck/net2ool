/**
 * Offline MAC -> vendor lookup.
 *
 * This is a curated subset of the IEEE OUI registry covering vendors that
 * commonly appear on home and small-office networks, plus the surveillance
 * hardware makers the threat analyzer cares about. Unknown prefixes return
 * null rather than a guess.
 *
 * Caveat worth knowing: modern phones and laptops use randomized MAC addresses
 * for privacy, so a null vendor on a mobile device is expected and is not
 * itself suspicious. Randomized addresses have the "locally administered" bit
 * set, which `isRandomizedMac` detects.
 */

interface OuiEntry {
  vendor: string
  /** Surveillance hardware: cameras, NVRs, DVRs, doorbells. */
  camera?: boolean
}

const OUI: Record<string, OuiEntry> = {
  // --- Surveillance / camera / NVR vendors ---
  "44:19:B6": { vendor: "Hikvision", camera: true },
  "C0:56:E3": { vendor: "Hikvision", camera: true },
  "4C:BD:8F": { vendor: "Hikvision", camera: true },
  "BC:AD:28": { vendor: "Hikvision", camera: true },
  "28:57:BE": { vendor: "Hikvision", camera: true },
  "3C:EF:8C": { vendor: "Dahua", camera: true },
  "90:02:A9": { vendor: "Dahua", camera: true },
  "4C:11:BF": { vendor: "Dahua", camera: true },
  "08:ED:ED": { vendor: "Dahua", camera: true },
  "9C:8E:CD": { vendor: "Amcrest", camera: true },
  "EC:71:DB": { vendor: "Reolink", camera: true },
  "00:40:8C": { vendor: "Axis Communications", camera: true },
  "AC:CC:8E": { vendor: "Axis Communications", camera: true },
  "B8:A4:4F": { vendor: "Axis Communications", camera: true },
  "2C:AA:8E": { vendor: "Wyze Labs", camera: true },
  "7C:78:B2": { vendor: "Wyze Labs", camera: true },
  "D0:3F:27": { vendor: "Wyze Labs", camera: true },
  "34:3E:A4": { vendor: "Ring", camera: true },
  "54:E0:19": { vendor: "Ring", camera: true },
  "F0:81:73": { vendor: "Ring", camera: true },
  "18:B4:30": { vendor: "Nest Labs", camera: true },
  "64:16:66": { vendor: "Nest Labs", camera: true },
  "00:1A:22": { vendor: "Mobotix", camera: true },
  "00:0F:7C": { vendor: "ACTi", camera: true },
  "00:18:AE": { vendor: "Vivotek", camera: true },
  "00:02:D1": { vendor: "Vivotek", camera: true },
  "00:80:F0": { vendor: "Panasonic", camera: true },
  "B0:C5:54": { vendor: "D-Link", camera: true },

  // --- Networking gear ---
  "04:18:D6": { vendor: "Ubiquiti" },
  "24:A4:3C": { vendor: "Ubiquiti" },
  "78:8A:20": { vendor: "Ubiquiti" },
  "FC:EC:DA": { vendor: "Ubiquiti" },
  "50:C7:BF": { vendor: "TP-Link" },
  "14:CF:92": { vendor: "TP-Link" },
  "A0:F3:C1": { vendor: "TP-Link" },
  "60:32:B1": { vendor: "TP-Link" },
  "A0:04:60": { vendor: "Netgear" },
  "40:5D:82": { vendor: "Netgear" },
  "3C:37:86": { vendor: "Netgear" },
  "00:1D:7E": { vendor: "Cisco-Linksys" },
  "C0:C1:C0": { vendor: "Cisco-Linksys" },
  "00:0C:29": { vendor: "VMware" },
  "00:15:5D": { vendor: "Microsoft (Hyper-V)" },
  "F4:F2:6D": { vendor: "TP-Link" },
  "D8:0D:17": { vendor: "TP-Link" },
  "00:1E:58": { vendor: "D-Link" },
  "34:08:04": { vendor: "D-Link" },
  "00:26:5A": { vendor: "D-Link" },
  "E8:DE:27": { vendor: "TP-Link" },
  "B4:FB:E4": { vendor: "Ubiquiti" },

  // --- Phones, computers, tablets ---
  "00:03:93": { vendor: "Apple" },
  "00:1B:63": { vendor: "Apple" },
  "3C:07:54": { vendor: "Apple" },
  "F0:18:98": { vendor: "Apple" },
  "A4:83:E7": { vendor: "Apple" },
  "04:0C:CE": { vendor: "Apple" },
  "DC:A9:04": { vendor: "Apple" },
  "AC:BC:32": { vendor: "Apple" },
  "F4:5C:89": { vendor: "Apple" },
  "00:12:FB": { vendor: "Samsung" },
  "78:1F:DB": { vendor: "Samsung" },
  "8C:77:12": { vendor: "Samsung" },
  "5C:0A:5B": { vendor: "Samsung" },
  "34:23:BA": { vendor: "Samsung" },
  "00:1B:21": { vendor: "Intel" },
  "3C:97:0E": { vendor: "Intel" },
  "94:65:9C": { vendor: "Intel" },
  "A0:88:69": { vendor: "Intel" },
  "64:09:80": { vendor: "Xiaomi" },
  "78:11:DC": { vendor: "Xiaomi" },
  "F8:A4:5F": { vendor: "Xiaomi" },
  "00:50:56": { vendor: "VMware" },

  // --- Smart home / IoT / media ---
  "3C:5A:B4": { vendor: "Google" },
  "F4:F5:D8": { vendor: "Google" },
  "44:65:0D": { vendor: "Amazon" },
  "F0:27:2D": { vendor: "Amazon" },
  "68:37:E9": { vendor: "Amazon" },
  "74:C2:46": { vendor: "Amazon" },
  "B0:A7:37": { vendor: "Roku" },
  "CC:6D:A0": { vendor: "Roku" },
  "D8:31:34": { vendor: "Roku" },
  "5C:AA:FD": { vendor: "Sonos" },
  "00:0E:58": { vendor: "Sonos" },
  "B8:27:EB": { vendor: "Raspberry Pi Foundation" },
  "DC:A6:32": { vendor: "Raspberry Pi Trading" },
  "E4:5F:01": { vendor: "Raspberry Pi Trading" },
  "28:CD:C1": { vendor: "Raspberry Pi Trading" },
  "24:0A:C4": { vendor: "Espressif (ESP32)" },
  "30:AE:A4": { vendor: "Espressif (ESP32)" },
  "84:F3:EB": { vendor: "Espressif (ESP8266)" },
  "A4:CF:12": { vendor: "Espressif (ESP32)" },
  "7C:9E:BD": { vendor: "Espressif (ESP32)" },
  "00:17:88": { vendor: "Philips Hue" },
  "EC:B5:FA": { vendor: "Philips Hue" },
}

/** Normalizes any common MAC notation to upper-case colon form. */
export function normalizeMac(input: string): string | null {
  if (!input) return null
  const hex = input.replace(/[^0-9a-fA-F]/g, "").toUpperCase()
  if (hex.length !== 12) return null
  return hex.match(/.{2}/g)!.join(":")
}

export function vendorFromMac(mac: string): string | null {
  const normalized = normalizeMac(mac)
  if (!normalized) return null
  const prefix = normalized.slice(0, 8)
  return OUI[prefix]?.vendor ?? null
}

export function isCameraVendor(mac: string): boolean {
  const normalized = normalizeMac(mac)
  if (!normalized) return false
  return OUI[normalized.slice(0, 8)]?.camera === true
}

/**
 * True when the "locally administered" bit is set, which indicates a
 * privacy-randomized address rather than a real hardware OUI.
 */
export function isRandomizedMac(mac: string): boolean {
  const normalized = normalizeMac(mac)
  if (!normalized) return false
  const firstOctet = Number.parseInt(normalized.slice(0, 2), 16)
  return (firstOctet & 0b10) !== 0
}
