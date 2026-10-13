-- =====================================================================
--  الجزء 3: أمان مستوى الصف (Row Level Security)
--  المدير: صلاحية كاملة.  الطالب: قراءة بياناته هو فقط — لا تعديل إطلاقًا.
-- =====================================================================

alter table public.app_settings            enable row level security;
alter table public.academic_years          enable row level security;
alter table public.groups                  enable row level security;
alter table public.subjects                enable row level security;
alter table public.students                enable row level security;
alter table public.profiles                enable row level security;
alter table public.student_subjects        enable row level security;
alter table public.class_sessions          enable row level security;
alter table public.attendance              enable row level security;
alter table public.cycles                  enable row level security;
alter table public.charges                 enable row level security;
alter table public.payments                enable row level security;
alter table public.payment_allocations     enable row level security;
alter table public.projects                enable row level security;
alter table public.project_questions       enable row level security;
alter table public.project_enrollments     enable row level security;
alter table public.student_project_progress enable row level security;
alter table public.files                   enable row level security;
alter table public.messages                enable row level security;
alter table public.message_targets         enable row level security;
alter table public.message_recipients      enable row level security;
alter table public.message_files           enable row level security;
alter table public.notifications           enable row level security;
alter table public.audit_logs              enable row level security;
alter table public.code_counters           enable row level security;

-- دالة مساعدة لإنشاء سياسة المدير الكاملة
do $$
declare t text;
begin
  foreach t in array array[
    'app_settings','academic_years','groups','subjects','students','student_subjects',
    'class_sessions','attendance','cycles','charges','payments','payment_allocations',
    'projects','project_questions','project_enrollments','student_project_progress',
    'files','messages','message_targets','message_recipients','message_files',
    'notifications','audit_logs','code_counters','profiles'
  ] loop
    execute format('drop policy if exists admin_all on public.%I', t);
    execute format(
      'create policy admin_all on public.%I for all to authenticated using (public.is_admin()) with check (public.is_admin())', t);
  end loop;
end $$;

-- ------------------------------------------------------------- profiles
drop policy if exists own_profile_read on public.profiles;
create policy own_profile_read on public.profiles
  for select to authenticated using (id = auth.uid());

-- --------------------------------------------------------- app_settings
drop policy if exists settings_read on public.app_settings;
create policy settings_read on public.app_settings
  for select to authenticated using (true);

-- عرض عام محدود للهوية البصرية (شاشة الدخول قبل تسجيل الدخول)
create or replace view public.public_branding
with (security_invoker = off) as
  select app_name, short_name, tagline, logo_url, icon_url, primary_color, accent_color, theme_mode
  from public.app_settings where id = 1;
grant select on public.public_branding to anon, authenticated;

-- ------------------------------------------- بيانات مرجعية للقراءة للطالب
drop policy if exists ref_read_years on public.academic_years;
create policy ref_read_years on public.academic_years
  for select to authenticated using (true);

drop policy if exists ref_read_groups on public.groups;
create policy ref_read_groups on public.groups
  for select to authenticated using (true);

drop policy if exists ref_read_subjects on public.subjects;
create policy ref_read_subjects on public.subjects
  for select to authenticated using (true);

-- ------------------------------------------------------------- students
drop policy if exists student_read_self on public.students;
create policy student_read_self on public.students
  for select to authenticated using (id = public.current_student_id());

-- ------------------------------------------------------ student_subjects
drop policy if exists student_read_own_subjects on public.student_subjects;
create policy student_read_own_subjects on public.student_subjects
  for select to authenticated using (student_id = public.current_student_id());

-- ------------------------------------------------------------ attendance
drop policy if exists student_read_own_attendance on public.attendance;
create policy student_read_own_attendance on public.attendance
  for select to authenticated using (student_id = public.current_student_id());

-- -------------------------------------------------------- class_sessions
drop policy if exists student_read_own_sessions on public.class_sessions;
create policy student_read_own_sessions on public.class_sessions
  for select to authenticated using (
    exists (select 1 from public.attendance a
             where a.session_id = class_sessions.id and a.student_id = public.current_student_id())
    or group_id = (select group_id from public.students where id = public.current_student_id())
  );

-- ---------------------------------------------------------------- cycles
drop policy if exists student_read_own_cycles on public.cycles;
create policy student_read_own_cycles on public.cycles
  for select to authenticated using (student_id = public.current_student_id());

-- --------------------------------------------------------------- charges
drop policy if exists student_read_own_charges on public.charges;
create policy student_read_own_charges on public.charges
  for select to authenticated using (student_id = public.current_student_id() and void_at is null);

-- -------------------------------------------------------------- payments
drop policy if exists student_read_own_payments on public.payments;
create policy student_read_own_payments on public.payments
  for select to authenticated using (student_id = public.current_student_id() and void_at is null);

