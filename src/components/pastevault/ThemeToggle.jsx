import { Moon, Sun } from "lucide-react";
import { ActionButton } from "./ActionButton";

export function ThemeToggle({ theme, toggleTheme, compact = false }) {
  const isDark = theme === "dark";
  const Icon = isDark ? Moon : Sun;

  return (
    <ActionButton
      icon={Icon}
      compact={compact}
      aria-label="Theme toggle"
      aria-pressed={isDark}
      onClick={toggleTheme}
    >
      {isDark ? "Dark" : "Light"}
    </ActionButton>
  );
}
