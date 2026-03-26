-- Tüm Çalışanlar grubu: Eksik aktif personeli ekle (sonradan giriş yapanlar giriş yaptığı günden itibaren grubu görsün).
-- Mevcut trigger (025) yeni eklenen/aktif edilen personeli otomatik ekliyor; bu migration geçmişte kalan eksikleri tamamlar.

INSERT INTO public.conversation_participants (conversation_id, participant_id, participant_type)
SELECT c.id, s.id, 'staff'
FROM public.conversations c
CROSS JOIN public.staff s
WHERE c.type = 'group' AND c.name = 'Tüm Çalışanlar' AND s.is_active = true
  AND NOT EXISTS (
    SELECT 1 FROM public.conversation_participants cp
    WHERE cp.conversation_id = c.id AND cp.participant_id = s.id AND cp.participant_type = 'staff' AND cp.left_at IS NULL
  )
ON CONFLICT (conversation_id, participant_id, participant_type) DO NOTHING;
