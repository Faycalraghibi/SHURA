import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, TextInput } from 'react-native';

import { Loading, Screen } from '../components/system/Screen';
import { SysButton } from '../components/system/Controls';
import { useNotify } from '../components/system/Notifications';
import { SysText, Window } from '../components/system/Window';
import { createPlayer, startSkill } from '../engine/player';
import { t } from '../i18n/en';
import { awaken } from '../lib/system';
import { usePlayer } from '../state/PlayerProvider';
import { colors, mono, space, TOUCH } from '../theme';

/** First launch: accept the System, give a name, choose a skill. Also used to add another skill. */
export default function Awaken() {
  const { mode } = useLocalSearchParams<{ mode?: string }>();
  const { player, setPlayer, update } = usePlayer();
  const notify = useNotify();
  const addingSkill = mode === 'skill' && player !== null;
  const [step, setStep] = useState<'accept' | 'name' | 'skill'>(addingSkill ? 'skill' : 'accept');
  const [name, setName] = useState('');
  const [skill, setSkill] = useState('');
  const [goal, setGoal] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const build = async () => {
    const text = skill.trim();
    if (!text) return;
    setBusy(true);
    setError(null);
    try {
      const { pack } = await awaken(text, goal.trim() || undefined);
      const now = Date.now();
      if (addingSkill) {
        update((p) => startSkill(p, pack, now));
      } else {
        setPlayer(startSkill(createPlayer(name, now), pack, now));
      }
      notify({ title: t.treeBuilt(pack.name) });
      router.replace('/assessment');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  if (busy) {
    return (
      <Screen scroll={false}>
        <Loading text={t.analyzing} sub={t.analyzingLong} />
      </Screen>
    );
  }

  return (
    <Screen>
      <Text style={styles.logo}>{t.appName}</Text>
      {step === 'accept' && (
        <Window title={t.awakenTitle}>
          <SysText style={styles.center}>{t.awakenBody}</SysText>
          <SysButton label={t.accept} onPress={() => setStep('name')} />
        </Window>
      )}
      {step === 'name' && (
        <Window title={t.system}>
          <SysText>{t.namePrompt}</SysText>
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder={t.namePlaceholder}
            placeholderTextColor={colors.textDim}
            style={styles.input}
            autoFocus
            maxLength={24}
            returnKeyType="next"
            onSubmitEditing={() => name.trim() && setStep('skill')}
            accessibilityLabel={t.namePlaceholder}
          />
          <SysButton label={t.next} onPress={() => setStep('skill')} disabled={!name.trim()} />
        </Window>
      )}
      {step === 'skill' && (
        <Window title={t.system}>
          <SysText>{t.skillPrompt}</SysText>
          <TextInput
            value={skill}
            onChangeText={setSkill}
            placeholder={t.skillPlaceholder}
            placeholderTextColor={colors.textDim}
            style={styles.input}
            autoFocus
            maxLength={120}
            accessibilityLabel={t.skillPlaceholder}
          />
          <TextInput
            value={goal}
            onChangeText={setGoal}
            placeholder={t.goalPlaceholder}
            placeholderTextColor={colors.textDim}
            style={[styles.input, styles.goal]}
            multiline
            maxLength={300}
            accessibilityLabel={t.goalPlaceholder}
          />
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <SysButton label={error ? t.retry : t.awakenButton} onPress={build} disabled={!skill.trim()} />
          {addingSkill ? <SysButton label={t.back} tone="quiet" onPress={() => router.back()} /> : null}
        </Window>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  logo: {
    color: colors.accent,
    fontFamily: mono,
    fontSize: 36,
    fontWeight: '900',
    letterSpacing: 12,
    textAlign: 'center',
    marginTop: space(16),
    marginBottom: space(10),
    textShadowColor: colors.glow,
    textShadowRadius: 16,
  },
  center: { textAlign: 'center' },
  input: {
    minHeight: TOUCH,
    borderWidth: 1,
    borderColor: colors.borderDim,
    borderRadius: 4,
    color: colors.text,
    fontSize: 16,
    paddingHorizontal: space(3),
    marginTop: space(3),
    backgroundColor: 'rgba(0,0,0,0.25)',
  },
  goal: { minHeight: 72, textAlignVertical: 'top', paddingTop: space(3) },
  error: { color: colors.danger, marginTop: space(3), lineHeight: 20 },
});
