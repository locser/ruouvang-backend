import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20260728173336 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table if exists "page_template" drop constraint if exists "page_template_handle_unique";`);
    this.addSql(`create table if not exists "page_section" ("id" text not null, "template_id" text not null, "type" text not null, "position" integer not null default 0, "enabled" boolean not null default true, "settings" jsonb null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "page_section_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_page_section_template_id" ON "page_section" ("template_id") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_page_section_deleted_at" ON "page_section" ("deleted_at") WHERE deleted_at IS NULL;`);

    this.addSql(`create table if not exists "page_template" ("id" text not null, "handle" text not null, "title" text not null, "status" text check ("status" in ('draft', 'published')) not null default 'draft', "metadata" jsonb null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "page_template_pkey" primary key ("id"));`);
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_page_template_handle_unique" ON "page_template" ("handle") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_page_template_deleted_at" ON "page_template" ("deleted_at") WHERE deleted_at IS NULL;`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "page_section" cascade;`);

    this.addSql(`drop table if exists "page_template" cascade;`);
  }

}
