CREATE TABLE `charges` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL,
	`month` text NOT NULL,
	`type` text NOT NULL,
	`amount` integer NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `charges_tenant` ON `charges` (`tenant_id`);--> statement-breakpoint
CREATE INDEX `charges_month` ON `charges` (`month`);--> statement-breakpoint
CREATE UNIQUE INDEX `charges_recurring_once` ON `charges` (`tenant_id`,`month`,`type`) WHERE "charges"."type" IN ('rent','maintenance');--> statement-breakpoint
CREATE TABLE `expenses` (
	`id` text PRIMARY KEY NOT NULL,
	`property_id` text NOT NULL,
	`unit_id` text,
	`spent_on` text NOT NULL,
	`category` text NOT NULL,
	`amount` integer NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`property_id`) REFERENCES `properties`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "expenses_positive" CHECK("expenses"."amount" > 0)
);
--> statement-breakpoint
CREATE INDEX `expenses_property` ON `expenses` (`property_id`,`spent_on`);--> statement-breakpoint
CREATE TABLE `files` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_type` text NOT NULL,
	`owner_id` text NOT NULL,
	`key` text NOT NULL,
	`name` text NOT NULL,
	`content_type` text NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `files_key_unique` ON `files` (`key`);--> statement-breakpoint
CREATE INDEX `files_owner` ON `files` (`owner_type`,`owner_id`);--> statement-breakpoint
CREATE TABLE `payments` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL,
	`paid_on` text NOT NULL,
	`amount` integer NOT NULL,
	`type` text DEFAULT 'rent' NOT NULL,
	`method` text DEFAULT 'upi' NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "payments_positive" CHECK("payments"."amount" > 0)
);
--> statement-breakpoint
CREATE INDEX `payments_tenant` ON `payments` (`tenant_id`);--> statement-breakpoint
CREATE INDEX `payments_paid_on` ON `payments` (`paid_on`);--> statement-breakpoint
CREATE TABLE `properties` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`address` text DEFAULT '' NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `readings` (
	`id` text PRIMARY KEY NOT NULL,
	`unit_id` text NOT NULL,
	`read_on` text NOT NULL,
	`value` integer NOT NULL,
	`charge_id` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`unit_id`) REFERENCES `units`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `readings_unit` ON `readings` (`unit_id`,`read_on`);--> statement-breakpoint
CREATE TABLE `tenants` (
	`id` text PRIMARY KEY NOT NULL,
	`unit_id` text NOT NULL,
	`name` text NOT NULL,
	`phone` text DEFAULT '' NOT NULL,
	`email` text DEFAULT '' NOT NULL,
	`move_in` text NOT NULL,
	`move_out` text,
	`agreement_end` text,
	`rent` integer NOT NULL,
	`deposit` integer DEFAULT 0 NOT NULL,
	`maintenance` integer DEFAULT 0 NOT NULL,
	`elec_rate` integer DEFAULT 0 NOT NULL,
	`due_day` integer DEFAULT 5 NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`unit_id`) REFERENCES `units`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "tenants_due_day" CHECK("tenants"."due_day" BETWEEN 1 AND 28)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `tenants_one_active_per_unit` ON `tenants` (`unit_id`) WHERE "tenants"."move_out" IS NULL;--> statement-breakpoint
CREATE TABLE `units` (
	`id` text PRIMARY KEY NOT NULL,
	`property_id` text NOT NULL,
	`name` text NOT NULL,
	`rent` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`property_id`) REFERENCES `properties`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `units_property_name` ON `units` (`property_id`,`name`);