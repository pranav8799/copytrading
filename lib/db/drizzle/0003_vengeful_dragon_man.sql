ALTER TABLE `accounts` ADD `mobile_number` varchar(20) NOT NULL;--> statement-breakpoint
ALTER TABLE `accounts` ADD `last_balance` decimal(20,8);--> statement-breakpoint
ALTER TABLE `accounts` ADD `current_balance` decimal(20,8);--> statement-breakpoint
ALTER TABLE `accounts` ADD `balance_updated_at` timestamp;