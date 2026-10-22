import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20261022000000 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`create table if not exists "khach_tiem_nang" ("id" text not null, "conversation_id" text not null, "ten" text null, "so_dien_thoai" text not null, "nhu_cau" text null, "nguon" text not null default 'chatbot', "trang_thai" text check ("trang_thai" in ('moi', 'da_goi', 'bo_qua')) not null default 'moi', "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "khach_tiem_nang_pkey" primary key ("id"));`);
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_khach_tiem_nang_conversation_id_unique" ON "khach_tiem_nang" ("conversation_id") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_khach_tiem_nang_deleted_at" ON "khach_tiem_nang" ("deleted_at") WHERE deleted_at IS NULL;`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "khach_tiem_nang" cascade;`);
  }
}
