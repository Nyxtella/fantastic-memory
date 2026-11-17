// js/music-player.js
document.addEventListener('DOMContentLoaded', () => {
  /**
   * OWNER-DEFINED PLAYLIST CONFIGURATION
   * Add, reorder, or categorize tracks here. Visitors cannot upload or inject URLs.
   *
   * Each track needs a title and ONE source in `src`:
   *   - a local file:        'assets/audio/my-song.mp3'
   *   - a direct audio link: 'https://example.com/path/song.mp3'   (mp3, ogg, wav, m4a ...)
   *   - a YouTube link:      'https://www.youtube.com/watch?v=VIDEO_ID'  or  'https://youtu.be/VIDEO_ID'
   *                          (or  youtube: 'VIDEO_ID'  instead of src)
   * Optional: artist, category, artwork, note, durationLabel.
   * YouTube tracks use the video thumbnail as artwork unless you set `artwork`,
   * and the video's own title if you leave `title` out.
   */
  const OWNER_PLAYLIST = [
    {
      src: 'https://youtu.be/U2Qd9TRY1Ro',
      note: ''
    }
    // Link examples (remove the leading // to use):
    // { title: 'Streamed from YouTube', artist: 'Someone', category: 'Streams', src: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' },
    // { title: 'Direct audio link', artist: 'Someone', category: 'Streams', src: 'https://example.com/song.mp3' },
  ];

  // ---- Normalise tracks: work out the source type and fill in sensible defaults ----
  const ABSOLUTE = /^(?:https?:)?\/\//i;
  function youtubeId(value) {
    if (!value) return null;
    const text = String(value).trim();
    const m = text.match(/(?:youtu\.be\/|youtube(?:-nocookie)?\.com\/(?:watch\?(?:[^#]*&)?v=|embed\/|shorts\/|live\/))([\w-]{11})/);
    return m ? m[1] : null;
  }
  const PLAYLIST = OWNER_PLAYLIST.map((t) => {
    const yt = youtubeId(t.src) || (t.youtube ? (youtubeId(t.youtube) || (/^[\w-]{11}$/.test(String(t.youtube).trim()) ? String(t.youtube).trim() : null)) : null);
    const kind = yt ? 'youtube' : (ABSOLUTE.test(t.src || '') ? 'remote' : 'local');
    return {
      title: t.title || (yt ? 'YouTube track' : 'Untitled'),
      hasTitle: !!t.title,
      artist: t.artist || '',
      category: t.category || 'Tracks',
      durationLabel: t.durationLabel || '--:--',
      src: t.src || '',
      kind,
      ytId: yt,
      artwork: t.artwork || (yt ? `https://i.ytimg.com/vi/${yt}/hqdefault.jpg` : 'assets/images/cover-01.svg'),
      note: t.note || ''
    };
  });

  if (!PLAYLIST.length) return;
  const pad2 = (n) => String(n).padStart(2, '0');

  // Resolve asset URLs relative to site root even when starting on /projects/*
  function resolveAsset(path) {
    if (ABSOLUTE.test(path)) return path;
    const prefix = window.location.pathname.includes('/projects/') ? '../' : '';
    return prefix + path.replace(/^\.?\//, '');
  }

  // Inject right-edge vertical tab + pop-out glass drawer into body
  const drawerMarkup = `
    <button
      type="button"
      class="soundtrack-tab"
      id="soundtrack-tab"
      aria-expanded="false"
      aria-controls="soundtrack-drawer"
    >
      Soundtrack
    </button>

    <div class="soundtrack-scrim" id="soundtrack-scrim" aria-hidden="true"></div>

    <aside
      class="soundtrack-drawer"
      id="soundtrack-drawer"
      aria-label="Curated soundtrack selector"
      aria-hidden="true"
    >
      <div class="drawer-inner">
        <div class="drawer-header">
          <p class="drawer-header__eyebrow">Curated Soundtrack</p>
          <button type="button" class="drawer-close" id="drawer-close">Close</button>
        </div>

        <div class="drawer-now-playing">
          <div class="drawer-cover">
            <img id="drawer-artwork" src="${resolveAsset(PLAYLIST[0].artwork)}" alt="Current track artwork">
          </div>
          <div>
            <p class="drawer-status" id="drawer-status">Standby · Off</p>
            <h2 class="drawer-track-title" id="drawer-title">${PLAYLIST[0].title}</h2>
            <p class="drawer-track-artist" id="drawer-artist">${PLAYLIST[0].artist}</p>
          </div>
        </div>

        <p class="drawer-track-note" id="drawer-note">${PLAYLIST[0].note}</p>

        <div
          class="scrubber"
          id="drawer-scrubber"
          role="slider"
          tabindex="0"
          aria-label="Track playback position"
          aria-valuemin="0"
          aria-valuemax="100"
          aria-valuenow="0"
        >
          <div class="scrubber__fill" id="drawer-scrubber-fill"></div>
        </div>

        <div class="time-row">
          <span id="drawer-time-current">0:00</span>
          <span id="drawer-time-duration">${PLAYLIST[0].durationLabel}</span>
        </div>

        <div class="drawer-tabs" id="drawer-tabs" role="tablist" aria-label="Soundtrack categories"></div>

        <ul class="playlist" id="drawer-playlist" aria-label="Available tracks"></ul>

        <div class="drawer-footer">
          <label class="volume-control" for="drawer-volume">
            <span>Volume</span>
            <input
              type="range"
              id="drawer-volume"
              min="0"
              max="1"
              step="0.01"
              value="0.1"
              aria-label="Background music volume"
            >
          </label>
          <span class="drawer-header__eyebrow" id="drawer-track-count">01 / ${pad2(PLAYLIST.length)}</span>
        </div>
      </div>
    </aside>
  `;

  document.body.insertAdjacentHTML('beforeend', drawerMarkup);

  // ---------------------------------------------------------------------
  // Playback engines (they live across page transitions)
  //   local   - an <audio> element for files on this site. Feeds the level meter.
  //   remote  - a fresh <audio> element per direct link (mp3, ogg ...). It is first tried
  //             in CORS mode so the level meter can read it; if the host does not allow
  //             that, it is reloaded as a plain stream (plays fine, just no glow).
  //   youtube - a hidden YouTube player driven through the IFrame API.
  // ---------------------------------------------------------------------
  const localAudio = new Audio();
  let remoteAudio = null;          // a fresh element per linked track (see loadTrack)
  localAudio.preload = 'none';
  localAudio.volume = 0.1;
  let audio = localAudio;          // the <audio> element in use (local/remote kinds)
  let volumeValue = 0.1;

  let currentIndex = 0;
  let activeKind = 'local';
  let activeCategory = 'All';
  let isPlaying = false;
  let failStreak = 0;              // consecutive tracks that failed to start

  const els = {
    soundToggle: document.getElementById('sound-toggle'),
    tabTrigger: document.getElementById('soundtrack-tab'),
    scrim: document.getElementById('soundtrack-scrim'),
    drawer: document.getElementById('soundtrack-drawer'),
    closeBtn: document.getElementById('drawer-close'),
    artwork: document.getElementById('drawer-artwork'),
    status: document.getElementById('drawer-status'),
    title: document.getElementById('drawer-title'),
    artist: document.getElementById('drawer-artist'),
    note: document.getElementById('drawer-note'),
    scrubber: document.getElementById('drawer-scrubber'),
    scrubberFill: document.getElementById('drawer-scrubber-fill'),
    timeCurrent: document.getElementById('drawer-time-current'),
    timeDuration: document.getElementById('drawer-time-duration'),
    tabs: document.getElementById('drawer-tabs'),
    playlist: document.getElementById('drawer-playlist'),
    volume: document.getElementById('drawer-volume'),
    trackCount: document.getElementById('drawer-track-count')
  };

  const currentTrack = () => PLAYLIST[currentIndex];

  function errorMessage(kind) {
    if (kind === 'youtube') return 'This video cannot be played here';
    if (kind === 'remote') return 'Could not load this audio link';
    return 'Add audio file in assets/audio/';
  }

  // ---- YouTube ---------------------------------------------------------
  let ytPlayer = null;
  let ytReady = null;              // Promise, created on first use
  let ytLoadedId = null;
  let ytTimer = null;

  let ytApiPromise = null;
  function ytApi() {
    if (ytApiPromise) return ytApiPromise;
    ytApiPromise = new Promise((resolve, reject) => {
      if (window.YT && window.YT.Player) { resolve(); return; }
      const previous = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => { if (previous) previous(); resolve(); };
      const script = document.createElement('script');
      script.src = 'https://www.youtube.com/iframe_api';
      script.onerror = () => { ytApiPromise = null; reject(new Error('YouTube unreachable')); };
      document.head.appendChild(script);
    });
    return ytApiPromise;
  }

  // The player sits in the corner, fully transparent and untouchable. If the browser
  // blocks autoplay, ytShowHost(true) reveals it so one click on the video starts it.
  const YT_HIDDEN_CSS = 'position:fixed;right:0;bottom:0;width:200px;height:200px;opacity:0.001;pointer-events:none;z-index:-1;';
  const YT_SHOWN_CSS = 'position:fixed;left:16px;bottom:16px;width:240px;height:135px;opacity:1;pointer-events:auto;z-index:2147483000;box-shadow:0 8px 30px rgba(0,0,0,.6);border-radius:6px;overflow:hidden;';
  let ytHost = null;
  let ytWatchdog = null;

  function ytShowHost(show) {
    if (!ytHost) return;
    ytHost.style.cssText = show ? YT_SHOWN_CSS : YT_HIDDEN_CSS;
    ytHost.setAttribute('aria-hidden', show ? 'false' : 'true');
    const frame = ytHost.querySelector('iframe');
    if (frame) { frame.style.width = '100%'; frame.style.height = '100%'; }
  }

  function clearYtWatchdog() { if (ytWatchdog) { clearTimeout(ytWatchdog); ytWatchdog = null; } }
  function armYtWatchdog() {
    clearYtWatchdog();
    els.status.textContent = `Loading · ${currentTrack().category}`;
    ytWatchdog = setTimeout(() => {
      ytWatchdog = null;
      if (activeKind !== 'youtube' || isPlaying) return;
      ytShowHost(true);
      els.status.textContent = 'Browser blocked autoplay: press play on the video';
    }, 5000);
  }

  function ytEnsure() {
    if (ytReady) return ytReady;
    ytReady = ytApi().then(() => new Promise((resolve) => {
      ytHost = document.createElement('div');
      ytHost.style.cssText = YT_HIDDEN_CSS;
      ytHost.setAttribute('aria-hidden', 'true');
      const inner = document.createElement('div');
      ytHost.appendChild(inner);
      document.body.appendChild(ytHost);
      const vars = { controls: 1, playsinline: 1, rel: 0 };
      if (/^https?:$/.test(window.location.protocol)) vars.origin = window.location.origin;
      ytPlayer = new window.YT.Player(inner, {
        width: 200,
        height: 200,
        playerVars: vars,
        events: {
          onReady: () => { ytPlayer.setVolume(Math.round(volumeValue * 100)); resolve(); },
          onStateChange: onYtState,
          onError: onYtError
        }
      });
    })).catch((err) => { ytReady = null; throw err; });
    return ytReady;
  }

  // ---- Reading durations (and titles) of YouTube tracks without playing them ----
  // A second hidden player cues each video in turn; a cued video reports its length.
  function probeYoutubeMeta() {
    const pending = PLAYLIST.filter((t) => t.kind === 'youtube' && (t.durationLabel === '--:--' || !t.hasTitle));
    if (!pending.length) return;
    ytApi().then(() => {
      const host = document.createElement('div');
      host.style.cssText = YT_HIDDEN_CSS.replace('right:0', 'left:0');
      host.setAttribute('aria-hidden', 'true');
      const inner = document.createElement('div');
      host.appendChild(inner);
      document.body.appendChild(host);

      let probe = null;
      let queue = pending.slice();
      let finishCurrent = null;

      const finish = () => {
        try { probe.destroy(); } catch {}
        host.remove();
      };
      const next = () => {
        const track = queue.shift();
        if (!track) { finish(); return; }
        let done = false;
        let tries = 0;
        let poll = null;
        const settle = () => {
          if (done) return;
          done = true;
          clearInterval(poll);
          finishCurrent = null;
          next();
        };
        finishCurrent = settle;
        const read = () => {
          const dur = probe.getDuration ? probe.getDuration() : 0;
          const data = (probe.getVideoData && probe.getVideoData()) || {};
          if (dur > 0 || ++tries > 20) {
            if (dur > 0) track.durationLabel = formatTime(dur);
            if (!track.hasTitle && data.title) track.title = data.title;
            if (!track.artist && data.author) track.artist = data.author;
            applyTrackMeta(track);
            settle();
          }
        };
        probe.cueVideoById(track.ytId);
        poll = setInterval(read, 400);   // up to ~8 s per video
      };

      probe = new window.YT.Player(inner, {
        width: 200,
        height: 200,
        playerVars: { controls: 0, rel: 0 },
        events: {
          onReady: () => { probe.mute(); next(); },
          onError: () => { if (finishCurrent) finishCurrent(); }   // unavailable video: skip it
        }
      });
    }).catch(() => {});
  }

  // Show freshly learned title / artist / duration wherever they appear
  function applyTrackMeta(track) {
    renderPlaylist();
    if (track === currentTrack()) {
      els.title.textContent = track.title;
      els.artist.textContent = track.artist;
      if (!isPlaying || activeKind !== 'youtube') els.timeDuration.textContent = track.durationLabel === '--:--' ? '0:00' : track.durationLabel;
    }
  }

  function stopYtTimer() { if (ytTimer) { clearInterval(ytTimer); ytTimer = null; } }
  function startYtTimer() {
    stopYtTimer();
    ytTimer = setInterval(() => {
      if (!ytPlayer || activeKind !== 'youtube') return;
      onProgress(ytPlayer.getCurrentTime(), ytPlayer.getDuration());
    }, 250);
  }

  function ytFillMeta() {
    const track = currentTrack();
    if (!ytPlayer || !ytPlayer.getVideoData) return;
    const data = ytPlayer.getVideoData() || {};
    if (!track.hasTitle && data.title) {
      track.title = data.title;
      els.title.textContent = data.title;
      renderPlaylist();
    }
    if (!track.artist && data.author) {
      track.artist = data.author;
      els.artist.textContent = data.author;
      renderPlaylist();
    }
    const dur = ytPlayer.getDuration();
    if (dur > 0 && track.durationLabel !== formatTime(dur)) {
      track.durationLabel = formatTime(dur);
      renderPlaylist();
    }
  }

  function onYtState(e) {
    if (activeKind !== 'youtube' || !window.YT) return;
    const S = window.YT.PlayerState;
    if (e.data === S.PLAYING) {
      clearYtWatchdog();
      ytShowHost(false);
      isPlaying = true;
      failStreak = 0;
      ytFillMeta();
      startYtTimer();
      syncAudioUI();
      startMeter();
    } else if (e.data === S.PAUSED) {
      isPlaying = false;
      stopYtTimer();
      syncAudioUI();
    } else if (e.data === S.BUFFERING && !isPlaying) {
      els.status.textContent = `Loading · ${currentTrack().category}`;
    } else if (e.data === S.ENDED) {
      isPlaying = false;
      stopYtTimer();
      loadTrack(currentIndex + 1, true);
    }
  }

  function onYtError() {
    if (activeKind !== 'youtube') return;
    handleFailure('youtube');
  }

  // ---- Shared engine API -----------------------------------------------
  function enginePlay() {
    if (activeKind === 'youtube') {
      const id = currentTrack().ytId;
      armYtWatchdog();
      return ytEnsure().then(() => {
        if (ytLoadedId === id) {
          ytPlayer.playVideo();
        } else {
          ytLoadedId = id;
          ytPlayer.loadVideoById(id);
        }
      });
    }
    if (activeKind === 'local') ensureMeter();
    else ensureCtx();
    audio.__wantPlay = true;
    return audio.play();
  }

  function enginePause() {
    if (activeKind === 'youtube') {
      clearYtWatchdog();
      ytShowHost(false);
      if (ytPlayer) ytPlayer.pauseVideo();
    } else {
      audio.__wantPlay = false;
      audio.pause();
    }
  }

  function engineDuration() {
    if (activeKind === 'youtube') return ytPlayer && ytPlayer.getDuration ? ytPlayer.getDuration() : 0;
    return audio.duration;
  }

  function engineTime() {
    if (activeKind === 'youtube') return ytPlayer && ytPlayer.getCurrentTime ? ytPlayer.getCurrentTime() : 0;
    return audio.currentTime;
  }

  function engineSeek(sec) {
    if (activeKind === 'youtube') {
      if (ytPlayer && ytPlayer.seekTo) { ytPlayer.seekTo(sec, true); onProgress(sec, ytPlayer.getDuration()); }
    } else {
      audio.currentTime = sec;
    }
  }

  function engineSetVolume(v) {
    volumeValue = v;
    localAudio.volume = v;
    if (remoteAudio) remoteAudio.volume = v;
    if (ytPlayer && ytPlayer.setVolume) ytPlayer.setVolume(Math.round(v * 100));
  }

  // Stop whatever is not the engine for `kind`
  function silenceOthers(kind) {
    if (kind !== 'local') localAudio.pause();
    if (kind !== 'remote') discardRemote();
    if (kind !== 'youtube') {
      clearYtWatchdog();
      ytShowHost(false);
      stopYtTimer();
      if (ytPlayer && ytPlayer.pauseVideo) ytPlayer.pauseVideo();
    }
  }

  function discardRemote() {
    if (!remoteAudio) return;
    const el = remoteAudio;
    remoteAudio = null;
    if (audio === el) audio = localAudio;
    el.__wantPlay = false;
    el.pause();
    if (el.__node) { try { el.__node.disconnect(); } catch {} el.__node = null; }
    el.removeAttribute('src');
    el.load();
  }

  // A track could not start: say so, and after a short pause move on
  // (but give up once every track in a row has failed, so it never loops forever)
  // A rejected play() can arrive just before the CORS retry starts; check after the event
  function failLater() {
    setTimeout(() => {
      if (activeKind !== 'youtube' && audio.__retrying) return;
      if (isPlaying) return;
      handleFailure(activeKind);
    }, 0);
  }

  let lastFailAt = 0;
  function handleFailure(kind) {
    const now = Date.now();
    if (now - lastFailAt < 600) return;   // an <audio> error and a rejected play() can both report one failure
    lastFailAt = now;
    clearYtWatchdog();
    ytShowHost(false);
    isPlaying = false;
    stopYtTimer();
    syncAudioUI();
    els.status.textContent = errorMessage(kind);
    failStreak += 1;
    if (PLAYLIST.length > 1 && failStreak < PLAYLIST.length && kind !== 'local') {
      setTimeout(() => { if (!isPlaying) loadTrack(currentIndex + 1, true); }, 1500);
    }
  }

  // ---------------------------------------------------------------------
  // Level meter: the sound button glows very slightly with the music.
  // - Needs http(s): on file:// the browser would mute audio routed via Web Audio.
  // - Local files and direct links whose host allows it (CORS) follow the real level.
  //   YouTube cannot be analysed (the browser blocks it), so it gets a slow ambient
  //   swell instead; set YT_BREATHING to false for no glow on YouTube tracks.
  // - RMS is divided by a slowly decaying peak, so loud and quiet masters
  //   (and any volume setting) produce the same small, even effect.
  // ---------------------------------------------------------------------
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  const meterAllowed = /^https?:$/.test(window.location.protocol) && !!AudioCtx;
  let audioCtx = null;
  let analyser = null;
  let meterBuf = null;
  let meterRaf = null;
  let smoothed = 0;
  let peak = 0.02;
  const MAX_PULSE = 0.3; // caps the effect so it stays subtle
  const YT_BREATHING = true;

  // One shared AudioContext + analyser; each metered <audio> element gets its own source node.
  function ensureCtx() {
    if (!meterAllowed) return false;
    if (!audioCtx) {
      try {
        audioCtx = new AudioCtx();
        analyser = audioCtx.createAnalyser();
        analyser.fftSize = 512;
        analyser.connect(audioCtx.destination);
        meterBuf = new Uint8Array(analyser.fftSize);
      } catch {
        audioCtx = null;
        analyser = null;
        return false;
      }
    }
    if (audioCtx.state === 'suspended') audioCtx.resume();
    return !!analyser;
  }

  // Route an element through the analyser. Only call this for elements whose audio
  // the browser may read (local files, or links loaded in CORS mode), or they go silent.
  function attachMeter(el) {
    if (!ensureCtx() || el.__node) return;
    try {
      el.__node = audioCtx.createMediaElementSource(el);
      el.__node.connect(analyser);
      el.__metered = true;
    } catch {
      el.__metered = false;
    }
  }

  function ensureMeter() { attachMeter(localAudio); }

  function meterFrame() {
    meterRaf = null;
    let target = 0;
    if (isPlaying && !reduceMotion.matches) {
      if (activeKind !== 'youtube' && audio.__metered && analyser) {
        analyser.getByteTimeDomainData(meterBuf);
        let sum = 0;
        for (let i = 0; i < meterBuf.length; i++) {
          const d = (meterBuf[i] - 128) / 128;
          sum += d * d;
        }
        const rms = Math.sqrt(sum / meterBuf.length);
        peak = Math.max(rms, peak * 0.996, 0.02);
        const norm = rms / peak;                     // 0..1 relative to recent peak
        target = Math.min(1, Math.max(0, (norm - 0.35) / 0.65)) * MAX_PULSE;
      } else if (activeKind === 'youtube' && YT_BREATHING) {
        // YouTube audio cannot be read, so this is a slow ambient swell, not the music's level
        target = (0.5 + 0.5 * Math.sin((performance.now() / 1000) * (2 * Math.PI / 3.6))) * MAX_PULSE * 0.6;
      }
    }
    smoothed += (target - smoothed) * 0.16;          // ease so it breathes, not flickers
    if (els.soundToggle) els.soundToggle.style.setProperty('--pulse', smoothed.toFixed(3));
    if (isPlaying || smoothed > 0.004) meterRaf = requestAnimationFrame(meterFrame);
    else if (els.soundToggle) els.soundToggle.style.setProperty('--pulse', '0');
  }

  function startMeter() {
    if (reduceMotion.matches || meterRaf) return;
    meterRaf = requestAnimationFrame(meterFrame);
  }

  // Wire an <audio> element; events from an element that is not the active one are ignored
  function wire(el) {
    el.addEventListener('play', () => {
      if (el !== audio) return;
      isPlaying = true; failStreak = 0; syncAudioUI(); startMeter();
    });
    el.addEventListener('pause', () => {
      if (el !== audio) return;
      isPlaying = false; syncAudioUI(); startMeter();
    });
    el.addEventListener('loadedmetadata', () => {
      // A linked track that loaded in CORS mode may be read by the meter
      if (el === remoteAudio && el.crossOrigin === 'anonymous' && !el.__retrying) {
        attachMeter(el);
        if (el === audio) startMeter();
      }
    });
    el.addEventListener('playing', () => { el.__retrying = false; });
    el.addEventListener('error', () => {
      if (el !== audio) return;
      // Host does not allow CORS reads: reload once as a plain stream (no glow)
      if (el === remoteAudio && el.crossOrigin === 'anonymous' && !el.__node) {
        el.__retrying = true;
        el.removeAttribute('crossorigin');
        el.src = resolveAsset(currentTrack().src);
        if (el.__wantPlay) el.play().catch(() => {});
        return;
      }
      el.__retrying = false;
      handleFailure(activeKind);
    });
    el.addEventListener('timeupdate', () => {
      if (el !== audio) return;
      onProgress(el.currentTime, el.duration);
    });
    el.addEventListener('ended', () => {
      if (el !== audio) return;
      loadTrack(currentIndex + 1, true);   // continuous playback through the playlist
    });
  }
  wire(localAudio);

  function formatTime(sec) {
    if (!Number.isFinite(sec) || sec < 0) return '0:00';
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  }

  function onProgress(cur, dur) {
    if (!dur || !Number.isFinite(dur)) return;
    const pct = (cur / dur) * 100;
    els.scrubberFill.style.width = `${pct.toFixed(2)}%`;
    els.scrubber.setAttribute('aria-valuenow', String(Math.round(pct)));
    els.timeCurrent.textContent = formatTime(cur);
    els.timeDuration.textContent = formatTime(dur);
  }

  function syncAudioUI() {
    if (els.soundToggle) {
      els.soundToggle.setAttribute('aria-pressed', String(isPlaying));
      els.soundToggle.setAttribute(
        'aria-label',
        isPlaying ? 'Turn background music off' : 'Turn background music on'
      );
    }
    els.status.textContent = isPlaying
      ? `Playing · ${currentTrack().category}`
      : `Paused · ${currentTrack().category}`;
  }

  function renderCategoryTabs() {
    const categories = ['All', ...new Set(PLAYLIST.map((t) => t.category))];
    els.tabs.innerHTML = '';

    categories.forEach((cat) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'drawer-tab-btn';
      btn.role = 'tab';
      btn.textContent = cat;
      btn.setAttribute('aria-selected', String(cat === activeCategory));
      btn.addEventListener('click', () => {
        activeCategory = cat;
        renderCategoryTabs();
        renderPlaylist();
      });
      els.tabs.appendChild(btn);
    });
  }

  function renderPlaylist() {
    els.playlist.innerHTML = '';

    PLAYLIST.forEach((track, idx) => {
      if (activeCategory !== 'All' && track.category !== activeCategory) return;

      const li = document.createElement('li');
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'playlist-item' + (idx === currentIndex ? ' is-active' : '');
      btn.setAttribute('aria-current', idx === currentIndex ? 'true' : 'false');
      const sub = [track.artist, track.category].filter(Boolean).join(' · ');
      btn.innerHTML = `
        <span class="playlist-item__idx">${pad2(idx + 1)}</span>
        <span>
          <span class="playlist-item__title">${track.title}</span>
          <span class="playlist-item__artist">${sub}</span>
        </span>
        <span class="playlist-item__dur">${track.durationLabel}</span>
      `;
      btn.addEventListener('click', () => {
        failStreak = 0;
        loadTrack(idx, true);
      });
      li.appendChild(btn);
      els.playlist.appendChild(li);
    });
  }

  function loadTrack(index, autoplay = false) {
    currentIndex = (index + PLAYLIST.length) % PLAYLIST.length;
    const track = currentTrack();

    activeKind = track.kind;
    silenceOthers(activeKind);
    if (activeKind === 'local') {
      discardRemote();
      audio = localAudio;
      audio.src = resolveAsset(track.src);
    } else if (activeKind === 'remote') {
      discardRemote();
      remoteAudio = new Audio();
      remoteAudio.preload = 'none';
      remoteAudio.volume = volumeValue;
      remoteAudio.crossOrigin = 'anonymous';   // lets the meter read it when the host allows
      wire(remoteAudio);
      audio = remoteAudio;
      audio.src = resolveAsset(track.src);
    } else {
      if (ytLoadedId !== track.ytId) {   // moving to a different video: nothing is playing until it starts
        ytLoadedId = null;
        isPlaying = false;
        stopYtTimer();
      }
      ytEnsure().catch(() => {});   // warm up the player so a later click can start at once
    }

    els.artwork.src = resolveAsset(track.artwork);
    els.title.textContent = track.title;
    els.artist.textContent = track.artist;
    els.note.textContent = track.note;
    els.timeCurrent.textContent = '0:00';
    els.timeDuration.textContent = track.durationLabel === '--:--' ? '0:00' : track.durationLabel;
    els.scrubberFill.style.width = '0%';
    els.scrubber.setAttribute('aria-valuenow', '0');
    els.trackCount.textContent = `${pad2(currentIndex + 1)} / ${pad2(PLAYLIST.length)}`;

    renderPlaylist();

    if (autoplay) {
      Promise.resolve(enginePlay())
        .then(() => {
          // YouTube reports playing through its own state events; <audio> through 'play'
          if (activeKind !== 'youtube') { isPlaying = true; syncAudioUI(); }
        })
        .catch(() => failLater());
    } else {
      isPlaying = false;
      syncAudioUI();
    }
  }

  // Single Background Music On/Off Toggle
  if (els.soundToggle) {
    els.soundToggle.addEventListener('click', () => {
      if (isPlaying) {
        enginePause();
        isPlaying = false;
        syncAudioUI();
      } else {
        failStreak = 0;
        Promise.resolve(enginePlay())
          .then(() => {
            if (activeKind !== 'youtube') { isPlaying = true; syncAudioUI(); }
          })
          .catch(() => {
            setTimeout(() => {
              if (audio.__retrying || isPlaying) return;
              els.status.textContent = errorMessage(activeKind);
              openDrawer();
            }, 0);
          });
      }
    });
  }

  // Drawer Open / Close Controls
  function openDrawer() {
    els.drawer.classList.add('is-open');
    els.scrim.classList.add('is-open');
    els.drawer.setAttribute('aria-hidden', 'false');
    els.tabTrigger.setAttribute('aria-expanded', 'true');
    els.closeBtn.focus();
  }

  function closeDrawer() {
    els.drawer.classList.remove('is-open');
    els.scrim.classList.remove('is-open');
    els.drawer.setAttribute('aria-hidden', 'true');
    els.tabTrigger.setAttribute('aria-expanded', 'false');
    els.tabTrigger.focus();
  }

  els.tabTrigger.addEventListener('click', () => {
    const isOpen = els.drawer.classList.contains('is-open');
    if (isOpen) closeDrawer();
    else openDrawer();
  });

  // Delegate clicks on any [data-open-soundtrack] link (including newly injected pages)
  document.addEventListener('click', (e) => {
    const trigger = e.target.closest('[data-open-soundtrack]');
    if (!trigger) return;
    e.preventDefault();
    openDrawer();
  });

  els.closeBtn.addEventListener('click', closeDrawer);
  els.scrim.addEventListener('click', closeDrawer);

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && els.drawer.classList.contains('is-open')) {
      closeDrawer();
    }
  });

  // Scrubber & Volume
  function paintVolume() {
    els.volume.style.setProperty('--fill', `${(parseFloat(els.volume.value) * 100).toFixed(0)}%`);
  }
  els.volume.addEventListener('input', (e) => {
    engineSetVolume(parseFloat(e.target.value));
    paintVolume();
  });
  paintVolume();

  els.scrubber.addEventListener('click', (e) => {
    const dur = engineDuration();
    if (!dur) return;
    const rect = els.scrubber.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    engineSeek(ratio * dur);
  });

  els.scrubber.addEventListener('keydown', (e) => {
    const dur = engineDuration();
    if (!dur) return;
    if (e.key === 'ArrowRight') engineSeek(Math.min(dur, engineTime() + 5));
    if (e.key === 'ArrowLeft') engineSeek(Math.max(0, engineTime() - 5));
  });

  renderCategoryTabs();
  loadTrack(0, false);

  // Once the page has settled: get the YouTube player ready (so the first click can start
  // at once) and read each video's length and title in the background.
  if (PLAYLIST.some((t) => t.kind === 'youtube')) {
    const warmUp = () => setTimeout(() => {
      ytEnsure().catch(() => {});
      probeYoutubeMeta();
    }, 800);
    if (document.readyState === 'complete') warmUp();
    else window.addEventListener('load', warmUp, { once: true });
  }
});
