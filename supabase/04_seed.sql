-- =====================================================================
--  بيانات ابتدائية اختيارية (يمكن تشغيلها لتجربة النظام)
-- =====================================================================
insert into public.academic_years (name, sort_order) values
  ('الصف الأول', 1), ('الصف الثاني', 2), ('الصف الثالث', 3)
on conflict (name) do nothing;

do $$
declare y1 uuid; y2 uuid; y3 uuid;
begin
  select id into y1 from public.academic_years where name='الصف الأول';
  select id into y2 from public.academic_years where name='الصف الثاني';
  select id into y3 from public.academic_years where name='الصف الثالث';

  insert into public.groups (year_id, name) values
    (y1,'مجموعة 1'), (y1,'مجموعة 2'),
    (y2,'مجموعة 1'), (y2,'مجموعة 2'),
    (y3,'مجموعة 1'), (y3,'مجموعة 2'), (y3,'مجموعة 3')
  on conflict do nothing;

  insert into public.subjects (year_id, name, price, sessions_per_cycle) values
    (y1,'أساسيات الكهرباء', 400, 4),
    (y2,'كهرباء', 500, 4),
    (y2,'إلكترونيات', 450, 4),
    (y3,'تحكم صناعي', 600, 4),
    (y3,'قدرة كهربية', 550, 4)
  on conflict do nothing;
end $$;
