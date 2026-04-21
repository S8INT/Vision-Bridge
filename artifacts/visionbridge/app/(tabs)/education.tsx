import React, { useState } from "react";
import {
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  Modal,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";

interface Article {
  id: string;
  title: string;
  category: "Diabetes" | "Glaucoma" | "Cataracts" | "Prevention" | "Children";
  readMinutes: number;
  summary: string;
  body: string;
  icon: string;
  color: string;
}

const ARTICLES: Article[] = [
  {
    id: "a-001",
    title: "Diabetes and Your Eyes: What Every Patient Should Know",
    category: "Diabetes",
    readMinutes: 5,
    icon: "droplet",
    color: "#0ea5e9",
    summary: "Diabetes can damage the small blood vessels in your retina. Early screening saves sight.",
    body:
      "Diabetic retinopathy is the leading cause of blindness in working-age adults in Uganda. " +
      "When your blood sugar is high for long periods, the tiny blood vessels at the back of your eye become weak. " +
      "They can leak, swell, or close off completely.\n\n" +
      "Warning signs include:\n" +
      "• Blurred or fluctuating vision\n" +
      "• Dark spots or floaters\n" +
      "• Difficulty seeing colours\n" +
      "• Vision loss\n\n" +
      "What you can do:\n" +
      "• Keep your blood sugar in your target range (HbA1c < 7%)\n" +
      "• Have an annual dilated eye exam\n" +
      "• Control blood pressure and cholesterol\n" +
      "• Stop smoking\n" +
      "• Take all prescribed medications\n\n" +
      "Most vision loss from diabetes can be PREVENTED if it is caught early. Talk to your CHW or visit your nearest eye clinic for screening.",
  },
  {
    id: "a-002",
    title: "Glaucoma — The Silent Thief of Sight",
    category: "Glaucoma",
    readMinutes: 4,
    icon: "eye-off",
    color: "#7c3aed",
    summary: "Glaucoma damages the optic nerve. There are usually no early symptoms — only an exam can detect it.",
    body:
      "Glaucoma is a group of eye diseases that damage the optic nerve, often because of high pressure inside the eye. " +
      "It is called the 'silent thief of sight' because it has no early symptoms.\n\n" +
      "You are at higher risk if you:\n" +
      "• Are over 40 years old\n" +
      "• Have a family member with glaucoma\n" +
      "• Are of African descent (3-4x higher risk)\n" +
      "• Have diabetes or high blood pressure\n\n" +
      "Treatment usually involves daily eye drops that lower pressure. Once vision is lost from glaucoma, it CANNOT be restored — but progression can be stopped with treatment.",
  },
  {
    id: "a-003",
    title: "Cataracts: When the Lens Becomes Cloudy",
    category: "Cataracts",
    readMinutes: 3,
    icon: "circle",
    color: "#10b981",
    summary: "Cataract is the leading cause of blindness in Uganda. Surgery can restore sight in most cases.",
    body:
      "A cataract is when the natural lens of your eye becomes cloudy, like looking through a frosted window. " +
      "It is most common in older adults but can affect anyone.\n\n" +
      "Symptoms include:\n" +
      "• Cloudy or blurry vision\n" +
      "• Sensitivity to bright lights\n" +
      "• Faded colours\n" +
      "• Difficulty seeing at night\n\n" +
      "The good news: cataract surgery is one of the most successful procedures in modern medicine. " +
      "A small operation replaces the cloudy lens with a clear plastic one. Most patients see clearly within a few days.",
  },
  {
    id: "a-004",
    title: "How to Use Eye Drops Correctly",
    category: "Prevention",
    readMinutes: 2,
    icon: "droplet",
    color: "#f59e0b",
    summary: "Proper technique helps the drops work and avoids contamination.",
    body:
      "1. Wash your hands with soap and water.\n" +
      "2. Tilt your head back and look up.\n" +
      "3. Pull your lower eyelid down to make a small pocket.\n" +
      "4. Hold the bottle close to your eye but DO NOT touch the eye or lashes.\n" +
      "5. Squeeze ONE drop into the pocket.\n" +
      "6. Close your eye gently for 1-2 minutes. Press lightly on the inner corner of your eye.\n" +
      "7. Wait 5 minutes between different drops.\n" +
      "8. Replace the cap. Store as instructed.\n\n" +
      "If you miss a dose, take it as soon as you remember — but do not double-dose.",
  },
  {
    id: "a-005",
    title: "Protecting Children's Vision",
    category: "Children",
    readMinutes: 4,
    icon: "smile",
    color: "#ec4899",
    summary: "Many vision problems in children are treatable if found early. Watch for warning signs.",
    body:
      "Children may not realise their vision is poor — they think everyone sees the same way. Watch for:\n" +
      "• Squinting or sitting very close to the TV\n" +
      "• Tilting the head when reading\n" +
      "• Frequent eye rubbing\n" +
      "• Poor school performance\n" +
      "• A white reflection in photos (instead of red eye) — see a doctor URGENTLY\n\n" +
      "All children should have a vision check by age 4 and again before starting school. Schools regularly host VisionBridge screening days — encourage your child's school to participate.",
  },
  {
    id: "a-006",
    title: "What to Expect at Your Teleconsultation",
    category: "Prevention",
    readMinutes: 3,
    icon: "video",
    color: "#06b6d4",
    summary: "A teleconsultation lets you speak with a specialist without travelling. Here's how to prepare.",
    body:
      "Before your call:\n" +
      "• Find a quiet, well-lit place\n" +
      "• Charge your phone or have a power source nearby\n" +
      "• Have your medications and any past reports ready\n" +
      "• Write down any questions you want to ask\n\n" +
      "During the call:\n" +
      "• Speak clearly and describe your symptoms\n" +
      "• Tell the doctor about ALL medications you take\n" +
      "• Ask if anything is unclear — there are no silly questions\n" +
      "• Take notes or ask the doctor to repeat important advice\n\n" +
      "After the call:\n" +
      "• Follow the treatment plan exactly\n" +
      "• Book any follow-up appointments\n" +
      "• Contact your CHW if symptoms worsen",
  },
];

const CATEGORIES = ["All", "Diabetes", "Glaucoma", "Cataracts", "Prevention", "Children"] as const;
type Category = typeof CATEGORIES[number];

export default function EducationScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [selectedCategory, setSelectedCategory] = useState<Category>("All");
  const [activeArticle, setActiveArticle] = useState<Article | null>(null);

  const filtered = selectedCategory === "All"
    ? ARTICLES
    : ARTICLES.filter((a) => a.category === selectedCategory);

  const topPad = Platform.OS === "web" ? insets.top + 67 : insets.top + 8;
  const botPad = Platform.OS === "web" ? 34 : 0;

  const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    content: { paddingHorizontal: 16, gap: 14 },
    title: { fontSize: 24, fontFamily: "Inter_700Bold", color: colors.foreground },
    subtitle: { fontSize: 13, fontFamily: "Inter_400Regular", color: colors.mutedForeground, marginTop: 2 },
    chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
    chip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card },
    chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
    chipText: { fontSize: 12, fontFamily: "Inter_600SemiBold", color: colors.mutedForeground },
    chipTextActive: { color: "#fff" },
    card: {
      borderRadius: 14, padding: 16, borderWidth: 1, gap: 10,
      backgroundColor: colors.card, borderColor: colors.border,
    },
    cardHeader: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
    iconBox: { width: 40, height: 40, borderRadius: 10, alignItems: "center", justifyContent: "center" },
    cardTitle: { fontSize: 15, fontFamily: "Inter_600SemiBold", color: colors.foreground, flex: 1 },
    cardMeta: { fontSize: 11, fontFamily: "Inter_500Medium", color: colors.mutedForeground, marginTop: 4 },
    cardSummary: { fontSize: 13, fontFamily: "Inter_400Regular", color: colors.mutedForeground, lineHeight: 19 },
    // Modal styles
    modalContainer: { flex: 1, backgroundColor: colors.background },
    modalHeader: {
      flexDirection: "row", alignItems: "center", gap: 12,
      paddingHorizontal: 16, paddingVertical: 12,
      borderBottomWidth: 1, borderBottomColor: colors.border,
    },
    modalTitle: { fontSize: 16, fontFamily: "Inter_600SemiBold", color: colors.foreground, flex: 1 },
    modalContent: { padding: 20, gap: 16 },
    modalArticleTitle: { fontSize: 22, fontFamily: "Inter_700Bold", color: colors.foreground },
    modalMeta: { fontSize: 12, fontFamily: "Inter_500Medium", color: colors.mutedForeground },
    modalBody: { fontSize: 15, fontFamily: "Inter_400Regular", color: colors.foreground, lineHeight: 24 },
  });

  return (
    <>
      <ScrollView
        style={styles.container}
        contentContainerStyle={[styles.content, { paddingTop: topPad + 8, paddingBottom: botPad + 100 }]}
        showsVerticalScrollIndicator={false}
      >
        <View>
          <Text style={styles.title}>Educational Content</Text>
          <Text style={styles.subtitle}>Learn how to protect your vision.</Text>
        </View>

        <View style={styles.chips}>
          {CATEGORIES.map((c) => {
            const active = selectedCategory === c;
            return (
              <TouchableOpacity
                key={c}
                style={[styles.chip, active && styles.chipActive]}
                onPress={() => setSelectedCategory(c)}
              >
                <Text style={[styles.chipText, active && styles.chipTextActive]}>{c}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {filtered.map((a) => (
          <TouchableOpacity
            key={a.id}
            style={styles.card}
            onPress={() => setActiveArticle(a)}
            activeOpacity={0.85}
          >
            <View style={styles.cardHeader}>
              <View style={[styles.iconBox, { backgroundColor: `${a.color}22` }]}>
                <Feather name={a.icon as never} size={20} color={a.color} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.cardTitle}>{a.title}</Text>
                <Text style={styles.cardMeta}>{a.category} · {a.readMinutes} min read</Text>
              </View>
            </View>
            <Text style={styles.cardSummary}>{a.summary}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <Modal
        visible={!!activeArticle}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setActiveArticle(null)}
      >
        {activeArticle && (
          <View style={styles.modalContainer}>
            <View style={[styles.modalHeader, { paddingTop: insets.top + 12 }]}>
              <View style={[styles.iconBox, { backgroundColor: `${activeArticle.color}22` }]}>
                <Feather name={activeArticle.icon as never} size={20} color={activeArticle.color} />
              </View>
              <Text style={styles.modalTitle}>{activeArticle.category}</Text>
              <TouchableOpacity onPress={() => setActiveArticle(null)}>
                <Feather name="x" size={24} color={colors.foreground} />
              </TouchableOpacity>
            </View>
            <ScrollView contentContainerStyle={styles.modalContent}>
              <Text style={styles.modalArticleTitle}>{activeArticle.title}</Text>
              <Text style={styles.modalMeta}>{activeArticle.readMinutes} min read</Text>
              <Text style={styles.modalBody}>{activeArticle.body}</Text>
            </ScrollView>
          </View>
        )}
      </Modal>
    </>
  );
}
