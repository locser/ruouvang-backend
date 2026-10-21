import { dongCanXuatKho } from "../hoan-thanh-don"

describe("dongCanXuatKho", () => {
  it("đơn chưa xuất kho: xuất đủ số đặt", () => {
    expect(dongCanXuatKho([{ id: "a", quantity: 2, detail: { quantity: 2, fulfilled_quantity: 0 } }]))
      .toEqual([{ id: "a", quantity: 2 }])
  })
  it("đã Fulfill một phần: chỉ xuất nốt phần còn thiếu", () => {
    expect(dongCanXuatKho([
      { id: "a", quantity: 3, detail: { fulfilled_quantity: 2 } },
      { id: "b", quantity: 1, detail: { fulfilled_quantity: 1 } },
    ])).toEqual([{ id: "a", quantity: 1 }])
  })
  it("đã xuất kho đủ: không còn dòng nào", () => {
    expect(dongCanXuatKho([{ id: "a", quantity: 1, detail: { fulfilled_quantity: 1 } }])).toEqual([])
  })
  it("thiếu items.quantity thì lấy detail.quantity (không coi là 0 chai)", () => {
    expect(dongCanXuatKho([{ id: "a", detail: { quantity: 1, fulfilled_quantity: 0 } }]))
      .toEqual([{ id: "a", quantity: 1 }])
  })
  it("không có dòng hàng", () => {
    expect(dongCanXuatKho(undefined)).toEqual([])
    expect(dongCanXuatKho([])).toEqual([])
  })
})
