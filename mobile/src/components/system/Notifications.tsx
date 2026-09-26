import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { AccessibilityInfo, Pressable, StyleSheet, Text } from 'react-native';
import Animated, { FadeInUp, FadeOutUp } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, glow, mono, space } from '../../theme';

import type { SystemNotice as SysNotice } from '../../lib/noticeTypes';

const Ctx = createContext<(n: SysNotice | SysNotice[]) => void>(() => {});

export function useNotify() {
  return useContext(Ctx);
}

const SHOW_MS = 2600;

/** Queue of System notifications that slide in one after another ("You have acquired a new quest."). */
export function NotificationHost({ children }: { children: ReactNode }) {
  const [queue, setQueue] = useState<SysNotice[]>([]);
  const insets = useSafeAreaInsets();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const notify = useCallback((n: SysNotice | SysNotice[]) => {
    setQueue((q) => [...q, ...(Array.isArray(n) ? n : [n])]);
  }, []);

  const current = queue[0];
  useEffect(() => {
    if (!current) return;
    AccessibilityInfo.announceForAccessibility(`${current.title}. ${current.body ?? ''}`);
    timer.current = setTimeout(() => setQueue((q) => q.slice(1)), SHOW_MS);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [current]);

  const color = current
    ? { system: colors.border, gold: colors.gold, danger: colors.danger, success: colors.success }[current.tone ?? 'system']
    : colors.border;

  return (
    <Ctx.Provider value={notify}>
      {children}
      {current ? (
        <Animated.View
          key={`${current.title}-${queue.length}`}
          entering={FadeInUp.duration(250)}
          exiting={FadeOutUp.duration(200)}
          style={[styles.wrap, { top: insets.top + space(3) }]}
          pointerEvents="box-none"
        >
          <Pressable onPress={() => setQueue((q) => q.slice(1))} style={[styles.card, { borderColor: color }, glow(color, 16)]}>
            <Text style={[styles.tag, { color }]}>[ SYSTEM ]</Text>
            <Text style={styles.title}>{current.title}</Text>
            {current.body ? <Text style={styles.body}>{current.body}</Text> : null}
          </Pressable>
        </Animated.View>
      ) : null}
    </Ctx.Provider>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: space(4), right: space(4), zIndex: 100 },
  card: {
    backgroundColor: 'rgba(6, 18, 40, 0.97)',
    borderWidth: 1.5,
    borderRadius: 6,
    padding: space(4),
    alignItems: 'center',
  },
  tag: { fontFamily: mono, fontSize: 11, letterSpacing: 3, marginBottom: space(1) },
  title: { color: colors.text, fontSize: 17, fontWeight: '700', textAlign: 'center' },
  body: { color: colors.textDim, fontSize: 14, marginTop: space(1), textAlign: 'center' },
});
