import { SubscriberArgs, SubscriberConfig } from "@medusajs/framework";
import { docCauHinhSmtp } from "../lib/email-don-hang";
import { guiEmailDatLaiMatKhau } from "../lib/email-dat-lai-mat-khau";

/**
 * Khi khách xin khôi phục mật khẩu (`POST /auth/customer/emailpass/reset-password`),
 * Medusa sinh token và phát sự kiện `auth.password_reset`. Subscriber này gửi email
 * kèm link đặt mật khẩu mới.
 *
 * Chỉ xử lý khách hàng (`actor_type = customer`): sự kiện này cũng phát cho tài khoản
 * quản trị, và email quản trị không đi qua trang của storefront.
 * Không ném lỗi: gửi mail hỏng chỉ ghi log, token không bao giờ được ghi vào log.
 */
export default async function passwordResetHandler({
  event: { data },
  container,
}: SubscriberArgs<{ entity_id: string; actor_type: string; token: string }>) {
  if (data.actor_type !== "customer") return;

  // SMTP lấy từ module cài đặt cửa hàng (không còn đọc SMTP_* từ env).
  const smtp = await docCauHinhSmtp(container);
  await guiEmailDatLaiMatKhau({ email: data.entity_id, token: data.token }, { smtp });
}

export const config: SubscriberConfig = { event: "auth.password_reset" };
