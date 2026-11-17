// js/timeline.js
(function () {
  let scrollHandler = null;
  let resizeHandler = null;
  let resizeObserver = null;

  window.initProjectTimeline = function initProjectTimeline() {
    if (scrollHandler) {
      window.removeEventListener('scroll', scrollHandler);
      scrollHandler = null;
    }
    if (resizeHandler) {
      window.removeEventListener('resize', resizeHandler);
      resizeHandler = null;
    }

    if (resizeObserver) { resizeObserver.disconnect(); resizeObserver = null; }

    const timeline = document.getElementById('project-timeline');
    const progressFill = document.getElementById('timeline-progress');
    const stages = Array.from(document.querySelectorAll('[data-stage]'));

    if (!timeline || !stages.length) return;

    // Stage images: cards containing .stage-media get an "Images" button.
    // (Hover also reveals them on mouse devices; the button covers touch + keyboard.)
    document.querySelectorAll('.timeline-card').forEach((card, i) => {
      const media = card.querySelector('.stage-media');
      if (!media || card.dataset.peekReady) return;
      card.dataset.peekReady = '1';
      card.classList.add('has-media');

      const count = media.querySelectorAll('figure').length;
      media.id = media.id || `stage-media-${i}`;
      media.innerHTML = `<div class="stage-media__inner"><div class="stage-media__grid">${media.innerHTML}</div></div>`;

      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'peek-toggle';
      btn.setAttribute('aria-expanded', 'false');
      btn.setAttribute('aria-controls', media.id);
      btn.innerHTML = `<span>${count === 1 ? 'Image' : 'Images'} · ${count}</span><span class="peek-toggle__icon" aria-hidden="true"></span>`;
      btn.addEventListener('click', () => {
        const open = card.classList.toggle('is-peeking');
        btn.setAttribute('aria-expanded', String(open));
      });
      card.insertBefore(btn, card.firstChild);
    });

    let ticking = false;

    function updateTimeline() {
      const viewportH = window.innerHeight;
      const focusLine = viewportH * 0.48;
      const rect = timeline.getBoundingClientRect();

      // The rail runs from the first marker to the last marker only, and the lit
      // fill is measured along that span, so it can always reach 100%.
      const rail = progressFill && progressFill.parentElement;
      const nodes = stages.map((st) => st.querySelector('.timeline-node'));
      if (rail && nodes[0] && nodes[nodes.length - 1]) {
        const mid = (n) => {
          const r = n.getBoundingClientRect();
          return r.top - rect.top + r.height / 2;
        };
        const firstY = mid(nodes[0]);
        const lastY = mid(nodes[nodes.length - 1]);
        const span = Math.max(1, lastY - firstY);
        rail.style.top = `${firstY.toFixed(1)}px`;
        rail.style.height = `${span.toFixed(1)}px`;
        rail.style.bottom = 'auto';

        const doc = document.documentElement;
        const atPageEnd = window.scrollY + viewportH >= doc.scrollHeight - 2;
        const along = (focusLine - rect.top - firstY) / span;
        const ratio = atPageEnd ? 1 : Math.max(0, Math.min(1, along));
        progressFill.style.height = `${(ratio * 100).toFixed(2)}%`;
      }

      let activeIndex = -1;
      let closestDistance = Infinity;

      stages.forEach((stage, idx) => {
        const sRect = stage.getBoundingClientRect();
        const stageCenter = sRect.top + sRect.height * 0.35;
        const distance = Math.abs(stageCenter - focusLine);

        if (sRect.top < viewportH * 0.78 && sRect.bottom > viewportH * 0.18) {
          if (distance < closestDistance) {
            closestDistance = distance;
            activeIndex = idx;
          }
        }
      });

      stages.forEach((stage, idx) => {
        const sRect = stage.getBoundingClientRect();
        const isApproaching =
          idx > activeIndex && sRect.top < viewportH * 0.92 && sRect.top > focusLine;

        stage.classList.toggle('is-active', idx === activeIndex);
        stage.classList.toggle('is-approaching', isApproaching);
      });

      ticking = false;
    }

    function onScrollOrResize() {
      if (!ticking) {
        window.requestAnimationFrame(updateTimeline);
        ticking = true;
      }
    }

    scrollHandler = onScrollOrResize;
    resizeHandler = onScrollOrResize;

    window.addEventListener('scroll', scrollHandler, { passive: true });
    window.addEventListener('resize', resizeHandler, { passive: true });
    // Cards change height when images open: keep the rail in step
    if ('ResizeObserver' in window) {
      resizeObserver = new ResizeObserver(onScrollOrResize);
      resizeObserver.observe(timeline);
    }

    updateTimeline();
  };

  document.addEventListener('DOMContentLoaded', () => {
    window.initProjectTimeline();
  });
})();
