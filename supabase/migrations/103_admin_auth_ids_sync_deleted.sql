-- admin_auth_ids senkronizasyonu: silinen admin'leri çıkar, eksik admin'leri ekle.
-- Admin paneli misafir listesi "Unauthorized" hatası veriyorsa bu migration yardımcı olur.

-- 1. Silinen veya pasif olan admin'leri admin_auth_ids'den çıkar
DELETE FROM public.admin_auth_ids a
WHERE NOT EXISTS (
  SELECT 1 FROM public.staff s
  WHERE s.auth_id = a.auth_id
    AND s.role = 'admin'
    AND COALESCE(s.is_active, true) = true
    AND s.deleted_at IS NULL
);

-- 2. Eksik admin'leri ekle
INSERT INTO public.admin_auth_ids (auth_id)
SELECT s.auth_id FROM public.staff s
WHERE s.role = 'admin'
  AND COALESCE(s.is_active, true) = true
  AND s.deleted_at IS NULL
  AND s.auth_id IS NOT NULL
ON CONFLICT (auth_id) DO NOTHING;

-- 3. sync_admin_auth_ids trigger'ını güncelle: deleted_at değişince de tetiklensin
DROP TRIGGER IF EXISTS trg_sync_admin_auth_ids ON public.staff;

CREATE OR REPLACE FUNCTION public.sync_admin_auth_ids()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    DELETE FROM public.admin_auth_ids WHERE auth_id = OLD.auth_id;
    RETURN OLD;
  END IF;

  -- Admin olarak eklenme veya güncelleme
  IF NEW.role = 'admin' AND NEW.auth_id IS NOT NULL
     AND COALESCE(NEW.is_active, true) = true
     AND NEW.deleted_at IS NULL
     AND (TG_OP = 'INSERT' OR OLD.role IS DISTINCT FROM 'admin' OR OLD.is_active IS DISTINCT FROM NEW.is_active OR OLD.deleted_at IS DISTINCT FROM NEW.deleted_at) THEN
    INSERT INTO public.admin_auth_ids (auth_id) VALUES (NEW.auth_id) ON CONFLICT (auth_id) DO NOTHING;
  END IF;

  -- Artık admin değil veya silindi/pasif: çıkar (sadece UPDATE için)
  IF TG_OP = 'UPDATE' AND OLD.role = 'admin'
     AND (NEW.role IS DISTINCT FROM 'admin'
          OR NOT COALESCE(NEW.is_active, true)
          OR NEW.deleted_at IS NOT NULL) THEN
    DELETE FROM public.admin_auth_ids WHERE auth_id = NEW.auth_id;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_sync_admin_auth_ids
  AFTER INSERT OR UPDATE OF role, is_active, deleted_at ON public.staff
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_admin_auth_ids();

COMMENT ON FUNCTION public.sync_admin_auth_ids() IS
  'Staff role/is_active/deleted_at değişince admin_auth_ids güncellenir. Silinen admin listeden çıkar.';
