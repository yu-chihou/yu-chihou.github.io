(() => {
  const storageKey = "yu-theme";
  const root = document.documentElement;
  const button = document.querySelector(".theme-toggle");
  const themeMeta = document.querySelector('meta[name="theme-color"]');

  if (!button) return;

  const getSavedTheme = () => {
    try {
      return localStorage.getItem(storageKey);
    } catch {
      return null;
    }
  };

  const applyTheme = (theme, persist = false) => {
    const isDark = theme === "dark";
    root.dataset.theme = isDark ? "dark" : "light";
    button.setAttribute("aria-pressed", String(isDark));
    button.setAttribute(
      "aria-label",
      isDark ? "Switch to light mode" : "Switch to dark mode"
    );
    button.title = isDark ? "Switch to light mode" : "Switch to dark mode";
    button.querySelector(".theme-toggle-icon").textContent = isDark ? "☀" : "☾";
    if (themeMeta) themeMeta.content = isDark ? "#171b1e" : "#f6f6f1";

    if (persist) {
      try {
        localStorage.setItem(storageKey, root.dataset.theme);
      } catch {
        // The selected theme still works for this page view.
      }
    }
  };

  applyTheme(root.dataset.theme || "light");

  button.addEventListener("click", () => {
    applyTheme(root.dataset.theme === "dark" ? "light" : "dark", true);
  });

  const systemTheme = window.matchMedia("(prefers-color-scheme: dark)");
  systemTheme.addEventListener?.("change", (event) => {
    if (!getSavedTheme()) applyTheme(event.matches ? "dark" : "light");
  });
})();
