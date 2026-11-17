// js/main.js
document.addEventListener('DOMContentLoaded', () => {
  const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  let activeObservers = [];

  function cleanupObservers() {
    activeObservers.forEach((obs) => obs.disconnect());
    activeObservers = [];
  }

  // Initialize Contact Page (Gmail compose builder & one-click copy)
  function initContactPage() {
    const contactForm = document.getElementById('gmail-contact-form');
    const copyBtn = document.getElementById('copy-studio-email');
    const feedbackEl = document.getElementById('contact-feedback');
    const studioEmail = 'therealk.dey@gmail.com';

    if (copyBtn) {
      copyBtn.addEventListener('click', async () => {
        try {
          await navigator.clipboard.writeText(studioEmail);
          if (feedbackEl) {
            feedbackEl.textContent = `Copied ${studioEmail} to clipboard.`;
          }
        } catch {
          if (feedbackEl) {
            feedbackEl.textContent = `Email: ${studioEmail}`;
          }
        }
      });
    }

    if (contactForm) {
      contactForm.addEventListener('submit', (e) => {
        e.preventDefault();

        const name = (document.getElementById('sender-name')?.value || '').trim();
        const replyEmail = (document.getElementById('sender-email')?.value || '').trim();
        const scope = (document.getElementById('inquiry-scope')?.value || 'Message').trim();
        const timeline = (document.getElementById('inquiry-timeline')?.value || 'Flexible').trim();
        const brief = (document.getElementById('inquiry-brief')?.value || '').trim();

        const subject = `[${scope}] ${name || 'New message'}`;
        const bodyLines = [
          `Name: ${name || '—'}`,
          `Reply Address: ${replyEmail || '—'}`,
          `Topic: ${scope}`,
          `Timeframe: ${timeline}`,
          '',
          'Message:',
          brief
        ];

        const gmailUrl =
          `https://mail.google.com/mail/?view=cm&fs=1` +
          `&to=${encodeURIComponent(studioEmail)}` +
          `&su=${encodeURIComponent(subject)}` +
          `&body=${encodeURIComponent(bodyLines.join('\n'))}`;

        window.open(gmailUrl, '_blank', 'noopener,noreferrer');

        if (feedbackEl) {
          feedbackEl.textContent = 'Opened pre-filled draft in Gmail.';
        }
      });
    }
  }

  // Initialize dynamic behaviors inside the active <main class="page-canvas">
  function initPageContent() {
    cleanupObservers();

    // 1. Scroll-Responsive Section Gradient Intensity
    const bands = document.querySelectorAll('[data-atmosphere]');
    if (bands.length) {
      const bandObserver = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            const intensity = entry.isIntersecting
              ? Math.min(1, 0.3 + entry.intersectionRatio * 0.85)
              : 0.25;
            entry.target.style.setProperty('--band-intensity', intensity.toFixed(2));
          });
        },
        { threshold: [0, 0.15, 0.35, 0.6, 0.85, 1] }
      );

      bands.forEach((band) => bandObserver.observe(band));
      activeObservers.push(bandObserver);
    }

    // 2. Subtle Editorial Entrance Reveals
    const reveals = document.querySelectorAll('.reveal');
    if (reveals.length) {
      const revealObserver = new IntersectionObserver(
        (entries, observer) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting) {
              entry.target.classList.add('is-visible');
              observer.unobserve(entry.target);
            }
          });
        },
        { threshold: 0.12 }
      );

      reveals.forEach((el) => revealObserver.observe(el));
      activeObservers.push(revealObserver);
    }

    // 3. Subtle Pointer-Tracking Parallax on Left-Column Project Images
    const projectCards = document.querySelectorAll('.project-card');
    if (projectCards.length) {
      const maxShift = 12;

      const resetCardParallax = (card, media) => {
        card.classList.remove('is-tracking');
        media.style.setProperty('--img-x', '0px');
        media.style.setProperty('--img-y', '0px');
        media.style.setProperty('--light-x', '25%');
        media.style.setProperty('--light-y', '25%');
      };

      projectCards.forEach((card) => {
        const media = card.querySelector('.project-card__media');
        if (!media) return;

        let rafId = null;
        let latestEvent = null;

        const applyParallax = () => {
          rafId = null;
          if (!latestEvent || motionQuery.matches) return;

          const rect = card.getBoundingClientRect();
          const normX = (latestEvent.clientX - rect.left) / rect.width - 0.5;
          const normY = (latestEvent.clientY - rect.top) / rect.height - 0.5;

          const offsetX = (-normX * maxShift * 2).toFixed(2);
          const offsetY = (-normY * maxShift * 2).toFixed(2);
          const lightX = ((normX + 0.5) * 100).toFixed(1);
          const lightY = ((normY + 0.5) * 100).toFixed(1);

          media.style.setProperty('--img-x', `${offsetX}px`);
          media.style.setProperty('--img-y', `${offsetY}px`);
          media.style.setProperty('--light-x', `${lightX}%`);
          media.style.setProperty('--light-y', `${lightY}%`);
        };

        card.addEventListener('pointerenter', (e) => {
          if (motionQuery.matches || e.pointerType === 'touch') return;
          card.classList.add('is-tracking');
        });

        card.addEventListener('pointermove', (e) => {
          if (motionQuery.matches || e.pointerType === 'touch') return;
          latestEvent = e;
          if (!rafId) {
            rafId = window.requestAnimationFrame(applyParallax);
          }
        });

        card.addEventListener('pointerleave', () => {
          if (rafId) {
            window.cancelAnimationFrame(rafId);
            rafId = null;
          }
          latestEvent = null;
          resetCardParallax(card, media);
        });
      });
    }

    // 4. Re-initialize project timeline if present on current page
    if (typeof window.initGallery === 'function') {
      window.initGallery();
    }

    if (typeof window.initProjectTimeline === 'function') {
      window.initProjectTimeline();
    }

    // 5. Initialize contact page Gmail form if present
    initContactPage();
  }

  // Reset parallax offsets immediately if user enables reduced motion mid-session
  motionQuery.addEventListener('change', (e) => {
    if (e.matches) {
      document.querySelectorAll('.project-card').forEach((card) => {
        card.classList.remove('is-tracking');
        const media = card.querySelector('.project-card__media');
        if (media) {
          media.style.setProperty('--img-x', '0px');
          media.style.setProperty('--img-y', '0px');
          media.style.setProperty('--light-x', '25%');
          media.style.setProperty('--light-y', '25%');
        }
      });
    }
  });

  // Light / dark theme toggle (choice is remembered; dark is the default)
  const themeToggle = document.getElementById('theme-toggle');
  function syncThemeButton() {
    if (!themeToggle) return;
    const isLight = document.documentElement.dataset.theme === 'light';
    themeToggle.setAttribute('aria-label', isLight ? 'Switch to dark mode' : 'Switch to light mode');
  }
  if (themeToggle) {
    syncThemeButton();
    themeToggle.addEventListener('click', () => {
      const next = document.documentElement.dataset.theme === 'light' ? 'dark' : 'light';
      const apply = () => {
        document.documentElement.dataset.theme = next;
        try { localStorage.setItem('theme', next); } catch { /* storage unavailable */ }
        syncThemeButton();
      };

      const root = document.documentElement;
      const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (reduce) { apply(); return; }

      if (document.startViewTransition) {
        // Circular reveal growing out of the toggle button
        const box = themeToggle.getBoundingClientRect();
        const x = box.left + box.width / 2;
        const y = box.top + box.height / 2;
        const radius = Math.hypot(Math.max(x, window.innerWidth - x), Math.max(y, window.innerHeight - y));
        const transition = document.startViewTransition(apply);
        transition.ready.then(() => {
          root.animate(
            { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${radius}px at ${x}px ${y}px)`] },
            { duration: 750, easing: 'cubic-bezier(0.22, 1, 0.36, 1)', pseudoElement: '::view-transition-new(root)' }
          );
        }).catch(() => {});
      } else {
        // Fallback: briefly cross-fade colours everywhere
        root.classList.add('theme-fade');
        apply();
        window.setTimeout(() => root.classList.remove('theme-fade'), 700);
      }
    });
  }

  // Mobile Navigation Drawer
  const menuToggle = document.getElementById('menu-toggle');
  const primaryNav = document.getElementById('primary-nav');

  function closeMobileNav() {
    if (!menuToggle || !primaryNav) return;
    primaryNav.classList.remove('is-open');
    menuToggle.setAttribute('aria-expanded', 'false');
    menuToggle.setAttribute('aria-label', 'Open menu');
  }

  if (menuToggle && primaryNav) {
    menuToggle.addEventListener('click', () => {
      const isOpen = primaryNav.classList.toggle('is-open');
      menuToggle.setAttribute('aria-expanded', String(isOpen));
      menuToggle.setAttribute('aria-label', isOpen ? 'Close menu' : 'Open menu');
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && primaryNav.classList.contains('is-open')) {
        closeMobileNav();
        menuToggle.focus();
      }
    });
  }

  // Smooth Cross-Fade + Vertical Page Transitions (preserves constant music playback)
  let isTransitioning = false;

  function updateHeaderNavigation(newDoc) {
    const currentHeader = document.querySelector('.site-header');
    const fetchedHeader = newDoc.querySelector('.site-header');
    if (!currentHeader || !fetchedHeader) return;

    const currentBrand = currentHeader.querySelector('.brand-mark');
    const fetchedBrand = fetchedHeader.querySelector('.brand-mark');
    if (currentBrand && fetchedBrand) {
      currentBrand.setAttribute('href', fetchedBrand.getAttribute('href'));
    }

    const currentLinks = currentHeader.querySelectorAll('.site-nav a');
    const fetchedLinks = fetchedHeader.querySelectorAll('.site-nav a');
    currentLinks.forEach((link, i) => {
      if (!fetchedLinks[i]) return;
      link.setAttribute('href', fetchedLinks[i].getAttribute('href'));
      const currentAttr = fetchedLinks[i].getAttribute('aria-current');
      if (currentAttr) {
        link.setAttribute('aria-current', currentAttr);
      } else {
        link.removeAttribute('aria-current');
      }
    });

    const currentFooterLinks = document.querySelectorAll('.site-footer a');
    const fetchedFooterLinks = newDoc.querySelectorAll('.site-footer a');
    currentFooterLinks.forEach((link, i) => {
      if (fetchedFooterLinks[i]) {
        link.setAttribute('href', fetchedFooterLinks[i].getAttribute('href'));
      }
    });
  }

  async function transitionToPage(url, pushHistory = true) {
    if (isTransitioning) return;
    const currentMain = document.querySelector('.page-canvas');
    if (!currentMain) {
      window.location.href = url;
      return;
    }

    isTransitioning = true;
    closeMobileNav();

    const exitDuration = motionQuery.matches ? 0 : 340;
    if (!motionQuery.matches) {
      currentMain.classList.add('is-exiting');
    }

    try {
      const [response] = await Promise.all([
        fetch(url),
        new Promise((resolve) => setTimeout(resolve, exitDuration))
      ]);

      if (!response.ok) throw new Error('Navigation fetch failed');

      const html = await response.text();
      const parser = new DOMParser();
      const nextDoc = parser.parseFromString(html, 'text/html');
      const nextMain = nextDoc.querySelector('.page-canvas');

      if (!nextMain) throw new Error('Missing .page-canvas');

      if (pushHistory) {
        window.history.pushState({ url }, '', url);
      }

      document.title = nextDoc.title;
      updateHeaderNavigation(nextDoc);

      if (!motionQuery.matches) {
        nextMain.classList.add('is-entering');
      }

      currentMain.replaceWith(nextMain);
      window.scrollTo({ top: 0, behavior: 'instant' });

      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => {
          nextMain.classList.remove('is-entering');
        });
      });

      initPageContent();
    } catch {
      // Graceful fallback (e.g., when opened directly via file:// without HTTP server)
      window.location.href = url;
    } finally {
      isTransitioning = false;
    }
  }

  // Intercept internal links for seamless transitions & uninterrupted audio
  document.addEventListener('click', (e) => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) {
      return;
    }

    const link = e.target.closest('a[href]');
    if (!link) return;

    if (link.hasAttribute('data-open-soundtrack')) return;

    const rawHref = link.getAttribute('href');
    if (
      !rawHref ||
      rawHref.startsWith('#') ||
      rawHref.startsWith('mailto:') ||
      rawHref.startsWith('tel:') ||
      link.target === '_blank'
    ) {
      return;
    }

    const targetUrl = new URL(link.href, window.location.href);
    if (targetUrl.origin !== window.location.origin) return;
    if (targetUrl.pathname === window.location.pathname && targetUrl.hash) return;

    e.preventDefault();
    transitionToPage(targetUrl.href, true);
  });

  window.addEventListener('popstate', () => {
    transitionToPage(window.location.href, false);
  });

  // Subtle initial entrance on cold page load
  const initialMain = document.querySelector('.page-canvas');
  if (initialMain && !motionQuery.matches) {
    initialMain.classList.add('is-entering');
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        initialMain.classList.remove('is-entering');
      });
    });
  }

  initPageContent();
});
