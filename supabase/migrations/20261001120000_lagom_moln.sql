-- =============================================================================
-- Lagom Moln – krypterad molnkopia (fas 1)
-- =============================================================================
--
-- VIKTIGT: Den här migreringen appliceras INTE automatiskt och är inte körd någonstans.
-- Den körs först när ägaren har godkänt Lagom Moln och skapat ett eget Supabase-projekt
-- (organisation "Lagom", region eu-north-1). Se docs/BACKEND.md och docs/DPIA-SYNK.md.
--
-- Principer:
-- - All data krypteras på enheten innan den skickas (end-to-end). Databasen ser bara
--   krypterade klumpar ("v1.<iv>.<chiffertext>"), storlekar, tider och e-postadressen i auth.users.
-- - Inget når tabellerna utan inloggning: anon har inga rättigheter alls.
-- - Radskydd (RLS) på alla tabeller: en inloggad användare når bara sina egna rader.
-- - Skrivningar av poster sker bara via sync_push (security definer) som kontrollerar
--   revision, kvot och storlek. Klienten kan aldrig själv ändra seq, rev eller bytes_used.
-- - delete_my_account raderar kontot; allt annat försvinner i kaskad.
--
-- Tester: supabase/tests/lagom_moln.test.sql (pgTAP, körs med `npx supabase test db`).

-- -----------------------------------------------------------------------------
-- Säkra standardrättigheter: nya tabeller, funktioner och sekvenser i public ska inte
-- automatiskt bli åtkomliga för anon/authenticated (Supabase delar annars ut dem). För
-- funktioner räcker det inte – se OBS nedan.
-- Står först, så att även objekten i den här migreringen omfattas.
-- -----------------------------------------------------------------------------
alter default privileges for role postgres in schema public revoke all on tables from anon, authenticated;
alter default privileges for role postgres in schema public revoke all on functions from anon, authenticated;
alter default privileges for role postgres in schema public revoke all on sequences from anon, authenticated;
-- OBS: Postgres ger ALLA roller (PUBLIC) rätt att köra nya funktioner, och den regeln går inte att
-- ta bort för bara ett schema ("... in schema public revoke execute on functions from public"
-- gör ingenting – det är provat). Därför måste VARJE ny funktion få en egen rad:
--   revoke execute on function public.<namn>(<argument>) from public, anon;
-- Se slutet av den här filen. Tabeller och sekvenser skyddas däremot av raderna ovan.

-- -----------------------------------------------------------------------------
-- vaults – ett valv per konto: inslagna nycklar, nyckelhärledning och samtycke
-- -----------------------------------------------------------------------------
create table public.vaults (
  -- Sätts av databasen till den inloggade användaren; appen kan inte välja ett annat id.
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  format int,
  kdf jsonb,
  wrapped_key_passphrase text,
  wrapped_key_recovery text,
  -- Ändringsräknare – ökas bara av sync_push.
  seq bigint not null default 0,
  -- Använt utrymme i byte – räknas bara av sync_push.
  bytes_used bigint not null default 0,
  consent_version text,
  consent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint vaults_format_check check (format is null or format = 1),
  constraint vaults_kdf_check check (kdf is null or (jsonb_typeof(kdf) = 'object' and pg_column_size(kdf) <= 1024)),
  constraint vaults_wrapped_passphrase_check check (wrapped_key_passphrase is null or length(wrapped_key_passphrase) <= 1024),
  constraint vaults_wrapped_recovery_check check (wrapped_key_recovery is null or length(wrapped_key_recovery) <= 1024),
  constraint vaults_consent_version_check check (consent_version is null or length(consent_version) <= 32)
);

comment on table public.vaults is 'Lagom Moln: ett valv per konto. Bara inslagna (krypterade) nycklar – aldrig lösenfras eller nyckel i klartext.';

-- -----------------------------------------------------------------------------
-- sync_items – krypterade poster (fas 1: en enda post, säkerhetskopian)
-- -----------------------------------------------------------------------------
create table public.sync_items (
  user_id uuid not null references public.vaults (user_id) on delete cascade,
  -- HMAC av postens logiska namn (24 byte, base64url) – servern kan inte se vad posten är.
  item_id text not null check (item_id ~ '^[A-Za-z0-9_-]{32}$'),
  rev int not null check (rev > 0),
  seq bigint not null,
  -- Krypterad klump "v1.<iv>.<chiffertext>". null = gravsten (posten är raderad).
  payload text null,
  deleted boolean not null default false,
  size int not null default 0 check (size >= 0),
  updated_at timestamptz not null default now(),
  primary key (user_id, item_id),
  constraint sync_items_payload_format check (payload is null or payload ~ '^v[0-9]+\.'),
  constraint sync_items_tombstone check ((deleted and payload is null) or (not deleted and payload is not null))
);

