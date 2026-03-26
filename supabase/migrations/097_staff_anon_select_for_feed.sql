-- Akışta (feed) görünen avatarlar: personel, admin, misafir herkes görebilsin.
-- Anon (giriş yapmamış) kullanıcılar staff tablosunu okuyamıyordu; feed post yazarı ve aktif personel avatarları görünmüyordu.
-- Çözüm: Anon kullanıcılar is_active=true olan staff satırlarını SELECT edebilsin (sadece feed/avatar göstermek için).

DROP POLICY IF EXISTS "staff_select_anon_feed" ON public.staff;
CREATE POLICY "staff_select_anon_feed" ON public.staff
  FOR SELECT TO anon
  USING (is_active = true);

COMMENT ON POLICY "staff_select_anon_feed" ON public.staff IS
  'Giriş yapmamış kullanıcılar akışta personel avatarlarını görebilsin (feed post yazarı, aktif personel strip).';
