/** @type {import('jest').Config} */
module.exports = {
  preset: "ts-jest",
  testEnvironment: "jsdom",
  roots: ["<rootDir>/tests"],
  setupFilesAfterEnv: ["<rootDir>/tests/setup.ts"],
  moduleNameMapper: {
    "^obsidian$": "<rootDir>/tests/__mocks__/obsidian.ts",
    "^components/(.*)$": "<rootDir>/components/$1",
    "^utils/(.*)$": "<rootDir>/utils/$1",
  },
  collectCoverageFrom: [
    "main.ts",
    "utils/**/*.ts",
    "components/suggester.ts",
    "components/article-input.ts",
    "!**/*.d.ts",
    "!**/node_modules/**",
    "!**/tests/**",
    "!**/coverage/**",
  ],
coverageThreshold: {
    "global": {
      "lines": 70
    },
    "utils/**/*.ts": {
      "lines": 70,
      "functions": 70
    }
  }
};
