alter table acq.drive_accounts add column if not exists kb_folder_id text;
alter table acq.drive_accounts add column if not exists kb_folder_name text;
create table if not exists acq.knowledge_docs (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references acq.organizations(id) on delete cascade,
  drive_file_id text, storage_path text, file_name text, file_type text,
  summary text, extracted_text text, status text default 'processing', error text,
  created_at timestamptz default now(), updated_at timestamptz default now()
);
create index if not exists knowledge_docs_org on acq.knowledge_docs(org_id);
create unique index if not exists knowledge_docs_org_file on acq.knowledge_docs(org_id, drive_file_id);
