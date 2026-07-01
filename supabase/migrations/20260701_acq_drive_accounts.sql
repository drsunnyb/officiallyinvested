create table if not exists acq.drive_accounts (
  org_id uuid primary key references acq.organizations(id) on delete cascade,
  user_id uuid,
  google_email text,
  refresh_token text,
  access_token text,
  token_expires_at timestamptz,
  root_folder_id text,
  root_folder_name text,
  scope text,
  status text default 'connected',
  last_synced_at timestamptz,
  last_error text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
alter table acq.deals add column if not exists drive_folder_id text;
