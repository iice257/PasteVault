import { ChevronDown, Monitor, Moon, Sun } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "../ui/dropdown-menu";
import { ActionButton } from "./ActionButton";

export function ThemeMenu({ theme, setTheme, buttonLabel = "Theme" }) {
  const applySystem = () => {
    setTheme(window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <ActionButton icon={Sun} aria-label="Theme menu" aria-pressed={theme === "light"}>
          {buttonLabel}
          <ChevronDown size={14} />
        </ActionButton>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="pv-menu" align="end">
        <DropdownMenuItem active={theme === "light"} onSelect={() => setTheme("light")}>
          <Sun size={16} />
          Light
        </DropdownMenuItem>
        <DropdownMenuItem active={theme === "dark"} onSelect={() => setTheme("dark")}>
          <Moon size={16} />
          Dark
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={applySystem}>
          <Monitor size={16} />
          System
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
