(() => {
  const storageKey = "yu-theme";
  const root = document.documentElement;
  const button = document.querySelector(".theme-toggle");
  const themeMeta = document.querySelector('meta[name="theme-color"]');

  document.querySelectorAll("a[href]").forEach((link) => {
    const href = link.getAttribute("href");

    if (!href) return;

    let destination;

    try {
      destination = new URL(href, window.location.href);
    } catch {
      return;
    }

    const isExternalHttp =
      (destination.protocol === "http:" ||
        destination.protocol === "https:") &&
      destination.origin !== window.location.origin;

    if (!isExternalHttp) return;

    link.target = "_blank";
    const relValues = new Set(
      (link.getAttribute("rel") || "").split(/\s+/).filter(Boolean)
    );
    relValues.add("noopener");
    relValues.add("noreferrer");
    link.setAttribute("rel", [...relValues].join(" "));
  });

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
    const icon = button.querySelector(".theme-toggle-icon");
    root.dataset.theme = isDark ? "dark" : "light";
    button.setAttribute("aria-pressed", String(isDark));
    button.setAttribute(
      "aria-label",
      isDark ? "Switch to light mode" : "Switch to dark mode"
    );
    button.title = isDark ? "Switch to light mode" : "Switch to dark mode";
    icon.textContent = isDark ? "☀︎" : "☾";
    icon.style.color = isDark ? "#f6f6f1" : "";
    icon.style.fontSize = isDark ? "1.25rem" : "";
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
