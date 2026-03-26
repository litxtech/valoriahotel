-- Yeni harcama kategorileri: Otel, Reception, Ofis vb.
INSERT INTO public.expense_categories (name, description, icon, sort_order)
SELECT v.name, v.description, v.icon, v.sort_order
FROM (VALUES
  ('Otel harcaması', 'Genel otel işletme giderleri', 'business', 8),
  ('Reception harcaması', 'Resepsiyon malzemeleri ve giderleri', 'desktop', 9),
  ('Ofis harcaması', 'Ofis kirası, elektrik, genel ofis giderleri', 'briefcase', 10),
  ('Mutfak harcaması', 'Mutfak malzemeleri, gıda', 'restaurant', 11),
  ('Housekeeping harcaması', 'Oda temizlik, çamaşır, nevresim', 'leaf', 12),
  ('Teknik harcaması', 'Bakım, onarım, teknik malzeme', 'construct', 13),
  ('Pazarlama harcaması', 'Reklam, broşür, tanıtım', 'megaphone', 14),
  ('Bakım harcaması', 'Bina, tesisat, genel bakım', 'hammer', 15),
  ('Enerji harcaması', 'Elektrik, su, doğalgaz', 'flash', 16)
) AS v(name, description, icon, sort_order)
WHERE NOT EXISTS (SELECT 1 FROM public.expense_categories c WHERE c.name = v.name);
