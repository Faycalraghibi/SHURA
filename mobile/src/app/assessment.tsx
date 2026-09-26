import { Redirect, router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { SysButton } from '../components/system/Controls';
import { useNotify } from '../components/system/Notifications';
import { Loading, Screen } from '../components/system/Screen';
import { Label, SysText, Window } from '../components/system/Window';
import { applyPlacement } from '../engine/player';
import { t } from '../i18n/en';
import { assess, type ChoiceItem } from '../lib/system';
import { usePlayer } from '../state/PlayerProvider';
import { colors, mono, space, TOUCH } from '../theme';

/** Placement (VISION §4): what can this person actually do right now? Graded on the phone. */
export default function Assessment() {
  const { player, update } = usePlayer();
  const notify = useNotify();
  const skill = player?.activeSkill ? player.skills[player.activeSkill] : null;
  const [items, setItems] = useState<ChoiceItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [started, setStarted] = useState(false);
  const [index, setIndex] = useState(0);
  const [picks, setPicks] = useState<(number | null)[]>([]);

  const load = () => {
    if (!skill) return;
    setError(null);
    setItems(null);
    assess(skill.pack.pack)
      .then((its) => {
        setItems(its);
        setPicks(its.map(() => null));
      })
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  };

  useEffect(load, [skill?.pack.pack]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!player || !skill) return <Redirect href="/" />;

  const finish = (answers: { competencyId: string; correct: boolean }[]) => {
    update((p) => applyPlacement(p, skill.pack.pack, answers, Date.now()));
    const correct = answers.filter((a) => a.correct).length;
    notify([{ title: t.assessDone(correct, answers.length) }, { title: t.nQuest }]);
    router.dismissTo('/');
  };

  const skip = () => finish([]);

  if (!started) {
    return (
      <Screen>
        <Window title={t.assessTitle} style={styles.top}>
          <SysText>{skill.pack.name}</SysText>
          <SysText dim style={styles.gap}>
            {t.assessIntro}
          </SysText>
          {error ? <Text style={styles.error}>{error}</Text> : null}
          {items === null && !error ? <Loading text={t.assessLoading} /> : null}
          <SysButton label={error ? t.retry : t.assessStart} onPress={error ? load : () => setStarted(true)} disabled={!error && !items} />
          <SysButton label={t.assessSkip} tone="quiet" onPress={skip} />
        </Window>
      </Screen>
    );
  }

  const item = items![index];
  const last = index === items!.length - 1;
  const pick = picks[index];

  return (
    <Screen>
      <Window title={t.questionOf(index + 1, items!.length)} style={styles.top}>
        <SysText style={styles.question}>{item.question}</SysText>
        {item.options.map((opt, i) => (
          <Pressable
            key={i}
            onPress={() => setPicks((ps) => ps.map((p, j) => (j === index ? i : p)))}
            style={[styles.option, pick === i && styles.optionOn]}
            accessibilityRole="radio"
            accessibilityState={{ checked: pick === i }}
          >
            <Text style={styles.optionKey}>{String.fromCharCode(65 + i)}</Text>
            <Text style={styles.optionText}>{opt}</Text>
          </Pressable>
        ))}
        <SysButton
          label={last ? t.finish : t.next}
          disabled={pick === null}
          onPress={() => {
            if (!last) return setIndex(index + 1);
            finish(items!.map((it, i) => ({ competencyId: it.competency_id, correct: picks[i] === it.answer_index })));
          }}
        />
      </Window>
      <View style={styles.dots}>
        {items!.map((_, i) => (
          <View key={i} style={[styles.dot, i <= index && styles.dotOn]} />
        ))}
      </View>
      <Label>{skill.pack.name.toUpperCase()}</Label>
    </Screen>
  );
}

const styles = StyleSheet.create({
  top: { marginTop: space(8) },
  gap: { marginTop: space(2) },
  question: { fontSize: 17, lineHeight: 25, marginBottom: space(3) },
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
  dots: { flexDirection: 'row', justifyContent: 'center', gap: space(2), marginBottom: space(4) },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.borderDim },
  dotOn: { backgroundColor: colors.accent },
  error: { color: colors.danger, marginTop: space(3), lineHeight: 20 },
});
