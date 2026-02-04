module.exports = {
  root: true,
  env: {
    browser: true,
    es2022: true,
    node: true,
  },
  extends: [
    "eslint:recommended",
    "plugin:@typescript-eslint/recommended",
    "prettier",
  ],
  parser: "@typescript-eslint/parser",
  parserOptions: {
    ecmaVersion: "latest",
    sourceType: "module",
  },
  plugins: ["@typescript-eslint"],
  ignorePatterns: [
    "node_modules",
    "dist",
    "build",
    "cdk.out",
    "*.js",
    "*.cjs",
    "*.mjs",
    "!.eslintrc.cjs",
  ],
  rules: {
    "@typescript-eslint/no-explicit-any": "warn",
    "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
    "no-unused-vars": "off",
  },
  overrides: [
    // React files
    {
      files: ["packages/frontend/**/*.tsx", "packages/frontend/**/*.ts"],
      extends: [
        "plugin:react/recommended",
        "plugin:react-hooks/recommended",
      ],
      plugins: ["react", "react-hooks"],
      settings: {
        react: {
          version: "detect",
        },
      },
      rules: {
        "react/react-in-jsx-scope": "off",
        "react/prop-types": "off",
        "react/no-unescaped-entities": "off",
      },
    },
    // Cypress files
    {
      files: ["**/cypress/**/*.ts"],
      rules: {
        "@typescript-eslint/no-namespace": "off",
      },
    },
  ],
};
