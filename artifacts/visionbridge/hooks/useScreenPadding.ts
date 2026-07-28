import { Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

/**
 * Screen chrome padding.
 *
 * On web the app renders inside a device frame, so content must clear the
 * simulated status bar (67px) and home indicator (34px); on native the
 * navigator already accounts for the safe area.
 *
 * `nativeTopInset: true` opts a screen into padding the native status bar too
 * (used by screens rendered without a header).
 */
export function useScreenPadding(options?: { nativeTopInset?: boolean }): { topPad: number; botPad: number } {
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === "web";

  const nativeTop = options?.nativeTopInset ? insets.top + 8 : 0;

  return {
    topPad: isWeb ? insets.top + 67 : nativeTop,
    botPad: isWeb ? 34 : 0,
  };
}
