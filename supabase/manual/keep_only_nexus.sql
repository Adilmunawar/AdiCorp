-- Keep only "Nexus Orbits Pakistan" and the owner account (adilmunawarx@gmail.com).
-- Run this yourself in the Supabase SQL editor. It first copies everything it removes into the
-- private schema _archive_20261007 (not reachable from the app or the API); once you are happy,
-- drop that with:  drop schema _archive_20261007 cascade;
-- Uploaded files of the other companies (storage) must be removed from the Storage page; SQL cannot delete them.

begin;
create schema if not exists _archive_20261007;
revoke all on schema _archive_20261007 from public, anon, authenticated;
do $$
declare keep uuid := 'bc8defea-829f-4eeb-b210-6918e88e3019'; t text;
begin
  foreach t in array array['profiles','employees','events','working_days_config','monthly_working_days','company_working_settings','activity_logs','employee_documents','leave_types','leave_requests','payslips','overtime_config','overtime_records','tier_config','employee_update_requests','messages','complaints','polls','announcements'] loop
    execute format('create table _archive_20261007.%I as select * from public.%I where company_id is distinct from %L', t, t, keep);
  end loop;
  create table _archive_20261007.companies as select * from public.companies where id <> keep;
  create table _archive_20261007.attendance as select a.* from public.attendance a join public.employees e on e.id = a.employee_id where e.company_id <> keep;
  create table _archive_20261007.leave_balances as select b.* from public.leave_balances b join public.employees e on e.id = b.employee_id where e.company_id <> keep;
  create table _archive_20261007.poll_options as select o.* from public.poll_options o join public.polls p on p.id = o.poll_id where p.company_id <> keep;
  create table _archive_20261007.poll_votes as select v.* from public.poll_votes v join public.polls p on p.id = v.poll_id where p.company_id <> keep;
  create table _archive_20261007.auth_users_list as select id, email, created_at, last_sign_in_at from auth.users where id <> 'c1aa586c-6493-4b2a-9179-34f6b6576cf0';

  delete from public.poll_votes v using public.polls p where p.id = v.poll_id and p.company_id <> keep;
  delete from public.poll_options o using public.polls p where p.id = o.poll_id and p.company_id <> keep;
  delete from public.polls where company_id <> keep;
  delete from public.announcements where company_id <> keep;
  delete from public.complaints where company_id <> keep;
  delete from public.messages where company_id <> keep;
  delete from public.employee_update_requests where company_id is distinct from keep;
  delete from public.employee_documents where company_id <> keep;
  delete from public.payslips where company_id <> keep;
  delete from public.overtime_records where company_id <> keep;
  delete from public.leave_requests where company_id <> keep;
  delete from public.leave_balances b using public.employees e where e.id = b.employee_id and e.company_id <> keep;
  delete from public.leave_types where company_id <> keep;
  delete from public.attendance a using public.employees e where e.id = a.employee_id and e.company_id <> keep;
  delete from public.events where company_id <> keep;
  delete from public.working_days_config where company_id <> keep;
  delete from public.monthly_working_days where company_id <> keep;
  delete from public.company_working_settings where company_id <> keep;
  delete from public.overtime_config where company_id <> keep;
  delete from public.tier_config where company_id <> keep;
  delete from public.activity_logs where company_id <> keep;
  delete from public.employees where company_id <> keep;
  delete from public.profiles where company_id is distinct from keep;
  delete from public.companies where id <> keep;
  delete from auth.users where id <> 'c1aa586c-6493-4b2a-9179-34f6b6576cf0';
end $$;
select (select count(*) from public.companies) companies, (select count(*) from auth.users) users, (select count(*) from public.employees) employees;
commit;
