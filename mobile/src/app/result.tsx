import { Redirect, router } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { SysButton } from '../components/system/Controls';
import { Screen } from '../components/system/Screen';
import { Label, SysText, Window } from '../components/system/Window';
import { t } from '../i18n/en';
import { getLastResult } from '../state/session';
import { colors, mono, space } from '../theme';

/** The verdict: what was proven, what failed and why, and what happens next (VISION §36). */
export default function Result() {
  const r = getLastResult();
  if (!r) return <Redirect href="/" />;
  const q = r.quest;
  const ev = r.evaluation;

  return (
    <Screen>
      <Window title={r.passed ? t.cleared : t.failed} tone={r.passed ? 'gold' : 'danger'} style={styles.top}>
        <Text style={styles.title}>“{q.title}”</Text>
        <Text style={[styles.score, { color: r.passed ? colors.success : colors.danger }]}>{t.score(r.score)}</Text>
        {r.xp > 0 ? <Text style={styles.xp}>{t.xpGained(r.xp)}</Text> : null}
      </Window>

      {ev ? (
        <>
          <Window title={t.criteria}>
            {ev.criteria.map((c, i) => (
              <View key={i} style={styles.criterion}>
                <Text style={[styles.mark, { color: c.met ? colors.success : colors.danger }]}>{c.met ? '✓' : '✗'}</Text>
                <View style={styles.flex}>
                  <SysText>{c.criterion}</SysText>
                  <SysText dim style={styles.small}>
                    {c.comment}
                  </SysText>
                </View>
              </View>
            ))}
          </Window>
          <Window title={t.feedback}>
            <SysText>{ev.feedback}</SysText>
            {!r.passed ? (
              <>
                <Label style={styles.section}>{t.diagnosis}</Label>
                <SysText>{t.cause[ev.failure_cause]}</SysText>
              </>
            ) : null}
          </Window>
        </>
      ) : (
        <Window title={t.explanation}>
          {q.items.map((item, i) => {
            const ok = r.picks[i] === item.answer_index;
            return (
              <View key={i} style={i ? styles.section : undefined}>
                <SysText>
                  <Text style={{ color: ok ? colors.success : colors.danger }}>{ok ? '✓ ' : '✗ '}</Text>
                  {item.question}
                </SysText>
                <SysText dim style={styles.small}>
                  {item.options[item.answer_index]}: {item.explanation}
                </SysText>
              </View>
            );
          })}
        </Window>
      )}

      <SysButton label={t.continue} onPress={() => router.dismissTo('/')} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  top: { marginTop: space(6) },
  flex: { flex: 1 },
  title: { color: colors.text, fontSize: 20, fontWeight: '800', textAlign: 'center' },
  score: { fontFamily: mono, fontSize: 16, textAlign: 'center', marginTop: space(2) },
  xp: { color: colors.gold, fontFamily: mono, fontSize: 28, fontWeight: '900', textAlign: 'center', marginTop: space(2), textShadowColor: colors.gold, textShadowRadius: 10 },
  criterion: { flexDirection: 'row', marginBottom: space(3) },
  mark: { fontSize: 18, width: 26, fontWeight: '900' },
  small: { fontSize: 13, lineHeight: 19, marginTop: space(1) },
  section: { marginTop: space(4) },
});
