-- =============================================================================
-- Tester för Lagom Moln (supabase/migrations/20261001120000_lagom_moln.sql)
-- =============================================================================
-- Körs med Supabase CLI mot den lokala databasen:
--   npx supabase start
--   npx supabase test db
-- Allt sker i en transaktion som rullas tillbaka – inget ligger kvar efteråt.
--
-- Testanvändare:
--   A = 00000000-0000-4000-8000-00000000000a
--   B = 00000000-0000-4000-8000-00000000000b

begin;
create extension if not exists pgtap with schema extensions;

select plan(40);

insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-00000000000a', 'a@example.com'),
  ('00000000-0000-4000-8000-00000000000b', 'b@example.com');

-- -----------------------------------------------------------------------------
-- Grundläggande skydd
-- -----------------------------------------------------------------------------
select is(
  (select count(*)::int from pg_class
     where oid in ('public.vaults'::regclass, 'public.sync_items'::regclass, 'public.entitlements'::regclass, 'public.webhook_events'::regclass)
       and relrowsecurity),
  4,
  'RLS är påslaget för alla fyra tabeller'
);

select ok(
  not has_function_privilege('anon', 'public.sync_push(jsonb)', 'execute')
    and not has_function_privilege('anon', 'public.delete_my_account()', 'execute')
    and has_function_privilege('authenticated', 'public.sync_push(jsonb)', 'execute'),
  'Bara inloggade får anropa funktionerna'
);

-- -----------------------------------------------------------------------------
-- anon (ej inloggad) nekas allt
-- -----------------------------------------------------------------------------
set local role anon;
set local request.jwt.claims to '{"role":"anon"}';

select throws_ok($$select count(*) from public.vaults$$, '42501', null, 'anon kan inte läsa vaults');
select throws_ok($$select count(*) from public.sync_items$$, '42501', null, 'anon kan inte läsa sync_items');
select throws_ok($$select count(*) from public.entitlements$$, '42501', null, 'anon kan inte läsa entitlements');
select throws_ok($$select public.sync_push('[]'::jsonb)$$, '42501', null, 'anon kan inte anropa sync_push');
select throws_ok($$select public.delete_my_account()$$, '42501', null, 'anon kan inte anropa delete_my_account');

reset role;

-- -----------------------------------------------------------------------------
-- B utan valv
-- -----------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-4000-8000-00000000000b","role":"authenticated"}';

select throws_ok($$select public.sync_push('[]'::jsonb)$$, 'P0002', null, 'B utan valv får P0002');

-- Ett valv utan samtycke tar inte emot något (samtycket läggs till längre ned).
insert into public.vaults (format, kdf, wrapped_key_passphrase, wrapped_key_recovery)
  values (1, '{"alg":"PBKDF2-SHA256","iter":600000,"salt":"YmJiYmJiYmJiYmJiYmJiYg"}', 'v1.bbb.bbb', 'v1.bbb.ccc');
select throws_ok(
  $$select public.sync_push('[{"id":"FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF","baseRev":0,"payload":"v1.b.b"}]'::jsonb)$$,
  '42501', null, 'Ett valv utan samtycke tar inte emot poster'
);

-- -----------------------------------------------------------------------------
-- A skapar sitt valv och laddar upp
-- -----------------------------------------------------------------------------
set local request.jwt.claims to '{"sub":"00000000-0000-4000-8000-00000000000a","role":"authenticated"}';

select lives_ok(
  $$insert into public.vaults (format, kdf, wrapped_key_passphrase, wrapped_key_recovery, consent_version, consent_at)
    values (1, '{"alg":"PBKDF2-SHA256","iter":600000,"salt":"c2FsdHNhbHRzYWx0c2FsdA"}', 'v1.aaa.bbb', 'v1.ccc.ddd', '2026-10-01', now())$$,
  'A skapar sitt valv'
);
select is((select user_id from public.vaults), '00000000-0000-4000-8000-00000000000a'::uuid, 'user_id sätts till den inloggade användaren');
select throws_ok(
  $$insert into public.vaults (user_id, format) values ('00000000-0000-4000-8000-00000000000b', 1)$$,
  '42501', null, 'A kan inte välja ett annat user_id'
);

