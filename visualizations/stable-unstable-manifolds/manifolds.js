(() => {
  'use strict';

  function initializeManifolds() {
    const surfaceSelect = document.getElementById('manifold-surface');
    const torusRoot = document.getElementById('torus-flow-visual');
    const sphereRoot = document.getElementById('sphere-flow-visual');
    const sphereShape = document.getElementById('sphere-shape');
    if (!surfaceSelect || !torusRoot || !sphereRoot || !sphereShape ||
      surfaceSelect.dataset.manifoldControllerInitialized === 'true') return;
    surfaceSelect.dataset.manifoldControllerInitialized = 'true';

    const note = document.getElementById('manifold-surface-note');
    const sphereHelp = document.getElementById('sphere-help');
    const surfaces = new Set(['torus', 'round', 'deformed']);
    const descriptions = {
      torus: 'Torus selected. Use the critical point and view menus to explore the flow.',
      round: 'Round sphere selected. The minimum and maximum are the two critical points.',
      deformed: 'Deformed sphere selected. Two maxima, one saddle, and one minimum.'
    };
    let currentSurface = null;

    // Keep the original shape control as a private compatibility input. All
    // visible surface selection belongs to the single native menu above.
    sphereShape.hidden = true;
    sphereShape.setAttribute('aria-hidden', 'true');
    sphereShape.tabIndex = -1;

    function surfaceFromURL() {
      const value = new URL(window.location.href).searchParams.get('surface');
      return surfaces.has(value) ? value : 'torus';
    }
    function updateURL(surface) {
      const url = new URL(window.location.href);
      if (url.searchParams.get('surface') === surface) return;
      url.searchParams.set('surface', surface);
      try {
        // Preserve other query parameters, the reading anchor and history state.
        window.history.replaceState(window.history.state, '', url.href);
      } catch { /* The menu still works when history writes are unavailable. */ }
    }
    function selectSurface(value, writeURL = false) {
      const surface = surfaces.has(value) ? value : 'torus';
      surfaceSelect.value = surface;
      if (surface !== currentSurface) {
        const oldRoot = currentSurface === 'torus' ? torusRoot : currentSurface ? sphereRoot : null;
        if (oldRoot) oldRoot.dispatchEvent(new CustomEvent('manifold:deactivate'));

        torusRoot.hidden = surface !== 'torus';
        sphereRoot.hidden = surface === 'torus';
        if (surface !== 'torus') sphereShape.value = surface;
        if (sphereHelp) sphereHelp.textContent = surface === 'round'
          ? 'Drag horizontally or use the buttons to rotate the sphere.'
          : 'Drag horizontally or use the buttons to rotate; turning the surface reveals the rear saddle branch.';
        if (note) note.textContent = descriptions[surface];

        const newRoot = surface === 'torus' ? torusRoot : sphereRoot;
        currentSurface = surface;
        // Reveal before activation: each renderer reads its actual canvas size,
        // refreshes the theme, and reuses its cached geometry and current state.
        newRoot.dispatchEvent(new CustomEvent('manifold:activate', {
          detail: { surface, shape: surface === 'torus' ? null : surface }
        }));
      }
      if (writeURL) updateURL(surface);
    }

    surfaceSelect.addEventListener('change', () => selectSurface(surfaceSelect.value, true));
    const restoreSurface = () => selectSurface(surfaceFromURL());
    window.addEventListener('popstate', restoreSurface);
    window.addEventListener('hashchange', restoreSurface);
    // Hash/history events for the same surface leave selection and rotation as-is.
    selectSurface(surfaceFromURL());
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeManifolds, { once: true });
  } else initializeManifolds();
})();
