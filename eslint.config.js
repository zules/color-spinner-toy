// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require("eslint-config-expo/flat");

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ["dist/*"],
  },
  {
    rules: {
      // Reanimated shared values are mutable boxes written via `.value` —
      // that's the documented API (spec §6: rotation IS a shared value), but
      // this rule can't model it and flags every write.
      "react-hooks/immutability": "off",
    },
  },
]);
