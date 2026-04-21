import { useWindowDimensions, PixelRatio, Platform } from "react-native";

/**
 * Responsive sizing helpers for icons, fonts and grid layouts.
 *
 * Breakpoints (window width in dp):
 *   xs:   < 360  (small phones)
 *   sm:   < 420  (typical phones)
 *   md:   < 768  (large phones / small tablets)
 *   lg:   < 1024 (tablets)
 *   xl:   >=1024 (desktop / wide web)
 *
 * Use `iconSize(base)` to scale any Feather/SymbolView icon proportionally.
 * Use `font(base)` to scale font sizes proportionally.
 * Use `cols` to pick the right number of columns for grids of feature buttons.
 */
export type Breakpoint = "xs" | "sm" | "md" | "lg" | "xl";

export interface Responsive {
  width: number;
  height: number;
  bp: Breakpoint;
  isXS: boolean;
  isPhone: boolean;
  isTablet: boolean;
  isWide: boolean;
  /** Number of columns recommended for a grid of feature/action buttons. */
  cols: number;
  /** Scales an icon size (in dp) so it grows on tablets and stays tappable on phones. */
  iconSize: (base: number) => number;
  /** Scales a font size (in dp) using the same curve as iconSize but more conservative. */
  font: (base: number) => number;
  /** Honours user's accessibility font scale, capped to avoid layout breakage. */
  fontScale: number;
}

function pickBreakpoint(w: number): Breakpoint {
  if (w < 360) return "xs";
  if (w < 420) return "sm";
  if (w < 768) return "md";
  if (w < 1024) return "lg";
  return "xl";
}

const SCALE: Record<Breakpoint, number> = {
  xs: 0.88,
  sm: 1.0,
  md: 1.06,
  lg: 1.18,
  xl: 1.28,
};

const COLS: Record<Breakpoint, number> = {
  xs: 2,
  sm: 2,
  md: 2,
  lg: 3,
  xl: 4,
};

export function useResponsive(): Responsive {
  const { width, height, fontScale } = useWindowDimensions();
  const bp = pickBreakpoint(width);
  const scale = SCALE[bp];

  const iconSize = (base: number) => {
    const scaled = base * scale;
    // Round to whole pixels so stroke widths render crisply.
    return PixelRatio.roundToNearestPixel(scaled);
  };

  const font = (base: number) => {
    // Use a gentler scale for typography so headlines don't explode on tablets.
    const f = base * (1 + (scale - 1) * 0.55);
    return PixelRatio.roundToNearestPixel(f);
  };

  return {
    width,
    height,
    bp,
    isXS: bp === "xs",
    isPhone: bp === "xs" || bp === "sm" || bp === "md",
    isTablet: bp === "lg",
    isWide: bp === "xl",
    cols: COLS[bp],
    iconSize,
    font,
    // Cap the OS font scale at 1.3 to prevent overflow in tight buttons.
    fontScale: Platform.OS === "web" ? 1 : Math.min(fontScale, 1.3),
  };
}
