-- =====================================================================
--  الجزء 2: الدوال والمُشغِّلات (Functions & Triggers)
-- =====================================================================

-- ------------------------------------------------------- دوال مساعدة للصلاحيات
create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $fn$
  select exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin');
$fn$;

create or replace function public.current_student_id()
returns uuid language sql stable security definer set search_path = public as $fn$
  select p.student_id from public.profiles p where p.id = auth.uid();
$fn$;

-- ------------------------------------- إنشاء ملف المستخدم تلقائيًا عند التسجيل
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $fn$
declare
  v_role public.app_role := 'student';
  v_student uuid;
  v_has_admin boolean;
begin
  select exists(select 1 from public.profiles where role = 'admin') into v_has_admin;

  if (new.raw_user_meta_data ->> 'role') = 'admin' then
    v_role := 'admin';
  elsif not v_has_admin then
    -- أول مستخدم في النظام يصبح المدير تلقائيًا
    v_role := 'admin';
  end if;

  begin
    v_student := nullif(new.raw_user_meta_data ->> 'student_id','')::uuid;
  exception when others then v_student := null; end;

  insert into public.profiles (id, role, full_name, student_id)
  values (new.id, v_role, coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email,'@',1)), v_student)
  on conflict (id) do update set role = excluded.role, student_id = coalesce(excluded.student_id, public.profiles.student_id);

  if v_student is not null then
    update public.students set auth_user_id = new.id, has_account = true where id = v_student;
  end if;

  return new;
end $fn$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

-- --------------------------------------------------- ترقية مستخدم إلى مدير
create or replace function public.make_admin(p_email text)
returns text language plpgsql security definer set search_path = public as $fn$
declare v_id uuid;
begin
  select id into v_id from auth.users where lower(email) = lower(p_email);
  if v_id is null then return 'لم يتم العثور على مستخدم بهذا البريد'; end if;
  insert into public.profiles (id, role, full_name) values (v_id, 'admin', p_email)
  on conflict (id) do update set role = 'admin', student_id = null;
  return 'تم ترقية ' || p_email || ' إلى مدير';
end $fn$;

-- ------------------------------------------------------ توليد كود طالب فريد
create or replace function public.next_student_code()
returns text language plpgsql security definer set search_path = public as $fn$
declare
  v_prefix text := 'ST-' || to_char(current_date,'YYYY');
  v_n integer;
  v_code text;
begin
  loop
    insert into public.code_counters(prefix, last_value) values (v_prefix, 1)
    on conflict (prefix) do update set last_value = public.code_counters.last_value + 1
    returning last_value into v_n;

    v_code := v_prefix || '-' || lpad(v_n::text, 3, '0');
    exit when not exists (select 1 from public.students where code = v_code);
  end loop;
  return v_code;
end $fn$;

create or replace function public.students_set_code()
returns trigger language plpgsql security definer set search_path = public as $fn$
begin
  if new.code is null or btrim(new.code) = '' then
    new.code := public.next_student_code();
  end if;
  new.updated_at := now();
  return new;
end $fn$;

drop trigger if exists trg_students_code on public.students;
create trigger trg_students_code before insert or update on public.students
for each row execute function public.students_set_code();

-- ------------------------------------------------ تحديث حالة المستحق تلقائيًا
create or replace function public.refresh_charge(p_charge uuid)
returns void language plpgsql security definer set search_path = public as $fn$
declare v_paid numeric(12,2); v_amount numeric(12,2); v_void timestamptz;
begin
  select amount, void_at into v_amount, v_void from public.charges where id = p_charge;
  if not found then return; end if;

  select coalesce(sum(pa.amount),0) into v_paid
  from public.payment_allocations pa
  join public.payments pm on pm.id = pa.payment_id and pm.void_at is null
  where pa.charge_id = p_charge;

  update public.charges
     set paid_amount = v_paid,
         status = case
                    when v_void is not null then 'void'::public.charge_status
                    when v_paid >= v_amount and v_amount > 0 then 'paid'::public.charge_status
                    when v_amount = 0 then 'paid'::public.charge_status
                    when v_paid > 0 then 'partial'::public.charge_status
                    else 'unpaid'::public.charge_status
                  end
   where id = p_charge;
end $fn$;

