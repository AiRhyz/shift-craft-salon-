-- shift-craft-salon Supabase スキーマ（v2 永続化用）
-- マルチテナント（store_id 分離）を初期から組み込む（要件 4. 拡張性）

create table if not exists stores (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  config jsonb not null default '{}',        -- PlanConfig 全体（営業時間・パターン・必要人数等）
  created_at timestamptz not null default now()
);

create table if not exists staff (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references stores(id) on delete cascade,
  name text not null,
  rank text not null,
  skills text[] not null default '{}',
  max_hours_month numeric not null default 160,
  max_hours_week numeric not null default 40,
  off_days_required int not null default 8,
  hourly_wage numeric not null default 0,
  avail_patterns text[],                      -- null = 全パターン可
  unavailable_weekdays int[] not null default '{}',
  auth_user_id uuid,                          -- Supabase Auth 連携（スタッフ本人ログイン用）
  created_at timestamptz not null default now()
);

create table if not exists wish_requests (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references stores(id) on delete cascade,
  staff_id uuid not null references staff(id) on delete cascade,
  date date not null,
  kind text not null check (kind in ('off', 'work')),  -- 休み希望 / 勤務希望
  pattern_id text,                                      -- kind='work' のとき
  created_at timestamptz not null default now(),
  unique (staff_id, date, kind, pattern_id)
);

create table if not exists schedules (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references stores(id) on delete cascade,
  month text not null,                        -- "2026-08"
  data jsonb not null,                        -- Schedule（solver 出力＋手動調整後）
  status text not null default 'draft' check (status in ('draft', 'confirmed')),
  confirmed_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists swap_requests (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references stores(id) on delete cascade,
  schedule_id uuid references schedules(id) on delete cascade,
  from_staff uuid not null references staff(id),
  to_staff uuid not null references staff(id),
  date date not null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  created_at timestamptz not null default now()
);

-- 相性マトリクス（センシティブ情報: RLS で管理者のみアクセス — 要件 2.）
create table if not exists pair_settings (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references stores(id) on delete cascade,
  staff_a uuid not null references staff(id) on delete cascade,
  staff_b uuid not null references staff(id) on delete cascade,
  kind text not null check (kind in ('ng_soft', 'ng_hard', 'caution', 'recommend')),
  note text,                                  -- 理由メモ（管理者のみ）
  created_at timestamptz not null default now()
);

-- Row Level Security（店舗分離・相性は管理者のみ）
alter table stores enable row level security;
alter table staff enable row level security;
alter table wish_requests enable row level security;
alter table schedules enable row level security;
alter table swap_requests enable row level security;
alter table pair_settings enable row level security;

-- ポリシー例（Auth 導入時に店舗メンバーシップに合わせて調整すること）
-- create policy "store members read" on schedules for select using (auth.uid() in (...));
