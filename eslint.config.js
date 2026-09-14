import js from "@eslint/js";
import globals from "globals";
import react from "eslint-plugin-react";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";

export default [
  { ignores: ["dist"] },
  {
    files: ["**/*.{js,jsx}"],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
      parserOptions: {
        ecmaVersion: "latest",
        ecmaFeatures: { jsx: true },
        sourceType: "module",
      },
    },
    settings: { react: { version: "18.3" } },
    plugins: {
      react,
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...js.configs.recommended.rules,
      ...react.configs.recommended.rules,
      ...react.configs["jsx-runtime"].rules,
      ...reactHooks.configs.recommended.rules,
      "react/jsx-no-target-blank": "off",
      "react/prop-types": 0,
      // GlobalAlertProvider swaps window.confirm for an in-app dialog that
      // returns a Promise<boolean>. Without await the Promise is truthy, so the
      // action runs before the user answers.
      "no-restricted-syntax": [
        "error",
        {
          selector: "CallExpression[callee.object.name='window'][callee.property.name='confirm']:not(AwaitExpression > CallExpression)",
          message: "window.confirm returns a Promise here (GlobalAlertProvider). Await it: `if (!(await window.confirm(msg))) return;`, or the action runs before the user answers.",
        },
      ],
      "no-restricted-globals": [
        "error",
        { name: "confirm", message: "Use `await window.confirm(...)`. It returns a Promise (GlobalAlertProvider)." },
      ],
      "react-refresh/only-export-components": [
        "warn",
        { allowConstantExport: true },
      ],
    },
  },
];
