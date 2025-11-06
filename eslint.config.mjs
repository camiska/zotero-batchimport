// @ts-check Let TS check this config file

import zotero from "@zotero-plugin/eslint-config";

const base = zotero({
  overrides: [
    {
      files: ["**/*.ts"],
      rules: {
        "@typescript-eslint/no-unused-vars": "off",
      },
    },
  ],
});

export default [
  ...base,
  {
    ignores: [".vscode/**", ".github/**", "**/*.md"],
  },
];
