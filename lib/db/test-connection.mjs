import mysql from "mysql2/promise";

const conn = await mysql.createConnection("mysql://root:@localhost:3306/copytrading");

const [tables] = await conn.query("SHOW TABLES;");
console.log("Tables:", tables);

for (const row of tables) {
  const tableName = Object.values(row)[0];
  const [cols] = await conn.query(`SHOW COLUMNS FROM \`${tableName}\`;`);
  console.log(`\n--- ${tableName} ---`);
  console.table(cols);
}

await conn.end();