create or replace function public.trg_alloc_refresh()
returns trigger language plpgsql security definer set search_path = public as $fn$
begin
  if tg_op = 'DELETE' then
    perform public.refresh_charge(old.charge_id);
    return old;
  else
    perform public.refresh_charge(new.charge_id);
    if tg_op = 'UPDATE' and old.charge_id <> new.charge_id then
      perform public.refresh_charge(old.charge_id);
    end if;
    return new;
  end if;
end $fn$;

drop trigger if exists trg_allocations_refresh on public.payment_allocations;
create trigger trg_allocations_refresh
after insert or update or delete on public.payment_allocations
for each row execute function public.trg_alloc_refresh();

create or replace function public.trg_payment_void_refresh()
returns trigger language plpgsql security definer set search_path = public as $fn$
declare r record;
begin
  for r in select distinct charge_id from public.payment_allocations where payment_id = new.id loop
    perform public.refresh_charge(r.charge_id);
  end loop;
  return new;
end $fn$;

drop trigger if exists trg_payments_void on public.payments;
create trigger trg_payments_void after update of void_at on public.payments
for each row execute function public.trg_payment_void_refresh();

-- =====================================================================
--  نظام الدورات: يُحتسب فقط من الحصص المنفّذة فعليًا (status = 'done')
--  الحصص المؤجلة أو الملغاة من المدرّس لا تُحتسب على الطالب إطلاقًا.
-- =====================================================================
create or replace function public.recompute_cycles(p_student uuid, p_subject uuid)
returns void language plpgsql security definer set search_path = public as $fn$
declare
  v_target int; v_price numeric(12,2); v_counted int; v_started int; v_i int;
  v_absence boolean; v_on_start boolean; v_cycle uuid; v_done int; v_name text;
begin
  select absence_counts_in_cycle, charge_on_cycle_start
    into v_absence, v_on_start from public.app_settings where id = 1;

  select s.name, greatest(coalesce(s.sessions_per_cycle,4),1),
         coalesce(ss.price_override, s.price)
    into v_name, v_target, v_price
  from public.subjects s
  left join public.student_subjects ss
         on ss.subject_id = s.id and ss.student_id = p_student
  where s.id = p_subject;

  if v_target is null then return; end if;

  -- عدد الحصص المنفّذة والمحتسبة على هذا الطالب في هذه المادة
  select count(*) into v_counted
  from public.attendance a
  join public.class_sessions cs on cs.id = a.session_id
  where a.student_id = p_student
    and cs.subject_id = p_subject
    and cs.status = 'done'
    and ( a.status in ('present','late')
          or (v_absence and a.status = 'absent') );

  v_started := (v_counted / v_target) + 1;

  for v_i in 1 .. v_started loop
    v_done := least(greatest(v_counted - (v_i - 1) * v_target, 0), v_target);

    insert into public.cycles
      (student_id, subject_id, cycle_index, sessions_target, sessions_done, status, opened_at, completed_at)
    values
      (p_student, p_subject, v_i, v_target, v_done,
       case when v_done >= v_target then 'completed' else 'open' end,
       current_date,
       case when v_done >= v_target then current_date else null end)
    on conflict (student_id, subject_id, cycle_index) do update
      set sessions_done   = excluded.sessions_done,
          sessions_target = excluded.sessions_target,
          status          = excluded.status,
          completed_at    = case when excluded.status = 'completed'
                                 then coalesce(public.cycles.completed_at, current_date)
                                 else null end
    returning id into v_cycle;

    -- إنشاء المستحق المالي للدورة
    if v_on_start or v_done >= v_target then
      insert into public.charges (student_id, kind, title, amount, subject_id, cycle_id, due_date)
      values (p_student, 'cycle', v_name || ' — دورة ' || v_i, v_price, p_subject, v_cycle, current_date)
      on conflict (cycle_id) where cycle_id is not null do nothing;
    end if;
  end loop;
end $fn$;

create or replace function public.recompute_student(p_student uuid)
returns void language plpgsql security definer set search_path = public as $fn$
declare r record;
begin
  for r in select subject_id from public.student_subjects where student_id = p_student and is_active loop
    perform public.recompute_cycles(p_student, r.subject_id);
  end loop;
end $fn$;

