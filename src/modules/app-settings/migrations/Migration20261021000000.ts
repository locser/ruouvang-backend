import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20261021000000 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`create table if not exists "app_settings" ("id" text not null, "key" text not null, "value" text not null default '', "is_secret" boolean not null default false, "updated_by" text null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "app_settings_pkey" primary key ("id"));`);
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_app_settings_key_unique" ON "app_settings" ("key") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_app_settings_deleted_at" ON "app_settings" ("deleted_at") WHERE deleted_at IS NULL;`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "app_settings" cascade;`);
  }
}
