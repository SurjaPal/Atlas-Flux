// ESLint flat config — CommonJS project, Node-only runtime, Mocha for tests.
const js = require("@eslint/js");

module.exports = [
  {
    ignores: [
      "node_modules/**",
      "artifacts/**",
      "cache/**",
      "coverage/**",
      "layer5/dashboard.html",
      "layer5/data/**",
      "pipeline/data/**",
    ],
  },
  js.configs.recommended,
  {
    files: ["**/*.js"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "commonjs",
      globals: {
        console: "readonly",
        process: "readonly",
        require: "readonly",
        module: "writable",
        exports: "writable",
        __dirname: "readonly",
        __filename: "readonly",
        Buffer: "readonly",
        setTimeout: "readonly",
        setInterval: "readonly",
        clearTimeout: "readonly",
        clearInterval: "readonly",
        Date: "readonly",
        Math: "readonly",
        JSON: "readonly",
        Promise: "readonly",
      },
    },
    rules: {
      "no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      "no-console": "off", // this repo's demos deliberately print measured results
    },
  },
  {
    files: ["test/**/*.js"],
    languageOptions: {
      globals: {
        describe: "readonly",
        it: "readonly",
        before: "readonly",
        after: "readonly",
        beforeEach: "readonly",
        afterEach: "readonly",
      },
    },
  },
];
