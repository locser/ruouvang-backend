import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20261015000000 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`create table if not exists "nhat_ky_entry" ("id" text not null, "doi_tuong" text not null, "doi_tuong_id" text not null, "hanh_dong" text not null, "nguoi_thuc_hien" text not null, "truoc" jsonb null, "sau" jsonb null, "ghi_chu" text null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "nhat_ky_entry_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_nhat_ky_entry_doi_tuong" ON "nhat_ky_entry" ("doi_tuong", "doi_tuong_id") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_nhat_ky_entry_deleted_at" ON "nhat_ky_entry" ("deleted_at") WHERE deleted_at IS NULL;`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "nhat_ky_entry" cascade;`);
  }
}
