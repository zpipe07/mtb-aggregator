import React from "react";
import type { Preview } from "@storybook/react";
import "../src/app/globals.css";

const preview: Preview = {
  parameters: {
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },
    layout: "centered",
    backgrounds: {
      default: "light",
      values: [
        { name: "light", value: "#faf9f7" },
        { name: "dark", value: "#1B3022" },
      ],
    },
  },
  globalTypes: {
    theme: {
      description: "Theme for palette iteration",
      toolbar: {
        title: "Theme",
        icon: "paintbrush",
        items: [
          { value: "light", title: "Light" },
          { value: "dark", title: "Dark" },
        ],
        dynamicTitle: true,
      },
    },
  },
  initialGlobals: {
    theme: "light",
  },
  decorators: [
    (Story, context) => {
      const theme = context.globals?.theme ?? "light";
      return (
        <div className={theme === "dark" ? "dark" : ""} style={{ minHeight: "100vh" }}>
          <Story />
        </div>
      );
    },
  ],
};

export default preview;
