import { dbSource, getPglite, getSql, type Sql } from "@/lib/db";

function toSql(
  run: <T>(text: string, params: unknown[]) => Promise<T[]>,
): Sql {
  const sql = (async <T = Record<string, unknown>>(
    strings: TemplateStringsArray,
    ...values: unknown[]
  ): Promise<T[]> => {
    let text = strings[0] ?? "";
    for (let i = 0; i < values.length; i += 1) {
      text += `$${i + 1}${strings[i + 1] ?? ""}`;
    }
    return run<T>(text, values);
  }) as unknown as Sql;
  sql.query = <T = Record<string, unknown>>(text: string, params: unknown[] = []) =>
    run<T>(text, params);
  return sql;
}

/**
 * Run work on a single database connection so BEGIN/COMMIT is real on both
 * PGLite (preview) and Neon (deploy). Critical for completing a sale.
 */
export async function withTransaction<T>(fn: (sql: Sql) => Promise<T>): Promise<T> {
  if (dbSource === "pglite") {
    const pg = await getPglite();
    return pg.transaction(async (tx) => {
      const sql = toSql(async <R>(text: string, params: unknown[]) => {
        const result = await tx.query<R>(text, params);
        return result.rows;
      });
      return fn(sql);
    });
  }

  const connectionString = process.env.DATABASE_URL?.trim();
  if (!connectionString) {
    const sql = await getSql();
    return fn(sql);
  }

  const { Client, types } = await import("pg");
  types.setTypeParser(20, Number);
  types.setTypeParser(1082, (value: string) => value);
  const client = new Client({ connectionString });
  await client.connect();
  try {
    await client.query("BEGIN");
    const sql = toSql(async <R>(text: string, params: unknown[]) => {
      const result = await client.query(text, params);
      return result.rows as R[];
    });
    const result = await fn(sql);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch {
      /* ignore rollback errors */
    }
    throw error;
  } finally {
    await client.end();
  }
}
