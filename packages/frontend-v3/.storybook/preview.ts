import type { Preview } from "@storybook/react";
import "../src/styles/globals.css";

const preview: Preview = {
  parameters: {
    backgrounds: {
      default: "dark",
      values: [
        { name: "dark", value: "#0B0D0F" },
        { name: "light", value: "#F7F6F2" },
      ],
    },
  },
};

export default preview;
