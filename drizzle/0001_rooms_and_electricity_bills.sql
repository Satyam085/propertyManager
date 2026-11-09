DROP TABLE `readings`;--> statement-breakpoint
DROP INDEX `tenants_one_active_per_unit`;--> statement-breakpoint
ALTER TABLE `tenants` ADD `label` text DEFAULT '' NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `tenants_active_room_label` ON `tenants` (`unit_id`,`label`) WHERE "tenants"."move_out" IS NULL;--> statement-breakpoint
ALTER TABLE `tenants` DROP COLUMN `elec_rate`;