// Spiele-Sammlung – gemeinsamer Baustein für alle Spiele im Browser
//
// Stellt bereit: Spieler-ID und Name (gelten für alle Spiele), Raumcode aus dem Link,
// Einladen/Teilen, Verbindung mit automatischem Wiederverbinden, Toast-Meldungen, Historie.
//
// Nutzung in einem Spiel:
//   const P = Platform.init('vier');
//   P.connect({ onState(s) {...}, onError(msg) {...}, onFull() {...} });
//   P.act({ col: 3 });      // Spielzug an den Server
//   P.rematch(); P.resign();
(function () {
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
  };

  const ABC = 'abcdefghijkmnpqrstuvwxyz23456789'; // ohne l, o, 0, 1 (verwechselbar)
  const ROOM_LEN = 8;
  const rand = (n, abc = ABC) => {
    const a = new Uint32Array(n);
    (window.crypto || window.msCrypto).getRandomValues(a);
    return Array.from(a, (x) => abc[x % abc.length]).join('');
  };

  // Eine Spieler-ID für alle Spiele (gleiche Domain = gleicher Speicher)
  let id = store.get('spiele.id', null);
  if (!id || String(id).length < 8) { id = rand(20); store.set('spiele.id', id); }

  // Raumcode robust lesen: nur die ersten 8 gültigen Zeichen.
  // Messenger hängen manchmal Text direkt an den Link an ("…?r=ab12cd34Spielst du mit?").
  function parseRoom(raw) {
    const m = String(raw || '').toLowerCase().match(/^[a-z0-9]{8}/);
    return m ? m[0] : '';
  }

  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  // ---------- Toast ----------
  let toastEl, toastTimer;
  function toast(msg, ms = 2600) {
    if (!toastEl) {
      toastEl = document.createElement('div');
      toastEl.className = 'pf-toast';
      toastEl.setAttribute('role', 'status');
      document.body.appendChild(toastEl);
    }
    toastEl.textContent = msg;
    toastEl.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove('show'), ms);
  }
  // Stil für den Toast einmalig einfügen (Spiele können ihn mit .pf-toast überschreiben)
  const css = document.createElement('style');
  css.textContent = `.pf-toast{position:fixed;left:50%;bottom:max(18px,env(safe-area-inset-bottom));transform:translate(-50%,30px);
    opacity:0;background:rgba(20,16,12,.92);color:#fff;font:600 .95rem/1.35 system-ui,sans-serif;padding:.6em 1.1em;border-radius:999px;
    max-width:calc(100vw - 32px);width:max-content;text-align:center;transition:.25s;pointer-events:none;z-index:1000}
    .pf-toast.show{opacity:1;transform:translate(-50%,0)}`;
  document.head.appendChild(css);

  function init(game) {
    let room = parseRoom(new URLSearchParams(location.search).get('r'));
    const rawRoom = new URLSearchParams(location.search).get('r');
    let ws = null, retry = 0, stopped = false, handlers = {}, timer = null;

    const api = {
      game, id, esc, toast, store,
      // Wurde ein Link geöffnet, der kaputt ist? (dann zeigen Spiele einen Hinweis)
      brokenLink: !!rawRoom && !room,
      get room() { return room; },
      get name() { return store.get('spiele.name', ''); },
      set name(v) { store.set('spiele.name', String(v || '').trim().slice(0, 20)); },

      // Neuen Raum anlegen und in die Adresszeile schreiben
      newRoom() {
        room = rand(ROOM_LEN);
        history.replaceState(null, '', `${location.pathname}?r=${room}`);
        return room;
      },
      link(r = room) { return `${location.origin}/${game}/?r=${r}`; },

      // Teilen: nur der Link, kein Text (Text + Link wird von manchen Apps zusammengeklebt)
      async share(title) {
        const url = api.link();
        if (navigator.share) {
          try { await navigator.share({ title, url }); return 'shared'; }
          catch (e) { if (e && e.name === 'AbortError') return 'aborted'; }
        }
        try { await navigator.clipboard.writeText(url); toast('Link kopiert – schick ihn deinem Mitspieler.'); return 'copied'; }
        catch { prompt('Link kopieren:', url); return 'prompt'; }
      },

      connect(h) {
        handlers = h || {};
        stopped = false;
        open();
      },
      send(msg) {
        if (ws && ws.readyState === 1) { ws.send(JSON.stringify(msg)); return true; }
        toast('Keine Verbindung – versuche es gleich nochmal.');
        return false;
      },
      act(a) { return api.send({ type: 'act', act: a }); },
      rematch() { return api.send({ type: 'rematch' }); },
      resign() { return api.send({ type: 'resign' }); },

      // Historie dieses Spielers (alle Spiele oder nur eines)
      async history(onlyThisGame = true) {
        try {
          const r = await fetch(`/api/history?id=${encodeURIComponent(id)}${onlyThisGame ? '&game=' + game : ''}`, { cache: 'no-store' });
          return await r.json();
        } catch { return []; }
      },
      // Fertige Historie-Liste in ein Element schreiben
      async renderHistory(el, opts = {}) {
        if (!el) return;
        const list = await api.history(opts.allGames ? false : true);
        if (!list.length) { el.innerHTML = opts.empty ? `<p class="pf-empty">${esc(opts.empty)}</p>` : ''; el.hidden = !opts.empty; return; }
        el.hidden = false;
        const word = { win: 'Sieg', loss: 'Niederlage', draw: 'Remis' };
        el.innerHTML = (opts.title === false ? '' : `<h2>${esc(opts.title || 'Deine letzten Partien')}</h2>`) +
          '<ul class="pf-history">' + list.slice(0, opts.limit || 10).map((h) =>
            `<li class="pf-${h.result}"><span class="pf-res">${word[h.result]}</span>` +
            `<span class="pf-opp">${opts.allGames ? esc(h.title) + ' · ' : ''}gegen ${esc(h.opp)}${h.summary ? ' · ' + esc(h.summary) : ''}</span>` +
            `<span class="pf-date">${new Date(h.ts).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' })}</span></li>`
          ).join('') + '</ul>';
      },
    };

    function open() {
      clearTimeout(timer);
      if (stopped || !room) return;
      if (ws && ws.readyState <= 1) return; // läuft schon
      const proto = location.protocol === 'https:' ? 'wss' : 'ws';
      ws = new WebSocket(`${proto}://${location.host}/ws`);
      ws.onopen = () => {
        retry = 0;
        ws.send(JSON.stringify({ type: 'join', game, room, id, name: api.name || 'Gast', data: handlers.joinData ? handlers.joinData() : {} }));
        handlers.onOpen && handlers.onOpen();
      };
      ws.onmessage = (e) => {
        let m; try { m = JSON.parse(e.data); } catch { return; }
        if (m.type === 'state') handlers.onState && handlers.onState(m);
        else if (m.type === 'error') {
          if (m.code === 'link') { stopped = true; handlers.onBadLink ? handlers.onBadLink(m.msg) : toast(m.msg); }
          else handlers.onError ? handlers.onError(m.msg) : toast(m.msg);
        } else if (m.type === 'full') { stopped = true; handlers.onFull ? handlers.onFull() : toast('Dieses Spiel hat schon zwei Spieler.'); }
      };
      ws.onclose = (e) => {
        if (stopped || e.code === 4000) return; // 4000 = in einem anderen Tab geöffnet
        handlers.onDisconnect && handlers.onDisconnect();
        timer = setTimeout(open, Math.min(8000, 500 * 2 ** retry++));
      };
    }
    // Handy aus dem Standby zurück -> sofort neu verbinden
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden && ws && ws.readyState > 1 && !stopped) { retry = 0; open(); }
    });

    return api;
  }

  window.Platform = { init, parseRoom, store, esc, toast };
})();
