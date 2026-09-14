-- Customer name on invoices (optional; shown on view / PDF / print)
alter table sales
  add column if not exists customer_name text not null default '';
