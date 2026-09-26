import { Redirect, router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { RankBadge } from '../components/RankBadge';
import { RankMap } from '../components/RankMap';
import { Bar } from '../components/system/Controls';
import { Label, SysText } from '../components/system/Window';
import { masteryPercent, status } from '../engine/mastery';
import type { CompetencyStatus } from '../engine/types';
import { t } from '../i18n/en';
import { usePlayer } from '../state/PlayerProvider';
import { colors, glow, mono, space } from '../theme';

/** The skill tree (VISION §5): every competency, its state, and what it builds on. */
export default function Tree() {
  const { player } = usePlayer();
  const [open, setOpen] = useState<string | null>(null);
  const skill = player?.activeSkill ? player.skills[player.activeSkill] : null;
  const statuses = useMemo(() => {
    if (!skill) return {};
    const now = Date.now();
    const out: Record<string, CompetencyStatus> = {};
    for (const c of skill.pack.competencies) out[c.id] = status(skill.pack, skill.competencies, c, now);
    return out;
  }, [skill]);
  if (!skill) return <Redirect href="/" />;

  const c = open ? skill.pack.competencies.find((x) => x.id === open) : null;
  const byId = new Map(skill.pack.competencies.map((x) => [x.id, x]));

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right', 'bottom']}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} accessibilityRole="button" accessibilityLabel={t.back} style={styles.backBtn}>
          <Text style={styles.back}>‹</Text>
        </Pressable>
        <Text style={styles.headerTitle}>{skill.pack.name.toUpperCase()}</Text>
        <Text style={styles.ceiling}>
          {skill.pack.verified_ceiling ? t.ceilingLabel(skill.pack.verified_ceiling) : t.ceilingNone}
        </Text>
      </View>
      <RankMap competencies={skill.pack.competencies} ceiling={skill.pack.verified_ceiling} statuses={statuses} onOpen={setOpen} />
      {c ? (
        <View style={[styles.sheet, glow(colors.border, 12)]}>
          <ScrollView>
            <View style={styles.sheetHead}>
              <RankBadge tier={c.tier} size={32} />
              <Text style={styles.sheetTitle}>{c.name}</Text>
              <Pressable onPress={() => setOpen(null)} accessibilityRole="button" accessibilityLabel={t.close} style={styles.closeBtn}>
                <Text style={styles.close}>×</Text>
              </Pressable>
            </View>
            <View style={styles.row}>
              <Text style={styles.statusText}>{t.status[statuses[c.id]]}</Text>
              <View style={styles.barWrap}>
                <Bar value={masteryPercent(skill.competencies[c.id], c.tier) / 100} />
              </View>
            </View>
            <Label style={styles.gap}>{t.masteryCriteria}</Label>
            <SysText>{c.mastery_criteria}</SysText>
            {c.common_mistakes.length ? (
              <>
                <Label style={styles.gap}>{t.commonMistakes}</Label>
                {c.common_mistakes.map((m) => (
                  <SysText key={m} dim>
                    ▸ {m}
                  </SysText>
                ))}
              </>
            ) : null}
            <Label style={styles.gap}>{t.prerequisites}</Label>
            {c.prerequisites.length ? (
              c.prerequisites.map((p) => (
                <SysText key={p} dim>
                  ▸ {byId.get(p)?.name ?? p}
                </SysText>
              ))
            ) : (
              <SysText dim>{t.noPrerequisites}</SysText>
            )}
          </ScrollView>
        </View>
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  header: { paddingHorizontal: space(4), paddingBottom: space(2), alignItems: 'center' },
  backBtn: { position: 'absolute', left: space(2), top: -space(1), width: 44, height: 44, justifyContent: 'center', alignItems: 'center' },
  back: { color: colors.accent, fontSize: 32 },
  headerTitle: { color: colors.accent, fontFamily: mono, letterSpacing: 3, fontWeight: '700', fontSize: 15, marginTop: space(2) },
  ceiling: { color: colors.textDim, fontSize: 12, marginTop: space(1) },
  sheet: {
    position: 'absolute',
    left: space(3),
    right: space(3),
    bottom: space(3),
    maxHeight: '55%',
    backgroundColor: 'rgba(6, 18, 40, 0.97)',
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: 6,
    padding: space(4),
  },
  sheetHead: { flexDirection: 'row', alignItems: 'center', gap: space(3) },
  sheetTitle: { color: colors.text, fontSize: 18, fontWeight: '800', flex: 1 },
  closeBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  close: { color: colors.textDim, fontSize: 28 },
  row: { flexDirection: 'row', alignItems: 'center', marginTop: space(3) },
  statusText: { color: colors.accent, fontFamily: mono, fontSize: 12, marginRight: space(3) },
  barWrap: { flex: 1, flexDirection: 'row' },
  gap: { marginTop: space(4) },
});
