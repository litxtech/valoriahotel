import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, Animated, Easing, useWindowDimensions } from 'react-native';
import Svg, { Circle, Defs, G, Line, LinearGradient, Path, Stop } from 'react-native-svg';
import { useTranslation } from 'react-i18next';
import { theme } from '@/constants/theme';
import {
  getScoreTier,
  SCORE_TIER_COLORS,
  type StaffEvaluationResolved,
} from '@/lib/staffEvaluation';

const ARC_R = 58;
const ARC_CX = 104;
const ARC_CY = 98;
const ARC_LEN = ARC_R * (1.5 * Math.PI);

const GAUGE_START_DEG = 225;
const GAUGE_SWEEP = 270;

const TICK_DEGS = [225, 157.5, 90, 22.5, -45] as const;

function ptOnArc(cx: number, cy: number, r: number, deg: number) {
  const rad = (deg * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

const arcStart = ptOnArc(ARC_CX, ARC_CY, ARC_R, GAUGE_START_DEG);
const arcEnd = ptOnArc(ARC_CX, ARC_CY, ARC_R, -45);
const ARC_PATH_D = `M ${arcStart.x} ${arcStart.y} A ${ARC_R} ${ARC_R} 0 1 1 ${arcEnd.x} ${arcEnd.y}`;

function scoreToNeedleDeg(score: number): number {
  return GAUGE_START_DEG - GAUGE_SWEEP * (score / 100);
}

type Props = {
  data: StaffEvaluationResolved;
};

export function StaffPerformanceScoreCard({ data }: Props) {
  const { t } = useTranslation();
  const { width: winW } = useWindowDimensions();
  const stackLayout = winW < 400;
  const gradId = `perfGaugeGrad-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const hasData = data.source !== 'none';
  const overall = hasData ? data.overall : 0;
  const tier = hasData ? getScoreTier(overall) : 'low';
  const tierColors = SCORE_TIER_COLORS[tier];

  const insightText =
    data.insightLine?.kind === 'db'
      ? data.insightLine.text
      : data.insightLine?.kind === 'i18n'
        ? t(data.insightLine.key)
        : null;

  const metrics: { key: string; val: number }[] = [
    { key: 'metricDiscipline', val: data.discipline },
    { key: 'metricCommunication', val: data.communication },
    { key: 'metricSpeed', val: data.speed },
    { key: 'metricResponsibility', val: data.responsibility },
  ];

  const targetDeg = useMemo(
    () => (hasData ? scoreToNeedleDeg(overall) : GAUGE_START_DEG),
    [hasData, overall]
  );
  const targetArcLen = hasData ? (overall / 100) * ARC_LEN : 0;

  const [needleDeg, setNeedleDeg] = useState(GAUGE_START_DEG);
  const [arcFillLen, setArcFillLen] = useState(0);
  const [displayScore, setDisplayScore] = useState(0);
  const animKeyRef = useRef(0);

  useEffect(() => {
    animKeyRef.current += 1;
    const key = animKeyRef.current;
    setNeedleDeg(GAUGE_START_DEG);
    setArcFillLen(0);
    setDisplayScore(0);

    const tAnim = new Animated.Value(0);
    const sub = tAnim.addListener(({ value }) => {
      if (animKeyRef.current !== key) return;
      const p = value;
      setNeedleDeg(GAUGE_START_DEG + (targetDeg - GAUGE_START_DEG) * p);
      setArcFillLen(targetArcLen * p);
      if (hasData) {
        setDisplayScore(Math.round(overall * p));
      }
    });

    Animated.timing(tAnim, {
      toValue: 1,
      duration: 820,
      easing: Easing.bezier(0.22, 1, 0.36, 1),
      useNativeDriver: false,
    }).start(() => {
      tAnim.removeListener(sub);
      if (animKeyRef.current !== key) return;
      setNeedleDeg(targetDeg);
      setArcFillLen(targetArcLen);
      setDisplayScore(hasData ? overall : 0);
    });

    return () => {
      tAnim.removeListener(sub);
    };
  }, [hasData, overall, targetDeg, targetArcLen]);

  const needleRad = (needleDeg * Math.PI) / 180;
  const needleLen = ARC_R - 8;
  const tipX = ARC_CX + needleLen * Math.cos(needleRad);
  const tipY = ARC_CY + needleLen * Math.sin(needleRad);

  return (
    <View style={styles.cardWrap}>
      <View style={[styles.accentBar, { backgroundColor: tierColors.stroke }]} />
      <View style={styles.card}>
        <View style={[styles.topRow, stackLayout && styles.topRowStack]}>
          <View style={[styles.gaugeCol, stackLayout && styles.gaugeColStack]}>
            <Svg width={stackLayout ? '100%' : 200} height={128} viewBox="0 0 208 128" style={styles.svg}>
              <Defs>
                <LinearGradient id={gradId} x1="0%" y1="100%" x2="100%" y2="0%">
                  <Stop offset="0" stopColor="#C45C52" stopOpacity={1} />
                  <Stop offset="0.34" stopColor="#C4A035" stopOpacity={1} />
                  <Stop offset="0.68" stopColor="#6FA387" stopOpacity={1} />
                  <Stop offset="1" stopColor="#2D8A6E" stopOpacity={1} />
                </LinearGradient>
              </Defs>

              <Path
                d={ARC_PATH_D}
                fill="none"
                stroke={theme.colors.border}
                strokeWidth={10}
                strokeLinecap="round"
                opacity={0.55}
              />

              {hasData && arcFillLen > 0.5 ? (
                <Path
                  d={ARC_PATH_D}
                  fill="none"
                  stroke={`url(#${gradId})`}
                  strokeWidth={8}
                  strokeLinecap="round"
                  strokeDasharray={`${arcFillLen} ${ARC_LEN}`}
                />
              ) : null}

              {TICK_DEGS.map((deg, i) => {
                const p = ptOnArc(ARC_CX, ARC_CY, ARC_R + 5, deg);
                return (
                  <Circle
                    key={`t-${i}`}
                    cx={p.x}
                    cy={p.y}
                    r={1.75}
                    fill={theme.colors.textMuted}
                    opacity={0.45}
                  />
                );
              })}

              <G opacity={hasData ? 1 : 0.35}>
                <Line
                  x1={ARC_CX}
                  y1={ARC_CY}
                  x2={tipX}
                  y2={tipY}
                  stroke={theme.colors.text}
                  strokeWidth={2}
                  strokeLinecap="round"
                />
              </G>
              <Circle cx={ARC_CX} cy={ARC_CY} r={6} fill={theme.colors.surface} stroke={theme.colors.border} strokeWidth={1.5} />
              <Circle cx={ARC_CX} cy={ARC_CY} r={3.5} fill={theme.colors.text} />
            </Svg>

            <View style={styles.scoreBlock} pointerEvents="none">
              {hasData ? (
                <View style={styles.scoreLine}>
                  <Text style={styles.bigScore}>{displayScore}</Text>
                  <Text style={styles.scoreDenom}>/100</Text>
                </View>
              ) : (
                <Text style={styles.bigScoreEmpty}>—</Text>
              )}
              <Text style={styles.gaugeCaption}>{t('staffEvaluationGaugeLabel')}</Text>
            </View>
          </View>

          <View style={[styles.metricsGrid, stackLayout && styles.metricsGridStack]}>
            {metrics.map((m) => (
              <View key={m.key} style={styles.metricCell}>
                <Text style={styles.metricLabel} numberOfLines={1}>
                  {t(m.key)}
                </Text>
                <View style={styles.metricValueRow}>
                  <Text style={[styles.metricValue, hasData ? null : styles.metricValueMuted]}>
                    {hasData ? m.val : '—'}
                  </Text>
                </View>
                <View style={styles.metricTrack}>
                  <View
                    style={[
                      styles.metricFill,
                      {
                        width: hasData ? `${m.val}%` : '0%',
                        backgroundColor: hasData ? tierColors.stroke : theme.colors.borderLight,
                      },
                    ]}
                  />
                </View>
              </View>
            ))}
          </View>
        </View>

        {hasData && insightText ? (
          <Text style={styles.insightLine} numberOfLines={2}>
            {insightText}
          </Text>
        ) : !hasData ? (
          <Text style={styles.insightLineMuted}>{t('staffEvaluationEmpty')}</Text>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  cardWrap: {
    marginTop: theme.spacing.sm,
    position: 'relative',
  },
  accentBar: {
    position: 'absolute',
    left: 0,
    top: 14,
    bottom: 14,
    width: 3,
    borderRadius: 2,
    zIndex: 1,
  },
  card: {
    marginLeft: 5,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    paddingVertical: theme.spacing.md,
    paddingHorizontal: theme.spacing.md,
    paddingLeft: theme.spacing.md + 2,
    ...theme.shadows.md,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: theme.spacing.md,
  },
  topRowStack: {
    flexDirection: 'column',
    alignItems: 'stretch',
    gap: theme.spacing.sm,
  },
  gaugeCol: {
    width: 200,
    alignItems: 'center',
    alignSelf: 'center',
  },
  gaugeColStack: {
    width: '100%',
    maxWidth: 240,
    alignSelf: 'center',
  },
  svg: { marginTop: -4 },
  scoreBlock: {
    marginTop: -56,
    alignItems: 'center',
    width: '100%',
  },
  scoreLine: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 2,
  },
  bigScore: {
    fontSize: 34,
    fontWeight: '700',
    letterSpacing: -1.2,
    color: theme.colors.text,
    fontVariant: ['tabular-nums'],
  },
  scoreDenom: {
    fontSize: 13,
    fontWeight: '600',
    color: theme.colors.textMuted,
    letterSpacing: -0.2,
  },
  bigScoreEmpty: {
    fontSize: 30,
    fontWeight: '600',
    color: theme.colors.textMuted,
  },
  gaugeCaption: {
    marginTop: 2,
    fontSize: 10,
    fontWeight: '700',
    color: theme.colors.textMuted,
    letterSpacing: 1.1,
    textTransform: 'uppercase',
  },
  metricsGrid: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 0,
    paddingTop: 4,
  },
  metricsGridStack: {
    flexGrow: 0,
    flexShrink: 0,
    alignSelf: 'stretch',
    width: '100%',
    paddingTop: theme.spacing.sm,
  },
  metricCell: {
    width: '50%',
    paddingLeft: 4,
    paddingRight: 4,
    paddingBottom: 14,
  },
  metricLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: theme.colors.textMuted,
    letterSpacing: 0.4,
    marginBottom: 4,
  },
  metricValueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  metricValue: {
    fontSize: 17,
    fontWeight: '700',
    color: theme.colors.text,
    fontVariant: ['tabular-nums'],
  },
  metricValueMuted: {
    color: theme.colors.textMuted,
  },
  metricTrack: {
    height: 3,
    borderRadius: 999,
    backgroundColor: theme.colors.borderLight,
    overflow: 'hidden',
  },
  metricFill: {
    height: '100%',
    borderRadius: 999,
  },
  insightLine: {
    marginTop: 4,
    paddingTop: theme.spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: theme.colors.border,
    fontSize: 13,
    lineHeight: 18,
    color: theme.colors.textSecondary,
    fontWeight: '500',
  },
  insightLineMuted: {
    marginTop: 6,
    fontSize: 13,
    color: theme.colors.textMuted,
    fontStyle: 'italic',
  },
});
