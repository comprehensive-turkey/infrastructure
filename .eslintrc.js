module.exports = {
  extends: [
    "eslint:recommended",
    "plugin:eslint-plugin-import/recommended",
    "plugin:eslint-plugin-import/typescript",
    "eslint-config-airbnb-typescript/base",
    "plugin:@typescript-eslint/eslint-plugin/recommended",
    "plugin:@typescript-eslint/eslint-plugin/recommended-requiring-type-checking",
    "plugin:eslint-plugin-prettier/recommended",
  ],
  parserOptions: {
    project: "tsconfig.json",
  },
};
