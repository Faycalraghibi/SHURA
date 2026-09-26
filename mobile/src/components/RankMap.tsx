import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import Svg, { Line, Path } from 'react-native-svg';

import { t } from '../i18n/en';
import { DEFAULT_LAYOUT, fitScale, layoutRankMap, prerequisiteClosure } from '../lib/layout';
import { tierIndex, type Competency, type Tier } from '../lib/types';
import { colors, rankColors, space } from '../theme';

const MIN_SCALE = 0.35;
const MAX_SCALE = 2.2;
const TOOLBAR_SPACE = 64;

import type { CompetencyStatus } from '../engine/types';

const STATUS_BORDER: Record<CompetencyStatus, string> = {
  locked: 'rgba(143,168,200,0.25)',
  available: colors.accent,
  training: colors.accent,
  proven: colors.success,
  mastered: colors.gold,
  decaying: colors.warn,
};

interface Props {
  competencies: Competency[];
  ceiling: Tier | null;
  onOpen: (id: string) => void;
  statuses?: Record<string, CompetencyStatus>;
}

export function RankMap({ competencies, ceiling, onOpen, statuses }: Props) {
  const map = useMemo(() => layoutRankMap(competencies), [competencies]);
  const [selected, setSelected] = useState<string | null>(null);
  const path = useMemo(
    () => (selected ? prerequisiteClosure(competencies, selected) : new Set<string>()),
    [competencies, selected],
  );
  const opts = DEFAULT_LAYOUT;

  const scale = useSharedValue(1);
  const tx = useSharedValue(0);
  const ty = useSharedValue(0);
  const start = useSharedValue({ scale: 1, tx: 0, ty: 0 });
  const [view, setView] = useState({ width: 0, height: 0 });

  // Fit and centre the whole map above the toolbar. The transform scales around the map's centre.
  const fit = (w: number, h: number, animate: boolean) => {
    const usable = Math.max(1, h - TOOLBAR_SPACE);
    const s = fitScale(map, { width: w, height: usable });
    const nx = w / 2 - map.width / 2;
    const ny = usable / 2 - map.height / 2;
    const set = animate ? (v: number) => withTiming(v) : (v: number) => v;
    scale.value = set(s);
    tx.value = set(nx);
    ty.value = set(ny);
  };

  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    if (width === view.width && height === view.height) return;
    setView({ width, height });
    fit(width, height, false);
  };

  const pan = Gesture.Pan()
    .minDistance(8)
    .onStart(() => {
      start.value = { scale: scale.value, tx: tx.value, ty: ty.value };
    })
    .onUpdate((e) => {
      tx.value = start.value.tx + e.translationX;
      ty.value = start.value.ty + e.translationY;
    });

  const pinch = Gesture.Pinch()
    .onStart(() => {
      start.value = { scale: scale.value, tx: tx.value, ty: ty.value };
    })
    .onUpdate((e) => {
      scale.value = Math.min(MAX_SCALE, Math.max(MIN_SCALE, start.value.scale * e.scale));
    });

  const gesture = Gesture.Simultaneous(pan, pinch);

  const animated = useAnimatedStyle(() => ({
    transform: [{ translateX: tx.value }, { translateY: ty.value }, { scale: scale.value }],
  }));

  const ceilingIdx = ceiling ? tierIndex(ceiling) : -1;

  return (
    <View style={styles.container} onLayout={onLayout}>
      <GestureDetector gesture={gesture}>
        <View style={StyleSheet.absoluteFill} collapsable={false}>
          <Animated.View style={[{ width: map.width, height: map.height }, animated]}>
            {map.rows.map((row) => {
              const above = tierIndex(row.tier) > ceilingIdx;
              return (
                <View
                  key={row.tier}
                  style={[
                    styles.band,
                    {
                      top: row.y - opts.rowGap / 2,
                      height: row.height + opts.rowGap,
                      width: map.width,
                      backgroundColor: tierIndex(row.tier) % 2 ? colors.bg : colors.surface,
                    },
                  ]}
                >
                  <Text
                    style={[styles.bandLabel, { color: rankColors[row.tier], top: opts.rowGap / 2 + 18, left: opts.padding }]}
                  >
                    {row.tier}
                  </Text>
                  {above && <View style={styles.aboveCeiling} accessibilityLabel={t.aboveCeiling} />}
                </View>
              );
            })}

            <Svg width={map.width} height={map.height} style={StyleSheet.absoluteFill} pointerEvents="none">
              {map.edges.map((e) => {
                const active = selected !== null && (e.to === selected || path.has(e.to)) && path.has(e.from);
                const [x1, y1, x2, y2] = e.points;
                const my = (y1 + y2) / 2;
                return (
                  <Path
                    key={`${e.from}->${e.to}`}
                    d={e.sameRow ? `M ${x1} ${y1} Q ${(x1 + x2) / 2} ${y1 - opts.rowGap * 0.9}, ${x2} ${y2}` : `M ${x1} ${y1} C ${x1} ${my}, ${x2} ${my}, ${x2} ${y2}`}
                    stroke={active ? colors.edgeActive : colors.edge}
                    strokeWidth={active ? 2.5 : 1.5}
                    fill="none"
                    opacity={selected && !active ? 0.35 : 1}
                  />
                );
              })}
              {ceiling && ceilingIdx < 6 && map.rows[ceilingIdx + 1] && (
                <Line
                  x1={0}
                  x2={map.width}
                  y1={map.rows[ceilingIdx + 1].y + opts.nodeHeight + opts.rowGap / 2}
                  y2={map.rows[ceilingIdx + 1].y + opts.nodeHeight + opts.rowGap / 2}
                  stroke={colors.warn}
                  strokeDasharray="6 6"
                  strokeWidth={1.5}
                />
              )}
            </Svg>

            {competencies.map((c) => {
              const n = map.nodes[c.id];
              const isSel = c.id === selected;
              const onPath = path.has(c.id);
              const dim = selected !== null && !isSel && !onPath;
              const above = tierIndex(c.tier) > ceilingIdx;
              const st = statuses?.[c.id];
              const statusBorder = st ? STATUS_BORDER[st] : colors.border;
              return (
                <Pressable
                  key={c.id}
                  onPress={() => (isSel ? onOpen(c.id) : setSelected(c.id))}
                  onLongPress={() => onOpen(c.id)}
                  accessibilityRole="button"
                  accessibilityLabel={`${c.name}, ${t.rankLabel(c.tier)}${st ? `, ${t.status[st]}` : ''}${above ? `. ${t.aboveCeiling}` : ''}`}
                  accessibilityHint="Tap twice to open details"
                  style={[
                    styles.node,
                    {
                      left: n.x,
                      top: n.y,
                      width: opts.nodeWidth,
                      height: opts.nodeHeight,
                      borderColor: isSel || onPath ? rankColors[c.tier] : statusBorder,
                      backgroundColor: st === 'mastered' ? 'rgba(255,209,102,0.14)' : colors.surfaceHigh,
                      opacity: dim ? 0.4 : st === 'locked' ? 0.5 : 1,
                      borderStyle: above ? 'dashed' : 'solid',
                    },
                  ]}
                >
                  <View style={[styles.tierDot, { backgroundColor: rankColors[c.tier] }]} />
                  <Text style={styles.nodeText} numberOfLines={3}>
                    {st === 'locked' ? '🔒 ' : st === 'mastered' ? '★ ' : ''}
                    {c.name}
                  </Text>
                </Pressable>
              );
            })}
          </Animated.View>
        </View>
      </GestureDetector>

      <View style={styles.toolbar} pointerEvents="box-none">
        <Text style={styles.hint}>{t.zoomHint}</Text>
        <Pressable
          style={styles.fitButton}
          onPress={() => {
            setSelected(null);
            fit(view.width, view.height, true);
          }}
          accessibilityRole="button"
        >
          <Text style={styles.fitText}>{t.resetView}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, overflow: 'hidden', backgroundColor: colors.bg },
  band: { position: 'absolute', left: 0 },
  bandLabel: { position: 'absolute', fontSize: 22, fontWeight: '900' },
  aboveCeiling: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(242,184,75,0.05)' },
  node: {
    position: 'absolute',
    backgroundColor: colors.surfaceHigh,
    borderWidth: 1.5,
    borderRadius: 10,
    paddingHorizontal: space(2),
    paddingVertical: space(1.5),
    justifyContent: 'center',
  },
  tierDot: { position: 'absolute', top: 6, right: 6, width: 6, height: 6, borderRadius: 3 },
  nodeText: { color: colors.text, fontSize: 12, fontWeight: '600', lineHeight: 15 },
  toolbar: {
    position: 'absolute',
    left: space(4),
    right: space(4),
    bottom: space(4),
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  hint: { color: colors.textDim, fontSize: 12, flexShrink: 1, marginRight: space(2) },
  fitButton: {
    minHeight: 40,
    paddingHorizontal: space(4),
    borderRadius: 20,
    backgroundColor: colors.surfaceHigh,
    borderWidth: 1,
    borderColor: colors.border,
    justifyContent: 'center',
  },
  fitText: { color: colors.text, fontWeight: '700' },
});
