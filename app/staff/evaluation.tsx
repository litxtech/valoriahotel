import { useCallback, useState } from 'react';
import { View, ScrollView, ActivityIndicator, StyleSheet } from 'react-native';
import { Stack, useFocusEffect } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '@/stores/authStore';
import { supabase } from '@/lib/supabase';
import { loadStaffProfileSelf } from '@/lib/loadStaffProfileForViewer';
import {
  StaffEvaluationHub,
  StaffReviewsFullModal,
  type HubReview,
} from '@/components/StaffEvaluationHub';
import { resolveStaffEvaluation } from '@/lib/staffEvaluation';
import { formatDateShort } from '@/lib/date';
import { theme } from '@/constants/theme';

type ReviewRow = { id: string; rating: number; comment: string | null; created_at: string };

type EvalProfile = {
  id: string;
  full_name: string | null;
  evaluation_score?: number | null;
  evaluation_discipline?: number | null;
  evaluation_communication?: number | null;
  evaluation_speed?: number | null;
  evaluation_responsibility?: number | null;
  evaluation_insight?: string | null;
  average_rating?: number | null;
  total_reviews?: number | null;
};

export default function StaffEvaluationScreen() {
  const { t } = useTranslation();
  const staffId = useAuthStore((s) => s.staff?.id);
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<EvalProfile | null>(null);
  const [reviews, setReviews] = useState<ReviewRow[]>([]);
  const [reviewsModalVisible, setReviewsModalVisible] = useState(false);

  useFocusEffect(
    useCallback(() => {
      if (!staffId) return;
      let cancelled = false;
      setLoading(true);
      (async () => {
        const res = await loadStaffProfileSelf(staffId);
        const { data: r } = await supabase
          .from('staff_reviews')
          .select('id, rating, comment, created_at')
          .eq('staff_id', staffId)
          .order('created_at', { ascending: false });
        if (cancelled) return;
        setProfile((res.data as EvalProfile) ?? null);
        setReviews((r ?? []) as ReviewRow[]);
        setLoading(false);
      })();
      return () => {
        cancelled = true;
      };
    }, [staffId])
  );

  if (!staffId) {
    return (
      <>
        <Stack.Screen options={{ title: t('evaluationHubTitle'), headerBackTitle: t('back') }} />
        <View style={styles.center} />
      </>
    );
  }

  if (loading || !profile) {
    return (
      <>
        <Stack.Screen options={{ title: t('evaluationHubTitle'), headerBackTitle: t('back') }} />
        <View style={styles.center}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
        </View>
      </>
    );
  }

  return (
    <>
      <Stack.Screen options={{ title: t('evaluationHubTitle'), headerBackTitle: t('back') }} />
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <StaffEvaluationHub
          resolved={resolveStaffEvaluation({
            id: profile.id,
            evaluation_score: profile.evaluation_score,
            evaluation_discipline: profile.evaluation_discipline,
            evaluation_communication: profile.evaluation_communication,
            evaluation_speed: profile.evaluation_speed,
            evaluation_responsibility: profile.evaluation_responsibility,
            evaluation_insight: profile.evaluation_insight,
            average_rating: profile.average_rating,
          })}
          averageRating={profile.average_rating ?? null}
          totalReviews={profile.total_reviews ?? null}
          reviews={reviews as HubReview[]}
          previewLimit={8}
          onOpenAllReviews={() => setReviewsModalVisible(true)}
          formatReviewDate={(iso) => formatDateShort(iso)}
        />
      </ScrollView>
      <StaffReviewsFullModal
        visible={reviewsModalVisible}
        onClose={() => setReviewsModalVisible(false)}
        staffName={profile.full_name || '—'}
        reviews={reviews as HubReview[]}
        formatReviewDate={(iso) => formatDateShort(iso)}
      />
    </>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: theme.colors.backgroundSecondary,
  },
  scroll: {
    padding: theme.spacing.lg,
    paddingBottom: theme.spacing.xxl,
    backgroundColor: theme.colors.backgroundSecondary,
  },
});
