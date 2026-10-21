#!/usr/bin/env python3
"""
Trích 55.010 sản phẩm CellphoneS từ sqlite ra JSON cho import-shop.ts.

Chạy TRÊN MÁY HOST (không phải trong container):
    python3 "AI ECommerce Brain/apps/backend/src/scripts/trich-cellphones.py"

Vì sao có bước trung gian này thay vì đọc thẳng sqlite trong Node: đọc sqlite
từ Node cần gói native `better-sqlite3`, phải biên dịch lúc cài và kéo theo
toolchain C++ vào image Medusa — quá nhiều thứ cho một lần chạy. Python có
sẵn module sqlite3 trong thư viện chuẩn.

Đầu ra: CellphoneS/data/cellphones_medusa.json
"""

import json
import os
import re
import sqlite3
import sys

GOC = "/home/syvn/Documents/AIECommerce/CellphoneS/data"
DB = os.path.join(GOC, "cellphones.sqlite")
RA = os.path.join(GOC, "cellphones_medusa.json")

# Thuộc tính đáng đưa vào Meilisearch để lọc cứng.
#
# Tên khoá dưới đây lấy từ việc QUÉT DỮ LIỆU THẬT, không phải đoán: bảng
# `attributes` có hàng trăm khoá và phần lớn là "no_selection", ảnh quảng cáo
# hoặc cờ nội bộ của Magento. Con số % là tỉ lệ sản phẩm thật sự có giá trị.
#
# Nhiều sản phẩm trong 45.060 mục là PHỤ KIỆN (ốp lưng, cáp, sạc) — chúng
# không có RAM hay pin là đúng, không phải thiếu dữ liệu.
SPECS_SO = {
    "battery": "battery_mah",            # 41% · "Li-Ion 3400 mAh"
    "battery_capacity": "battery_mah",   #  2% · "10.000 mAh"  (dự phòng)
    "storage": "storage_gb",             # 25% · "64 GB"
    "mobile_storage_filter": "storage_gb",  # 4% (dự phòng)
    "display_size": "screen_inch",       # 31% · "5.99 inches"
    "mobile_ram_filter": "ram_gb",       #  2% · "Dưới 4GB"
}
SPECS_CHUOI = {
    "manufacturer": "brand",             # 35% · cột `brand` của bảng products RỖNG
    "chipset": "chipset",                # 25%
    "cpu": "cpu",                        # 27%
    "display_resolution": "display_resolution",  # 31%
    "product_condition": "tinh_trang",   # 93% · "Mới"
}


def so_dau_tien(s):
    """
    Bóc số đầu tiên khỏi chuỗi thông số.

    Phải phân biệt dấu chấm PHÂN CÁCH NGHÌN với dấu chấm THẬP PHÂN:
        "10.000 mAh"   -> 10000   (phân cách nghìn: đúng 3 chữ số theo sau)
        "5.99 inches"  -> 5.99    (thập phân)
        "Li-Ion 3400 mAh" -> 3400
        "Dưới 4GB"     -> 4
    Xoá dấu chấm vô điều kiện như bản đầu sẽ biến 5.99 inch thành 599 inch.
    """
    if not s or not isinstance(s, str):
        return None
    m = re.search(r"(\d[\d.,]*)", s)
    if not m:
        return None
    raw = m.group(1).rstrip(".,")
    # Chuẩn hoá: chấm/phẩy + đúng 3 chữ số = phân cách nghìn -> bỏ
    raw = re.sub(r"[.,](?=\d{3}\b)", "", raw)
    raw = raw.replace(",", ".")
    try:
        v = float(raw)
    except ValueError:
        return None
    if v <= 0:
        return None
    return int(v) if v == int(v) else round(v, 2)


