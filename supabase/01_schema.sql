-- =====================================================================
--  منصّة إدارة الدروس والطلاب — مخطط قاعدة البيانات
--  Supabase / PostgreSQL
--  الجزء 1: الامتدادات، الأنواع، الجداول
-- =====================================================================

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------- أنواع
do $$ begin
  create type public.app_role as enum ('admin','student');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.student_status as enum ('active','inactive');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.session_status as enum ('scheduled','done','postponed','cancelled');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.attendance_status as enum ('present','absent','late','excused');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.charge_kind as enum ('cycle','extra');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.charge_status as enum ('unpaid','partial','paid','void');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.payment_method as enum ('cash','bank','wallet','other');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.question_status as enum ('not_started','in_progress','completed','needs_revision');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.audience_type as enum ('student','group','year','all');
exception when duplicate_object then null; end $$;

-- ------------------------------------------------------------ الإعدادات
create table if not exists public.app_settings (
  id                        smallint primary key default 1 check (id = 1),
  app_name                  text        not null default 'منصّة المعلّم',
  short_name                text        not null default 'المعلّم',
  tagline                   text        default 'إدارة الدروس والطلاب',
  teacher_name              text        default '',
  teacher_phone             text        default '',
  teacher_email             text        default '',
  teacher_address           text        default '',
  logo_url                  text,
  icon_url                  text,
  avatar_url                text,
  primary_color             text        not null default '#2563eb',
  accent_color              text        not null default '#0d9488',
  theme_mode                text        not null default 'system',
  currency                  text        not null default 'EGP',
  currency_symbol           text        not null default 'ج.م',
  default_sessions_per_cycle integer    not null default 4 check (default_sessions_per_cycle between 1 and 60),
  absence_counts_in_cycle   boolean     not null default true,
  charge_on_cycle_start     boolean     not null default true,
  student_can_view_history  boolean     not null default false,
  student_can_view_attendance boolean   not null default true,
  student_can_view_files    boolean     not null default true,
  report_header             text        default '',
  report_footer             text        default '',
  updated_at                timestamptz not null default now()
);
insert into public.app_settings (id) values (1) on conflict (id) do nothing;

-- --------------------------------------------------------- السنوات الدراسية
create table if not exists public.academic_years (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  sort_order  integer not null default 0,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  unique (name)
);

-- ---------------------------------------------------------------- المجموعات
create table if not exists public.groups (
  id          uuid primary key default gen_random_uuid(),
  year_id     uuid not null references public.academic_years(id) on delete cascade,
  name        text not null,
  notes       text,
  created_at  timestamptz not null default now(),
  unique (year_id, name)
);
create index if not exists idx_groups_year on public.groups(year_id);

-- ------------------------------------------------------------------ المواد
create table if not exists public.subjects (
  id                 uuid primary key default gen_random_uuid(),
  year_id            uuid not null references public.academic_years(id) on delete cascade,
  name               text not null,
  price              numeric(12,2) not null default 0 check (price >= 0),
  sessions_per_cycle integer not null default 4 check (sessions_per_cycle between 1 and 60),
  color              text default '#2563eb',
  is_active          boolean not null default true,
  notes              text,
  created_at         timestamptz not null default now(),
  unique (year_id, name)
);
create index if not exists idx_subjects_year on public.subjects(year_id);

-- ----------------------------------------------------------------- الطلاب
create table if not exists public.students (
  id             uuid primary key default gen_random_uuid(),
  code           text not null unique,
  full_name      text not null,
  phone          text,
  guardian_phone text,
  year_id        uuid references public.academic_years(id) on delete set null,
  group_id       uuid references public.groups(id) on delete set null,
  status         public.student_status not null default 'active',
  enrolled_at    date not null default current_date,
  notes          text,
  auth_user_id   uuid unique references auth.users(id) on delete set null,
  has_account    boolean not null default false,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index if not exists idx_students_year   on public.students(year_id);
create index if not exists idx_students_group  on public.students(group_id);
create index if not exists idx_students_status on public.students(status);
create index if not exists idx_students_name   on public.students using gin (to_tsvector('simple', full_name));

-- --------------------------------------------------------- ملفات المستخدمين
create table if not exists public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  role        public.app_role not null default 'student',
  full_name   text,
  student_id  uuid unique references public.students(id) on delete cascade,
  created_at  timestamptz not null default now()
);

