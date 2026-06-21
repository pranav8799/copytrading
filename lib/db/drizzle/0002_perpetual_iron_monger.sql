ALTER TABLE `settings` ADD `selected_accounts` json DEFAULT ('[]') NOT NULL;--> statement-breakpoint
ALTER TABLE `settings` DROP COLUMN `selected_account_ids`;