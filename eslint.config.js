import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.strict,
  {
    files: ["engine/**/*.ts"],
    rules: {
      // Engine purity: no browser APIs, no ambient time/randomness.
      // Current date and random numbers must be injected as arguments.
      "no-restricted-globals": [
        "error",
        { name: "window", message: "engine/ must not touch browser APIs" },
        { name: "document", message: "engine/ must not touch browser APIs" },
        { name: "navigator", message: "engine/ must not touch browser APIs" },
        { name: "localStorage", message: "engine/ must not touch browser APIs" },
        { name: "fetch", message: "engine/ must be pure; no I/O" }
      ],
      "no-restricted-properties": [
        "error",
        { object: "Date", property: "now", message: "Inject current date as an argument" },
        { object: "Math", property: "random", message: "Inject RNG (seeded PRNG) as an argument" }
      ],
      "no-restricted-syntax": [
        "error",
        {
          selector: "NewExpression[callee.name='Date'][arguments.length=0]",
          message: "new Date() reads wall-clock time; inject current date as an argument"
        }
      ]
    }
  },
  {
    ignores: ["node_modules/", "dist/", "coverage/"]
  }
);
