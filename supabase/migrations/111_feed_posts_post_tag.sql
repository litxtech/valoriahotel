-- Etiket sistemi: paylaşım türü (şikayet, istek, öneri, teşekkür, soru, diğer)
ALTER TABLE public.feed_posts ADD COLUMN IF NOT EXISTS post_tag TEXT;

COMMENT ON COLUMN public.feed_posts.post_tag IS 'Paylaşım etiketi: şikayet, istek, öneri, teşekkür, soru, diğer veya null';

CREATE INDEX IF NOT EXISTS idx_feed_posts_post_tag ON public.feed_posts(post_tag) WHERE post_tag IS NOT NULL;
