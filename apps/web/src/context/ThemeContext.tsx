import {
  createContext,
  useContext,
  useEffect,
  useMemo,
} from "react";

/** Public UI is light-only (Workshop Modern). `.dark` is not applied. */
type Theme = "light";

type ThemeContextValue = {
  theme: Theme;
  /** No-op: kept for API stability; document stays light. */
  setTheme: (theme: "light" | "dark") => void;
  /** No-op */
  toggleTheme: () => void;
  isSystem: false;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

function forceLightDocument() {
  if (typeof document !== "undefined") {
    document.documentElement.classList.remove("dark");
  }
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    forceLightDocument();
  }, []);

  const value = useMemo<ThemeContextValue>(
    () => ({
      theme: "light",
      setTheme: () => {
        forceLightDocument();
      },
      toggleTheme: () => {
        forceLightDocument();
      },
      isSystem: false,
    }),
    [],
  );

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error("useTheme must be used within ThemeProvider");
  }
  return ctx;
}