create index sync_items_user_seq_idx on public.sync_items (user_id, seq);

comment on table public.sync_items is 'Lagom Moln: krypterade poster. Skrivs bara via sync_push.';

-- -----------------------------------------------------------------------------
-- entitlements – köp kopplade till ett konto (för framtida bruk; skrivs bara av servern)
-- -----------------------------------------------------------------------------
create table public.entitlements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  source text not null check (source in ('stripe', 'appstore', 'play', 'key')),
  purchase_ref text,
  license_key text check (license_key like 'LAGOM1.%'),
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  unique (source, purchase_ref)
);

create index entitlements_user_idx on public.entitlements (user_id);

comment on table public.entitlements is 'Köp kopplade till ett Lagom Moln-konto. Skrivs bara av serverfunktioner (service_role).';

-- -----------------------------------------------------------------------------
-- webhook_events – id:n på behandlade webhooks (skydd mot dubbletter). Bara service_role.
-- -----------------------------------------------------------------------------
create table public.webhook_events (
  id text primary key,
  received_at timestamptz not null default now()
);

comment on table public.webhook_events is 'Behandlade webhook-händelser. Bara service_role.';

-- -----------------------------------------------------------------------------
-- Rättigheter
-- -----------------------------------------------------------------------------
revoke all on table public.vaults, public.sync_items, public.entitlements, public.webhook_events from anon, authenticated;

-- Valvet: läsa, skapa och ändra bara de här kolumnerna. user_id, seq och bytes_used kan inte sättas.
grant select on table public.vaults to authenticated;
grant insert (format, kdf, wrapped_key_passphrase, wrapped_key_recovery, consent_version, consent_at, updated_at) on table public.vaults to authenticated;
grant update (format, kdf, wrapped_key_passphrase, wrapped_key_recovery, consent_version, consent_at, updated_at) on table public.vaults to authenticated;

-- Poster: läsa och radera direkt. Skriva bara via sync_push.
grant select, delete on table public.sync_items to authenticated;

-- Köp: bara läsa sina egna.
grant select on table public.entitlements to authenticated;

grant all on table public.vaults, public.sync_items, public.entitlements, public.webhook_events to service_role;

-- -----------------------------------------------------------------------------
-- Radskydd (RLS)
-- -----------------------------------------------------------------------------
alter table public.vaults enable row level security;
alter table public.sync_items enable row level security;
alter table public.entitlements enable row level security;
-- Inga policyer: bara service_role (som går förbi RLS) når tabellen.
alter table public.webhook_events enable row level security;

