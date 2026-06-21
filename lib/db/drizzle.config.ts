import { defineConfig } from "drizzle-kit";
import * as dotenv from "dotenv";
import path from "path";
console.log("DEBUG DATABASE_URL:", JSON.stringify(process.env.DATABASE_URL));
dotenv.config({ path: path.resolve(__dirname, ".env") });

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL, ensure the database is provisioned");
}

export default defineConfig({
  schema: "./src/schema/index.ts",
  out: "./drizzle",
  dialect: "mysql",
  dbCredentials: {
    url: process.env.DATABASE_URL,
  },
});