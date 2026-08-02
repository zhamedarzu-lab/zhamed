alter table cash_snapshots
  add column if not exists paycheck_id integer references paychecks(id) on delete set null;
