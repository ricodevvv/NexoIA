import { Client } from "pg";

/**
 * Deja la base de tests vacía antes de correr, así cada corrida arranca igual.
 */
export default async function globalSetup() {
  const client = new Client({ connectionString: "postgres://nexo:nexo@localhost:5432/nexo_test" });
  await client.connect();
  await client.query('truncate "user", usage, verification, rate_limit cascade');
  await client.end();
}
