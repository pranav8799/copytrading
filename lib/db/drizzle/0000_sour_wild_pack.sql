CREATE TABLE `accounts` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`name` varchar(100) NOT NULL,
	`api_key` text NOT NULL,
	`secret_key` text NOT NULL,
	`is_active` boolean NOT NULL DEFAULT true,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `accounts_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `trade_logs` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`account_id` bigint NOT NULL,
	`order_id` varchar(100),
	`symbol` varchar(20) NOT NULL,
	`side` enum('BUY','SELL') NOT NULL,
	`order_type` varchar(30) NOT NULL,
	`quantity` decimal(20,8),
	`price` decimal(20,8),
	`trigger_price` decimal(20,8),
	`reduce_only` boolean DEFAULT false,
	`status` varchar(30),
	`error_message` text,
	`fired_via` enum('MANUAL','WEBHOOK') DEFAULT 'MANUAL',
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `trade_logs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `webhooks` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`name` varchar(100) NOT NULL,
	`token` varchar(100) NOT NULL,
	`target_accounts` json DEFAULT ('[]'),
	`default_symbol` varchar(20),
	`default_leverage` int,
	`is_active` boolean NOT NULL DEFAULT true,
	`last_triggered` timestamp,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `webhooks_id` PRIMARY KEY(`id`),
	CONSTRAINT `webhooks_token_unique` UNIQUE(`token`)
);
--> statement-breakpoint
CREATE TABLE `webhook_logs` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`webhook_id` bigint NOT NULL,
	`payload` json,
	`accounts_fired` int DEFAULT 0,
	`success_count` int DEFAULT 0,
	`fail_count` int DEFAULT 0,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `webhook_logs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `system_logs` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`level` enum('info','warn','error') NOT NULL,
	`message` text NOT NULL,
	`context` json,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `system_logs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `settings` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`default_leverage` int NOT NULL DEFAULT 10,
	`default_order_type` varchar(30) NOT NULL DEFAULT 'MARKET',
	`webhooks_enabled` boolean NOT NULL DEFAULT true,
	CONSTRAINT `settings_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `trade_logs` ADD CONSTRAINT `trade_logs_account_id_accounts_id_fk` FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `webhook_logs` ADD CONSTRAINT `webhook_logs_webhook_id_webhooks_id_fk` FOREIGN KEY (`webhook_id`) REFERENCES `webhooks`(`id`) ON DELETE no action ON UPDATE no action;