create or replace function public.recompute_session(p_session uuid)
returns void language plpgsql security definer set search_path = public as $fn$
declare v_subject uuid; r record;
begin
  select subject_id into v_subject from public.class_sessions where id = p_session;
  if v_subject is null then return; end if;
  for r in select distinct student_id from public.attendance where session_id = p_session loop
    perform public.recompute_cycles(r.student_id, v_subject);
  end loop;
end $fn$;

-- إعادة الحساب عند تغيّر حالة الحصة (تنفيذ / تأجيل / إلغاء)
create or replace function public.trg_session_status()
returns trigger language plpgsql security definer set search_path = public as $fn$
begin
  new.updated_at := now();
  return new;
end $fn$;

drop trigger if exists trg_sessions_touch on public.class_sessions;
create trigger trg_sessions_touch before update on public.class_sessions
for each row execute function public.trg_session_status();

create or replace function public.trg_session_after()
returns trigger language plpgsql security definer set search_path = public as $fn$
begin
  if old.status is distinct from new.status then
    perform public.recompute_session(new.id);
  end if;
  return new;
end $fn$;

drop trigger if exists trg_sessions_after on public.class_sessions;
create trigger trg_sessions_after after update on public.class_sessions
for each row execute function public.trg_session_after();

-- فتح الدورة الأولى فور تسجيل الطالب في مادة
create or replace function public.trg_student_subject_after()
returns trigger language plpgsql security definer set search_path = public as $fn$
begin
  perform public.recompute_cycles(new.student_id, new.subject_id);
  return new;
end $fn$;

drop trigger if exists trg_ss_after on public.student_subjects;
create trigger trg_ss_after after insert on public.student_subjects
for each row execute function public.trg_student_subject_after();

-- =====================================================================
--  حفظ الحضور دفعة واحدة + تنفيذ الحصة
-- =====================================================================
create or replace function public.save_attendance(p_session uuid, p_records jsonb, p_mark_done boolean default true)
returns void language plpgsql security definer set search_path = public as $fn$
declare r jsonb;
begin
  if not public.is_admin() then raise exception 'غير مصرّح'; end if;

  for r in select * from jsonb_array_elements(p_records) loop
    insert into public.attendance (session_id, student_id, status, note)
    values (p_session,
            (r->>'student_id')::uuid,
            coalesce((r->>'status'),'present')::public.attendance_status,
            r->>'note')
    on conflict (session_id, student_id) do update
      set status = excluded.status, note = excluded.note, recorded_at = now();
  end loop;

  if p_mark_done then
    update public.class_sessions set status = 'done' where id = p_session and status <> 'done';
  end if;

  perform public.recompute_session(p_session);

  insert into public.audit_logs (actor_id, action, entity, entity_id, meta)
  values (auth.uid(), 'save_attendance', 'class_sessions', p_session::text,
          jsonb_build_object('count', jsonb_array_length(p_records)));
end $fn$;

-- =====================================================================
--  تسجيل دفعة مع توزيعها تلقائيًا على المستحقات (الأقدم أولًا)
-- =====================================================================
create or replace function public.record_payment(
  p_student uuid,
  p_amount  numeric,
  p_method  public.payment_method default 'cash',
  p_paid_at date default current_date,
  p_notes   text default null,
  p_charge  uuid default null,
  p_reference text default null
) returns uuid language plpgsql security definer set search_path = public as $fn$
declare
  v_payment uuid; v_left numeric(12,2) := p_amount; v_take numeric(12,2); r record;
begin
  if not public.is_admin() then raise exception 'غير مصرّح'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'المبلغ يجب أن يكون أكبر من صفر'; end if;

  insert into public.payments (student_id, amount, method, paid_at, notes, reference, created_by)
  values (p_student, p_amount, coalesce(p_method,'cash'), coalesce(p_paid_at, current_date), p_notes, p_reference, auth.uid())
  returning id into v_payment;

  -- أولوية للمستحق المحدد
  if p_charge is not null then
    select id, (amount - paid_amount) as remaining into r
    from public.charges where id = p_charge and void_at is null and student_id = p_student;
    if found and r.remaining > 0 then
      v_take := least(v_left, r.remaining);
      insert into public.payment_allocations (payment_id, charge_id, amount) values (v_payment, r.id, v_take);
      v_left := v_left - v_take;
    end if;
  end if;

  -- ثم الأقدم فالأحدث
  for r in
    select id, (amount - paid_amount) as remaining
    from public.charges
    where student_id = p_student and void_at is null and (amount - paid_amount) > 0
      and (p_charge is null or id <> p_charge)
    order by due_date asc, created_at asc
  loop
    exit when v_left <= 0;
    v_take := least(v_left, r.remaining);
    if v_take > 0 then
      insert into public.payment_allocations (payment_id, charge_id, amount) values (v_payment, r.id, v_take);
      v_left := v_left - v_take;
    end if;
  end loop;

  insert into public.audit_logs (actor_id, action, entity, entity_id, meta)
  values (auth.uid(), 'record_payment', 'payments', v_payment::text,
          jsonb_build_object('student', p_student, 'amount', p_amount, 'unallocated', v_left));

  return v_payment;
