/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        bg: "var(--color-bg)",
        surface: "var(--color-surface)",
        "surface-elevated": "var(--color-surface-elevated)",
        hover: "var(--color-hover)",
        border: "var(--color-border)",
        text: {
          DEFAULT: "var(--color-text)",
          secondary: "var(--color-text-secondary)",
        },
        muted: "var(--color-muted)",
        primary: "var(--color-primary)",
        card: "var(--color-card)",
        sidebar: "var(--color-sidebar)",
        "icon-success": "var(--color-icon-success)",
        "icon-warning": "var(--color-icon-warning)",
        "icon-danger": "var(--color-icon-danger)",
        "icon-info": "var(--color-icon-info)",
      },
      fontFamily: {
        sans: "var(--font-sans)",
        mono: "var(--font-mono)",
      },
      spacing: {
        "safe": "var(--radius-md)",
      },
      borderRadius: {
        sm: "var(--radius-sm)",
        md: "var(--radius-md)",
        lg: "var(--radius-lg)",
        xl: "var(--radius-xl)",
      },
      boxShadow: {
        sm: "var(--shadow-sm)",
        md: "var(--shadow-md)",
        lg: "var(--shadow-sidebar)",
      },
      transitionDuration: {
        fast: "var(--transition-fast)",
        normal: "var(--transition-normal)",
      },
    },
  },
  plugins: [],
}
