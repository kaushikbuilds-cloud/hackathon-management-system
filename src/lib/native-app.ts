/**
 * The HackathonBase Android app (mobile/) opens this site full-screen and
 * injects `window.Capacitor` with its native plugins. These helpers are safe
 * to call in any browser: outside the app they report "not available".
 */

/** Added to the app's user agent (mobile/capacitor.config.json). */
export const APP_USER_AGENT = "HackathonBaseApp";

/** The latest APK, published by .github/workflows/android-app.yml. */
export const APP_DOWNLOAD_URL = "https://github.com/kaushikbuilds-cloud/hackathon-management-system/releases/download/android-app/HackathonBase.apk";

type Barcode = { rawValue?: string; displayValue?: string };
type BarcodeScannerPlugin = {
  scan(options: { formats: string[] }): Promise<{ barcodes: Barcode[] }>;
  isGoogleBarcodeScannerModuleAvailable(): Promise<{ available: boolean }>;
  installGoogleBarcodeScannerModule(): Promise<void>;
};
type CapacitorGlobal = { isNativePlatform?: () => boolean; Plugins?: { BarcodeScanner?: BarcodeScannerPlugin } };

function scannerPlugin(): BarcodeScannerPlugin | null {
  if (typeof window === "undefined") return null;
  const cap = (window as unknown as { Capacitor?: CapacitorGlobal }).Capacitor;
  return cap?.isNativePlatform?.() ? (cap.Plugins?.BarcodeScanner ?? null) : null;
}

/** True inside the Android app, where the fast native QR scanner is available. */
export function hasNativeScanner(): boolean {
  return scannerPlugin() !== null;
}

export type NativeScan = { ok: true; text: string } | { ok: false; reason: "cancelled" | "installing" | "unavailable" };

/**
 * Opens Google's scanner screen and returns the QR code's text. The first
 * time, Android may need to download the scanner (a few seconds).
 */
export async function scanWithNativeScanner(): Promise<NativeScan> {
  const plugin = scannerPlugin();
  if (!plugin) return { ok: false, reason: "unavailable" };
  try {
    const { available } = await plugin.isGoogleBarcodeScannerModuleAvailable();
    if (!available) {
      await plugin.installGoogleBarcodeScannerModule();
      return { ok: false, reason: "installing" };
    }
    const { barcodes } = await plugin.scan({ formats: ["QR_CODE"] });
    const text = barcodes[0]?.rawValue ?? barcodes[0]?.displayValue;
    return text ? { ok: true, text } : { ok: false, reason: "cancelled" };
  } catch (e) {
    const message = e instanceof Error ? e.message.toLowerCase() : "";
    return { ok: false, reason: message.includes("cancel") ? "cancelled" : "unavailable" };
  }
}
