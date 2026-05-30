import { useState, useEffect } from "react";
import { Switch } from "../../components/Switch/Switch";

const THEME_KEY = "gda-theme";

function getStoredTheme(): "dark" | "light" {
  try {
    const stored = localStorage.getItem(THEME_KEY);
    if (stored === "light") return "light";
  } catch { /* noop */ }
  return "dark";
}

function applyTheme(theme: "dark" | "light") {
  document.documentElement.setAttribute("data-theme", theme);
  try { localStorage.setItem(THEME_KEY, theme); } catch { /* noop */ }
}

export function Appearance() {
  const [theme, setTheme] = useState<"dark" | "light">(getStoredTheme);

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  return (
    <div className="max-w-md">
      <h2 className="text-lg font-semibold text-ink-primary mb-4">Appearance</h2>
      <Switch
        checked={theme === "light"}
        onChange={(checked) => setTheme(checked ? "light" : "dark")}
        label="Light theme"
      />
      <p className="mt-2 text-xs text-ink-muted">
        Toggle between dark (default) and light mode. Preference is saved locally.
      </p>
    </div>
  );
}
