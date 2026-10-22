import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db";
import { writeAudit } from "@/server/mappers";

type CustomerRow = {
  id: number;
  name: string;
  phone: string;
  address: string;
  created_at: string | Date;
  updated_at: string | Date;
};

const customerInput = z.object({
  name: z.string().trim().min(1, "Customer name is required.").max(200),
  phone: z.string().trim().max(40),
  address: z.string().trim().max(500),
});

function mapCustomer(row: CustomerRow) {
  return {
    id: Number(row.id),
    name: row.name,
    phone: row.phone,
    address: row.address,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}

export const listCustomers = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const sql = await getSql();
    const rows = await sql<CustomerRow>`
      select id, name, phone, address, created_at, updated_at
      from customers
      where user_id = ${context.userId}
      order by lower(name), id`;
    return rows.map(mapCustomer);
  });

export const createCustomer = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => customerInput.parse(input))
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const rows = await sql<CustomerRow>`
      insert into customers (user_id, name, phone, address)
      values (${context.userId}, ${data.name}, ${data.phone}, ${data.address})
      returning id, name, phone, address, created_at, updated_at`;
    const customer = mapCustomer(rows[0]);
    await writeAudit(sql, context.userId, "Customer created", "customer", customer.id, customer.name);
    return customer;
  });

export const updateCustomer = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => customerInput.extend({ id: z.number().int().positive() }).parse(input))
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const rows = await sql<CustomerRow>`
      update customers set
        name = ${data.name},
        phone = ${data.phone},
        address = ${data.address},
        updated_at = now()
      where id = ${data.id} and user_id = ${context.userId}
      returning id, name, phone, address, created_at, updated_at`;
    if (!rows[0]) throw new Error("Customer not found.");
    const customer = mapCustomer(rows[0]);
    await writeAudit(sql, context.userId, "Customer updated", "customer", customer.id, customer.name);
    return customer;
  });
