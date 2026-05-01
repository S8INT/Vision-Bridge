import React, { useRef, useState } from "react";
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  type TextInputProps,
} from "react-native";
import { useColors } from "@/hooks/useColors";

interface Props {
  value: string; // YYYY-MM-DD
  onChange: (value: string) => void;
  label?: string;
  required?: boolean;
}

function clamp(val: string, min: number, max: number): string {
  const n = parseInt(val, 10);
  if (isNaN(n)) return val;
  return String(Math.min(Math.max(n, min), max)).padStart(val.length < 2 ? 1 : 2, "0");
}

function parseDate(iso: string): { dd: string; mm: string; yyyy: string } {
  const [yyyy = "", mm = "", dd = ""] = iso.split("-");
  return { dd, mm, yyyy };
}

function buildDate(dd: string, mm: string, yyyy: string): string {
  if (!dd && !mm && !yyyy) return "";
  const y = yyyy.padStart(4, "0").slice(0, 4);
  const m = mm.padStart(2, "0").slice(0, 2);
  const d = dd.padStart(2, "0").slice(0, 2);
  return `${y}-${m}-${d}`;
}

export function DateInput({ value, onChange, label, required }: Props) {
  const colors = useColors();
  const { dd: initDd, mm: initMm, yyyy: initYyyy } = parseDate(value);

  const [dd, setDd] = useState(initDd);
  const [mm, setMm] = useState(initMm);
  const [yyyy, setYyyy] = useState(initYyyy);

  const [ddFocus, setDdFocus] = useState(false);
  const [mmFocus, setMmFocus] = useState(false);
  const [yyyyFocus, setYyyyFocus] = useState(false);

  const mmRef = useRef<TextInput>(null);
  const yyyyRef = useRef<TextInput>(null);

  function handleDd(text: string) {
    const digits = text.replace(/\D/g, "").slice(0, 2);
    setDd(digits);
    onChange(buildDate(digits, mm, yyyy));
    if (digits.length === 2) mmRef.current?.focus();
  }

  function handleMm(text: string) {
    const digits = text.replace(/\D/g, "").slice(0, 2);
    setMm(digits);
    onChange(buildDate(dd, digits, yyyy));
    if (digits.length === 2) yyyyRef.current?.focus();
  }

  function handleYyyy(text: string) {
    const digits = text.replace(/\D/g, "").slice(0, 4);
    setYyyy(digits);
    onChange(buildDate(dd, mm, digits));
  }

  function handleDdBlur() {
    setDdFocus(false);
    if (dd.length === 1) {
      const padded = dd.padStart(2, "0");
      setDd(padded);
      onChange(buildDate(padded, mm, yyyy));
    }
  }

  function handleMmBlur() {
    setMmFocus(false);
    if (mm.length === 1) {
      const padded = mm.padStart(2, "0");
      setMm(padded);
      onChange(buildDate(dd, padded, yyyy));
    }
  }

  const box = (focused: boolean) => [
    styles.box,
    {
      borderColor: focused ? colors.primary : colors.border,
      backgroundColor: focused ? "#f0f9ff" : colors.card,
    },
  ];

  const inputStyle = [styles.input, { color: colors.foreground }];

  return (
    <View>
      {label ? (
        <Text style={[styles.label, { color: colors.foreground }]}>
          {label}
          {required ? <Text style={{ color: colors.destructive }}> *</Text> : null}
        </Text>
      ) : null}

      <View style={styles.row}>
        {/* Day */}
        <View style={styles.segment}>
          <Text style={[styles.segLabel, { color: colors.mutedForeground }]}>Day</Text>
          <View style={box(ddFocus)}>
            <TextInput
              style={inputStyle}
              value={dd}
              onChangeText={handleDd}
              onFocus={() => setDdFocus(true)}
              onBlur={handleDdBlur}
              keyboardType="numeric"
              placeholder="DD"
              placeholderTextColor={colors.mutedForeground}
              maxLength={2}
              returnKeyType="next"
              onSubmitEditing={() => mmRef.current?.focus()}
            />
          </View>
        </View>

        <Text style={[styles.sep, { color: colors.mutedForeground }]}>/</Text>

        {/* Month */}
        <View style={styles.segment}>
          <Text style={[styles.segLabel, { color: colors.mutedForeground }]}>Month</Text>
          <View style={box(mmFocus)}>
            <TextInput
              ref={mmRef}
              style={inputStyle}
              value={mm}
              onChangeText={handleMm}
              onFocus={() => setMmFocus(true)}
              onBlur={handleMmBlur}
              keyboardType="numeric"
              placeholder="MM"
              placeholderTextColor={colors.mutedForeground}
              maxLength={2}
              returnKeyType="next"
              onSubmitEditing={() => yyyyRef.current?.focus()}
            />
          </View>
        </View>

        <Text style={[styles.sep, { color: colors.mutedForeground }]}>/</Text>

        {/* Year */}
        <View style={[styles.segment, styles.yearSegment]}>
          <Text style={[styles.segLabel, { color: colors.mutedForeground }]}>Year</Text>
          <View style={box(yyyyFocus)}>
            <TextInput
              ref={yyyyRef}
              style={inputStyle}
              value={yyyy}
              onChangeText={handleYyyy}
              onFocus={() => setYyyyFocus(true)}
              onBlur={() => setYyyyFocus(false)}
              keyboardType="numeric"
              placeholder="YYYY"
              placeholderTextColor={colors.mutedForeground}
              maxLength={4}
              returnKeyType="done"
            />
          </View>
        </View>
      </View>

      <Text style={[styles.hint, { color: colors.mutedForeground }]}>
        e.g. 15 / 06 / 1985
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  label: {
    fontSize: 14,
    fontWeight: "600",
    marginBottom: 8,
  },
  row: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 4,
  },
  segment: {
    flex: 1,
    alignItems: "center",
  },
  yearSegment: {
    flex: 1.6,
  },
  segLabel: {
    fontSize: 11,
    fontWeight: "600",
    letterSpacing: 0.3,
    textTransform: "uppercase",
    marginBottom: 4,
  },
  box: {
    width: "100%",
    borderWidth: 1.5,
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 12,
    alignItems: "center",
  },
  input: {
    fontSize: 18,
    fontWeight: "600",
    textAlign: "center",
    width: "100%",
  },
  sep: {
    fontSize: 22,
    fontWeight: "300",
    marginBottom: 12,
    paddingHorizontal: 2,
  },
  hint: {
    fontSize: 11,
    marginTop: 6,
    textAlign: "center",
  },
});
