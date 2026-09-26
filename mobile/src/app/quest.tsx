import { Redirect, router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Linking, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { RankBadge } from '../components/RankBadge';
import { SysButton } from '../components/system/Controls';
import { useNotify } from '../components/system/Notifications';
import { Loading, Screen } from '../components/system/Screen';
import { Label, SysText, Window } from '../components/system/Window';
import { isProven, newCompetencyState } from '../engine/mastery';
import { planNext } from '../engine/planner';
import { recordResult } from '../engine/player';
import { t } from '../i18n/en';
import { eventNotices } from '../lib/notices';
import { evaluate, gradeChoices, requestHint, requestQuest } from '../lib/system';
import { usePlayer, type ActiveQuest } from '../state/PlayerProvider';
import { setLastResult } from '../state/session';
import { colors, mono, space, TOUCH } from '../theme';

export default function QuestScreen() {
  const { player, activeQuest, setActiveQuest, update } = usePlayer();
  const notify = useNotify();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [judging, setJudging] = useState(false);
  const [hinting, setHinting] = useState(false);
  const requested = useRef(false);

  const skill = player?.activeSkill ? player.skills[player.activeSkill] : null;

  const generate = async () => {
    if (!player || !skill) return;
    const penalty = player.daily.penaltyPending;
    const plan = planNext(skill, Date.now(), { forceRetest: penalty });
    if (!plan) return router.back();
    setLoading(true);
    setError(null);
    try {
      const known = skill.pack.competencies
        .filter((c) => isProven(skill.competencies[c.id] ?? newCompetencyState(), c.tier))
        .map((c) => c.name);
      const cs = skill.competencies[plan.competencyId];
      const lastFail = cs?.evidence.filter((e) => !e.passed).slice(-1)[0];
      const quest = await requestQuest({
        pack_id: skill.pack.pack,
        competency_id: plan.competencyId,
        evidence_type: plan.evidenceType,
        known,
        weakness: lastFail && lastFail.cause !== 'none' ? t.cause[lastFail.cause] : null,
        retest: plan.retest,
      });
      setActiveQuest({
        quest,
        hintLevel: 0,
        hints: [],
        draft: quest.starter ?? '',
        choices: quest.items.map(() => null),
        penalty: penalty && plan.retest,
      });
      notify({ title: t.nQuest, body: quest.title });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!activeQuest && !requested.current) {
      requested.current = true;
      generate();
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (!player || !skill) return <Redirect href="/" />;

  if (!activeQuest) {
    return (
      <Screen scroll={!!error}>
        {error ? (
          <Window title={t.system} tone="danger" style={styles.top}>
            <SysText>{error}</SysText>
            <SysButton label={t.retry} onPress={generate} busy={loading} />
            <SysButton label={t.back} tone="quiet" onPress={() => router.back()} />
          </Window>
        ) : (
          <Loading text={t.generating} />
        )}
      </Screen>
    );
  }

  if (judging) {
    return (
      <Screen scroll={false}>
        <Loading text={t.judging} />
      </Screen>
    );
  }

  const aq = activeQuest;
  const q = aq.quest;
  const save = (patch: Partial<ActiveQuest>) => setActiveQuest({ ...aq, ...patch });
  const canSubmit = q.format === 'choice' ? aq.choices.every((c) => c !== null) : aq.draft.trim().length > 0;

  const hint = async () => {
    const level = Math.min(6, aq.hintLevel + 1);
    setHinting(true);
    setError(null);
    try {
      const text = await requestHint(q, q.format === 'choice' ? '' : aq.draft, level);
      save({ hintLevel: level, hints: [...aq.hints, text] });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setHinting(false);
    }
  };

  const submit = async () => {
    setJudging(true);
    setError(null);
    try {
      let score: number;
      let passed: boolean;
      let evaluation = null;
      if (q.format === 'choice') {
        ({ score, passed } = gradeChoices(q.items, aq.choices));
      } else {
        evaluation = await evaluate(q, aq.draft, aq.hintLevel);
        score = evaluation.score;
        passed = evaluation.passed;
      }
      let xp = 0;
      const events = update((p) => {
        const r = recordResult(
          p,
          {
            packId: q.pack_id,
            competencyId: q.competency_id,
            type: q.evidence_type,
            score,
            passed,
            hintLevel: aq.hintLevel,
            retest: q.retest,
            cause: evaluation?.failure_cause ?? (passed ? 'none' : 'misconception'),
            missingPrerequisite: evaluation?.missing_prerequisite ?? null,
            questTitle: q.title,
            penalty: aq.penalty,
          },
          Date.now(),
        );
        xp = r.xp;
        return r;
      });
      setLastResult({ quest: q, score, passed, xp, evaluation, picks: aq.choices, events });
      setActiveQuest(null);
      // The result screen shows the verdict itself; notifications carry what happened beyond it.
      notify(eventNotices(events.filter((e) => e.kind !== 'quest_complete' && e.kind !== 'quest_failed')));
      router.replace('/result');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setJudging(false);
    }
  };

  return (
    <Screen>
      <Window title={`${t.questTitle}${q.retest ? ` · ${t.retestTag}` : ''}`} tone={aq.penalty ? 'danger' : 'system'}>
        <Text style={styles.title}>“{q.title}”</Text>
        <SysText dim style={styles.flavor}>
          {q.flavor}
        </SysText>
        <View style={styles.meta}>
          <RankBadge tier={q.tier} size={22} />
          <Text style={styles.metaText}>
            {q.competency_name} · {t.evidence[q.evidence_type]}
          </Text>
        </View>
      </Window>

      <Window>
        <Label>{t.objective}</Label>
        <SysText>{q.objective}</SysText>
        <Label style={styles.section}>{t.instructions}</Label>
        <SysText selectable>{q.instructions}</SysText>
        {q.requirements.length ? (
          <>
            <Label style={styles.section}>{t.requirements}</Label>
            {q.requirements.map((r) => (
              <SysText key={r}>▸ {r}</SysText>
            ))}
          </>
        ) : null}
        {q.resources.length ? (
          <>
            <Label style={styles.section}>{t.resources}</Label>
            {q.resources.map((r) => (
              <Text key={r.url} style={styles.link} onPress={() => Linking.openURL(r.url)} accessibilityRole="link">
                {r.title}
              </Text>
            ))}
          </>
        ) : null}
      </Window>

      <Window title={t.yourAnswer}>
        {q.format === 'choice' ? (
          q.items.map((item, qi) => (
            <View key={qi} style={qi ? styles.section : undefined}>
              <SysText style={styles.question}>
                {qi + 1}. {item.question}
              </SysText>
              {item.options.map((opt, oi) => {
                const on = aq.choices[qi] === oi;
                return (
                  <Pressable
                    key={oi}
                    onPress={() => save({ choices: aq.choices.map((c, j) => (j === qi ? oi : c)) })}
                    style={[styles.option, on && styles.optionOn]}
                    accessibilityRole="radio"
                    accessibilityState={{ checked: on }}
                  >
                    <Text style={styles.optionKey}>{String.fromCharCode(65 + oi)}</Text>
                    <Text style={styles.optionText}>{opt}</Text>
                  </Pressable>
                );
              })}
            </View>
          ))
        ) : (
          <TextInput
            value={aq.draft}
            onChangeText={(draft) => save({ draft })}
            placeholder={q.format === 'code' ? t.codePlaceholder : t.answerPlaceholder}
            placeholderTextColor={colors.textDim}
            multiline
            autoCapitalize={q.format === 'code' ? 'none' : 'sentences'}
            autoCorrect={q.format !== 'code'}
            spellCheck={q.format !== 'code'}
            style={[styles.answer, q.format === 'code' && styles.code]}
            textAlignVertical="top"
            accessibilityLabel={t.yourAnswer}
          />
        )}

        {aq.hints.map((h, i) => (
          <View key={i} style={styles.hintBox}>
            <Label>
              HINT {i + 1} · {t.hintNames[i + 1]}
            </Label>
            <SysText>{h}</SysText>
          </View>
        ))}
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <SysButton label={t.submit} onPress={submit} disabled={!canSubmit} />
        {aq.hintLevel < 6 ? (
          <>
            <SysButton label={t.hint(aq.hintLevel)} tone="quiet" onPress={hint} busy={hinting} />
            <SysText dim style={styles.small}>
              {t.hintWarning}
            </SysText>
          </>
        ) : null}
      </Window>

      <Pressable
        onPress={() => {
          setActiveQuest(null);
          router.back();
        }}
        accessibilityRole="button"
      >
        <Text style={styles.abandon}>{t.abandon}</Text>
      </Pressable>
    </Screen>
  );
}

const styles = StyleSheet.create({
  top: { marginTop: space(8) },
  title: { color: colors.text, fontSize: 21, fontWeight: '800', textAlign: 'center' },
  flavor: { textAlign: 'center', fontStyle: 'italic', marginTop: space(2) },
  meta: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space(2), marginTop: space(3) },
  metaText: { color: colors.textDim, fontFamily: mono, fontSize: 12 },
  section: { marginTop: space(4) },
  link: { color: colors.accent, textDecorationLine: 'underline', fontSize: 15, lineHeight: 26 },
  question: { fontWeight: '600', marginBottom: space(1) },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: TOUCH,
    borderWidth: 1,
    borderColor: colors.borderDim,
    borderRadius: 4,
    padding: space(3),
    marginTop: space(2),
  },
  optionOn: { borderColor: colors.accent, backgroundColor: 'rgba(88,195,255,0.12)' },
  optionKey: { color: colors.accent, fontFamily: mono, fontWeight: '700', width: 24 },
  optionText: { color: colors.text, flex: 1, fontSize: 15, lineHeight: 21 },
  answer: {
    minHeight: 180,
    borderWidth: 1,
    borderColor: colors.borderDim,
    borderRadius: 4,
    color: colors.text,
    fontSize: 15,
    lineHeight: 22,
    padding: space(3),
    backgroundColor: 'rgba(0,0,0,0.3)',
  },
  code: { fontFamily: mono, fontSize: 13, lineHeight: 19 },
  hintBox: { marginTop: space(4), borderLeftWidth: 2, borderLeftColor: colors.warn, paddingLeft: space(3) },
  error: { color: colors.danger, marginTop: space(3), lineHeight: 20 },
  small: { fontSize: 12, marginTop: space(1), textAlign: 'center' },
  abandon: { color: colors.textDim, textAlign: 'center', textDecorationLine: 'underline', fontSize: 12, marginTop: space(2) },
});
