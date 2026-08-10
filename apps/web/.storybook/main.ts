import path from "path";
import { fileURLToPath } from "url";
import type { StorybookConfig } from "@storybook/react-vite";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const config: StorybookConfig = {
  stories: ["../src/**/*.stories.@(js|jsx|mjs|ts|tsx)"],
  addons: [],
  framework: {
    name: "@storybook/react-vite",
    options: {},
  },
  viteFinal: async (config) => {
    config.resolve = {
      ...config.resolve,
      alias: {
        ...(typeof config.resolve?.alias === "object" ? config.resolve.alias : {}),
        "@": path.resolve(__dirname, "../src"),
      },
    };
    config.define = {
      ...config.define,
      "process.env": "{}",
    };
    config.esbuild = {
      ...config.esbuild,
      jsx: "automatic",
    };
    return config;
  },
};

export default config;
