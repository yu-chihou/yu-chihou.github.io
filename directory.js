(() => {
  const search = document.querySelector("#directory-search");
  const groups = [...document.querySelectorAll(".directory-group")];
  const count = document.querySelector("#directory-count");
  const empty = document.querySelector("#directory-empty");

  if (!search || !groups.length || !count || !empty) {
    return;
  }

  const normalize = (value) =>
    value
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLocaleLowerCase();

  const entries = groups.flatMap((group) => [
    ...group.querySelectorAll(".people-directory li"),
  ]);
  const total = entries.length;

  const filterDirectory = () => {
    const query = normalize(search.value.trim());
    let visible = 0;

    groups.forEach((group) => {
      let visibleInGroup = 0;

      group.querySelectorAll(".people-directory li").forEach((entry) => {
        const matches = normalize(entry.textContent).includes(query);
        entry.hidden = !matches;

        if (matches) {
          visible += 1;
          visibleInGroup += 1;
        }
      });

      group.hidden = visibleInGroup === 0;

      const indexLink = document.querySelector(
        `.directory-index a[href="#${group.id}"]`
      );

      if (indexLink) {
        indexLink.hidden = visibleInGroup === 0;
      }
    });

    count.textContent = query ? `${visible} of ${total} names` : `${total} names`;
    empty.hidden = visible !== 0;
  };

  search.addEventListener("input", filterDirectory);
  search.addEventListener("search", filterDirectory);
  filterDirectory();
})();

(() => {
  const button = document.querySelector(".scroll-to-top");

  if (!button) {
    return;
  }

  let ticking = false;

  const updateVisibility = () => {
    const visible = window.scrollY > 480;
    button.classList.toggle("is-visible", visible);
    button.setAttribute("aria-hidden", String(!visible));
    button.tabIndex = visible ? 0 : -1;
  };

  const handleScroll = () => {
    if (ticking) {
      return;
    }

    ticking = true;
    window.requestAnimationFrame(() => {
      updateVisibility();
      ticking = false;
    });
  };

  button.addEventListener("click", () => {
    const reduceMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches;

    window.scrollTo({
      top: 0,
      behavior: reduceMotion ? "auto" : "smooth",
    });
  });

  window.addEventListener("scroll", handleScroll, { passive: true });
  updateVisibility();
})();
