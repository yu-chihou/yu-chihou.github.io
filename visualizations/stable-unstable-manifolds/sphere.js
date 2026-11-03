(() => {
  'use strict';

  function initializeSphere() {
    const root = document.getElementById('sphere-flow-visual');
    if (!root || root.dataset.sphereInitialized === 'true') return;
    const find = id => root.querySelector('#sphere-' + id);
    const canvas = find('canvas');
    const criticalSelect = find('critical');
    const shapeSelect = find('shape');
    const stableCheck = find('stable');
    const unstableCheck = find('unstable');
    const play = find('play');
    const stableLabel = find('stable-label');
    const unstableLabel = find('unstable-label');
    const cutKey = find('cut-key');
    const viewKey = find('view-key');
    const detail = find('detail');
    const turnLeft = find('turn-left');
    const turnRight = find('turn-right');
    const frontView = find('front-view');
    const probe = root.querySelector('.sphere-probe');
    if (![canvas, criticalSelect, shapeSelect, stableCheck, unstableCheck, play,
      stableLabel, unstableLabel, cutKey, viewKey, detail, probe].every(Boolean)) return;
    let ctx;
    try { ctx = canvas.getContext('2d'); } catch { /* Keep the page text available. */ }
    if (!ctx) {
      detail.textContent = 'The interactive view is unavailable in this browser.';
      for (const control of [criticalSelect, shapeSelect, stableCheck, unstableCheck,
        play, turnLeft, turnRight, frontView]) if (control) control.disabled = true;
      return;
    }
    const sceneCanvas = document.createElement('canvas');
    const sceneContext = sceneCanvas.getContext('2d');
    const colorCanvas = document.createElement('canvas');
    colorCanvas.width = colorCanvas.height = 1;
    const colorContext = colorCanvas.getContext('2d');
    if (!colorContext) return;
    root.dataset.sphereInitialized = 'true';
    canvas.style.touchAction = 'pan-y';

    const PI = Math.PI, TAU = 2 * PI;
    const normalize = p => {
      const norm = Math.hypot(p[0], p[1], p[2]);
      return p.map(x => x / norm);
    };
    const distance = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
    const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
    const mix = (a, b, t) => a.map((x, i) => Math.round(x * (1 - t) + b[i] * t));
    const rgb = a => 'rgb(' + a.map(Math.round).join(',') + ')';
    const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
    const deformedAngles = {
      a: PI,
      b: .04295242244699,
      c: .80433834040444,
      d: -.82986282956970
    };
    for (const id of Object.keys(deformedAngles)) {
      let theta = deformedAngles[id];
      for (let i = 0; i < 5; i++) {
        const x = Math.sin(theta), z = Math.cos(theta), t = 1 + z;
        const K = x * t * t * t - .15 * t;
        const L = 1 + 1.5 * x * x * t * t - .15 * x;
        const derivative = t * t * t * z * z - 2 * (3 * x * t * t - .15) * x * z
          + 3 * x * x * x * x * t - K * x - L * z;
        theta -= (K * z - L * x) / derivative;
      }
      deformedAngles[id] = theta;
    }
    const models = new Map();
    // Geometry and the canvas remain dormant until selected by the controller.
    let active = false;
    const isActive = () => active && !root.hidden && root.isConnected;
    let model, colors, width = 0, height = 0;
    let yaw = .30, pitch = .10, drag = null;
    let dirty = true, drawQueued = false, animation = null;
    let particles = [], projectedCriticals = [];
    let regularFont = '', selectedFont = '';
    let camera = null, depthBuffer = null, depthWidth = 0, depthHeight = 0;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');

    // F(x,y,z) = (x,y,z + A x²(1+z)³ + B x(1+z)) on the unit sphere.
    // The upper-localized deformation leaves the lower body round. Its last
    // coordinate is height; L = ∂F_3/∂z is positive throughout the sphere.
    // All flow computations use the metric induced by this very embedding.
    function world(p, geometry = model) {
      const [x, y, z] = p, t = 1 + z;
      return [x, y, z + geometry.A * x * x * t * t * t + geometry.B * x * t];
    }
    function normal(p, geometry = model) {
      const [x, y, z] = p, t = 1 + z;
      const K = 2 * geometry.A * x * t * t * t + geometry.B * t;
      const L = 1 + 3 * geometry.A * x * x * t * t + geometry.B * x;
      return normalize([L * x - K * z, L * y, z]);
    }
    function velocity(p, geometry = model) {
      const [x, y, z] = p, t = 1 + z;
      const K = 2 * geometry.A * x * t * t * t + geometry.B * t;
      const L = 1 + 3 * geometry.A * x * x * t * t + geometry.B * x;
      const h = L * x - K * z, denominator = h * h + L * L * y * y + z * z;
      return [z * h / denominator, z * L * y / denominator,
        (-L * (x * x + y * y) + K * x * z) / denominator];
    }
    function rk4(p, h, geometry = model) {
      const a = velocity(p, geometry);
      const b = velocity(p.map((x, i) => x + h * a[i] / 2), geometry);
      const c = velocity(p.map((x, i) => x + h * b[i] / 2), geometry);
      const d = velocity(p.map((x, i) => x + h * c[i]), geometry);
      return normalize(p.map((x, i) => x + h * (a[i] + 2 * b[i] + 2 * c[i] + d[i]) / 6));
    }
    function atAngle(theta) { return [Math.sin(theta), 0, Math.cos(theta)]; }
    function meridian(from, to, count = 180) {
      return Array.from({ length: count + 1 }, (_, i) => atAngle(from + (to - from) * i / count));
    }
    function simplify(path, geometry, spacing = .018) {
      if (!path.length) return [];
      const result = [path[0]];
      let last = world(path[0], geometry);
      for (let i = 1; i < path.length - 1; i++) {
        const next = world(path[i], geometry);
        if (distance(last, next) >= spacing) { result.push(path[i]); last = next; }
      }
      if (path.length > 1) result.push(path[path.length - 1]);
      return result;
    }
    function makeCritical(id, p, index, name, geometry) {
      return { id, p, index, name, world: world(p, geometry) };
    }
    function buildSeparator(geometry) {
      const b = geometry.critical.b.p, a = geometry.critical.a.p, epsilon = 1e-4;
      // The unstable direction is e_y. The O(ε²) normalization error in the
      // stable direction contracts; the two branches are reflections in y=0.
      let p = normalize([b[0], epsilon, b[2]]);
      const dense = [b, p];
      for (let i = 0; i < 8000 && distance(p, a) > 1e-7; i++) {
        p = rk4(p, .005, geometry);
        if (p[2] < dense[dense.length - 1][2]) dense.push(p);
      }
      // The endpoint a is only used to close the basin boundary. It is excluded
      // from W^u(b); its hollow critical marker displays that exclusion.
      while (dense.length > 1 && dense[dense.length - 1][2] <= a[2]) dense.pop();
      dense.push(a);
      geometry.separatorDense = dense;
      geometry.separator = simplify(dense, geometry, .012);
      geometry.separatorBack = geometry.separator.map(p => [p[0], -p[1], p[2]]);
    }
    function basin(p, geometry) {
      const table = geometry.separatorDense, z = p[2];
      if (z >= table[0][2] || z <= table[table.length - 1][2]) return 'd';
      let lo = 0, hi = table.length - 1;
      while (hi - lo > 1) {
        const mid = (lo + hi) >> 1;
        if (table[mid][2] > z) lo = mid; else hi = mid;
      }
      const t = (z - table[lo][2]) / (table[hi][2] - table[lo][2]);
      const boundaryX = table[lo][0] + t * (table[hi][0] - table[lo][0]);
      return p[0] > boundaryX ? 'c' : 'd';
    }
    function trace(seed, geometry, direction = 1, target = geometry.critical.a.p) {
      let p = seed.slice();
      const path = [p];
      for (let i = 0; i < 6500 && distance(p, target) > 2e-6; i++) {
        p = rk4(p, direction * .005, geometry);
        if (i % 4 === 0) path.push(p);
      }
      path.push(p);
      return simplify(path, geometry, .020);
    }
    function buildSamples(geometry) {
      geometry.samples = [];
      if (geometry.mode === 'round') {
        for (let i = 0; i < 10; i++) {
          const phi = TAU * i / 10;
          const points = Array.from({ length: 170 }, (_, j) => {
            const theta = .035 + (PI - .07) * j / 169;
            return [Math.sin(theta) * Math.cos(phi), Math.sin(theta) * Math.sin(phi), Math.cos(theta)];
          });
          geometry.samples.push({ source: 'd', seed: points[2], points });
        }
      } else {
        for (const id of ['d', 'c']) {
          const side = id === 'd' ? -1 : 1;
          // Interior seeds spread examples across each open basin. Integrating
          // in both time directions gives complete example trajectories without
          // making a very anisotropic maximum's fastest direction dominate.
          for (const [z, fraction] of [[.35, .25], [0, .50], [-.35, .75]]) for (const sign of [-1, 1]) {
            const x = side * fraction * Math.sqrt(1 - z * z);
            const seed = [x, sign * Math.sqrt(1 - z * z - x * x), z];
            const back = trace(seed, geometry, -1, geometry.critical[id].p);
            const forward = trace(seed, geometry);
            const points = back.reverse().concat(forward.slice(1));
            geometry.samples.push({ source: id, seed: points[Math.floor(points.length * .12)], points });
          }
        }
      }
    }
    function buildModel(mode) {
      if (models.has(mode)) return models.get(mode);
      const geometry = { mode, A: mode === 'round' ? 0 : .5,
        B: mode === 'round' ? 0 : -.15, critical: {}, vertices: [], faces: [], grid: [] };
      if (mode === 'round') {
        geometry.critical.a = makeCritical('a', [0, 0, -1], 0, 'minimum', geometry);
        geometry.critical.d = makeCritical('d', [0, 0, 1], 2, 'maximum', geometry);
      } else {
        for (const id of ['a', 'b', 'c', 'd']) geometry.critical[id] = makeCritical(id,
          id === 'a' ? [0, 0, -1] : atAngle(deformedAngles[id]), id === 'a' ? 0 : id === 'b' ? 1 : 2,
          id === 'a' ? 'minimum' : id === 'b' ? 'saddle' : 'maximum', geometry);
        buildSeparator(geometry);
        geometry.stableLeft = meridian(deformedAngles.d + .003, deformedAngles.b);
        geometry.stableRight = meridian(deformedAngles.c - .003, deformedAngles.b);
        geometry.stableClosure = meridian(deformedAngles.d, deformedAngles.c, 260);
      }
      const nTheta = 56, nPhi = 88;
      for (let i = 0; i <= nTheta; i++) for (let j = 0; j < nPhi; j++) {
        const theta = PI * i / nTheta, phi = TAU * j / nPhi;
        const p = [Math.sin(theta) * Math.cos(phi), Math.sin(theta) * Math.sin(phi), Math.cos(theta)];
        geometry.vertices.push({ p, w: world(p, geometry) });
      }
      for (let i = 0; i < nTheta; i++) for (let j = 0; j < nPhi; j++) {
        const theta = PI * (i + .5) / nTheta, phi = TAU * (j + .5) / nPhi;
        const p = [Math.sin(theta) * Math.cos(phi), Math.sin(theta) * Math.sin(phi), Math.cos(theta)];
        geometry.faces.push({ ids: [i * nPhi + j, i * nPhi + (j + 1) % nPhi,
          (i + 1) * nPhi + (j + 1) % nPhi, (i + 1) * nPhi + j],
          n: normal(p, geometry), basin: mode === 'round' ? 'd' : basin(p, geometry) });
      }
      for (let j = 0; j < 10; j++) {
        const phi = TAU * j / 10;
        geometry.grid.push(Array.from({ length: 100 }, (_, i) => {
          const theta = PI * i / 99;
          return [Math.sin(theta) * Math.cos(phi), Math.sin(theta) * Math.sin(phi), Math.cos(theta)];
        }));
      }
      for (let i = 1; i < 8; i++) {
        const theta = PI * i / 8;
        geometry.grid.push(Array.from({ length: 121 }, (_, j) => {
          const phi = TAU * j / 120;
          return [Math.sin(theta) * Math.cos(phi), Math.sin(theta) * Math.sin(phi), Math.cos(theta)];
        }));
      }
      buildSamples(geometry);
      models.set(mode, geometry);
      return geometry;
    }

    function readColor(token, background) {
      probe.style.color = 'var(' + token + ')';
      colorContext.clearRect(0, 0, 1, 1);
      colorContext.fillStyle = getComputedStyle(probe).color;
      colorContext.fillRect(0, 0, 1, 1);
      const data = Array.from(colorContext.getImageData(0, 0, 1, 1).data);
      return background ? mix(background, data.slice(0, 3), data[3] / 255) : data.slice(0, 3);
    }
    function typography() {
      const style = getComputedStyle(root);
      regularFont = '400 ' + style.fontSize + ' ' + style.fontFamily;
      selectedFont = '500 ' + style.fontSize + ' ' + style.fontFamily;
    }
    function palette() {
      if (!isActive() || document.hidden) { dirty = true; return; }
      const bg = readColor('--background');
      colors = { bg, fg: readColor('--foreground', bg), muted: readColor('--muted-foreground', bg),
        border: readColor('--border', bg), s: readColor('--viz-series-1', bg), u: readColor('--viz-series-2', bg) };
      typography(); requestDraw();
    }
    function prepareCamera() {
      const right = [Math.cos(yaw), -Math.sin(yaw), 0];
      const up = [-Math.sin(yaw) * Math.sin(pitch), -Math.cos(yaw) * Math.sin(pitch), Math.cos(pitch)];
      const toward = [Math.sin(yaw) * Math.cos(pitch), Math.cos(yaw) * Math.cos(pitch), Math.sin(pitch)];
      let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
      for (const vertex of model.vertices) {
        const x = dot(vertex.w, right), y = dot(vertex.w, up);
        minX = Math.min(minX, x); maxX = Math.max(maxX, x);
        minY = Math.min(minY, y); maxY = Math.max(maxY, y);
      }
      // One scale factor preserves the embedding and its induced metric.
      camera = { right, up, toward, centerX: (minX + maxX) / 2, centerY: (minY + maxY) / 2,
        scale: Math.min((width - 76) / (maxX - minX), (height - 90) / (maxY - minY)) };
    }
    function projectWorld(w) {
      return { x: width / 2 + (dot(w, camera.right) - camera.centerX) * camera.scale,
        y: height / 2 - (dot(w, camera.up) - camera.centerY) * camera.scale,
        d: dot(w, camera.toward) };
    }
    const project = p => projectWorld(world(p));

    // A small depth buffer distinguishes visible curves from hidden branches.
    // Both are drawn; hidden branches have lower opacity, not a new dash meaning.
    function clearDepth() {
      depthWidth = Math.max(1, Math.ceil(width / 3));
      depthHeight = Math.max(1, Math.ceil(height / 3));
      depthBuffer = new Float32Array(depthWidth * depthHeight);
      depthBuffer.fill(-Infinity);
    }
    function depthTriangle(a, b, c) {
      const scaleX = depthWidth / width, scaleY = depthHeight / height;
      const ax = a.x * scaleX, ay = a.y * scaleY, bx = b.x * scaleX, by = b.y * scaleY;
      const cx = c.x * scaleX, cy = c.y * scaleY;
      const den = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy);
      if (Math.abs(den) < 1e-7) return;
      const left = clamp(Math.floor(Math.min(ax, bx, cx)), 0, depthWidth - 1);
      const right = clamp(Math.ceil(Math.max(ax, bx, cx)), 0, depthWidth - 1);
      const top = clamp(Math.floor(Math.min(ay, by, cy)), 0, depthHeight - 1);
      const bottom = clamp(Math.ceil(Math.max(ay, by, cy)), 0, depthHeight - 1);
      for (let y = top; y <= bottom; y++) for (let x = left; x <= right; x++) {
        const l = ((by - cy) * (x + .5 - cx) + (cx - bx) * (y + .5 - cy)) / den;
        const m = ((cy - ay) * (x + .5 - cx) + (ax - cx) * (y + .5 - cy)) / den;
        const n = 1 - l - m;
        if (l >= -.025 && m >= -.025 && n >= -.025) {
          const d = l * a.d + m * b.d + n * c.d, index = y * depthWidth + x;
          if (d > depthBuffer[index]) depthBuffer[index] = d;
        }
      }
    }
    function visibility(p) {
      const x = clamp(Math.floor(p.x / width * depthWidth), 0, depthWidth - 1);
      const y = clamp(Math.floor(p.y / height * depthHeight), 0, depthHeight - 1);
      return p.d >= depthBuffer[y * depthWidth + x] - .045 ? 1 : .24;
    }
    function selectedArea() {
      const id = criticalSelect.value;
      if (id === 'a' && stableCheck.checked) return { kind: 's', basin: null };
      if ((id === 'c' || id === 'd') && unstableCheck.checked) return { kind: 'u', basin: model.mode === 'round' ? null : id };
      return null;
    }
    function drawCurve(points, kind, lineWidth = 3.1, opacity = 1, cut = false) {
      const projected = points.map(project);
      const color = cut ? rgb(colors.fg) : rgb(colors[kind]);
      let travel = 0;
      ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      for (let i = 0; i < projected.length - 1; i++) {
        const a = projected[i], b = projected[i + 1];
        const length = Math.hypot(b.x - a.x, b.y - a.y);
        const middle = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, d: (a.d + b.d) / 2 };
        const alpha = visibility(middle) * opacity;
        if (cut) {
          ctx.globalAlpha = alpha; ctx.strokeStyle = rgb(colors.bg); ctx.lineWidth = lineWidth + 4;
          ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
        }
        ctx.globalAlpha = alpha; ctx.strokeStyle = color; ctx.lineWidth = lineWidth;
        if (kind === 'u' && !cut) { ctx.setLineDash([7, 5]); ctx.lineDashOffset = -travel; }
        else ctx.setLineDash([]);
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
        travel += length;
      }
      ctx.restore();
    }
    function drawArrow(p, kind, size = 5.4, opacity = 1) {
      const a = project(p), v = velocity(p), next = normalize(p.map((x, i) => x + .015 * v[i])), b = project(next);
      const dx = b.x - a.x, dy = b.y - a.y, length = Math.hypot(dx, dy);
      if (length < .001) return;
      const ux = dx / length, uy = dy / length;
      ctx.save(); ctx.globalAlpha = visibility(a) * opacity; ctx.fillStyle = rgb(colors[kind]);
      ctx.beginPath(); ctx.moveTo(a.x + size * ux, a.y + size * uy);
      ctx.lineTo(a.x - size * .65 * ux - size * .62 * uy, a.y - size * .65 * uy + size * .62 * ux);
      ctx.lineTo(a.x - size * .65 * ux + size * .62 * uy, a.y - size * .65 * uy - size * .62 * ux);
      ctx.closePath(); ctx.fill(); ctx.restore();
    }
    function midpoint(path, fraction = .5) {
      return path[Math.max(1, Math.min(path.length - 2, Math.floor((path.length - 1) * fraction)))];
    }
    function haloText(text, x, y, align = 'left', selected = false) {
      ctx.save(); ctx.font = selected ? selectedFont : regularFont;
      ctx.textAlign = align; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
      ctx.strokeStyle = rgb(colors.bg); ctx.lineWidth = 4; ctx.strokeText(text, x, y);
      ctx.fillStyle = rgb(colors.fg); ctx.fillText(text, x, y); ctx.restore();
    }
    function drawCritical(cp, position) {
      const active = cp.id === criticalSelect.value;
      ctx.save();
      if (active && (stableCheck.checked || unstableCheck.checked)) {
        if (stableCheck.checked) {
          ctx.strokeStyle = rgb(colors.s); ctx.lineWidth = 2.8; ctx.beginPath(); ctx.arc(position.x, position.y, 9, 0, TAU); ctx.stroke();
        }
        if (unstableCheck.checked) {
          ctx.strokeStyle = rgb(colors.u); ctx.lineWidth = 2.8; ctx.setLineDash([3, 3]);
          ctx.beginPath(); ctx.arc(position.x, position.y, stableCheck.checked ? 13 : 9, 0, TAU); ctx.stroke(); ctx.setLineDash([]);
        }
      }
      ctx.fillStyle = active ? rgb(colors.fg) : rgb(colors.bg);
      ctx.strokeStyle = rgb(colors.fg); ctx.lineWidth = 1.6; ctx.beginPath();
      ctx.arc(position.x, position.y, active ? 4.2 : 3.8, 0, TAU); ctx.fill(); ctx.stroke(); ctx.restore();
      const compact = width < 520;
      let text = compact ? cp.id : cp.id + ' · ' + cp.name;
      let x = position.x, y = position.y, align = 'left';
      if (cp.id === 'd' && model.mode === 'deformed') { x -= 17; y -= 14; align = 'right'; }
      else if (cp.id === 'c') { x += 17; y -= 14; }
      else if (cp.id === 'a') { x += 18; y += 12; }
      else { x += 18; y -= 12; }
      ctx.save(); ctx.font = regularFont; const textWidth = ctx.measureText(text).width; ctx.restore();
      if (align === 'right' && x - textWidth < 8) { text = cp.id; x = Math.max(16, position.x - 15); }
      if (align === 'left' && x + textWidth > width - 8) { text = cp.id; x = Math.min(width - 18, position.x + 15); }
      haloText(text, x, y, align, active);
    }
    function drawScene() {
      prepareCamera(); clearDepth();
      const vertices = model.vertices.map(vertex => projectWorld(vertex.w));
      const area = selectedArea(), light = normalize([-.55, .70, .85]);
      const faces = model.faces.map(face => {
        const points = face.ids.map(id => vertices[id]);
        depthTriangle(points[0], points[1], points[2]); depthTriangle(points[0], points[2], points[3]);
        const shade = .065 + .19 * (1 - Math.max(-.5, dot(face.n, light)));
        let color = mix(colors.bg, colors.fg, shade);
        if (area && (!area.basin || face.basin === area.basin)) color = mix(color, colors[area.kind], .34);
        return { points, color: rgb(color), depth: points.reduce((sum, p) => sum + p.d, 0) / 4 };
      });
      faces.sort((a, b) => a.depth - b.depth);
      ctx.save(); ctx.globalAlpha = 1;
      for (const face of faces) {
        ctx.fillStyle = face.color; ctx.beginPath(); ctx.moveTo(face.points[0].x, face.points[0].y);
        for (let i = 1; i < face.points.length; i++) ctx.lineTo(face.points[i].x, face.points[i].y);
        ctx.closePath(); ctx.fill();
      }
      ctx.restore();
      for (const curve of model.grid) drawCurve(curve, 'fg', .55, .11);
      if (area) {
        const samples = model.samples.filter(sample => !area.basin || sample.source === area.basin);
        for (let i = 0; i < samples.length; i++) {
          drawCurve(samples[i].points, area.kind, 1.3, .53);
          drawArrow(midpoint(samples[i].points, .40 + (i % 3) * .12), area.kind, 4.1, .72);
        }
        if (model.mode === 'deformed') {
          if (criticalSelect.value === 'a') drawCurve(model.stableClosure, 's', 1.55, 1, true);
          else {
            drawCurve(model.separator, 's', 1.55, 1, true);
            drawCurve(model.separatorBack, 's', 1.55, 1, true);
          }
        }
      }
      if (model.mode === 'deformed' && criticalSelect.value === 'b') {
        if (stableCheck.checked) {
          drawCurve(model.stableLeft, 's'); drawCurve(model.stableRight, 's');
          drawArrow(midpoint(model.stableLeft, .58), 's'); drawArrow(midpoint(model.stableRight, .58), 's');
        }
        if (unstableCheck.checked) {
          drawCurve(model.separator, 'u'); drawCurve(model.separatorBack, 'u');
          drawArrow(midpoint(model.separator, .52), 'u'); drawArrow(midpoint(model.separatorBack, .52), 'u');
        }
      }
      projectedCriticals = Object.values(model.critical).map(cp => ({ cp, position: projectWorld(cp.world) }));
      const x = width - 22, y = height - 56;
      ctx.save(); ctx.strokeStyle = rgb(colors.muted); ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(x, y + 23); ctx.lineTo(x, y - 12); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x - 3, y - 6); ctx.lineTo(x, y - 13); ctx.lineTo(x + 3, y - 6); ctx.stroke(); ctx.restore();
      haloText('f', x, y - 26, 'center');
    }
    function drawParticles() {
      for (const particle of particles) {
        const p = project(particle.p);
        ctx.save(); ctx.globalAlpha = Math.max(.40, visibility(p)); ctx.fillStyle = rgb(colors[particle.kind]);
        ctx.strokeStyle = rgb(colors.bg); ctx.lineWidth = 1.8; ctx.beginPath(); ctx.arc(p.x, p.y, 4.7, 0, TAU); ctx.fill(); ctx.stroke(); ctx.restore();
      }
    }
    function draw() {
      if (!isActive() || !model || !colors || document.hidden || width <= 0 || height <= 0) return;
      ctx.clearRect(0, 0, width, height);
      if (dirty || !sceneContext) {
        drawScene();
        if (sceneContext) { sceneContext.clearRect(0, 0, sceneCanvas.width, sceneCanvas.height); sceneContext.drawImage(canvas, 0, 0); }
      } else ctx.drawImage(sceneCanvas, 0, 0, sceneCanvas.width, sceneCanvas.height, 0, 0, width, height);
      drawParticles();
      for (const { cp, position } of projectedCriticals) drawCritical(cp, position);
      dirty = false;
    }
    function requestDraw() {
      dirty = true;
      if (isActive() && !document.hidden && !drawQueued) {
        drawQueued = true;
        requestAnimationFrame(() => { drawQueued = false; if (dirty) draw(); });
      }
    }
    function resize() {
      if (!isActive() || document.hidden) { dirty = true; return; }
      const bounds = canvas.getBoundingClientRect(); width = bounds.width; height = bounds.height;
      if (width <= 0 || height <= 0) return;
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(width * ratio); canvas.height = Math.round(height * ratio);
      sceneCanvas.width = canvas.width; sceneCanvas.height = canvas.height;
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0); typography(); requestDraw();
    }
    const flowLabel = () => reduced.matches ? 'Show flow positions' : 'Follow flow';
    function stopAnimation(clear = true) {
      if (animation !== null) cancelAnimationFrame(animation);
      animation = null; play.textContent = flowLabel(); if (clear) particles = [];
    }
    function update() {
      stopAnimation(); endDrag();
      if (!model) return;
      const cp = model.critical[criticalSelect.value]; if (!cp) return;
      stableLabel.textContent = 'Stable · ' + (2 - cp.index) + 'D';
      unstableLabel.textContent = 'Unstable · ' + cp.index + 'D';
      const area = selectedArea();
      cutKey.hidden = !area || model.mode === 'round';
      cutKey.textContent = 'Neutral curves: excluded from shaded region';
      viewKey.textContent = area ? 'Shading: 2D manifold · thin arrows: sample trajectories' : 'Arrows point downhill · faint curves lie behind the surface';
      const description = cp.index === 1 ? 'two incoming branches; two outgoing branches' : cp.index === 0 ? 'stable open surface; unstable point' : 'stable point; unstable open surface';
      detail.textContent = cp.id + ' · Morse index ' + cp.index + ' · ' + description;
      canvas.setAttribute('aria-label', (model.mode === 'round' ? 'Round sphere. ' : 'Deformed sphere with two unequal peaks. ') +
        cp.id + ', ' + cp.name + ', selected. Stable dimension ' + (2 - cp.index) + ', unstable dimension ' + cp.index +
        '. Stable curves are solid, unstable curves dashed. Hollow critical points and neutral boundary curves are excluded. Drag horizontally or use the rotation buttons.');
      play.disabled = !area && !(cp.index === 1 && (stableCheck.checked || unstableCheck.checked));
      requestDraw();
    }
    function changeShape() {
      stopAnimation(); endDrag();
      if (!isActive()) { dirty = true; return; }
      model = buildModel(shapeSelect.value === 'round' ? 'round' : 'deformed');
      criticalSelect.replaceChildren(...Object.values(model.critical).map(cp => {
        const option = document.createElement('option'); option.value = cp.id;
        const name = model.mode === 'deformed' && cp.index === 2
          ? (cp.id === 'c' ? 'right maximum' : 'left maximum') : cp.name;
        option.textContent = cp.id + ' · ' + name; return option;
      }));
      criticalSelect.value = model.mode === 'round' ? 'a' : 'b';
      yaw = .30; pitch = .10; update();
    }
    function initialParticles() {
      const result = [], area = selectedArea();
      if (area) {
        const samples = model.samples.filter(sample => !area.basin || sample.source === area.basin);
        for (const sample of samples) result.push({ p: sample.seed.slice(), kind: area.kind });
      } else if (criticalSelect.value === 'b') {
        if (stableCheck.checked) {
          result.push({ p: atAngle(deformedAngles.d + .08), kind: 's' });
          result.push({ p: atAngle(deformedAngles.c - .08), kind: 's' });
        }
        if (unstableCheck.checked) {
          const front = model.separatorDense.find(p => p[1] > .12);
          result.push({ p: front.slice(), kind: 'u' });
          result.push({ p: [front[0], -front[1], front[2]], kind: 'u' });
        }
      }
      return result;
    }
    function startAnimation() {
      if (!isActive() || !model || document.hidden || width <= 0 || height <= 0) return;
      if (animation !== null) { stopAnimation(); requestDraw(); return; }
      particles = initialParticles(); if (!particles.length) return;
      if (reduced.matches) {
        for (let i = 0; i < 900; i++) for (const particle of particles) particle.p = rk4(particle.p, .005);
        requestDraw(); return;
      }
      play.textContent = 'Stop flow';
      const started = performance.now(); let previous = started;
      function step(now) {
        if (!isActive() || document.hidden || width <= 0 || height <= 0) { stopAnimation(false); return; }
        const delta = Math.min((now - previous) / 1000, .08) * 2.2; previous = now;
        const steps = Math.max(1, Math.ceil(delta / .005));
        for (let i = 0; i < steps; i++) for (const particle of particles) particle.p = rk4(particle.p, delta / steps);
        draw();
        if (now - started < 10000) animation = requestAnimationFrame(step);
        else { animation = null; play.textContent = flowLabel(); }
      }
      animation = requestAnimationFrame(step);
    }
    function endDrag() {
      const current = drag; drag = null; canvas.classList.remove('dragging');
      if (current && canvas.hasPointerCapture(current.id)) canvas.releasePointerCapture(current.id);
    }
    canvas.addEventListener('pointerdown', event => {
      if (!isActive() || event.isPrimary === false || event.button !== 0) return;
      endDrag(); const touch = event.pointerType === 'touch';
      drag = { id: event.pointerId, x: event.clientX, y: event.clientY, yaw, pitch, active: !touch };
      if (!touch) { canvas.setPointerCapture(event.pointerId); canvas.classList.add('dragging'); }
    });
    canvas.addEventListener('pointermove', event => {
      if (!isActive() || !drag || drag.id !== event.pointerId) return;
      const dx = event.clientX - drag.x, dy = event.clientY - drag.y;
      if (!drag.active) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) < 8) return;
        if (Math.abs(dy) >= Math.abs(dx)) { endDrag(); return; }
        drag.active = true; canvas.setPointerCapture(event.pointerId); canvas.classList.add('dragging');
      }
      if (event.cancelable) event.preventDefault();
      yaw = drag.yaw + dx * .009; pitch = clamp(drag.pitch + dy * .006, -.8, .8); requestDraw();
    }, { passive: false });
    const finishPointer = event => { if (drag && drag.id === event.pointerId) endDrag(); };
    canvas.addEventListener('pointerup', finishPointer);
    canvas.addEventListener('pointercancel', finishPointer);
    canvas.addEventListener('lostpointercapture', finishPointer);
    if (turnLeft) turnLeft.addEventListener('click', () => { if (!isActive()) return; endDrag(); yaw -= PI / 8; requestDraw(); });
    if (turnRight) turnRight.addEventListener('click', () => { if (!isActive()) return; endDrag(); yaw += PI / 8; requestDraw(); });
    if (frontView) frontView.addEventListener('click', () => { if (!isActive()) return; endDrag(); yaw = .30; pitch = .10; requestDraw(); });
    criticalSelect.addEventListener('change', update); shapeSelect.addEventListener('change', changeShape);
    stableCheck.addEventListener('change', update); unstableCheck.addEventListener('change', update);
    play.addEventListener('click', startAnimation);
    if ('ResizeObserver' in window) new ResizeObserver(resize).observe(canvas);
    else window.addEventListener('resize', resize);
    new MutationObserver(palette).observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'style', 'data-theme'] });
    const systemTheme = window.matchMedia('(prefers-color-scheme: dark)');
    if (systemTheme.addEventListener) systemTheme.addEventListener('change', palette);
    else if (systemTheme.addListener) systemTheme.addListener(palette);
    const motionChanged = () => { stopAnimation(false); requestDraw(); };
    if (reduced.addEventListener) reduced.addEventListener('change', motionChanged);
    else if (reduced.addListener) reduced.addListener(motionChanged);
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) { stopAnimation(false); endDrag(); }
      else if (isActive()) { palette(); resize(); }
    });
    root.addEventListener('manifold:deactivate', () => {
      active = false; stopAnimation(false); endDrag();
    });
    root.addEventListener('manifold:activate', event => {
      active = true;
      const requested = event.detail && event.detail.shape;
      if (requested === 'round' || requested === 'deformed') shapeSelect.value = requested;
      const mode = shapeSelect.value === 'round' ? 'round' : 'deformed';
      if (!model || model.mode !== mode) changeShape();
      palette(); resize();
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initializeSphere, { once: true });
  else initializeSphere();
})();
