import mysql from "mysql2/promise";

const conn = await mysql.createConnection("mysql://root:@localhost:3306/copytrading");

const statements = [
  "ALTER TABLE `accounts` ADD `mobile_number` varchar(20) NOT NULL DEFAULT 'N/A'",
  "ALTER TABLE `accounts` ADD `last_balance` decimal(20,8)",
  "ALTER TABLE `accounts` ADD `current_balance` decimal(20,8)",
  "ALTER TABLE `accounts` ADD `balance_updated_at` timestamp NULL",
];

for (const sql of statements) {
  try {
    console.log(`Running: ${sql}`);
    await conn.query(sql);
    console.log("✅ Success\n");
  } catch (err) {
    console.error("❌ Failed:", err.message, "\n");
  }
}

await conn.end();