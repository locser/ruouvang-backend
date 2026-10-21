/// <reference types="vite/client" />

// Các biến do Vite của Medusa Admin bơm vào lúc build.
// Thiếu khai báo này thì src/admin/lib/sdk.ts báo lỗi "Cannot find name".
declare const __BASE__: string
declare const __BACKEND_URL__: string
declare const __STOREFRONT_URL__: string