end $fn$;

create or replace function public.void_payment(p_payment uuid, p_reason text)
returns void language plpgsql security definer set search_path = public as $fn$
begin
  if not public.is_admin() then raise exception 'غير مصرّح'; end if;
  update public.payments set void_at = now(), void_reason = p_reason where id = p_payment;
  delete from public.payment_allocations where payment_id = p_payment;
  insert into public.audit_logs (actor_id, action, entity, entity_id, meta)
  values (auth.uid(), 'void_payment', 'payments', p_payment::text, jsonb_build_object('reason', p_reason));
end $fn$;

create or replace function public.void_charge(p_charge uuid, p_reason text)
returns void language plpgsql security definer set search_path = public as $fn$
begin
  if not public.is_admin() then raise exception 'غير مصرّح'; end if;
  delete from public.payment_allocations where charge_id = p_charge;
  update public.charges set void_at = now(), void_reason = p_reason, status = 'void' where id = p_charge;
  insert into public.audit_logs (actor_id, action, entity, entity_id, meta)
  values (auth.uid(), 'void_charge', 'charges', p_charge::text, jsonb_build_object('reason', p_reason));
end $fn$;

-- =====================================================================
--  إضافة بند مالي لمجموعة/سنة/الجميع دفعة واحدة
-- =====================================================================
create or replace function public.add_bulk_charge(
  p_title text,
  p_amount numeric,
  p_due date default current_date,
  p_notes text default null,
  p_student_ids uuid[] default '{}',
  p_group_ids uuid[] default '{}',
  p_year_ids uuid[] default '{}',
  p_all boolean default false,
  p_project_id uuid default null
) returns jsonb language plpgsql security definer set search_path = public as $fn$
declare v_batch uuid := gen_random_uuid(); v_count int := 0;
begin
  if not public.is_admin() then raise exception 'غير مصرّح'; end if;

  with target as (
    select id from public.students
    where status = 'active' and (
        p_all
        or id = any(coalesce(p_student_ids,'{}'))
        or group_id = any(coalesce(p_group_ids,'{}'))
        or year_id  = any(coalesce(p_year_ids,'{}'))
        or (p_project_id is not null and id in (select student_id from public.project_enrollments where project_id = p_project_id))
      )
  ), ins as (
    insert into public.charges (student_id, kind, title, amount, due_date, notes, batch_id, created_by)
    select id, 'extra', p_title, p_amount, coalesce(p_due, current_date), p_notes, v_batch, auth.uid() from target
    returning student_id
  )
  select count(*) into v_count from ins;

  insert into public.notifications (student_id, type, title, body)
  select student_id, 'finance', 'مطالبة مالية جديدة', p_title || ' — ' || p_amount::text
  from public.charges where batch_id = v_batch;

  insert into public.audit_logs (actor_id, action, entity, entity_id, meta)
  values (auth.uid(), 'add_bulk_charge', 'charges', v_batch::text,
          jsonb_build_object('title', p_title, 'amount', p_amount, 'count', v_count));

  return jsonb_build_object('batch_id', v_batch, 'count', v_count);
end $fn$;

