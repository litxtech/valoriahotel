export type StaffEvaluationResolved = {
  overall: number;
  discipline: number;
  communication: number;
  speed: number;
  responsibility: number;
  insightLine: { kind: 'db'; text: string } | { kind: 'i18n'; key: string } | null;
  source: 'database' | 'derived' | 'none';
};

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.round(n)));
}

function stableOffset(staffId: string, salt: number): number {
  let h = 0;
  for (let i = 0; i < staffId.length; i++) {
    h = (h * 31 + staffId.charCodeAt(i)) >>> 0;
  }
  return (((h + salt) % 17) - 8) / 2;
}

function spreadSubscores(overall: number, staffId: string): Pick<StaffEvaluationResolved, 'discipline' | 'communication' | 'speed' | 'responsibility'> {
  return {
    discipline: clamp(overall + stableOffset(staffId, 1), 0, 100),
    communication: clamp(overall + stableOffset(staffId, 3), 0, 100),
    speed: clamp(overall + stableOffset(staffId, 5), 0, 100),
    responsibility: clamp(overall + stableOffset(staffId, 7), 0, 100),
  };
}

function pickInsightKey(
  overall: number,
  sub: Pick<StaffEvaluationResolved, 'discipline' | 'communication' | 'speed' | 'responsibility'>,
  source: 'database' | 'derived'
): { kind: 'i18n'; key: string } | null {
  if (sub.communication >= 82 && sub.communication >= overall - 3) {
    return { kind: 'i18n', key: 'insightStrongComm' };
  }
  if (sub.discipline <= 45 || (overall >= 55 && sub.discipline < overall - 18)) {
    return { kind: 'i18n', key: 'insightDisciplineAttention' };
  }
  if (source === 'derived') {
    return { kind: 'i18n', key: 'insightGuestDerived' };
  }
  if (overall >= 70) {
    return { kind: 'i18n', key: 'insightRising' };
  }
  return { kind: 'i18n', key: 'insightStable' };
}

export type StaffEvaluationInput = {
  id: string;
  evaluation_score: number | null | undefined;
  evaluation_discipline: number | null | undefined;
  evaluation_communication: number | null | undefined;
  evaluation_speed: number | null | undefined;
  evaluation_responsibility: number | null | undefined;
  evaluation_insight: string | null | undefined;
  average_rating: number | null | undefined;
};

export function resolveStaffEvaluation(row: StaffEvaluationInput): StaffEvaluationResolved {
  const hasDbOverall = row.evaluation_score != null && !Number.isNaN(Number(row.evaluation_score));
  const hasDbSubs =
    [row.evaluation_discipline, row.evaluation_communication, row.evaluation_speed, row.evaluation_responsibility].every(
      (x) => x != null && !Number.isNaN(Number(x))
    );

  if (hasDbOverall) {
    const overall = clamp(Number(row.evaluation_score), 0, 100);
    const subs = hasDbSubs
      ? {
          discipline: clamp(Number(row.evaluation_discipline), 0, 100),
          communication: clamp(Number(row.evaluation_communication), 0, 100),
          speed: clamp(Number(row.evaluation_speed), 0, 100),
          responsibility: clamp(Number(row.evaluation_responsibility), 0, 100),
        }
      : spreadSubscores(overall, row.id);
    const dbText = row.evaluation_insight?.trim();
    let insightLine: StaffEvaluationResolved['insightLine'];
    if (dbText) {
      insightLine = { kind: 'db', text: dbText };
    } else {
      insightLine = pickInsightKey(overall, subs, 'database');
    }
    return {
      overall,
      ...subs,
      insightLine,
      source: 'database',
    };
  }

  const avg = row.average_rating != null ? Number(row.average_rating) : 0;
  if (avg > 0) {
    const overall = clamp((avg / 5) * 100, 0, 100);
    const subs = spreadSubscores(overall, row.id);
    return {
      overall,
      ...subs,
      insightLine: pickInsightKey(overall, subs, 'derived'),
      source: 'derived',
    };
  }

  return {
    overall: 0,
    discipline: 0,
    communication: 0,
    speed: 0,
    responsibility: 0,
    insightLine: null,
    source: 'none',
  };
}

export type ScoreTier = 'low' | 'mid' | 'good' | 'excellent';

export function getScoreTier(score: number): ScoreTier {
  if (score <= 39) return 'low';
  if (score <= 69) return 'mid';
  if (score <= 84) return 'good';
  return 'excellent';
}

export const SCORE_TIER_COLORS: Record<ScoreTier, { stroke: string; soft: string; label: string }> = {
  low: { stroke: '#E07A7A', soft: '#FDF2F2', label: '#B85C5C' },
  mid: { stroke: '#D9A23C', soft: '#FDF8ED', label: '#9A7229' },
  good: { stroke: '#5BA87A', soft: '#F0F7F2', label: '#3D7A55' },
  excellent: { stroke: '#7A9B6A', soft: '#F4F7F0', label: '#5C7A4E' },
};
