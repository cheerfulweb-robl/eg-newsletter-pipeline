-- 20270106_ask_wg_admin_inbox.sql
-- Admin inbox for Ask WG: saves chat conversations + links leads for review, reply, archive, and delete.
-- Safe to re-run.
begin;

create table if not exists public.discovery_conversations (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  session_key text unique not null,
  intent text,
  community text,
  source_page text,
  messages jsonb not null default '[]'::jsonb,
  lead_id uuid references public.discovery_leads(id) on delete set null,
  status text not null default 'open' check (status in ('open', 'replied', 'archived')),
  admin_notes text,
  replied_at timestamptz
);

alter table public.discovery_conversations enable row level security;
revoke all on public.discovery_conversations from anon;

drop policy if exists "discovery_conversations_admin_all" on public.discovery_conversations;
create policy "discovery_conversations_admin_all"
  on public.discovery_conversations
  for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop trigger if exists trg_discovery_conversations_block_viewer on public.discovery_conversations;
create trigger trg_discovery_conversations_block_viewer
  before insert or update or delete on public.discovery_conversations
  for each row execute function public.wg_block_viewer_writes();

create index if not exists idx_discovery_conversations_status_updated
  on public.discovery_conversations (status, updated_at desc);

-- Link discovery_leads to discovery_conversations and store admin reply history
alter table public.discovery_leads
  add column if not exists conversation_id uuid references public.discovery_conversations(id) on delete set null,
  add column if not exists admin_reply text,
  add column if not exists replied_at timestamptz,
  add column if not exists replied_by text;

alter table public.discovery_leads drop constraint if exists discovery_leads_status_check;
alter table public.discovery_leads
  add constraint discovery_leads_status_check
  check (status in ('new', 'replied', 'contacted', 'archived'));

commit;
