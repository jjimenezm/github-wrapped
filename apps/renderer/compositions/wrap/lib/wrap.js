/*
 * What every scene of the video shares, as a plain script (`window.WrapVideo`):
 *
 * - the wrap's data, read once from the render variables and turned into display-ready values
 *   (texts in the wrap's language, numbers formatted like the web, art already drawn);
 * - the web's motion curves, registered as GSAP eases;
 * - the art's own entrance choreography, replayed on a GSAP timeline.
 *
 * Needs `vendor/gsap.min.js` and `vendor/art.iife.js` (global `WrappedArt`) loaded first.
 */
(() => {
  'use strict';

  const Art = window.WrappedArt;

  // Motion: the curves of apps/web (tokens.css and the count-up), so the video moves like the app.
  const cubicBezier = (x1, y1, x2, y2) => {
    const cx = 3 * x1;
    const bx = 3 * (x2 - x1) - cx;
    const ax = 1 - cx - bx;
    const cy = 3 * y1;
    const by = 3 * (y2 - y1) - cy;
    const ay = 1 - cy - by;
    const sampleX = (t) => ((ax * t + bx) * t + cx) * t;
    const sampleY = (t) => ((ay * t + by) * t + cy) * t;
    const slopeX = (t) => (3 * ax * t + 2 * bx) * t + cx;
    return (x) => {
      if (x <= 0) return 0;
      if (x >= 1) return 1;
      // Newton's method converges in a few steps; bisection covers the flat stretches.
      let t = x;
      for (let i = 0; i < 8; i++) {
        const error = sampleX(t) - x;
        const slope = slopeX(t);
        if (Math.abs(error) < 1e-7) return sampleY(t);
        if (Math.abs(slope) < 1e-6) break;
        t -= error / slope;
      }
      let [lo, hi] = [0, 1];
      t = x;
      for (let i = 0; i < 30; i++) {
        if (sampleX(t) < x) lo = t;
        else hi = t;
        t = (lo + hi) / 2;
      }
      return sampleY(t);
    };
  };

  const EASE = {
    /** --gw-ease-out: every entrance and state change in the web. */
    out: cubicBezier(0.16, 1, 0.3, 1),
    /** --gw-ease-in-out: loops, slow drifts and exits (the grid loader, the stars' twinkle). */
    inOut: cubicBezier(0.45, 0, 0.55, 1),
    /** The count-up's ease-out-expo, exactly 1 at the end. */
    expo: (t) => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t)),
  };
  gsap.registerEase('gw-out', EASE.out);
  gsap.registerEase('gw-in-out', EASE.inOut);
  gsap.registerEase('gw-expo', EASE.expo);

  /** Seconds, from the web: the count-up, the stories reveal, --gw-dur-slow and the art's CSS. */
  const MOTION = { count: 1.4, reveal: 0.8, slow: 0.4, draw: 2.4, rise: 1.6, twinkle: 3.2 };

  const INTL = { es: 'es-CL', en: 'en-US' };

  // The same words the web uses (apps/web/src/i18n) wherever the video shows the same thing.
  const COPY = {
    es: {
      eyebrow: 'Tu año en GitHub',
      styles: { huella: 'Huella', cordillera: 'Cordillera', constelacion: 'Constelación' },
      contributions: (n) => (n === 1 ? 'contribución' : 'contribuciones'),
      activeDays: (n) => (n === 1 ? 'día activo' : 'días activos'),
      metricsEyebrow: 'Detrás del número',
      metricsTitle: 'Tu año, en detalle',
      metrics: {
        commits: 'commits',
        mergedPRs: 'PRs mergeados',
        reviews: 'code reviews',
        issues: 'issues abiertos',
        private: 'en repos privados',
      },
      weekly: 'Actividad semanal',
      peak: (max, week) => `máx. ${max} · sem. ${week}`,
      huella: 'Tu ritmo, dibujado como una huella',
      cordillera: 'Tu año como paisaje',
      cordilleraNote: 'La cumbre es tu mejor semana.',
      projects: 'Proyectos con más actividad este año',
      constellation: 'Tu cielo de repositorios',
      repoCommits: (n) => `${n} commits`,
      scan: 'Escanea mi año en GitHub',
      cta: (host) => `Crea el tuyo en ${host}`,
    },
    en: {
      eyebrow: 'Your year on GitHub',
      styles: { huella: 'Fingerprint', cordillera: 'Ridgeline', constelacion: 'Constellation' },
      contributions: (n) => (n === 1 ? 'contribution' : 'contributions'),
      activeDays: (n) => (n === 1 ? 'active day' : 'active days'),
      metricsEyebrow: 'Behind the number',
      metricsTitle: 'Your year, up close',
      metrics: {
        commits: 'commits',
        mergedPRs: 'merged PRs',
        reviews: 'code reviews',
        issues: 'issues opened',
        private: 'in private repos',
      },
      weekly: 'Weekly activity',
      peak: (max, week) => `max ${max} · wk ${week}`,
      huella: 'Your rhythm, drawn as a fingerprint',
      cordillera: 'Your year as a landscape',
      cordilleraNote: 'The summit is your best week.',
      projects: 'Your most active projects this year',
      constellation: 'Your sky of repositories',
      repoCommits: (n) => `${n} commits`,
      scan: 'Scan my year on GitHub',
      cta: (host) => `Make yours at ${host}`,
    },
  };

  // 16px Octicons (MIT), the same paths apps/web uses.
  const ICONS = {
    commits: [
      'M11.93 8.5a4.002 4.002 0 0 1-7.86 0H.75a.75.75 0 0 1 0-1.5h3.32a4.002 4.002 0 0 1 7.86 0h3.32a.75.75 0 0 1 0 1.5Zm-1.43-.75a2.5 2.5 0 1 0-5 0 2.5 2.5 0 0 0 5 0Z',
    ],
    mergedPRs: [
      'M1.5 3.25a2.25 2.25 0 1 1 3 2.122v5.256a2.251 2.251 0 1 1-1.5 0V5.372A2.25 2.25 0 0 1 1.5 3.25Zm5.677-.177L9.573.677A.25.25 0 0 1 10 .854V2.5h1A2.5 2.5 0 0 1 13.5 5v5.628a2.251 2.251 0 1 1-1.5 0V5a1 1 0 0 0-1-1h-1v1.646a.25.25 0 0 1-.427.177L7.177 3.427a.25.25 0 0 1 0-.354ZM3.75 2.5a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5Zm0 9.5a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5Zm8.25.75a.75.75 0 1 0 1.5 0 .75.75 0 0 0-1.5 0Z',
    ],
    reviews: [
      'm11.28 3.22 4.25 4.25a.75.75 0 0 1 0 1.06l-4.25 4.25a.749.749 0 0 1-1.275-.326.749.749 0 0 1 .215-.734L13.94 8l-3.72-3.72a.749.749 0 0 1 .326-1.275.749.749 0 0 1 .734.215Zm-6.56 0a.751.751 0 0 1 1.042.018.751.751 0 0 1 .018 1.042L2.06 8l3.72 3.72a.749.749 0 0 1-.326 1.275.749.749 0 0 1-.734-.215L.47 8.53a.75.75 0 0 1 0-1.06Z',
    ],
    issues: [
      'M8 9.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Z',
      'M8 0a8 8 0 1 1 0 16A8 8 0 0 1 8 0ZM1.5 8a6.5 6.5 0 1 0 13 0 6.5 6.5 0 0 0-13 0Z',
    ],
    private: [
      'M4 4a4 4 0 0 1 8 0v2h.25c.966 0 1.75.784 1.75 1.75v5.5A1.75 1.75 0 0 1 12.25 15h-8.5A1.75 1.75 0 0 1 2 13.25v-5.5C2 6.784 2.784 6 3.75 6H4Zm8.25 3.5h-8.5a.25.25 0 0 0-.25.25v5.5c0 .138.112.25.25.25h8.5a.25.25 0 0 0 .25-.25v-5.5a.25.25 0 0 0-.25-.25ZM10.5 6V4a2.5 2.5 0 1 0-5 0v2Z',
    ],
    repo: [
      'M2 2.5A2.5 2.5 0 0 1 4.5 0h8.75a.75.75 0 0 1 .75.75v12.5a.75.75 0 0 1-.75.75h-2.5a.75.75 0 0 1 0-1.5h1.75v-2h-8a1 1 0 0 0-.714 1.7.75.75 0 1 1-1.072 1.05A2.495 2.495 0 0 1 2 11.5Zm10.5-1h-8a1 1 0 0 0-1 1v6.708A2.486 2.486 0 0 1 4.5 9h8ZM5 12.25a.25.25 0 0 1 .25-.25h3.5a.25.25 0 0 1 .25.25v3.25a.25.25 0 0 1-.4.2l-1.45-1.087a.249.249 0 0 0-.3 0L5.4 15.7a.25.25 0 0 1-.4-.2Z',
    ],
    star: [
      'M8 .25a.75.75 0 0 1 .673.418l1.882 3.815 4.21.612a.75.75 0 0 1 .416 1.279l-3.046 2.97.719 4.192a.751.751 0 0 1-1.088.791L8 12.347l-3.766 1.98a.75.75 0 0 1-1.088-.79l.72-4.194L.818 6.374a.75.75 0 0 1 .416-1.28l4.21-.611L7.327.668A.75.75 0 0 1 8 .25Z',
    ],
  };

  const icon = (name) =>
    `<svg viewBox="0 0 16 16" aria-hidden="true" fill="currentColor">${ICONS[name]
      .map((d) => `<path d="${d}"/>`)
      .join('')}</svg>`;

  /** Dark modules on light paper, one path of horizontal runs (no seams), like the card's QR. */
  const qrSvg = (text) => {
    const matrix = Art.qrMatrix(text);
    const quiet = 2;
    const size = matrix.length + quiet * 2;
    let d = '';
    matrix.forEach((row, r) => {
      let c = 0;
      while (c < row.length) {
        if (!row[c]) {
          c++;
          continue;
        }
        const start = c;
        while (row[c]) c++;
        d += `M${start + quiet},${r + quiet}h${c - start}v1h${start - c}z`;
      }
    });
    return (
      `<svg viewBox="0 0 ${size} ${size}" shape-rendering="crispEdges" aria-hidden="true">` +
      `<rect width="${size}" height="${size}" fill="${Art.INK.paper}"/>` +
      `<path d="${d}" fill="${Art.INK.background}"/></svg>`
    );
  };

  const parseSnapshot = (value) => {
    const snapshot = typeof value === 'string' ? JSON.parse(value) : value;
    if (!snapshot || typeof snapshot !== 'object' || typeof snapshot.login !== 'string') {
      throw new Error('[wrap] the "snapshot" variable is not a wrap snapshot');
    }
    return snapshot;
  };

  const PUBLIC_METRICS = ['commits', 'mergedPRs', 'reviews', 'issues'];

  /**
   * The video's data from the render variables, with the web summary slide's rules: a metric
   * that failed (null) or is 0 gets no row, and is never shown as a guess (R10).
   */
  function model(vars) {
    const locale = vars.locale === 'en' ? 'en' : 'es';
    const copy = COPY[locale];
    const snapshot = parseSnapshot(vars.snapshot);
    const { period, metrics } = snapshot;
    const fmt = (n) => Art.formatNumber(n, locale);
    const url = String(vars.url);
    const urlText = url.replace(/^https?:\/\//, '');

    const change = Art.yearOverYear(metrics.contributions, snapshot.previousContributions);
    let delta = null;
    if (change !== null) {
      const percent = new Intl.NumberFormat(INTL[locale], { style: 'percent' });
      const previous = {
        ...Art.previousYearPeriod(period),
        year: period.year - 1,
        complete: period.complete,
      };
      delta = {
        text: (change > 0 ? '↑ ' : change < 0 ? '↓ ' : '') + percent.format(Math.abs(change) / 100),
        up: change > 0,
        versus: `vs. ${Art.periodChip(previous, locale)}`,
      };
    }

    const rows = PUBLIC_METRICS.filter((key) => metrics[key] !== null && metrics[key] > 0).map(
      (key) => ({ key, value: fmt(metrics[key]), label: copy.metrics[key], icon: icon(key) }),
    );
    if (snapshot.privateContributions > 0) {
      rows.push({
        key: 'private',
        value: fmt(snapshot.privateContributions),
        label: copy.metrics.private,
        icon: icon('private'),
      });
    }

    const weekly = snapshot.weekly.map((v) => (Number.isFinite(v) && v > 0 ? v : 0));
    const best = Math.max(0, ...weekly);

    const featured = [...snapshot.featured]
      .sort((a, b) => b.commits - a.commits)
      .slice(0, 3)
      .map((repo) => ({
        name: repo.name,
        commits: copy.repoCommits(fmt(repo.commits)),
        stars: repo.stars > 0 ? fmt(repo.stars) : null,
        icon: icon('repo'),
        starIcon: icon('star'),
      }));

    // The web's animated markup: its classes and delays drive animateArt().
    const art = (style) =>
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${Art.ART_WIDTH} ${Art.ART_HEIGHT}" overflow="visible">` +
      `${Art.artMarkup(style, snapshot, { locale, animated: true })}</svg>`;

    const contributions = metrics.contributions;
    return {
      locale,
      copy,
      login: snapshot.login,
      year: period.year,
      avatar: /^data:image\/(png|jpeg);base64,/.test(vars.avatar ?? '') ? vars.avatar : null,
      seed: Number.isFinite(vars.seed)
        ? vars.seed
        : Art.seedFor(snapshot.githubUserId, period.year),
      periodLabel: Art.periodLabel(period, locale),
      periodChip: Art.periodChip(period, locale),
      count:
        contributions === null
          ? null
          : { value: contributions, label: copy.contributions(contributions), format: fmt },
      delta,
      activeDays:
        snapshot.activeDays === null
          ? null
          : `${fmt(snapshot.activeDays)} ${copy.activeDays(snapshot.activeDays)}`,
      metrics: rows,
      weekly,
      peak: best > 0 ? copy.peak(fmt(best), weekly.indexOf(best) + 1) : null,
      languages: snapshot.languages.slice(0, 3).map((l) => l.name),
      palette: Art.artPalette(snapshot.languages),
      featured,
      art: {
        huella: art('huella'),
        cordillera: art('cordillera'),
        constelacion: art('constelacion'),
      },
      url,
      urlText,
      host: urlText.split('/')[0],
      qr: qrSvg(url),
    };
  }

  let cached = null;

  /** The model of this render, built on first use from the root composition's variables. */
  const data = () => {
    // The root's variables: declared defaults plus the render's --variables. A scene's own
    // `__hyperframes` only sees per-mount values, so the global one is read on purpose.
    cached ??= model(window.__hyperframes?.getVariables?.() ?? {});
    return cached;
  };

  const delayOf = (el) => (parseFloat(el.style.animationDelay) || 0) / 1000;

  /**
   * Replays the art's own entrance (the classes and delays @wrapped/art writes for the web) on a
   * GSAP timeline, so it is seekable frame by frame: strokes draw, layers rise, stars twinkle.
   */
  const animateArt = (tl, root, at, until) => {
    root.querySelectorAll('.gw-draw').forEach((el) => {
      tl.fromTo(
        el,
        { strokeDasharray: 1, strokeDashoffset: 1 },
        { strokeDashoffset: 0, duration: MOTION.draw, ease: 'gw-out' },
        at + delayOf(el),
      );
    });
    root.querySelectorAll('.gw-rise').forEach((el) => {
      tl.fromTo(
        el,
        { opacity: 0, y: 10 },
        { opacity: 1, y: 0, duration: MOTION.rise, ease: 'gw-out' },
        at + delayOf(el),
      );
    });
    // The CSS twinkle alternates forever; here it alternates only while the scene shows.
    root.querySelectorAll('.gw-tw').forEach((el) => {
      const start = at + delayOf(el);
      const repeat = Math.max(0, Math.floor((until - start) / MOTION.twinkle) - 1);
      tl.fromTo(
        el,
        { opacity: 0.35 },
        { opacity: 1, duration: MOTION.twinkle, ease: 'gw-in-out', repeat, yoyo: true },
        start,
      );
    });
  };

  /** A seeded random stream for the motion's small variations (the light's path). */
  const random = (salt) => Art.createRng(Art.deriveSeed(data().seed, salt));

  /** Every scene's content enters from below, like the web's stories... */
  const enter = (tl, targets, at, stagger = 0.1) => {
    tl.fromTo(
      targets,
      { autoAlpha: 0, y: 40 },
      { autoAlpha: 1, y: 0, duration: MOTION.reveal, ease: 'gw-out', stagger },
      at,
    );
  };

  /** ...and leaves upward in the scene's last --gw-dur-slow. */
  const exit = (tl, targets, end) => {
    tl.fromTo(
      targets,
      { autoAlpha: 1, y: 0 },
      { autoAlpha: 0, y: -24, duration: MOTION.slow, ease: 'gw-in-out', immediateRender: false },
      end - MOTION.slow,
    );
  };

  const register = (id, tl) => {
    window.__timelines = window.__timelines || {};
    window.__timelines[id] = tl;
  };

  window.WrapVideo = { EASE, MOTION, model, data, random, animateArt, enter, exit, register };
})();