-- -------------------------------------------------------------- المشاريع
drop policy if exists student_read_projects on public.projects;
create policy student_read_projects on public.projects
  for select to authenticated using (
    exists (select 1 from public.project_enrollments pe
             where pe.project_id = projects.id and pe.student_id = public.current_student_id()));

drop policy if exists student_read_questions on public.project_questions;
create policy student_read_questions on public.project_questions
  for select to authenticated using (
    exists (select 1 from public.project_enrollments pe
             where pe.project_id = project_questions.project_id and pe.student_id = public.current_student_id()));

drop policy if exists student_read_enrollment on public.project_enrollments;
create policy student_read_enrollment on public.project_enrollments
  for select to authenticated using (student_id = public.current_student_id());

drop policy if exists student_read_progress on public.student_project_progress;
create policy student_read_progress on public.student_project_progress
  for select to authenticated using (student_id = public.current_student_id());

-- --------------------------------------------------------------- الرسائل
drop policy if exists student_read_recipients on public.message_recipients;
create policy student_read_recipients on public.message_recipients
  for select to authenticated using (student_id = public.current_student_id());

drop policy if exists student_update_read_flag on public.message_recipients;
create policy student_update_read_flag on public.message_recipients
  for update to authenticated
  using (student_id = public.current_student_id())
  with check (student_id = public.current_student_id());

drop policy if exists student_read_messages on public.messages;
create policy student_read_messages on public.messages
  for select to authenticated using (
    exists (select 1 from public.message_recipients mr
             where mr.message_id = messages.id and mr.student_id = public.current_student_id()));

drop policy if exists student_read_message_files on public.message_files;
create policy student_read_message_files on public.message_files
  for select to authenticated using (
    exists (select 1 from public.message_recipients mr
             where mr.message_id = message_files.message_id and mr.student_id = public.current_student_id()));

drop policy if exists student_read_files on public.files;
create policy student_read_files on public.files
  for select to authenticated using (
    exists (select 1
              from public.message_files mf
              join public.message_recipients mr on mr.message_id = mf.message_id
             where mf.file_id = files.id and mr.student_id = public.current_student_id()));

-- ------------------------------------------------------------- الإشعارات
drop policy if exists student_read_notifications on public.notifications;
create policy student_read_notifications on public.notifications
  for select to authenticated using (student_id = public.current_student_id());

drop policy if exists student_mark_notification on public.notifications;
create policy student_mark_notification on public.notifications
  for update to authenticated
  using (student_id = public.current_student_id())
  with check (student_id = public.current_student_id());

-- ==================================================================
--  التخزين: حاوية خاصة للملفات
-- ==================================================================
insert into storage.buckets (id, name, public)
values ('files','files', false)
on conflict (id) do nothing;

insert into storage.buckets (id, name, public)
values ('branding','branding', true)
on conflict (id) do update set public = true;

drop policy if exists files_admin_all on storage.objects;
create policy files_admin_all on storage.objects
  for all to authenticated
  using (bucket_id in ('files','branding') and public.is_admin())
  with check (bucket_id in ('files','branding') and public.is_admin());

drop policy if exists files_student_read on storage.objects;
create policy files_student_read on storage.objects
  for select to authenticated
  using (
    bucket_id = 'files' and exists (
      select 1 from public.files f
      join public.message_files mf on mf.file_id = f.id
      join public.message_recipients mr on mr.message_id = mf.message_id
      where f.path = storage.objects.name
        and mr.student_id = public.current_student_id()));

drop policy if exists branding_public_read on storage.objects;
create policy branding_public_read on storage.objects
  for select to public using (bucket_id = 'branding');

-- ==================================================================
--  صلاحيات تنفيذ الدوال
-- ==================================================================
grant execute on function public.is_admin()                to authenticated;
grant execute on function public.current_student_id()      to authenticated;
grant execute on function public.student_balance(uuid)     to authenticated;
grant execute on function public.dashboard_stats()         to authenticated;
grant execute on function public.save_attendance(uuid, jsonb, boolean) to authenticated;
grant execute on function public.record_payment(uuid, numeric, public.payment_method, date, text, uuid, text) to authenticated;
grant execute on function public.void_payment(uuid, text)  to authenticated;
grant execute on function public.void_charge(uuid, text)   to authenticated;
grant execute on function public.add_bulk_charge(text, numeric, date, text, uuid[], uuid[], uuid[], boolean, uuid) to authenticated;
grant execute on function public.send_message(text, text, public.audience_type, uuid[], uuid[], uuid[], uuid[]) to authenticated;
grant execute on function public.recompute_student(uuid)   to authenticated;
grant execute on function public.next_student_code()       to authenticated;
