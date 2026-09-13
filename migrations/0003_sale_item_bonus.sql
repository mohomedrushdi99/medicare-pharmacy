-- Add free bonus quantity per sale line (not a currency discount)
alter table sale_items
  add column if not exists bonus integer not null default 0;

alter table sale_items
  drop constraint if exists sale_items_bonus_nonneg;

alter table sale_items
  add constraint sale_items_bonus_nonneg check (bonus >= 0);
