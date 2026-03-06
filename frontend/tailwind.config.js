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
        /* Dashboard status colors */
        "dashboard-success": "var(--color-dashboard-success)",
        "dashboard-success-bg": "var(--color-dashboard-success-bg)",
        "dashboard-warning": "var(--color-dashboard-warning)",
        "dashboard-warning-bg": "var(--color-dashboard-warning-bg)",
        "dashboard-danger": "var(--color-dashboard-danger)",
        "dashboard-danger-bg": "var(--color-dashboard-danger-bg)",
        "dashboard-info": "var(--color-dashboard-info)",
        "dashboard-info-bg": "var(--color-dashboard-info-bg)",
        /* Dashboard metric colors */
        "dashboard-metric-primary": "var(--color-dashboard-metric-primary)",
        "dashboard-metric-secondary": "var(--color-dashboard-metric-secondary)",
        "dashboard-metric-tertiary": "var(--color-dashboard-metric-tertiary)",
        "dashboard-metric-quaternary": "var(--color-dashboard-metric-quaternary)",
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
