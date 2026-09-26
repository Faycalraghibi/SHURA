import type { ReactNode } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors, mono, space } from '../../theme';

/** Scrollable full-screen container with the System's background and keyboard handling. */
export function Screen({ children, scroll = true }: { children: ReactNode; scroll?: boolean }) {
  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right', 'bottom']}>
      <KeyboardAvoidingView style={styles.flex} behavior="height">
        {scroll ? (
          <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
            {children}
          </ScrollView>
        ) : (
          <View style={[styles.flex, styles.content]}>{children}</View>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

export function Loading({ text, sub }: { text: string; sub?: string }) {
  return (
    <View style={styles.loading} accessibilityLiveRegion="polite">
      <ActivityIndicator size="large" color={colors.accent} />
      <Text style={styles.loadingText}>{text}</Text>
      {sub ? <Text style={styles.loadingSub}>{sub}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  flex: { flex: 1 },
  content: { padding: space(4), paddingBottom: space(12) },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: space(8), minHeight: 320 },
  loadingText: { color: colors.accent, fontFamily: mono, marginTop: space(4), textAlign: 'center', letterSpacing: 1 },
  loadingSub: { color: colors.textDim, marginTop: space(2), textAlign: 'center', lineHeight: 20 },
});
