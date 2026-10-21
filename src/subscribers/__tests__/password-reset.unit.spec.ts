const mockGui = jest.fn();

jest.mock("../../lib/email-dat-lai-mat-khau", () => ({
  guiEmailDatLaiMatKhau: (...args: unknown[]) => mockGui(...args),
}));

jest.mock("../../lib/email-don-hang", () => ({
  docCauHinhSmtp: async () => ({ host: "h", port: 587, user: "u", pass: "p", from: "u" }),
}));

import { AuthWorkflowEvents } from "@medusajs/framework/utils";
import passwordResetHandler, { config } from "../password-reset";

const goi = (data: { entity_id: string; actor_type: string; token: string }) =>
  passwordResetHandler({ event: { data, name: "auth.password_reset" }, container: { resolve: jest.fn() } } as any);

describe("subscriber password-reset", () => {
  beforeEach(() => mockGui.mockReset());

  it("lắng nghe đúng sự kiện mà Medusa phát khi khách xin khôi phục mật khẩu", () => {
    expect(config.event).toBe(AuthWorkflowEvents.PASSWORD_RESET);
    expect(config.event).toBe("auth.password_reset");
  });

  it("khách hàng: gửi mail với email (entity_id) và token", async () => {
    await goi({ entity_id: "khach@example.com", actor_type: "customer", token: "tok-1" });
    expect(mockGui).toHaveBeenCalledTimes(1);
    expect(mockGui).toHaveBeenCalledWith(
      { email: "khach@example.com", token: "tok-1" },
      { smtp: { host: "h", port: 587, user: "u", pass: "p", from: "u" } }
    );
  });

  it("tài khoản quản trị (user): KHÔNG gửi, vì link đặt lại là của storefront", async () => {
    await goi({ entity_id: "admin@example.com", actor_type: "user", token: "tok-2" });
    expect(mockGui).not.toHaveBeenCalled();
  });
});
