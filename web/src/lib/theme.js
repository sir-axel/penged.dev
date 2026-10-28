// Light/dark theme helpers. The inline script in index.html applies the first paint; this keeps it in sync after.
export const THEME_KEY = "penged-theme";
// <meta name="theme-color"> follows --background (light 94%, dark 8%).
export const THEME_COLOR = { light: "#f0f0f0", dark: "#141414" };

export const isTheme = (t) => t === "light" || t === "dark";

export function storedTheme() {
  try {
    const t = localStorage.getItem(THEME_KEY);
    return isTheme(t) ? t : null;
  } catch {
    return null;
  }
}

export function systemTheme() {
  try {
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  } catch {
    return "light";
  }
}

/** What the page is showing right now (set before first paint by the inline script). */
export const currentTheme = () => (document.documentElement.classList.contains("dark") ? "dark" : "light");

/** Paint a theme (class, color-scheme, browser chrome colour). Does not store it. */
export function paintTheme(theme) {
  const root = document.documentElement;
  root.classList.toggle("dark", theme === "dark");
  root.style.colorScheme = theme;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", THEME_COLOR[theme]);
}

export function storeTheme(theme) {
  try {
    localStorage.setItem(THEME_KEY, theme);
  } catch {
    /* private mode / blocked storage: the theme just won't survive a reload on this device */
  }
}
