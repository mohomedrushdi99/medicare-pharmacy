create table if not exists customers (
  id          serial primary key,
  user_id     text not null,
  name        text not null,
  phone       text not null default '',
  address     text not null default '',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists customers_user_name_idx
  on customers (user_id, lower(name));

alter table sales
  add column if not exists customer_id integer references customers (id) on delete set null,
  add column if not exists customer_phone text not null default '',
  add column if not exists customer_address text not null default '';

create index if not exists sales_user_customer_idx on sales (user_id, customer_id);
