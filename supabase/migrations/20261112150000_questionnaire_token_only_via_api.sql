-- The homeowner questionnaire form now goes through /api/questionnaire (token checked on the server), so the public key no longer needs the table.
drop policy if exists public_questionnaire_by_token on public.homeowner_questionnaires;
drop policy if exists public_questionnaire_update_by_token on public.homeowner_questionnaires;
revoke all on table public.homeowner_questionnaires from anon;

-- Staff access is unchanged, but needs a granted role like the other staff tables.
alter policy auth_manage_questionnaires on public.homeowner_questionnaires
  using (public.get_my_role() not in ('pending', 'anonymous')) with check (public.get_my_role() not in ('pending', 'anonymous'));
