/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["VK Sans Text", "Inter", "system-ui", "sans-serif"],
        display: ["VK Sans Display", "VK Sans Text", "sans-serif"],
        mono: ["VK Sans Mono", "ui-monospace", "monospace"],
      },
      colors: {
        ink: "#211D16", muted: "#726A5B", faint: "#9C9385",
        line: "#E7DFD0", bg: "#F4EFE6", bg2: "#EFE8DB", surface: "#FDFBF6",
        teal: "#0FB39A", purple: "#6D5AE6", coral: "#E8734A",
        amber: "#D98A16", good: "#2C9E68", danger: "#D9534F",
      },
      boxShadow: {
        glow: "0 0 0 4px rgba(15,179,154,.22), 0 10px 28px rgba(15,179,154,.28)",
        soft: "0 1px 2px rgba(40,30,10,.04)",
      },
    },
  },
  plugins: [],
};
