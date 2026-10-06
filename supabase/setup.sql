begin;
create extension if not exists pgcrypto;
create table public.profiles (
 id uuid primary key references auth.users(id) on delete cascade,
 email text not null, full_name text not null,
 role text not null default 'pending' check(role in ('admin','reporter','trainer','groundstaff','pending')),
 created_at timestamptz not null default now()
);
create table public.sectors(id uuid primary key default gen_random_uuid(), name text unique not null, location text not null default '', active boolean not null default true);
create table public.facilities(id uuid primary key default gen_random_uuid(), sector_id uuid not null references public.sectors(id), name text not null, type text not null check(type in ('Washroom','Kitchen','Other')), active boolean not null default true, unique(sector_id,name));
create table public.issue_options(id uuid primary key default gen_random_uuid(), facility_type text not null check(facility_type in ('Washroom','Kitchen','Other')), label text not null, unique(facility_type,label));
create table public.notification_routes(id uuid primary key default gen_random_uuid(), sector_id uuid references public.sectors(id), email text not null check(email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'), unique nulls not distinct(sector_id,email));
create sequence public.ticket_number_seq;
create table public.tickets (
 id uuid primary key, ticket_number text unique not null,
 sector_id uuid not null references public.sectors(id), facility_id uuid not null references public.facilities(id),
 issue text not null check(length(issue) between 1 and 200), comments text not null default '' check(length(comments)<=5000),
 priority text not null check(priority in ('Low','Normal','High','Urgent')),
 status text not null default 'Open' check(status in ('Open','Under Review','Assigned','Awaiting Verification','Closed')),
 reporter_id uuid not null references public.profiles(id), trainer_id uuid references public.profiles(id), assignee_id uuid references public.profiles(id),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(), closed_at timestamptz,
 version integer not null default 1
);
create table public.ticket_history(id uuid primary key default gen_random_uuid(), ticket_id uuid not null references public.tickets(id), actor_id uuid not null references public.profiles(id), action text not null, note text not null default '', created_at timestamptz not null default now());
create table public.attachments(id uuid primary key default gen_random_uuid(), ticket_id uuid not null references public.tickets(id), uploaded_by uuid not null references public.profiles(id), path text unique not null, stage text not null check(stage in ('Report','Inspection','Completion')), created_at timestamptz not null default now());
create table public.training_reports (
 id uuid primary key default gen_random_uuid(), ticket_id uuid references public.tickets(id), sector_id uuid not null references public.sectors(id), trainer_id uuid not null references public.profiles(id),
 report_date date not null, site_details text not null default '', topics text[] not null check(cardinality(topics)>0), other_topic text not null default '',
 observations jsonb not null default '{}', team_size integer not null check(team_size between 1 and 1000), attendance text not null check(length(attendance) between 1 and 10000),
 feedback_score integer not null check(feedback_score between 0 and 10), feedback_name text not null default '', feedback_contact text not null default '', notes text not null default '', created_at timestamptz not null default now()
);
create table public.notification_outbox(id uuid primary key default gen_random_uuid(), ticket_id uuid not null references public.tickets(id), event text not null, status text not null default 'pending' check(status in ('pending','processing','sent','failed')), attempts integer not null default 0, last_error text, created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create index on public.tickets(created_at);
create index on public.tickets(status);
create index on public.attachments(ticket_id);
create index on public.ticket_history(ticket_id);
create index on public.notification_outbox(ticket_id);

create function public.app_role() returns text language sql stable security definer set search_path = '' as $$ select role from public.profiles where id = auth.uid() $$;
create function public.is_member() returns boolean language sql stable security definer set search_path = '' as $$ select coalesce(public.app_role() in ('admin','reporter','trainer','groundstaff'),false) $$;
create function public.can_read_ticket(tid uuid) returns boolean language sql stable security definer set search_path = '' as $$
 select exists(select 1 from public.tickets t where t.id=tid and public.is_member() and (public.app_role() in ('admin','trainer') or t.reporter_id=auth.uid() or t.assignee_id=auth.uid()))
$$;
create function public.can_work_ticket(tid uuid) returns boolean language sql stable security definer set search_path = '' as $$
 select exists(select 1 from public.tickets t where t.id=tid and public.is_member() and t.status<>'Closed' and (public.app_role()='admin' or (public.app_role()='trainer' and t.trainer_id=auth.uid()) or (public.app_role()='groundstaff' and t.assignee_id=auth.uid()) or t.reporter_id=auth.uid()))
$$;
create function public.handle_new_user() returns trigger language plpgsql security definer set search_path = '' as $$
begin
 insert into public.profiles(id,email,full_name,role) values(new.id,coalesce(new.email,''),coalesce(nullif(new.raw_user_meta_data->>'full_name',''),split_part(coalesce(new.email,'User'),'@',1)),case when lower(new.email)='sushantkumar1995@gmail.com' then 'admin' else 'pending' end);
 return new;
end $$;
create trigger shrine_new_user after insert on auth.users for each row execute function public.handle_new_user();
insert into public.profiles(id,email,full_name,role) select id,coalesce(email,''),coalesce(nullif(raw_user_meta_data->>'full_name',''),split_part(coalesce(email,'User'),'@',1)),case when lower(email)='sushantkumar1995@gmail.com' then 'admin' else 'pending' end from auth.users;

create function public.create_ticket(p_id uuid,p_facility uuid,p_issue text,p_comments text,p_priority text) returns public.tickets language plpgsql security definer set search_path = '' as $$
declare f public.facilities; t public.tickets;
begin
 if public.app_role() not in ('admin','reporter','trainer') or auth.uid() is null then raise exception 'Only reporters, trainers and admins may create tickets'; end if;
 select * into t from public.tickets where id=p_id;
 if found then
  if t.reporter_id<>auth.uid() then raise exception 'Ticket identifier already in use'; end if;
  return t;
 end if;
 select * into f from public.facilities where id=p_facility and active and exists(select 1 from public.sectors where id=sector_id and active);
 if not found then raise exception 'Select an active facility'; end if;
 if not exists(select 1 from public.issue_options where facility_type=f.type and label=p_issue) then raise exception 'Invalid issue option'; end if;
 insert into public.tickets(id,ticket_number,sector_id,facility_id,issue,comments,priority,reporter_id) values(p_id,'TKT-'||to_char(now() at time zone 'Asia/Kolkata','YYYYMMDD')||'-'||lpad(nextval('public.ticket_number_seq')::text,6,'0'),f.sector_id,f.id,p_issue,coalesce(p_comments,''),p_priority,auth.uid()) returning * into t;
 insert into public.ticket_history(ticket_id,actor_id,action,note) values(t.id,auth.uid(),'Created',p_comments);
 insert into public.notification_outbox(ticket_id,event) values(t.id,'Ticket created');
 return t;
end $$;
create function public.transition_ticket(p_id uuid,p_version integer,p_action text,p_note text,p_assignee uuid default null) returns public.tickets language plpgsql security definer set search_path = '' as $$
declare t public.tickets; r text := public.app_role(); new_status text;
begin
 if not public.can_read_ticket(p_id) then raise exception 'Access denied'; end if;
 select * into t from public.tickets where id=p_id for update;
 if t.version<>p_version then raise exception 'Ticket changed. Refresh before trying again.'; end if;
 if t.status='Closed' then raise exception 'Ticket is closed'; end if;
 if length(trim(coalesce(p_note,'')))=0 or length(p_note)>5000 then raise exception 'Add an action comment (maximum 5000 characters)'; end if;
 if p_action='Claim' then
  if r not in ('admin','trainer') or t.status<>'Open' then raise exception 'Only a trainer may claim an open ticket'; end if;
  t.trainer_id:=auth.uid(); new_status:='Under Review';
 elsif p_action in ('Assign','Close','Return') then
  if r not in ('admin','trainer') or (r='trainer' and t.trainer_id is distinct from auth.uid()) then raise exception 'Only the assigned trainer may perform this action'; end if;
  if p_action='Assign' then
   if t.status not in ('Under Review','Assigned') then raise exception 'Inspect the ticket before assigning'; end if;
   if not exists(select 1 from public.profiles where id=p_assignee and role='groundstaff') then raise exception 'Select groundstaff'; end if;
   t.assignee_id:=p_assignee; new_status:='Assigned';
  elsif p_action='Return' then
   if t.status<>'Awaiting Verification' or t.assignee_id is null then raise exception 'Only completed work can be returned'; end if;
   new_status:='Assigned';
  else
   if t.status not in ('Under Review','Awaiting Verification') then raise exception 'Inspect or verify before closing'; end if;
   new_status:='Closed';
  end if;
 elsif p_action='Complete' then
  if t.status<>'Assigned' or not (r='admin' or (r='groundstaff' and t.assignee_id=auth.uid())) then raise exception 'Only assigned groundstaff may complete work'; end if;
  new_status:='Awaiting Verification';
 else raise exception 'Invalid action'; end if;
 update public.tickets set status=new_status,trainer_id=t.trainer_id,assignee_id=t.assignee_id,version=version+1,updated_at=now(),closed_at=case when new_status='Closed' then now() else null end where id=p_id returning * into t;
 insert into public.ticket_history(ticket_id,actor_id,action,note) values(p_id,auth.uid(),p_action,p_note);
 insert into public.notification_outbox(ticket_id,event) values(p_id,p_action||' — '||new_status);
 return t;
end $$;
create function public.add_ticket_comment(p_id uuid,p_note text) returns void language plpgsql security definer set search_path = '' as $$
begin
 if not public.can_work_ticket(p_id) then raise exception 'Access denied or ticket closed'; end if;
 if length(trim(coalesce(p_note,'')))=0 or length(p_note)>5000 then raise exception 'Enter a comment (maximum 5000 characters)'; end if;
 insert into public.ticket_history(ticket_id,actor_id,action,note) values(p_id,auth.uid(),'Comment',p_note);
end $$;
create function public.set_user_role(p_id uuid,p_role text,p_name text) returns void language plpgsql security definer set search_path = '' as $$
begin
 if public.app_role()<>'admin' or public.app_role() is null then raise exception 'Admin access required'; end if;
 if p_id=auth.uid() and p_role<>'admin' then raise exception 'You cannot remove your own admin role'; end if;
 if p_role not in ('admin','trainer','reporter','groundstaff','pending') then raise exception 'Invalid role'; end if;
 if length(trim(p_name))=0 then raise exception 'Name required'; end if;
 update public.profiles set role=p_role,full_name=p_name where id=p_id;
end $$;

alter table public.profiles enable row level security;
alter table public.sectors enable row level security;
alter table public.facilities enable row level security;
alter table public.issue_options enable row level security;
alter table public.notification_routes enable row level security;
alter table public.tickets enable row level security;
alter table public.ticket_history enable row level security;
alter table public.attachments enable row level security;
alter table public.training_reports enable row level security;
alter table public.notification_outbox enable row level security;
create policy profiles_read on public.profiles for select to authenticated using(id=auth.uid() or public.is_member());
create policy sectors_read on public.sectors for select to authenticated using(public.is_member());
create policy sectors_admin on public.sectors for all to authenticated using(public.app_role()='admin') with check(public.app_role()='admin');
create policy facilities_read on public.facilities for select to authenticated using(public.is_member());
create policy facilities_admin on public.facilities for all to authenticated using(public.app_role()='admin') with check(public.app_role()='admin');
create policy issues_read on public.issue_options for select to authenticated using(public.is_member());
create policy issues_admin on public.issue_options for all to authenticated using(public.app_role()='admin') with check(public.app_role()='admin');
create policy routes_admin on public.notification_routes for all to authenticated using(public.app_role()='admin') with check(public.app_role()='admin');
create policy tickets_read on public.tickets for select to authenticated using(public.can_read_ticket(id));
create policy history_read on public.ticket_history for select to authenticated using(public.can_read_ticket(ticket_id));
create policy attachments_read on public.attachments for select to authenticated using(public.can_read_ticket(ticket_id));
create policy attachments_insert on public.attachments for insert to authenticated with check(uploaded_by=auth.uid() and public.can_work_ticket(ticket_id) and path like auth.uid()::text||'/'||ticket_id::text||'/%' and exists(select 1 from storage.objects where bucket_id='ticket-photos' and name=path));
create policy training_read on public.training_reports for select to authenticated using(public.app_role() in ('admin','trainer'));
create policy training_insert on public.training_reports for insert to authenticated with check(public.app_role() in ('admin','trainer') and trainer_id=auth.uid() and (ticket_id is null or public.can_read_ticket(ticket_id)));
create policy outbox_read on public.notification_outbox for select to authenticated using(public.can_read_ticket(ticket_id));

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('ticket-photos','ticket-photos',false,1048576,array['image/jpeg','image/png']);
create policy photos_upload on storage.objects for insert to authenticated with check(bucket_id='ticket-photos' and (storage.foldername(name))[1]=auth.uid()::text and public.can_work_ticket(((storage.foldername(name))[2])::uuid));
create policy photos_read on storage.objects for select to authenticated using(bucket_id='ticket-photos' and (((storage.foldername(name))[1]=auth.uid()::text and public.can_read_ticket(((storage.foldername(name))[2])::uuid)) or exists(select 1 from public.attachments a where a.path=name and public.can_read_ticket(a.ticket_id))));
create policy photos_cleanup on storage.objects for delete to authenticated using(bucket_id='ticket-photos' and (storage.foldername(name))[1]=auth.uid()::text and not exists(select 1 from public.attachments where path=name));

revoke all on public.profiles,public.tickets,public.ticket_history,public.attachments,public.training_reports,public.notification_outbox,public.sectors,public.facilities,public.issue_options,public.notification_routes from anon,authenticated;
grant select on public.profiles,public.tickets,public.ticket_history,public.attachments,public.training_reports,public.notification_outbox to authenticated;
grant insert on public.attachments,public.training_reports to authenticated;
grant select,insert,update,delete on public.sectors,public.facilities,public.issue_options,public.notification_routes to authenticated;
grant all on public.profiles,public.tickets,public.ticket_history,public.attachments,public.training_reports,public.notification_outbox,public.sectors,public.facilities,public.issue_options,public.notification_routes to service_role;
revoke all on function public.handle_new_user() from public;
revoke all on function public.create_ticket(uuid,uuid,text,text,text),public.transition_ticket(uuid,integer,text,text,uuid),public.add_ticket_comment(uuid,text),public.set_user_role(uuid,text,text),public.app_role(),public.is_member(),public.can_read_ticket(uuid),public.can_work_ticket(uuid) from public;
grant execute on function public.create_ticket(uuid,uuid,text,text,text),public.transition_ticket(uuid,integer,text,text,uuid),public.add_ticket_comment(uuid,text),public.set_user_role(uuid,text,text),public.app_role(),public.is_member(),public.can_read_ticket(uuid),public.can_work_ticket(uuid) to authenticated,service_role;

-- Illustrative sectors only. Rename these in Administration before field use.
insert into public.sectors(name,location) values('Demo Sector A','Replace with your actual sector'),('Demo Sector B','Replace with your actual sector');
insert into public.facilities(sector_id,name,type) select s.id,f.name,f.type from public.sectors s cross join (values('Washroom 1','Washroom'),('Washroom 2','Washroom'),('Kitchen 1','Kitchen'),('Kitchen 2','Kitchen'),('Common Area','Other')) as f(name,type);
insert into public.issue_options(facility_type,label) values('Washroom','Bad smell'),('Washroom','Dirty floor'),('Washroom','Blocked W/C or urinal'),('Washroom','Missing soap / supplies'),('Washroom','Water unavailable'),('Washroom','Other'),('Kitchen','Missing items / supplies'),('Kitchen','Dirty surfaces'),('Kitchen','Equipment fault'),('Kitchen','Hygiene concern'),('Kitchen','Other'),('Other','Cleaning required'),('Other','Damage / repair'),('Other','Missing supplies'),('Other','Other');
insert into public.notification_routes(sector_id,email) values(null,'sushantkumar1995@gmail.com');
commit;
