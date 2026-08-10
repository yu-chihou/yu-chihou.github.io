(() => {
  const collections = {
    books: {
      target: "books-grid",
      dateLabel: "Read",
      imageLabel: "Book cover for",
    },
    albums: {
      target: "albums-grid",
      dateLabel: "Listened",
      imageLabel: "Album cover for",
    },
    films: {
      target: "films-grid",
      dateLabel: "Watched",
      imageLabel: "Film poster for",
    },
  };

  const formatDate = (value) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value || "")) {
      return value;
    }

    const [year, month, day] = value.split("-").map(Number);
    const date = new Date(Date.UTC(year, month - 1, day));

    return new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      timeZone: "UTC",
    }).format(date);
  };

  const createCard = (item, type, settings) => {
    const card = document.createElement("article");
    card.className = "media-card";
    card.dataset.kind = type;

    const content = document.createElement(item.url ? "a" : "div");
    content.className = "media-card-link";

    if (item.url) {
      content.href = item.url;
      content.target = "_blank";
      content.rel = "noopener noreferrer";
    }

    const image = document.createElement("img");
    image.className = "media-cover";
    image.src = item.image;
    image.alt = `${settings.imageLabel} ${item.title}`;
    image.loading = "lazy";
    image.decoding = "async";

    const copy = document.createElement("div");
    copy.className = "media-card-copy";

    const title = document.createElement("h2");
    title.className = "media-card-title";
    title.textContent = item.title;

    const metadata = document.createElement("p");
    metadata.className = "media-card-meta";

    const dateText = item.date
      ? `${settings.dateLabel} ${formatDate(item.date)}`
      : "";

    metadata.textContent = [
      item.creator,
      item.year,
      dateText,
    ]
      .filter(Boolean)
      .join(" · ");

    copy.append(title, metadata);

    if (item.note) {
      const note = document.createElement("p");
      note.className = "media-card-note";
      note.textContent = item.note;
      copy.append(note);
    }

    content.append(image, copy);
    card.append(content);

    return card;
  };

  const showMessage = (target, message) => {
    const paragraph = document.createElement("p");
    paragraph.className = "media-grid-message";
    paragraph.textContent = message;
    target.append(paragraph);
  };

  fetch("misc-data.json", {
    cache: "no-store",
    credentials: "same-origin",
  })
    .then((response) => {
      if (!response.ok) {
        throw new Error("Could not load misc-data.json");
      }

      return response.json();
    })
    .then((data) => {
      Object.entries(collections).forEach(([type, settings]) => {
        const target = document.getElementById(settings.target);
        if (!target) return;

        const items = Array.isArray(data[type]) ? data[type] : [];

        if (items.length === 0) {
          showMessage(target, "Nothing added yet.");
          return;
        }

        items.forEach((item) => {
          target.append(createCard(item, type, settings));
        });
      });
    })
    .catch(() => {
      Object.values(collections).forEach((settings) => {
        const target = document.getElementById(settings.target);

        if (target) {
          showMessage(
            target,
            "This collection is temporarily unavailable."
          );
        }
      });
    });
})();
