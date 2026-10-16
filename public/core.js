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
//   P.live({ … });          // Live-Vorschau an den Mitspieler (Spiel braucht live: true)
//   Chat: erscheint automatisch als Knopf unten rechts. Abschalten mit P.connect({ chat: false, … }).
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
    .pf-toast.show{opacity:1;transform:translate(-50%,0)}
    /* Einladung (Vorbild: Mühle). Farben kommen aus dem Spiel über --pf-* Variablen. */
    .pf-invite{position:absolute;inset:0;z-index:30;display:flex;align-items:center;justify-content:center;
      background:var(--pf-veil,rgba(20,8,4,.35));backdrop-filter:blur(2px);-webkit-backdrop-filter:blur(2px);border-radius:var(--pf-veil-radius,12px);animation:pf-fade .25s ease}
    .pf-invite.pf-inline{position:static;background:none;backdrop-filter:none;-webkit-backdrop-filter:none;margin:14px 0}
    .pf-invite[hidden]{display:none!important}
    .pf-invite-card{max-width:340px;width:calc(100% - 32px);text-align:center;padding:22px 20px;box-sizing:border-box;
      background:var(--pf-card,#fffaf3);color:var(--pf-text,#2a1a14);border:1px solid var(--pf-line,#dccdbb);border-radius:18px;
      box-shadow:var(--pf-shadow,0 10px 30px rgba(60,25,10,.15));font-family:var(--pf-font,system-ui,-apple-system,'Segoe UI',sans-serif)}
    .pf-invite.pf-inline .pf-invite-card{width:100%}
    .pf-invite-card h2{font-family:var(--pf-title-font,Fraunces,Georgia,serif);font-size:1.45rem;line-height:1.2;margin:0 0 6px;color:inherit}
    .pf-invite-card p{color:var(--pf-muted,#7a6458);margin:0 0 14px;font-size:1rem}
    .pf-linkbox{background:var(--pf-linkbox,var(--pf-bg,#f3ece2));border:1px dashed var(--pf-line,#dccdbb);border-radius:10px;padding:10px;margin-bottom:12px;word-break:break-all;text-align:center}
    .pf-linkbox code{font:.85rem/1.4 ui-monospace,SFMono-Regular,Menlo,monospace;color:var(--pf-text,#2a1a14)}
    .pf-btn{font:inherit;font-weight:600;font-size:1rem;border-radius:12px;padding:12px 18px;cursor:pointer;width:100%;margin-top:4px;
      border:1px solid transparent;background:var(--pf-accent,#7a2e18);color:var(--pf-accent-text,#fff6ea);transition:transform .08s ease,filter .2s}
    .pf-btn:hover{filter:brightness(1.08)} .pf-btn:active{transform:scale(.97)}
    @keyframes pf-fade{from{opacity:0}to{opacity:1}}
    /* ---------- Chat (für alle Spiele). Farben über dieselben --pf-* Variablen wie die Einladung ---------- */
    body.pf-has-chat .pf-toast{bottom:max(84px,calc(72px + env(safe-area-inset-bottom)))}
    body.pf-has-chat{padding-bottom:max(76px,calc(64px + env(safe-area-inset-bottom)))}
    .pf-chat-fab{position:fixed;right:max(16px,env(safe-area-inset-right));bottom:max(16px,env(safe-area-inset-bottom));z-index:900;
      width:54px;height:54px;border-radius:50%;border:0;cursor:pointer;display:grid;place-items:center;
      background:var(--pf-accent,#7a2e18);color:var(--pf-accent-text,#fff6ea);box-shadow:0 6px 18px rgba(0,0,0,.25);transition:transform .12s}
    .pf-chat-fab:active{transform:scale(.94)} .pf-chat-fab svg{width:26px;height:26px}
    .pf-chat-fab[hidden],.pf-chat[hidden]{display:none!important}
    .pf-chat-badge{position:absolute;top:-3px;right:-3px;min-width:21px;height:21px;padding:0 6px;border-radius:999px;
      background:#d9412f;color:#fff;font:700 12px/21px system-ui,sans-serif;box-shadow:0 0 0 2px var(--pf-card,#fff)}
    .pf-chat{position:fixed;z-index:950;right:max(16px,env(safe-area-inset-right));bottom:max(16px,env(safe-area-inset-bottom));
      width:min(360px,calc(100vw - 32px));height:min(480px,calc(100svh - 120px));display:flex;flex-direction:column;
      background:var(--pf-card,#fffaf3);color:var(--pf-text,#2a1a14);border:1px solid var(--pf-line,#dccdbb);border-radius:18px;
      box-shadow:0 18px 50px rgba(0,0,0,.28);overflow:hidden;font:15px/1.4 system-ui,-apple-system,'Segoe UI',sans-serif;animation:pf-up .18s ease}
    @media (max-width:560px){.pf-chat{left:0;right:0;bottom:0;width:auto;height:min(62svh,520px);border-radius:18px 18px 0 0;border-bottom:0;
      padding-bottom:env(safe-area-inset-bottom)}}
    .pf-chat-head{display:flex;align-items:center;gap:8px;padding:10px 10px 10px 16px;border-bottom:1px solid var(--pf-line,#dccdbb)}
    .pf-chat-head b{flex:1;font-size:1rem} .pf-chat-head small{color:var(--pf-muted,#7a6458);font-weight:400}
    .pf-chat-x{border:0;background:none;color:var(--pf-muted,#7a6458);font-size:26px;line-height:1;width:40px;height:40px;cursor:pointer;border-radius:10px}
    .pf-chat-list{flex:1;overflow-y:auto;padding:12px 12px 6px;display:flex;flex-direction:column;gap:6px;overscroll-behavior:contain}
    .pf-chat-empty{margin:auto;color:var(--pf-muted,#7a6458);text-align:center;font-size:.92rem;padding:0 20px}
    .pf-msg{max-width:80%;align-self:flex-start;display:flex;flex-direction:column}
    .pf-msg.me{align-self:flex-end;align-items:flex-end}
    .pf-msg span{padding:7px 11px;border-radius:16px 16px 16px 4px;background:var(--pf-linkbox,var(--pf-bg,#f3ece2));white-space:pre-wrap;overflow-wrap:anywhere}
    .pf-msg.me span{background:var(--pf-accent,#7a2e18);color:var(--pf-accent-text,#fff6ea);border-radius:16px 16px 4px 16px}
    .pf-msg.emoji span{background:none!important;font-size:2rem;line-height:1.1;padding:0 2px}
    .pf-msg time{font-size:.7rem;color:var(--pf-muted,#7a6458);margin:2px 6px 0}
    .pf-chat-quick{display:flex;gap:6px;padding:6px 12px;overflow-x:auto}
    .pf-chat-quick button{flex:none;border:1px solid var(--pf-line,#dccdbb);background:none;color:inherit;border-radius:999px;padding:5px 11px;font:inherit;cursor:pointer}
    .pf-chat-form{display:flex;gap:8px;padding:8px 12px 12px}
    .pf-chat-form input{flex:1;min-width:0;font:inherit;font-size:16px;padding:10px 12px;border-radius:12px;
      border:1px solid var(--pf-line,#dccdbb);background:var(--pf-bg,#fff);color:var(--pf-text,#2a1a14);outline:none}
    .pf-chat-form input:focus{border-color:var(--pf-accent,#7a2e18)}
    .pf-chat-form button{border:0;border-radius:12px;padding:0 14px;cursor:pointer;font:inherit;font-weight:600;
      background:var(--pf-accent,#7a2e18);color:var(--pf-accent-text,#fff6ea)}
    /* Tablet/Desktop: Chat dockt rechts an, wenn daneben Platz ist (Brett wird nicht überdeckt) */
    .pf-chat.pf-dock{top:max(12px,env(safe-area-inset-top));bottom:max(12px,env(safe-area-inset-bottom));right:max(12px,env(safe-area-inset-right));
      left:auto;width:var(--pf-dock-w,340px);height:auto;border-radius:18px;border-bottom:1px solid var(--pf-line,#dccdbb);padding-bottom:0;
      box-shadow:0 8px 30px rgba(0,0,0,.18)}
    @keyframes pf-up{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:none}}`;
  document.head.appendChild(css);

  const TITLES = { vier: 'Vier Gewinnt', dame: 'Dame', muehle: 'Mühle', wort: 'Wortraten', minigolf: 'Minigolf' };

  function init(game) {
    let room = parseRoom(new URLSearchParams(location.search).get('r'));
    const rawRoom = new URLSearchParams(location.search).get('r');
    let ws = null, retry = 0, stopped = false, handlers = {}, timer = null, invite = null, chat = null, lastState = null;

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
      title: TITLES[game] || 'Spiele',

      // Teilen: nur der Link, kein Text (Text + Link wird von manchen Apps zusammengeklebt)
      async share(title = `Spielst du eine Runde ${api.title} mit mir?`) {
        const url = api.link();
        if (navigator.share) {
          try { await navigator.share({ title, url }); return 'shared'; }
          catch (e) { if (e && e.name === 'AbortError') return 'aborted'; }
        }
        return api.copyLink();
      },
      // "Link kopieren" – für den Knopf unter dem Brett
      async copyLink() {
        const url = api.link();
        try { await navigator.clipboard.writeText(url); toast('Link kopiert ✓'); return 'copied'; }
        catch { prompt('Link kopieren:', url); return 'prompt'; }
      },

      // Einladungs-Karte wie bei Mühle: legt sich über das Brett, solange der Mitspieler fehlt.
      // host = Element, über das sich die Karte legt (bekommt position:relative).
      // { inline: true } zeigt die Karte stattdessen im Seitenfluss.
      invite(host, opts = {}) {
        if (!invite) {
          invite = document.createElement('div');
          invite.className = 'pf-invite' + (opts.inline ? ' pf-inline' : '');
          invite.hidden = true;
          invite.innerHTML = `<div class="pf-invite-card" role="dialog" aria-label="Mitspieler einladen">
            <h2>Warte auf deinen Mitspieler</h2><p>Schick ihm diesen Link:</p>
            <div class="pf-linkbox"><code></code></div>
            <button type="button" class="pf-btn">Link teilen</button></div>`;
          invite.querySelector('.pf-btn').addEventListener('click', () => api.share());
          if (!opts.inline && getComputedStyle(host).position === 'static') host.style.position = 'relative';
          host.appendChild(invite);
        }
        return {
          show(on = true) {
            if (on && room) invite.querySelector('code').textContent = api.link();
            invite.hidden = !on || !room;
          },
          hide() { invite.hidden = true; },
        };
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
      // Live-Vorschau an den Mitspieler (z. B. Zielen). Still: kein Hinweis, wenn offline.
      live(data) { if (ws && ws.readyState === 1) ws.send(JSON.stringify({ type: 'live', data })); },
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


    // ---------- Chat: schwebender Knopf + Fenster, in jedem Spiel automatisch ----------
    // Nachrichten liegen nur im Speicher des Servers (letzte 50 pro Raum).
    function makeChat() {
      const QUICK = ['👍', '😂', '😮', '🙈', 'GG', 'Revanche?', 'Gut gespielt!'];
      const seenKey = `spiele.chatSeen.${game}.${room}`;
      let me = 0, msgs = [], open = false, unread = 0, oppName = 'Mitspieler';

      const fab = document.createElement('button');
      fab.type = 'button'; fab.className = 'pf-chat-fab'; fab.setAttribute('aria-label', 'Chat öffnen');
      fab.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12a8 8 0 0 1-11.6 7.1L4 20.5l1.4-4.6A8 8 0 1 1 21 12z"/></svg><span class="pf-chat-badge" hidden></span>';
      const box = document.createElement('section');
      box.className = 'pf-chat'; box.hidden = true; box.setAttribute('aria-label', 'Chat');
      box.innerHTML = `<div class="pf-chat-head"><b>Chat <small></small></b><button type="button" class="pf-chat-x" aria-label="Chat schließen">×</button></div>
        <div class="pf-chat-list" role="log" aria-live="polite"></div>
        <div class="pf-chat-quick">${QUICK.map((q) => `<button type="button">${esc(q)}</button>`).join('')}</div>
        <form class="pf-chat-form" autocomplete="off"><input maxlength="300" placeholder="Nachricht …" enterkeyhint="send" aria-label="Nachricht"><button>Senden</button></form>`;
      document.body.append(fab, box);
      document.body.classList.add('pf-has-chat');
      const $q = (s) => box.querySelector(s);
      const list = $q('.pf-chat-list'), input = $q('input'), badge = fab.querySelector('.pf-chat-badge');

      const isEmoji = (t) => /^(\p{Extended_Pictographic}|\p{Emoji_Component}|‍|️){1,6}$/u.test(t);
      const time = (ts) => new Date(ts).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
      const seen = () => Number(store.get(seenKey, 0)) || 0;
      function markSeen() { const last = msgs.length ? msgs[msgs.length - 1].id : 0; if (last > seen()) store.set(seenKey, last); }

      function draw() {
        list.innerHTML = msgs.length
          ? msgs.map((m) => `<div class="pf-msg${m.seat === me ? ' me' : ''}${isEmoji(m.text) ? ' emoji' : ''}"><span>${esc(m.text)}</span><time>${time(m.ts)}</time></div>`).join('')
          : `<p class="pf-chat-empty">Schreib ${esc(oppName)} etwas – oder schick ein 👍.</p>`;
        list.scrollTop = list.scrollHeight;
      }
      function setUnread(n) {
        unread = n;
        badge.hidden = !n; badge.textContent = n > 9 ? '9+' : String(n);
        const t = document.title.replace(/^\(\d+\+?\) /, ''); // Spiele ändern den Titel selbst (z. B. "Du bist dran")
        document.title = n ? `(${n > 9 ? '9+' : n}) ${t}` : t;
        fab.setAttribute('aria-label', n ? `Chat öffnen, ${n} neue Nachricht${n > 1 ? 'en' : ''}` : 'Chat öffnen');
      }
      // ---- Andocken: freie Fläche rechts nutzen, statt das Brett zu überdecken ----
      // 1) Rechts neben dem Spiel ist genug Platz  -> Chat dort einsetzen, nichts verschieben.
      // 2) Links + rechts zusammen reichen          -> Spiel nach links rücken, Chat rechts daneben.
      // 3) Zu wenig Platz (Handy, schmales Tablet)  -> wie bisher: Leiste von unten / schwebendes Fenster.
      const MIN_CHAT = 280, MAX_CHAT = 400, MIN_GAME = 440, GAP = 24;
      const root = document.documentElement;
      function contentBox() {
        let L = Infinity, R = -Infinity;
        const W = innerWidth;
        for (const el of document.querySelectorAll('body > *, body > * > *, body > * > * > *')) {
          if (el === box || el === fab || box.contains(el) || /^(SCRIPT|STYLE|LINK|svg)$/i.test(el.tagName)) continue;
          if (el.classList.contains('pf-toast')) continue;
          const cs = getComputedStyle(el);
          if (cs.position === 'fixed' || cs.display === 'none' || cs.visibility === 'hidden') continue;
          const r = el.getBoundingClientRect();
          if (r.width < 2 || r.height < 2 || r.width >= W - 2) continue; // volle Breite = nur Hintergrund/Leiste
          L = Math.min(L, r.left); R = Math.max(R, r.right);
        }
        return R > L ? { L, R } : null;
      }
      function undock() {
        box.classList.remove('pf-dock');
        document.body.style.paddingRight = bodyPad;
        root.style.removeProperty('--pf-chat-w');
      }
      const bodyPad = document.body.style.paddingRight;
      let docked = '';
      function layout() {
        undock(); docked = '';
        if (!open || innerWidth <= 560) return;
        const c = contentBox();
        if (!c) return;
        const W = innerWidth, freeRight = W - c.R, gameW = c.R - c.L;
        const sideW = Math.min(MAX_CHAT, freeRight - GAP);            // rechts daneben, nichts bewegt sich
        const pushW = Math.min(MAX_CHAT, W - gameW - GAP * 2);        // Spiel rückt nach links, bleibt gleich groß
        const squeezeW = Math.min(MAX_CHAT, W - MIN_GAME - GAP * 2);  // Spiel wird etwas schmaler
        let w, mode;
        if (sideW >= MIN_CHAT && sideW >= pushW - 40) { w = sideW; mode = 'side'; }
        else if (pushW >= MIN_CHAT) { w = pushW; mode = 'push'; }
        else if (squeezeW >= MIN_CHAT) { w = MIN_CHAT; mode = 'push'; }
        else return;
        root.style.setProperty('--pf-dock-w', w + 'px');
        if (mode === 'push') {
          root.style.setProperty('--pf-chat-w', (w + GAP) + 'px');
          document.body.style.paddingRight = (w + GAP) + 'px';
        }
        box.classList.add('pf-dock'); docked = mode;
      }
      let raf = 0;
      addEventListener('resize', () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(layout); });

      function show(on) {
        open = on; box.hidden = !on; fab.hidden = on;
        layout();
        if (on) { toastEl && toastEl.classList.remove('show'); setUnread(0); markSeen(); draw(); if (matchMedia('(hover: hover)').matches) input.focus(); }
      }
      function send(text) {
        text = String(text || '').trim();
        if (!text) return;
        if (api.send({ type: 'chat', text })) input.value = '';
      }

      fab.addEventListener('click', () => show(true));
      $q('.pf-chat-x').addEventListener('click', () => show(false));
      document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && open) show(false); });
      $q('.pf-chat-form').addEventListener('submit', (e) => { e.preventDefault(); send(input.value); });
      $q('.pf-chat-quick').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) send(b.textContent); });
      document.addEventListener('visibilitychange', () => { if (!document.hidden && open) { setUnread(0); markSeen(); } });

      return {
        load(seat, all) {
          me = seat; msgs = all || [];
          if (open) { draw(); markSeen(); } else setUnread(msgs.filter((m) => m.seat !== me && m.id > seen()).length);
        },
        add(m) {
          if (msgs.some((x) => x.id === m.id)) return;
          msgs.push(m); if (msgs.length > 50) msgs.shift();
          const mine = m.seat === me;
          if (open && !document.hidden) { draw(); markSeen(); return; }
          if (open) draw();
          if (!mine) { setUnread(unread + 1); if (!open) toast(`${m.name}: ${m.text.length > 60 ? m.text.slice(0, 57) + '…' : m.text}`); }
        },
        players(state) {
          // Namen des Mitspielers für den Kopf – aus dem Spielzustand, egal wie das Spiel ihn sortiert
          const names = (state.players || []).filter(Boolean).map((p) => p.name);
          const other = names.find((n) => n !== api.name) || names[1 - me];
          if (other) { oppName = other; $q('.pf-chat-head small').textContent = '· mit ' + other; }
        },
      };
    }

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
        if (m.type === 'state') { lastState = m; handlers.onState && handlers.onState(m); chat && chat.players(m); }
        else if (m.type === 'chatlog') {
          if (handlers.chat === false) return;
          if (!chat) { chat = makeChat(); if (lastState) chat.players(lastState); }
          chat.load(m.you, m.msgs);
        }
        else if (m.type === 'chat') chat && chat.add(m.msg, true);
        else if (m.type === 'live') handlers.onLive && handlers.onLive(m.data, m.seat);
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
