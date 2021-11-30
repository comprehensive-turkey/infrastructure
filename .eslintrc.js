module.exports = {
  extends: [
    "eslint:recommended",
    "eslint-config-airbnb-typescript/base",
    "plugin:@typescript-eslint/eslint-plugin/recommended",
    "plugin:@typescript-eslint/eslint-plugin/recommended-requiring-type-checking",
    "eslint-config-prettier",
  ],
  rules: {
    "prettier/prettier": ["error"],
  },
  plugins: ["eslint-plugin-prettier"],
  parserOptions: {
    project: "tsconfig.json",
  },
};
