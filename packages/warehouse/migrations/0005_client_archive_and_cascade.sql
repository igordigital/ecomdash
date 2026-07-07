-- Archiving (soft, reversible: stop syncing, keep all data) and deletion
-- (hard, irreversible: purge everything) for dim_client.
--
-- Archiving is just a status flag: the (future) daily/backfill job skips
-- archived clients, but their historical data stays intact and queryable.
-- Deletion needs every client-keyed table to cascade from dim_client, which
-- the original schema didn't set up (plain `references dim_client`
-- defaults to ON DELETE RESTRICT). Rather than hand-list every table (easy
-- to miss one as the schema grows), this walks pg_constraint for every
-- single-column foreign key pointing at dim_client or dim_campaign_map and
-- rebuilds it with ON DELETE CASCADE.

alter table dim_client
  add column status text not null default 'active' check (status in ('active', 'archived')),
  add column archived_at timestamptz;

do $$
declare
  r record;
begin
  for r in
    select con.conname, con.conrelid::regclass::text as table_name, att.attname as column_name
    from pg_constraint con
    join pg_attribute att on att.attrelid = con.conrelid and att.attnum = any(con.conkey)
    join pg_class cl on cl.oid = con.conrelid
    where con.contype = 'f'
      and con.confrelid = 'dim_client'::regclass
      and array_length(con.conkey, 1) = 1
      and not cl.relispartition
  loop
    execute format('alter table %s drop constraint %I', r.table_name, r.conname);
    execute format(
      'alter table %s add constraint %I foreign key (%I) references dim_client (client_id) on delete cascade',
      r.table_name, r.conname, r.column_name
    );
  end loop;

  for r in
    select con.conname, con.conrelid::regclass::text as table_name, att.attname as column_name
    from pg_constraint con
    join pg_attribute att on att.attrelid = con.conrelid and att.attnum = any(con.conkey)
    join pg_class cl on cl.oid = con.conrelid
    where con.contype = 'f'
      and con.confrelid = 'dim_campaign_map'::regclass
      and array_length(con.conkey, 1) = 1
      and not cl.relispartition
  loop
    execute format('alter table %s drop constraint %I', r.table_name, r.conname);
    execute format(
      'alter table %s add constraint %I foreign key (%I) references dim_campaign_map (campaign_key) on delete cascade',
      r.table_name, r.conname, r.column_name
    );
  end loop;
end;
$$;
