import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20260724043250 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table if exists "blog_tag" drop constraint if exists "blog_tag_slug_unique";`);
    this.addSql(`alter table if exists "blog_post" drop constraint if exists "blog_post_slug_unique";`);
    this.addSql(`alter table if exists "blog_category" drop constraint if exists "blog_category_slug_unique";`);
    this.addSql(`create table if not exists "blog_author" ("id" text not null, "name" text not null, "bio" jsonb null, "avatar" text null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "blog_author_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_blog_author_deleted_at" ON "blog_author" ("deleted_at") WHERE deleted_at IS NULL;`);

    this.addSql(`create table if not exists "blog_category" ("id" text not null, "slug" text not null, "name" jsonb null, "description" jsonb null, "rank" integer not null default 0, "metadata" jsonb null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "blog_category_pkey" primary key ("id"));`);
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_blog_category_slug_unique" ON "blog_category" ("slug") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_blog_category_deleted_at" ON "blog_category" ("deleted_at") WHERE deleted_at IS NULL;`);

    this.addSql(`create table if not exists "blog_post" ("id" text not null, "slug" text not null, "status" text check ("status" in ('draft', 'published')) not null default 'draft', "published_at" timestamptz null, "thumbnail" text null, "author_id" text null, "category_ids" jsonb null, "tag_ids" jsonb null, "is_featured" boolean not null default false, "title" jsonb null, "excerpt" jsonb null, "content" jsonb null, "seo_title" jsonb null, "seo_description" jsonb null, "metadata" jsonb null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "blog_post_pkey" primary key ("id"));`);
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_blog_post_slug_unique" ON "blog_post" ("slug") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_blog_post_author_id" ON "blog_post" ("author_id") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_blog_post_deleted_at" ON "blog_post" ("deleted_at") WHERE deleted_at IS NULL;`);

    this.addSql(`create table if not exists "blog_tag" ("id" text not null, "slug" text not null, "name" jsonb null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "blog_tag_pkey" primary key ("id"));`);
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_blog_tag_slug_unique" ON "blog_tag" ("slug") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_blog_tag_deleted_at" ON "blog_tag" ("deleted_at") WHERE deleted_at IS NULL;`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "blog_author" cascade;`);

    this.addSql(`drop table if exists "blog_category" cascade;`);

    this.addSql(`drop table if exists "blog_post" cascade;`);

    this.addSql(`drop table if exists "blog_tag" cascade;`);
  }

}