-- --------------------------------------------------------- ربط الطالب بالمواد
create table if not exists public.student_subjects (
  id             uuid primary key default gen_random_uuid(),
  student_id     uuid not null references public.students(id) on delete cascade,
  subject_id     uuid not null references public.subjects(id) on delete cascade,
  price_override numeric(12,2) check (price_override >= 0),
  is_active      boolean not null default true,
  started_at     date not null default current_date,
  created_at     timestamptz not null default now(),
  unique (student_id, subject_id)
);
create index if not exists idx_ss_student on public.student_subjects(student_id);
create index if not exists idx_ss_subject on public.student_subjects(subject_id);

-- ------------------------------------------------------------------ الحصص
create table if not exists public.class_sessions (
  id             uuid primary key default gen_random_uuid(),
  subject_id     uuid not null references public.subjects(id) on delete cascade,
  group_id       uuid references public.groups(id) on delete set null,
  session_date   date not null,
  start_time     time,
  end_time       time,
  location       text,
  status         public.session_status not null default 'scheduled',
  rescheduled_to date,
  reason         text,
  notes          text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index if not exists idx_sessions_date    on public.class_sessions(session_date);
create index if not exists idx_sessions_subject on public.class_sessions(subject_id);
create index if not exists idx_sessions_group   on public.class_sessions(group_id);

-- ------------------------------------------------------------ الحضور والغياب
create table if not exists public.attendance (
  id          uuid primary key default gen_random_uuid(),
  session_id  uuid not null references public.class_sessions(id) on delete cascade,
  student_id  uuid not null references public.students(id) on delete cascade,
  status      public.attendance_status not null default 'present',
  note        text,
  recorded_at timestamptz not null default now(),
  unique (session_id, student_id)
);
create index if not exists idx_att_student on public.attendance(student_id);
create index if not exists idx_att_session on public.attendance(session_id);

-- ------------------------------------------------------------ دورات الحصص
create table if not exists public.cycles (
  id               uuid primary key default gen_random_uuid(),
  student_id       uuid not null references public.students(id) on delete cascade,
  subject_id       uuid not null references public.subjects(id) on delete cascade,
  cycle_index      integer not null check (cycle_index >= 1),
  sessions_target  integer not null default 4,
  sessions_done    integer not null default 0,
  status           text not null default 'open' check (status in ('open','completed')),
  opened_at        date not null default current_date,
  completed_at     date,
  unique (student_id, subject_id, cycle_index)
);
create index if not exists idx_cycles_student on public.cycles(student_id);

-- --------------------------------------------------------------- المستحقات
create table if not exists public.charges (
  id          uuid primary key default gen_random_uuid(),
  student_id  uuid not null references public.students(id) on delete cascade,
  kind        public.charge_kind not null default 'extra',
  title       text not null,
  amount      numeric(12,2) not null check (amount >= 0),
  paid_amount numeric(12,2) not null default 0 check (paid_amount >= 0),
  subject_id  uuid references public.subjects(id) on delete set null,
  cycle_id    uuid references public.cycles(id) on delete set null,
  batch_id    uuid,
  due_date    date not null default current_date,
  status      public.charge_status not null default 'unpaid',
  notes       text,
  created_by  uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now(),
  void_at     timestamptz,
  void_reason text
);
create unique index if not exists uq_charges_cycle on public.charges(cycle_id) where cycle_id is not null;
create index if not exists idx_charges_student on public.charges(student_id);
create index if not exists idx_charges_status  on public.charges(status);
create index if not exists idx_charges_batch   on public.charges(batch_id);

-- --------------------------------------------------------------- المدفوعات
create table if not exists public.payments (
  id          uuid primary key default gen_random_uuid(),
  student_id  uuid not null references public.students(id) on delete cascade,
  amount      numeric(12,2) not null check (amount > 0),
  method      public.payment_method not null default 'cash',
  paid_at     date not null default current_date,
  reference   text,
  notes       text,
  created_by  uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now(),
  void_at     timestamptz,
  void_reason text
);
create index if not exists idx_payments_student on public.payments(student_id);
create index if not exists idx_payments_date    on public.payments(paid_at);

create table if not exists public.payment_allocations (
  id         uuid primary key default gen_random_uuid(),
  payment_id uuid not null references public.payments(id) on delete cascade,
  charge_id  uuid not null references public.charges(id) on delete cascade,
  amount     numeric(12,2) not null check (amount > 0),
  created_at timestamptz not null default now()
);
create index if not exists idx_alloc_payment on public.payment_allocations(payment_id);
create index if not exists idx_alloc_charge  on public.payment_allocations(charge_id);

-- ---------------------------------------------------------------- المشاريع
create table if not exists public.projects (
  id          uuid primary key default gen_random_uuid(),
  year_id     uuid references public.academic_years(id) on delete set null,
  title       text not null,
  description text,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now()
);

create table if not exists public.project_questions (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references public.projects(id) on delete cascade,
  idx         integer not null default 1,
  title       text not null,
  description text,
  created_at  timestamptz not null default now()
);
create index if not exists idx_pq_project on public.project_questions(project_id);

create table if not exists public.project_enrollments (
  id         uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (project_id, student_id)
);

create table if not exists public.student_project_progress (
  id           uuid primary key default gen_random_uuid(),
  student_id   uuid not null references public.students(id) on delete cascade,
  question_id  uuid not null references public.project_questions(id) on delete cascade,
  status       public.question_status not null default 'not_started',
  completed_at date,
  grade        numeric(5,2),
  notes        text,
  updated_at   timestamptz not null default now(),
  unique (student_id, question_id)
);
create index if not exists idx_spp_student on public.student_project_progress(student_id);

-- ----------------------------------------------------------------- الملفات
create table if not exists public.files (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  path        text not null unique,
  mime        text,
  size        bigint default 0,
  uploaded_by uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------- الرسائل
create table if not exists public.messages (
  id            uuid primary key default gen_random_uuid(),
  title         text not null,
  body          text,
  audience_type public.audience_type not null default 'all',
  created_by    uuid references auth.users(id) on delete set null,
  created_at    timestamptz not null default now()
);

create table if not exists public.message_targets (
  id          uuid primary key default gen_random_uuid(),
  message_id  uuid not null references public.messages(id) on delete cascade,
  target_type public.audience_type not null,
  target_id   uuid
);

create table if not exists public.message_recipients (
  id         uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.messages(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete cascade,
  read_at    timestamptz,
  unique (message_id, student_id)
);
create index if not exists idx_mr_student on public.message_recipients(student_id);

create table if not exists public.message_files (
  id         uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.messages(id) on delete cascade,
  file_id    uuid not null references public.files(id) on delete cascade,
  unique (message_id, file_id)
);

-- --------------------------------------------------------------- الإشعارات
create table if not exists public.notifications (
  id         uuid primary key default gen_random_uuid(),
  student_id uuid references public.students(id) on delete cascade,
  for_admin  boolean not null default false,
  type       text not null default 'info',
  title      text not null,
  body       text,
  link       text,
  read_at    timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists idx_notif_student on public.notifications(student_id, read_at);

-- ------------------------------------------------------------ سجل العمليات
create table if not exists public.audit_logs (
  id         bigserial primary key,
  actor_id   uuid,
  actor_name text,
  action     text not null,
  entity     text not null,
  entity_id  text,
  meta       jsonb,
  created_at timestamptz not null default now()
);
create index if not exists idx_audit_created on public.audit_logs(created_at desc);

-- ------------------------------------------------------- عدّاد أكواد الطلاب
create table if not exists public.code_counters (
  prefix     text primary key,
  last_value integer not null default 0
);
