import mysql from "mysql2/promise";

const conn = await mysql.createConnection("mysql://root:@localhost:3306/copytrading");

const statements = [
  "ALTER TABLE `trade_logs` MODIFY `account_id` bigint NOT NULL",
  "ALTER TABLE `webhook_logs` MODIFY `webhook_id` bigint NOT NULL",
  "ALTER TABLE `trade_logs` ADD CONSTRAINT `trade_logs_account_id_accounts_id_fk` FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON DELETE NO ACTION ON UPDATE NO ACTION",
  "ALTER TABLE `webhook_logs` ADD CONSTRAINT `webhook_logs_webhook_id_webhooks_id_fk` FOREIGN KEY (`webhook_id`) REFERENCES `webhooks`(`id`) ON DELETE NO ACTION ON UPDATE NO ACTION",
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