create policy vaults_own on public.vaults
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy sync_items_own on public.sync_items
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy entitlements_own on public.entitlements
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- -----------------------------------------------------------------------------
-- sync_push – skriv poster med kontroll av revision, kvot och storlek
-- -----------------------------------------------------------------------------
-- p_items: [{ "id": "<32 tecken>", "baseRev": <revisionen klienten bygger på, 0 = ny>,
--             "payload": "v1.…" | null (null = gravsten) }]
-- Svar:    { "applied": [{ "id", "rev", "seq" }], "conflicts": [{ "id", "rev" }] }
--
-- En post vars baseRev inte stämmer med nuvarande rev skrivs inte, utan hamnar i conflicts
-- (en annan enhet hann före). Kvoten är 50 000 000 byte totalt och 4 000 000 byte per post.
-- Ett valv utan samtycke (consent_version saknas) tar inte emot något (42501).
-- Allt sker i en transaktion med valvraden låst – två samtidiga anrop kan inte krocka.
create or replace function public.sync_push(p_items jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_seq bigint;
  v_consent text;
  v_bytes bigint;
  v_item jsonb;
  v_id text;
  v_base int;
  v_payload text;
  v_size int;
  v_cur_rev int;
  v_cur_size int;
  v_applied jsonb := '[]'::jsonb;
  v_conflicts jsonb := '[]'::jsonb;
begin
  if v_uid is null then
    raise exception 'Inte inloggad' using errcode = '42501';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' then
    raise exception 'p_items måste vara en lista' using errcode = '22023';
  end if;
  if jsonb_array_length(p_items) > 500 then
    raise exception 'För många poster i ett anrop' using errcode = '22023';
  end if;

  -- Lås valvet: en uppladdning i taget per konto.
  select v.seq, v.consent_version into v_seq, v_consent from public.vaults v where v.user_id = v_uid for update;
  if not found then
    raise exception 'Valvet saknas' using errcode = 'P0002';
  end if;
  -- Utan samtycke (hälsouppgifter, art. 9.2 a GDPR) sparas ingenting – även om appen skulle försöka.
  if v_consent is null then
    raise exception 'Samtycke saknas' using errcode = '42501';
  end if;

  -- Använt utrymme räknas om från posterna (poster kan ha raderats direkt).
  select coalesce(sum(s.size), 0) into v_bytes from public.sync_items s where s.user_id = v_uid;

  for v_item in select value from jsonb_array_elements(p_items) loop
    if jsonb_typeof(v_item) <> 'object' then
      raise exception 'Ogiltig post' using errcode = '22023';
    end if;
    v_id := v_item ->> 'id';
    if v_id is null or v_id !~ '^[A-Za-z0-9_-]{32}$' then
      raise exception 'Ogiltigt post-id' using errcode = '22023';
    end if;
    v_base := coalesce((v_item ->> 'baseRev')::int, 0);
    v_payload := v_item ->> 'payload';
    v_size := coalesce(octet_length(v_payload), 0);
    if v_size > 4000000 then
      raise exception 'Posten är större än 4 000 000 byte' using errcode = '53400';
    end if;

    select s.rev, s.size into v_cur_rev, v_cur_size
      from public.sync_items s
      where s.user_id = v_uid and s.item_id = v_id;
    if not found then
      v_cur_rev := 0;
      v_cur_size := 0;
    end if;

    if v_base <> v_cur_rev then
      v_conflicts := v_conflicts || jsonb_build_array(jsonb_build_object('id', v_id, 'rev', v_cur_rev));
      continue;
    end if;

    v_bytes := v_bytes - v_cur_size + v_size;
    if v_bytes > 50000000 then
      raise exception 'Kvoten på 50 000 000 byte är full' using errcode = '53400';
    end if;

    v_seq := v_seq + 1;
    insert into public.sync_items as s (user_id, item_id, rev, seq, payload, deleted, size, updated_at)
      values (v_uid, v_id, v_cur_rev + 1, v_seq, v_payload, v_payload is null, v_size, now())
      on conflict (user_id, item_id) do update
        set rev = excluded.rev,
            seq = excluded.seq,
            payload = excluded.payload,
            deleted = excluded.deleted,
            size = excluded.size,
            updated_at = excluded.updated_at;
    v_applied := v_applied || jsonb_build_array(jsonb_build_object('id', v_id, 'rev', v_cur_rev + 1, 'seq', v_seq));
  end loop;

  update public.vaults v set seq = v_seq, bytes_used = v_bytes, updated_at = now() where v.user_id = v_uid;

  return jsonb_build_object('applied', v_applied, 'conflicts', v_conflicts);
end;
$$;

comment on function public.sync_push(jsonb) is 'Lagom Moln: skriv krypterade poster med revisionskontroll, kvot (50 MB totalt, 4 MB per post) och gravstenar.';

-- -----------------------------------------------------------------------------
-- delete_my_account – radera det egna kontot (valv, poster och köp följer med i kaskad)
-- -----------------------------------------------------------------------------
-- Åtkomsttoken (JWT) gäller fortfarande tills den går ut (högst en timme), men det finns inget
-- kvar att nå: valvet och posterna är borta. Appen glömmer sessionen direkt.
create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'Inte inloggad' using errcode = '42501';
  end if;
  delete from auth.users where id = v_uid;
end;
$$;

comment on function public.delete_my_account() is 'Lagom Moln: radera det egna kontot och all data i kaskad.';

-- Varje funktion måste stängas för PUBLIC och anon uttryckligen (se OBS överst i filen).
revoke execute on function public.sync_push(jsonb) from public, anon;
revoke execute on function public.delete_my_account() from public, anon;
grant execute on function public.sync_push(jsonb) to authenticated;
grant execute on function public.delete_my_account() to authenticated;