def main():
    if not os.path.exists(DB):
        sys.exit(f"Không thấy {DB}")

    con = sqlite3.connect(DB)
    con.row_factory = sqlite3.Row

    ra = []
    bo_qua_khong_sku = 0
    bo_qua_khong_gia = 0

    imgs_dir = os.path.join(GOC, "images")
    imgs_set = set(os.listdir(imgs_dir)) if os.path.exists(imgs_dir) else set()

    for r in con.execute("SELECT * FROM products"):
        sku = (r["sku"] or "").strip()
        if not sku:
            bo_qua_khong_sku += 1
            continue

        # special_price = 0 nghĩa là KHÔNG giảm giá, không phải giá bằng 0.
        gia = r["special_price"] if (r["special_price"] or 0) > 0 else (r["price"] or 0)
        if not gia or gia <= 0:
            bo_qua_khong_gia += 1
            continue

        try:
            attrs = json.loads(r["attributes"] or "{}")
        except (json.JSONDecodeError, TypeError):
            attrs = {}

        try:
            cats = json.loads(r["categories"] or "[]")
        except (json.JSONDecodeError, TypeError):
            cats = []

        specs = {}
        # Số: chỉ ghi khi bóc được giá trị; khoá đầu tiên thắng (khoá chính đứng
        # trước khoá dự phòng trong SPECS_SO).
        for khoa_nguon, khoa_dich in SPECS_SO.items():
            if khoa_dich in specs:
                continue
            v = attrs.get(khoa_nguon)
            if not v or v == "no_selection":
                continue
            n = so_dau_tien(str(v))
            if n is not None:
                specs[khoa_dich] = n
        # Chuỗi: giữ nguyên, cắt ngắn cho khỏi phình index.
        for khoa_nguon, khoa_dich in SPECS_CHUOI.items():
            v = attrs.get(khoa_nguon)
            if v and v != "no_selection":
                specs[khoa_dich] = str(v).strip()[:120]

        mo_ta = attrs.get("additional_information") or attrs.get("short_description") or ""
        if isinstance(mo_ta, dict):
            mo_ta = mo_ta.get("value") or ""
        mo_ta = re.sub(r"<[^>]+>", " ", str(mo_ta))
        mo_ta = re.sub(r"\s+", " ", mo_ta).strip()[:2000]

        anh = []
        if r["local_image"]:
            anh.append(f"/images/{os.path.basename(r['local_image'])}")
        else:
            found_img = None
            thumb = r["thumbnail"]
            if thumb and thumb != "no_selection":
                base = os.path.basename(thumb)
                if base in imgs_set:
                    found_img = base
            if not found_img and r["url_path"]:
                slug_val = r["url_path"].replace(".html", "").strip("/")
                for ext in [".png", ".jpg", ".jpeg", ".webp"]:
                    for suffix in ["", "_1", "_1_", "_2", "_1_1"]:
                        cand = f"{slug_val}{suffix}{ext}"
                        if cand in imgs_set:
                            found_img = cand
                            break
                    if found_img:
                        break
            if found_img:
                anh.append(f"/images/{found_img}")

        ra.append({
            "sku": sku,
            "name": (r["name"] or "").strip(),
            "handle": r["url_path"].replace(".html", "").strip("/") if r["url_path"] else "",
            "url_path": r["url_path"] or "",
            "price": float(r["price"] or 0),
            "special_price": float(r["special_price"] or 0),
            "stock": int(r["stock"] or 0),
            "brand": (r["brand"] or "").strip() or None,
            "category": cats[0]["uri"] if cats and isinstance(cats[0], dict) else None,
            "description": mo_ta,
            "images": anh,
            "specs": specs,
        })

    con.close()

    with open(RA, "w", encoding="utf-8") as f:
        json.dump(ra, f, ensure_ascii=False)

    print(f"✔ Đã ghi {len(ra):,} sản phẩm → {RA}")
    print(f"  bỏ qua: {bo_qua_khong_sku:,} không có SKU · {bo_qua_khong_gia:,} không có giá")
    co_specs = sum(1 for x in ra if x["specs"])
    print(f"  có ít nhất 1 thuộc tính lọc: {co_specs:,} ({co_specs * 100 // max(len(ra), 1)}%)")


if __name__ == "__main__":
    main()