select is(
  public.sync_push('[{"id":"AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA","baseRev":0,"payload":"v1.iv.ct1"}]'::jsonb),
  '{"applied":[{"id":"AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA","rev":1,"seq":1}],"conflicts":[]}'::jsonb,
  'En ny post ger rev 1 och seq 1'
);
select is((select size from public.sync_items where item_id = 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'), 9, 'Storleken räknas i byte');

select is(
  public.sync_push('[{"id":"AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA","baseRev":0,"payload":"v1.iv.gammal"}]'::jsonb),
  '{"applied":[],"conflicts":[{"id":"AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA","rev":1}]}'::jsonb,
  'En gammal baseRev ger konflikt'
);
select is((select payload from public.sync_items where item_id = 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'), 'v1.iv.ct1', 'Konflikten skrev inte över posten');

select is(
  public.sync_push('[{"id":"AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA","baseRev":1,"payload":null}]'::jsonb),
  '{"applied":[{"id":"AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA","rev":2,"seq":2}],"conflicts":[]}'::jsonb,
  'En gravsten ger rev 2 och seq 2'
);
select results_eq(
  $$select deleted, payload is null, size from public.sync_items where item_id = 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'$$,
  $$values (true, true, 0)$$,
  'Gravstenen saknar innehåll'
);
select results_eq($$select seq, bytes_used from public.vaults$$, $$values (2::bigint, 0::bigint)$$, 'Valvets seq och bytes_used följer med');

select throws_ok(
  $$select public.sync_push('[{"id":"för-kort","baseRev":0,"payload":"v1.a.b"}]'::jsonb)$$,
  '22023', null, 'Ett ogiltigt post-id nekas'
);

-- -----------------------------------------------------------------------------
-- A kan inte gå förbi sync_push
-- -----------------------------------------------------------------------------
select throws_ok($$update public.vaults set seq = 99$$, '42501', null, 'A kan inte ändra seq direkt');
select throws_ok($$update public.vaults set bytes_used = 0$$, '42501', null, 'A kan inte ändra bytes_used direkt');
select throws_ok(
  $$insert into public.sync_items (user_id, item_id, rev, seq, payload, size)
    values ('00000000-0000-4000-8000-00000000000a', 'BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB', 1, 1, 'v1.a.b', 6)$$,
  '42501', null, 'A kan inte skriva poster direkt'
);
select throws_ok($$update public.sync_items set rev = 50$$, '42501', null, 'A kan inte ändra rev direkt');

-- -----------------------------------------------------------------------------
-- Kvoten
-- -----------------------------------------------------------------------------
select throws_ok(
  $$select public.sync_push(jsonb_build_array(jsonb_build_object('id', 'CCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC', 'baseRev', 0, 'payload', 'v1.' || repeat('a', 4000000))))$$,
  '53400', null, 'En post över 4 000 000 byte nekas'
);

reset role;
-- En stor post (bara storleken – innehållet spelar ingen roll här).
insert into public.sync_items (user_id, item_id, rev, seq, payload, deleted, size)
  values ('00000000-0000-4000-8000-00000000000a', 'DDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDD', 1, 3, 'v1.stor', false, 49999000);

set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-4000-8000-00000000000a","role":"authenticated"}';
select throws_ok(
  $$select public.sync_push(jsonb_build_array(jsonb_build_object('id', 'EEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEE', 'baseRev', 0, 'payload', 'v1.' || repeat('b', 2000))))$$,
  '53400', null, 'Kvoten på 50 000 000 byte totalt slår till'
);
select is((select count(*)::int from public.sync_items where item_id = 'EEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEE'), 0, 'Inget sparades när kvoten slog till');

-- Radering av egna poster frigör utrymme.
select lives_ok($$delete from public.sync_items where item_id = 'DDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDD'$$, 'A kan radera sina egna poster');

-- -----------------------------------------------------------------------------
-- B:s valv och poster
-- -----------------------------------------------------------------------------
set local request.jwt.claims to '{"sub":"00000000-0000-4000-8000-00000000000b","role":"authenticated"}';
-- B ger sitt samtycke (valvet skapades utan samtycke längre upp).
update public.vaults set consent_version = '2026-10-01', consent_at = now();

select is(
  public.sync_push('[{"id":"FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF","baseRev":0,"payload":"v1.b.b"}]'::jsonb),
  '{"applied":[{"id":"FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF","rev":1,"seq":1}],"conflicts":[]}'::jsonb,
  'B har en egen seq-räknare'
);
select is_empty(
  $$select 1 from public.sync_items where user_id = '00000000-0000-4000-8000-00000000000a'$$,
  'B ser inga av A:s poster'
);
select results_eq($$select user_id from public.vaults$$, $$values ('00000000-0000-4000-8000-00000000000b'::uuid)$$, 'B ser bara sitt eget valv');

set local request.jwt.claims to '{"sub":"00000000-0000-4000-8000-00000000000a","role":"authenticated"}';
select results_eq(
  $$with u as (update public.vaults set consent_version = 'kapad' where user_id = '00000000-0000-4000-8000-00000000000b' returning 1) select count(*)::int from u$$,
  $$values (0)$$,
  'A kan inte skriva i B:s valv'
);
select results_eq(
  $$with d as (delete from public.sync_items where user_id = '00000000-0000-4000-8000-00000000000b' returning 1) select count(*)::int from d$$,
  $$values (0)$$,
  'A kan inte radera B:s poster'
);

-- -----------------------------------------------------------------------------
-- Köp och webhooks
-- -----------------------------------------------------------------------------
reset role;
insert into public.entitlements (user_id, source, purchase_ref, license_key)
  values ('00000000-0000-4000-8000-00000000000a', 'stripe', 'cs_test_1', 'LAGOM1.abc.def');

set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-4000-8000-00000000000b","role":"authenticated"}';
select is_empty($$select 1 from public.entitlements$$, 'B ser inte A:s köp');

set local request.jwt.claims to '{"sub":"00000000-0000-4000-8000-00000000000a","role":"authenticated"}';
select is((select count(*)::int from public.entitlements), 1, 'A ser sitt eget köp');
select throws_ok(
  $$insert into public.entitlements (user_id, source, purchase_ref) values ('00000000-0000-4000-8000-00000000000a', 'key', 'x')$$,
  '42501', null, 'A kan inte skapa köp själv'
);
select throws_ok($$select count(*) from public.webhook_events$$, '42501', null, 'Inloggade når inte webhook_events');

-- -----------------------------------------------------------------------------
-- delete_my_account raderar i kaskad
-- -----------------------------------------------------------------------------
select lives_ok($$select public.delete_my_account()$$, 'A raderar sitt konto');

reset role;
select results_eq(
  $$select
      (select count(*)::int from auth.users where id = '00000000-0000-4000-8000-00000000000a'),
      (select count(*)::int from public.vaults where user_id = '00000000-0000-4000-8000-00000000000a'),
      (select count(*)::int from public.sync_items where user_id = '00000000-0000-4000-8000-00000000000a'),
      (select count(*)::int from public.entitlements where user_id = '00000000-0000-4000-8000-00000000000a')$$,
  $$values (0, 0, 0, 0)$$,
  'Kontot, valvet, posterna och köpen är borta'
);
select results_eq(
  $$select
      (select count(*)::int from auth.users where id = '00000000-0000-4000-8000-00000000000b'),
      (select count(*)::int from public.sync_items where user_id = '00000000-0000-4000-8000-00000000000b')$$,
  $$values (1, 1)$$,
  'B:s konto och poster finns kvar'
);

select * from finish();
rollback;
