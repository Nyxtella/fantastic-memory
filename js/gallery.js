// js/gallery.js
// Image lightbox.
//  - Gallery page: click a .gallery-item__btn to open a larger view with prev/next.
//  - Project pages: click any image inside a .stage-media block to open it on its own
//    (no prev/next arrows).
// Keys: Esc closes, Left/Right navigate (gallery only). Click the picture to zoom.
(function () {
  let dialog = null;
  let frame, imgEl, titleEl, detailEl, countEl, prevBtn, nextBtn;
  let items = [];   // { origin, src, alt, title, detail }
  let current = -1;
  let touchX = null;

  const ICON = {
    close: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>',
    prev: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg>',
    next: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5l7 7-7 7"/></svg>'
  };

  function build() {
    dialog = document.createElement('dialog');
    dialog.className = 'lightbox';
    dialog.setAttribute('aria-label', 'Image viewer');
    dialog.innerHTML = `
      <div class="lightbox__stage">
        <button type="button" class="lb-btn lb-close" aria-label="Close viewer">${ICON.close}</button>
        <button type="button" class="lb-btn lb-prev" aria-label="Previous image">${ICON.prev}</button>
        <button type="button" class="lb-btn lb-next" aria-label="Next image">${ICON.next}</button>
        <div class="lightbox__frame"><img class="lightbox__img" alt=""></div>
        <p class="lightbox__caption">
          <span class="lightbox__title"></span>
          <span class="lightbox__detail"></span>
          <span class="lightbox__count" aria-live="polite"></span>
        </p>
      </div>`;
    document.body.appendChild(dialog);

    frame = dialog.querySelector('.lightbox__frame');
    imgEl = dialog.querySelector('.lightbox__img');
    titleEl = dialog.querySelector('.lightbox__title');
    detailEl = dialog.querySelector('.lightbox__detail');
    countEl = dialog.querySelector('.lightbox__count');
    prevBtn = dialog.querySelector('.lb-prev');
    nextBtn = dialog.querySelector('.lb-next');

    dialog.querySelector('.lb-close').addEventListener('click', () => dialog.close());
    prevBtn.addEventListener('click', () => step(-1));
    nextBtn.addEventListener('click', () => step(1));

    // Click on the dark area (not the picture or controls) closes the viewer
    dialog.addEventListener('click', (e) => {
      if (e.target === dialog || e.target.classList.contains('lightbox__stage')) dialog.close();
    });

    dialog.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowLeft') { e.preventDefault(); step(-1); }
      if (e.key === 'ArrowRight') { e.preventDefault(); step(1); }
    });

    dialog.addEventListener('close', () => {
      document.documentElement.classList.remove('lightbox-open');
      resetZoom();
      const it = items[current];
      if (it && document.contains(it.origin)) it.origin.focus({ preventScroll: true });
    });

    // Zoom: click toggles, pointer movement pans while zoomed
    imgEl.addEventListener('click', (e) => {
      if (imgEl.classList.contains('is-zoomed')) {
        resetZoom();
      } else {
        setOrigin(e);
        imgEl.classList.add('is-zoomed');
      }
    });
    frame.addEventListener('mousemove', (e) => {
      if (imgEl.classList.contains('is-zoomed')) setOrigin(e);
    });

    // Swipe between images on touch screens
    dialog.addEventListener('touchstart', (e) => {
      touchX = e.touches.length === 1 ? e.touches[0].clientX : null;
    }, { passive: true });
    dialog.addEventListener('touchend', (e) => {
      if (touchX === null || imgEl.classList.contains('is-zoomed')) return;
      const dx = e.changedTouches[0].clientX - touchX;
      if (Math.abs(dx) > 55) step(dx < 0 ? 1 : -1);
      touchX = null;
    }, { passive: true });
  }

  function setOrigin(e) {
    const r = imgEl.getBoundingClientRect();
    const x = Math.min(100, Math.max(0, ((e.clientX - r.left) / r.width) * 100));
    const y = Math.min(100, Math.max(0, ((e.clientY - r.top) / r.height) * 100));
    imgEl.style.transformOrigin = `${x}% ${y}%`;
  }

  function resetZoom() {
    imgEl.classList.remove('is-zoomed');
    imgEl.style.transformOrigin = '';
  }

  function render() {
    const it = items[current];
    if (!it) return;

    resetZoom();
    frame.classList.add('is-loading');
    imgEl.onload = () => frame.classList.remove('is-loading');
    imgEl.src = it.src;
    imgEl.alt = it.alt;
    titleEl.textContent = it.title;
    detailEl.textContent = it.detail;

    const multiple = items.length > 1;
    countEl.textContent = multiple
      ? `${String(current + 1).padStart(2, '0')} / ${String(items.length).padStart(2, '0')}`
      : '';
    prevBtn.hidden = !multiple;
    nextBtn.hidden = !multiple;

    // Warm the cache for the neighbours
    if (multiple) {
      [current - 1, current + 1].forEach((i) => {
        const n = items[(i + items.length) % items.length];
        if (n && n !== it) new Image().src = n.src;
      });
    }
  }

  function step(dir) {
    if (items.length < 2) return;
    current = (current + dir + items.length) % items.length;
    render();
  }

  function open(list, index) {
    if (!dialog) build();
    items = list;
    current = index;
    render();
    document.documentElement.classList.add('lightbox-open');
    if (!dialog.open) dialog.showModal();
  }

  function galleryItems() {
    return Array.from(document.querySelectorAll('.gallery-item__btn')).map((btn) => {
      const thumb = btn.querySelector('img');
      const fig = btn.closest('figure');
      const cap = fig && fig.querySelector('figcaption');
      return {
        origin: btn,
        src: btn.dataset.full || (thumb && thumb.currentSrc) || '',
        alt: thumb ? thumb.alt : '',
        title: cap ? cap.textContent.trim() : '',
        detail: (fig && fig.dataset.detail) || ''
      };
    });
  }

  function singleItem(img) {
    const fig = img.closest('figure');
    const cap = fig && fig.querySelector('figcaption');
    return [{
      origin: img,
      src: img.dataset.full || img.currentSrc || img.src,
      alt: img.alt || '',
      title: cap ? cap.textContent.trim() : (img.alt || ''),
      detail: ''
    }];
  }

  window.initGallery = function initGallery() {
    // Gallery page: thumbnails open the viewer with prev/next
    document.querySelectorAll('.gallery-item__btn').forEach((btn) => {
      if (btn.dataset.lbReady) return;
      btn.dataset.lbReady = '1';
      btn.addEventListener('click', () => {
        const list = galleryItems();
        open(list, list.findIndex((it) => it.origin === btn));
      });
    });

    // Project pages: stage images open on their own, no arrows
    document.querySelectorAll('.stage-media img').forEach((img) => {
      if (img.dataset.lbReady) return;
      img.dataset.lbReady = '1';
      img.style.cursor = 'zoom-in';
      img.tabIndex = 0;
      img.setAttribute('role', 'button');
      img.setAttribute('aria-label', 'Enlarge image: ' + (img.alt || 'figure'));
      img.addEventListener('click', () => open(singleItem(img), 0));
      img.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(singleItem(img), 0); }
      });
    });
  };

  document.addEventListener('DOMContentLoaded', window.initGallery);
})();