-- =====================================================================
--  إرسال رسالة إلى جهة مستهدفة
-- =====================================================================
create or replace function public.send_message(
  p_title text,
  p_body text,
  p_audience_type public.audience_type,
  p_student_ids uuid[] default '{}',
  p_group_ids uuid[] default '{}',
  p_year_ids uuid[] default '{}',
  p_file_ids uuid[] default '{}'
) returns uuid language plpgsql security definer set search_path = public as $fn$
declare v_msg uuid; v_count int;
begin
  if not public.is_admin() then raise exception 'غير مصرّح'; end if;

  insert into public.messages (title, body, audience_type, created_by)
  values (p_title, p_body, p_audience_type, auth.uid()) returning id into v_msg;

  insert into public.message_targets (message_id, target_type, target_id)
  select v_msg, 'student'::public.audience_type, unnest(coalesce(p_student_ids,'{}'::uuid[]))
  union all
  select v_msg, 'group'::public.audience_type, unnest(coalesce(p_group_ids,'{}'::uuid[]))
  union all
  select v_msg, 'year'::public.audience_type, unnest(coalesce(p_year_ids,'{}'::uuid[]));

  insert into public.message_files (message_id, file_id)
  select v_msg, unnest(coalesce(p_file_ids,'{}'::uuid[])) on conflict do nothing;

  insert into public.message_recipients (message_id, student_id)
  select v_msg, s.id from public.students s
  where s.status = 'active' and (
      p_audience_type = 'all'
      or s.id = any(coalesce(p_student_ids,'{}'))
      or s.group_id = any(coalesce(p_group_ids,'{}'))
      or s.year_id  = any(coalesce(p_year_ids,'{}'))
    )
  on conflict do nothing;

  get diagnostics v_count = row_count;

  insert into public.notifications (student_id, type, title, body, link)
  select student_id, 'message', 'رسالة جديدة', p_title, '/portal/messages'
  from public.message_recipients where message_id = v_msg;

  insert into public.audit_logs (actor_id, action, entity, entity_id, meta)
  values (auth.uid(), 'send_message', 'messages', v_msg::text, jsonb_build_object('recipients', v_count));

  return v_msg;
end $fn$;

-- =====================================================================
--  ملخص مالي سريع للطالب
-- =====================================================================
create or replace function public.student_balance(p_student uuid)
returns table (total_due numeric, total_paid numeric, outstanding numeric)
language sql stable security definer set search_path = public as $fn$
  select
    coalesce((select sum(amount) from public.charges where student_id = p_student and void_at is null),0) as total_due,
    coalesce((select sum(paid_amount) from public.charges where student_id = p_student and void_at is null),0) as total_paid,
    coalesce((select sum(amount - paid_amount) from public.charges where student_id = p_student and void_at is null),0) as outstanding;
$fn$;

-- إحصائيات لوحة المعلومات
create or replace function public.dashboard_stats()
returns jsonb language plpgsql stable security definer set search_path = public as $fn$
declare v jsonb;
begin
  if not public.is_admin() then raise exception 'غير مصرّح'; end if;
  select jsonb_build_object(
    'students_total',   (select count(*) from public.students),
    'students_active',  (select count(*) from public.students where status='active'),
    'students_debt',    (select count(distinct student_id) from public.charges where void_at is null and amount > paid_amount),
    'students_clear',   (select count(*) from public.students s where s.status='active'
                          and not exists (select 1 from public.charges c where c.student_id=s.id and c.void_at is null and c.amount>c.paid_amount)),
    'total_due',        (select coalesce(sum(amount),0) from public.charges where void_at is null),
    'total_paid',       (select coalesce(sum(paid_amount),0) from public.charges where void_at is null),
    'outstanding',      (select coalesce(sum(amount-paid_amount),0) from public.charges where void_at is null),
    'paid_this_month',  (select coalesce(sum(amount),0) from public.payments where void_at is null and paid_at >= date_trunc('month', current_date)),
    'paid_this_year',   (select coalesce(sum(amount),0) from public.payments where void_at is null and paid_at >= date_trunc('year', current_date)),
    'sessions_today',   (select count(*) from public.class_sessions where session_date = current_date),
    'sessions_week',    (select count(*) from public.class_sessions where session_date between current_date and current_date + 6),
    'by_year',          (select coalesce(jsonb_agg(x),'[]'::jsonb) from (
                            select y.id, y.name,
                                   coalesce(sum(c.paid_amount),0) as paid,
                                   coalesce(sum(c.amount - c.paid_amount),0) as outstanding,
                                   (select count(*) from public.students s2 where s2.year_id=y.id) as students
                            from public.academic_years y
                            left join public.students s on s.year_id = y.id
                            left join public.charges c on c.student_id = s.id and c.void_at is null
                            group by y.id, y.name, y.sort_order order by y.sort_order
                         ) x)
  ) into v;
  return v;
end $fn$;
