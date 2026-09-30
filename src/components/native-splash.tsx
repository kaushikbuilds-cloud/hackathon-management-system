"use client";

import { useEffect } from "react";

type SplashPlugin = { hide?: (options?: { fadeOutDuration?: number }) => Promise<void> };

/**
 * In the Android app the logo splash stays up until the site is ready (up to
 * 10 s, mobile/capacitor.config.json); this hides it once the page has loaded.
 * Does nothing in a normal browser.
 */
export function NativeSplash() {
  useEffect(() => {
    const cap = (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean; Plugins?: { SplashScreen?: SplashPlugin } } }).Capacitor;
    if (cap?.isNativePlatform?.()) cap.Plugins?.SplashScreen?.hide?.({ fadeOutDuration: 250 }).catch(() => {});
  }, []);
  return null;
}
