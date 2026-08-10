# Yu-Chi Hou's academic website

This repository publishes the site at <https://yu-chihou.github.io>.

## Updating the site on GitHub

1. Open the file for the page you want to change.
2. Select the pencil icon (`Edit this file`).
3. Change the relevant text or link.
4. Select `Commit changes`.

GitHub Pages will publish the update automatically. Most changes appear within
ten minutes.

Page files:

- `index.html`: home and contact information
- `research.html`: publications, preprints, and notes
- `activities.html`: talks, seminars, and service
- `mathematicians.html`: mathematician directory
- `misc.html`: books, albums, films, and other interests
- `styles.css`: colors, spacing, typography, and responsive layout

Long-form content is grouped by type instead of being placed in the repository
root. Use this pattern for new pages:

- `reviews/books/<slug>/index.html`: book reviews
- `reviews/albums/<slug>/index.html`: album reviews
- `reviews/films/<slug>/index.html`: film reviews

The `<slug>` should be a short, lowercase, hyphen-separated name. For example,
the review of *Elected American* lives at
`reviews/books/elected-american/index.html` and is published at
`/reviews/books/elected-american/`.
