const { loadEnv } = require("@medusajs/utils");
loadEnv("test", process.cwd());

module.exports = {
  transform: {
    "^.+\\.[jt]s$": [
      "@swc/jest",
      {
        jsc: {
          parser: { syntax: "typescript", decorators: true },
        },
      },
    ],
  },
  testEnvironment: "node",
  moduleFileExtensions: ["js", "ts", "json"],
  modulePathIgnorePatterns: ["dist/", "<rootDir>/.medusa/"],
  setupFiles: ["./integration-tests/setup.js"],
  // Mã dùng chung nằm NGOÀI thư mục này (packages/ cạnh src). Không khai báo
  // ở đây thì Jest không nhìn thấy, và mã dùng chung sẽ mãi không có kiểm thử —
  // đúng loại mã nguy hiểm nhất khi thiếu kiểm thử vì mọi app đều phụ thuộc.
  roots: ["<rootDir>/src", "<rootDir>/integration-tests", "<rootDir>/packages"],
};

if (process.env.TEST_TYPE === "integration:http") {
  module.exports.testMatch = ["**/integration-tests/http/*.spec.[jt]s"];
} else if (process.env.TEST_TYPE === "integration:modules") {
  module.exports.testMatch = ["**/src/modules/*/__tests__/**/*.[jt]s"];
} else if (process.env.TEST_TYPE === "unit") {
  module.exports.testMatch = [
    "**/src/**/__tests__/**/*.unit.spec.[jt]s",
    "**/packages/**/__tests__/**/*.unit.spec.[jt]s",
  ];
}
