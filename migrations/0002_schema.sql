-- Medicare Pharmacy — application schema
-- All business tables are scoped by user_id (TEXT) so each signed-in operator
-- has an isolated pharmacy. No staff/roles tables.

create table if not exists medicines (
  id              serial primary key,
  user_id         text not null,
  code            text not null,
  name            text not null,
  generic_name    text not null default '',
  category        text not null default '',
  unit            text not null default 'Box',
  purchase_price  numeric(12,2) not null,
  selling_price   numeric(12,2) not null,
  current_stock   integer not null default 0,
  min_stock       integer not null default 0,
  status          text not null default 'active',
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint medicines_code_unique unique (user_id, code),
  constraint medicines_stock_nonneg check (current_stock >= 0),
  constraint medicines_min_stock_nonneg check (min_stock >= 0),
  constraint medicines_purchase_nonneg check (purchase_price >= 0),
  constraint medicines_selling_nonneg check (selling_price >= 0),
  constraint medicines_status_check check (status in ('active', 'inactive'))
);

create index if not exists medicines_user_id_idx on medicines (user_id);
create index if not exists medicines_user_status_idx on medicines (user_id, status);
create index if not exists medicines_user_name_idx on medicines (user_id, name);

create table if not exists settings (
  user_id               text primary key,
  pharmacy_name         text not null default 'Medicare Pharmacy',
  subtitle              text not null default 'Wholesale Medicine Supplier',
  address               text not null default '',
  phone                 text not null default '',
  email                 text not null default '',
  website               text not null default '',
  tax_vat_number        text not null default '',
  logo_data             text not null default '',
  invoice_prefix        text not null default 'INV',
  next_invoice_number   integer not null default 1,
  currency              text not null default 'LKR',
  currency_symbol       text not null default 'Rs.',
  default_tax_percent   numeric(6,2) not null default 0,
  default_discount      numeric(12,2) not null default 0,
  invoice_footer        text not null default '',
  terms_and_conditions  text not null default '',
  accent_color          text not null default '#0F766E',
  theme                 text not null default 'system',
  sidebar_appearance    text not null default 'expanded',
  layout_density        text not null default 'comfortable',
  app_name              text not null default 'Medicare Pharmacy',
  show_today_sales      boolean not null default true,
  show_today_invoices   boolean not null default true,
  show_total_medicines  boolean not null default true,
  show_total_stock      boolean not null default true,
  show_low_stock        boolean not null default true,
  show_stock_value      boolean not null default true,
  show_sales_chart      boolean not null default true,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  constraint settings_next_invoice_pos check (next_invoice_number >= 1),
  constraint settings_theme_check check (theme in ('light', 'dark', 'system')),
  constraint settings_sidebar_check check (sidebar_appearance in ('expanded', 'compact')),
  constraint settings_density_check check (layout_density in ('comfortable', 'compact'))
);

create table if not exists sales (
  id              serial primary key,
  user_id         text not null,
  invoice_number  text not null,
  invoice_date    date not null default current_date,
  subtotal        numeric(12,2) not null,
  discount        numeric(12,2) not null default 0,
  tax             numeric(12,2) not null default 0,
  grand_total     numeric(12,2) not null,
  amount_paid     numeric(12,2) not null default 0,
  balance         numeric(12,2) not null default 0,
  payment_method  text not null default 'cash',
  status          text not null default 'completed',
  notes           text not null default '',
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint sales_invoice_unique unique (user_id, invoice_number),
  constraint sales_payment_method_check check (payment_method in ('cash', 'card', 'bank_transfer', 'other')),
  constraint sales_status_check check (status in ('completed', 'cancelled')),
  constraint sales_nonneg_money check (
    subtotal >= 0 and discount >= 0 and tax >= 0 and grand_total >= 0 and amount_paid >= 0
  )
);

create index if not exists sales_user_id_idx on sales (user_id);
create index if not exists sales_user_date_idx on sales (user_id, invoice_date desc);
create index if not exists sales_user_created_idx on sales (user_id, created_at desc);

create table if not exists sale_items (
  id              serial primary key,
  sale_id         integer not null references sales (id) on delete cascade,
  user_id         text not null,
  medicine_id     integer not null references medicines (id),
  medicine_code   text not null,
  medicine_name   text not null,
  quantity        integer not null,
  bonus           integer not null default 0,
  unit_price      numeric(12,2) not null,
  line_total      numeric(12,2) not null,
  constraint sale_items_qty_pos check (quantity > 0),
  constraint sale_items_bonus_nonneg check (bonus >= 0),
  constraint sale_items_price_nonneg check (unit_price >= 0 and line_total >= 0)
);

create index if not exists sale_items_sale_id_idx on sale_items (sale_id);
create index if not exists sale_items_user_id_idx on sale_items (user_id);
create index if not exists sale_items_medicine_id_idx on sale_items (medicine_id);

create table if not exists stock_movements (
  id              serial primary key,
  user_id         text not null,
  medicine_id     integer not null references medicines (id),
  adjustment_type text not null,
  quantity        integer not null,
  bonus           integer not null default 0,
  previous_stock  integer not null,
  new_stock       integer not null,
  reason          text not null default '',
  sale_id         integer references sales (id) on delete set null,
  created_at      timestamptz not null default now(),
  constraint stock_movements_type_check check (
    adjustment_type in ('add', 'remove', 'sale', 'correction')
  )
);

create index if not exists stock_movements_user_id_idx on stock_movements (user_id);
create index if not exists stock_movements_user_created_idx on stock_movements (user_id, created_at desc);
create index if not exists stock_movements_medicine_idx on stock_movements (medicine_id);

create table if not exists audit_logs (
  id          serial primary key,
  user_id     text not null,
  action      text not null,
  entity      text not null default '',
  entity_id   text not null default '',
  details     text not null default '',
  created_at  timestamptz not null default now()
);

create index if not exists audit_logs_user_created_idx on audit_logs (user_id, created_at desc);
