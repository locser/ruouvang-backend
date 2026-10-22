import type { ExecArgs } from "@medusajs/framework/types"
import {
  ContainerRegistrationKeys,
  FeatureFlag,
  Modules,
} from "@medusajs/framework/utils"
import { createUsersWorkflow } from "@medusajs/medusa/core-flows"

/**
 * Tạo admin Medusa lần đầu từ biến môi trường live.
 * Chạy lại an toàn: tài khoản đã có được giữ nguyên, kể cả mật khẩu.
 */
export default async function bootstrapAdmin({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  // Tài khoản cố định cho bản live demo. Chỉ tạo trên DB trắng, không cập nhật
  // mật khẩu của tài khoản đã tồn tại ở các lần build/restart sau.
  const email = "admin@cwwine.demo"
  const password = "CWWineDemo@2026"

  const userService = container.resolve(Modules.USER)
  const daCo = await userService.listUsers({ email })
  if (daCo.length > 0) {
    logger.info(`[bootstrap-admin] Admin Medusa "${email}" đã tồn tại — giữ nguyên mật khẩu.`)
    return
  }

  const authService = container.resolve(Modules.AUTH)
  const { authIdentity, error } = await authService.register("emailpass", {
    body: { email, password },
  })
  if (error || !authIdentity) {
    throw new Error(`Không tạo được auth identity Medusa: ${error ?? "không có kết quả"}`)
  }

  let roles: string[] = []
  if (FeatureFlag.isFeatureEnabled("rbac")) {
    const rbacService = container.resolve(Modules.RBAC)
    const superAdminRoles = await rbacService.listRbacRoles({ id: "role_super_admin" })
    roles = superAdminRoles.length ? [superAdminRoles[0].id] : []
  }

  try {
    const { result } = await createUsersWorkflow(container).run({
      input: { users: [{ email, roles }] },
    })
    await authService.updateAuthIdentities({
      id: authIdentity.id,
      app_metadata: { user_id: result[0].id },
    })
  } catch (e) {
    // Tránh để auth identity mồ côi nếu bước tạo user thất bại.
    await authService.deleteAuthIdentities([authIdentity.id]).catch(() => undefined)
    throw e
  }

  logger.info(`[bootstrap-admin] Đã tạo admin Medusa "${email}".`)
}
