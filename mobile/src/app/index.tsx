import { Redirect, router } from 'expo-router';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import { RankBadge } from '../components/RankBadge';
import { Bar, SysButton } from '../components/system/Controls';
import { Loading, Screen } from '../components/system/Screen';
import { Label, SysText, Window } from '../components/system/Window';
import { masteryPercent, status } from '../engine/mastery';
import { planNext } from '../engine/planner';
import { levelFromXp, rankInfo, STAT_INFO, stats, type Stats } from '../engine/progression';
import { t } from '../i18n/en';
import { playerTitle } from '../lib/notices';
import { tierIndex } from '../lib/types';
import { usePlayer } from '../state/PlayerProvider';
import { colors, mono, rankColors, space } from '../theme';

/** The status window (VISION §35): who you are, what you can do, and the quest in front of you. */
export default function Status() {
  const { ready, player, activeQuest, reset, setPlayer } = usePlayer();
  if (!ready) return <Loading text={t.system} />;
  if (!player) return <Redirect href="/awaken" />;
  const skill = player.activeSkill ? player.skills[player.activeSkill] : null;
  if (!skill) return <Redirect href={{ pathname: '/awaken', params: { mode: 'skill' } }} />;
  if (!skill.assessed) return <Redirect href="/assessment" />;

  const now = Date.now();
  const lvl = levelFromXp(player.xp);
  const info = rankInfo(skill);
  const st = stats(Object.values(player.skills));
  const penalty = player.daily.penaltyPending;
  const plan = planNext(skill, now, { forceRetest: penalty });
  const planComp = plan ? skill.pack.competencies.find((c) => c.id === plan.competencyId) : null;

  // Skill bars: the competencies in play right now (training, proven, retest due), weakest first.
  const bars = skill.pack.competencies
    .map((c) => ({ c, st: status(skill.pack, skill.competencies, c, now), pct: masteryPercent(skill.competencies[c.id], c.tier) }))
    .filter((x) => x.st !== 'locked')
    .sort((a, b) => tierIndex(a.c.tier) - tierIndex(b.c.tier) || a.pct - b.pct)
    .slice(0, 6);

  const otherSkills = Object.values(player.skills).filter((s) => s.pack.pack !== skill.pack.pack);

  return (
    <Screen>
      <Window title={t.statusTitle}>
        <View style={styles.row}>
          <View style={styles.levelBox}>
            <Text style={styles.levelNum}>{lvl.level}</Text>
            <Label>{t.level}</Label>
          </View>
          <View style={styles.flex}>
            <Label>{t.name}</Label>
            <SysText style={styles.name}>{player.name}</SysText>
            <Label style={styles.gapTop}>{t.titleLabel}</Label>
            <SysText dim>{playerTitle(player)}</SysText>
          </View>
        </View>
        <View style={[styles.row, styles.gapTop]}>
          <Text style={styles.xpLabel}>{t.xp}</Text>
          <Bar value={lvl.into / lvl.needed} />
          <Text style={styles.xpNum}>
            {lvl.into}/{lvl.needed}
          </Text>
        </View>

        <View style={styles.statGrid}>
          {(Object.keys(st) as (keyof Stats)[]).map((k) => (
            <View key={k} style={styles.stat} accessibilityLabel={`${STAT_INFO[k]} ${st[k]}`}>
              <Text style={styles.statKey}>{k}</Text>
              <Text style={styles.statVal}>{st[k]}</Text>
            </View>
          ))}
        </View>
      </Window>

      <Window title={`${t.rank} · ${skill.pack.name.toUpperCase()}`}>
        <View style={styles.row}>
          {info.rank ? <RankBadge tier={info.rank} size={56} /> : <Text style={styles.unranked}>{t.unranked}</Text>}
          <View style={[styles.flex, styles.gapLeft]}>
            {info.next ? (
              <>
                <SysText>{t.nextRank(info.next, info.nextMastered, info.nextTotal)}</SysText>
                <View style={styles.gapTopSmall}>
                  <Bar value={info.nextTotal ? info.nextMastered / info.nextTotal : 0} color={rankColors[info.next]} />
                </View>
                {info.capped ? <SysText dim style={styles.small}>{t.rankCapped(info.next)}</SysText> : null}
              </>
            ) : null}
          </View>
        </View>
        {bars.map(({ c, st: s, pct }) => (
          <View key={c.id} style={styles.skillRow} accessibilityLabel={`${c.name} ${pct}% ${t.status[s]}`}>
            <Text style={[styles.skillTier, { color: rankColors[c.tier] }]}>{c.tier}</Text>
            <Text style={styles.skillName} numberOfLines={1}>
              {c.name}
            </Text>
            <View style={styles.skillBar}>
              <Bar value={pct / 100} height={6} color={s === 'decaying' ? colors.warn : colors.accent} />
            </View>
            <Text style={styles.skillPct}>{pct}%</Text>
          </View>
        ))}
        <SysButton label={t.skillTree} tone="quiet" onPress={() => router.push('/tree')} />
      </Window>

      {penalty ? (
        <Window title={t.penaltyTitle} tone="danger">
          <SysText>{t.penaltyBody}</SysText>
        </Window>
      ) : null}

      <Window title={t.dailyTitle} tone={player.daily.done >= player.daily.target ? 'gold' : 'system'}>
        <SysText>{t.dailyName}</SysText>
        <SysText dim style={styles.gapTopSmall}>
          {player.daily.done >= player.daily.target ? t.dailyDone : t.dailyProgress(player.daily.done, player.daily.target)}
        </SysText>
        <SysText dim>{t.streak(player.daily.streak)}</SysText>
      </Window>

      <Window title={t.questTitle}>
        {activeQuest ? (
          <>
            <SysText style={styles.questName}>“{activeQuest.quest.title}”</SysText>
            <SysText dim>{activeQuest.quest.objective}</SysText>
            <SysButton label={t.resumeQuest} onPress={() => router.push('/quest')} />
          </>
        ) : plan && planComp ? (
          <>
            <View style={styles.row}>
              <RankBadge tier={planComp.tier} size={24} />
              <SysText style={[styles.flex, styles.gapLeft]}>{planComp.name}</SysText>
            </View>
            <SysText dim style={styles.gapTopSmall}>
              {t.evidence[plan.evidenceType]}
              {plan.retest ? ` · ${t.retestTag}` : ''}
              {plan.reason === 'step_back' ? ` · ${t.stepBackTag}` : ''}
            </SysText>
            <SysButton label={t.acceptQuest} onPress={() => router.push('/quest')} />
          </>
        ) : (
          <SysText dim>{t.noQuest}</SysText>
        )}
      </Window>

      <Window title={t.skills}>
        {otherSkills.map((s) => (
          <Pressable
            key={s.pack.pack}
            style={styles.otherSkill}
            accessibilityRole="button"
            onPress={() => setPlayer({ ...player, activeSkill: s.pack.pack })}
          >
            <SysText>{s.pack.name}</SysText>
            <Text style={styles.switch}>{t.switchSkill}</Text>
          </Pressable>
        ))}
        <SysButton label={t.newSkill} tone="quiet" onPress={() => router.push({ pathname: '/awaken', params: { mode: 'skill' } })} />
      </Window>

      <Window title={t.log}>
        {player.log.slice(0, 6).map((l, i) => (
          <SysText key={`${l.at}-${i}`} dim style={styles.small}>
            › {l.text}
          </SysText>
        ))}
      </Window>

      <Pressable
        onPress={() =>
          Alert.alert(t.resetGame, t.resetConfirm, [
            { text: t.back, style: 'cancel' },
            { text: t.resetGame, style: 'destructive', onPress: () => reset() },
          ])
        }
        accessibilityRole="button"
      >
        <Text style={styles.reset}>{t.resetGame}</Text>
      </Pressable>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  row: { flexDirection: 'row', alignItems: 'center' },
  gapTop: { marginTop: space(3) },
  gapTopSmall: { marginTop: space(1.5) },
  gapLeft: { marginLeft: space(3) },
  levelBox: { alignItems: 'center', width: 84, marginRight: space(3) },
  levelNum: { color: colors.accent, fontFamily: mono, fontSize: 44, fontWeight: '900', textShadowColor: colors.glow, textShadowRadius: 12 },
  name: { fontSize: 18, fontWeight: '700' },
  xpLabel: { color: colors.textDim, fontFamily: mono, marginRight: space(2) },
  xpNum: { color: colors.textDim, fontFamily: mono, marginLeft: space(2), fontSize: 12 },
  statGrid: { flexDirection: 'row', flexWrap: 'wrap', marginTop: space(3), borderTopWidth: 1, borderTopColor: colors.borderDim, paddingTop: space(2) },
  stat: { width: '33.33%', flexDirection: 'row', justifyContent: 'space-between', paddingVertical: space(1.5), paddingHorizontal: space(2) },
  statKey: { color: colors.textDim, fontFamily: mono, fontWeight: '700' },
  statVal: { color: colors.text, fontFamily: mono, fontWeight: '700' },
  unranked: { color: colors.textDim, fontFamily: mono, fontWeight: '800', letterSpacing: 2 },
  small: { fontSize: 12, lineHeight: 18, marginTop: space(1) },
  skillRow: { flexDirection: 'row', alignItems: 'center', marginTop: space(3) },
  skillTier: { fontFamily: mono, fontWeight: '800', width: 18 },
  skillName: { color: colors.text, flex: 1, fontSize: 13, marginRight: space(2) },
  skillBar: { width: 90, flexDirection: 'row' },
  skillPct: { color: colors.textDim, fontFamily: mono, fontSize: 12, width: 40, textAlign: 'right' },
  questName: { fontSize: 18, fontWeight: '700', marginBottom: space(1) },
  otherSkill: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', minHeight: 44 },
  switch: { color: colors.accent, fontFamily: mono },
  reset: { color: colors.textDim, textAlign: 'center', textDecorationLine: 'underline', marginTop: space(4), fontSize: 12 },
});
