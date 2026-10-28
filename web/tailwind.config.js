import animate from "tailwindcss-animate";

const c = (name) => `hsl(var(--${name}) / <alpha-value>)`;

/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ["class"],
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      fontFamily: {
        display: ["var(--font-display)"],
        heading: ["var(--font-heading)"],
        body: ["var(--font-body)"],
        mono: ["var(--font-mono)"],
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      colors: {
        background: c("background"),
        foreground: c("foreground"),
        card: { DEFAULT: c("card"), foreground: c("card-foreground") },
        popover: { DEFAULT: c("popover"), foreground: c("popover-foreground") },
        primary: { DEFAULT: c("primary"), foreground: c("primary-foreground") },
        secondary: { DEFAULT: c("secondary"), foreground: c("secondary-foreground") },
        muted: { DEFAULT: c("muted"), foreground: c("muted-foreground") },
        accent: { DEFAULT: c("accent"), foreground: c("accent-foreground") },
        destructive: { DEFAULT: c("destructive"), foreground: c("destructive-foreground") },
        border: c("border"),
        input: c("input"),
        ring: c("ring"),
        brand: { DEFAULT: c("brand"), foreground: c("brand-foreground"), soft: c("brand-soft") },
        success: c("success"),
        warning: c("warning"),
      },
    },
  },
  plugins: [animate],
};
