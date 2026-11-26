// ============================================================
// multiplayer.js: Play with a Buddy (phase 1: pairing + live buddy panel)
//
// Each player runs their own game and save. Every ~330 ms this file sends a
// small summary of the local game (Aura, rates, cards, status) to a shared
// room, and draws the buddy's summary in a side panel. Big moments (packs,
// boss fights, Frenzy, Nyan Cat) are sent as one-off events for the feed.
//
// Transports:
//   firebase  Firebase Realtime Database + anonymous auth (needs firebase-config.js)
//   local     BroadcastChannel between tabs of one browser (dev/testing: ?mp=local)
//   ?mp=emu   Firebase transport against local emulators (auth :9099, database :9000)
//
// game.js calls mpEmit(kind, data) at a few hook points; everything else
// only reads G and the game's helper functions. No room joined = no effect.
// ============================================================
(() => {
  'use strict';

  const LS_PROFILE = 'nugget_mp_profile';
  const LS_ROOM = 'nugget_mp_room';
  const LS_PID = 'nugget_mp_pid';
  const LS_HIDE = 'nugget_mp_hidden';
  const SEND_MS = 330;          // state send interval
  const HEARTBEAT_MS = 2000;    // send even if nothing changed
  const AWAY_MS = 8000;         // no state for this long = buddy away
  const CODE_LETTERS = 'BCDFGHJKLMNPQRSTVWXZ';   // no vowels: codes can't spell words
  const EMOJIS = ['🐔', '🍗', '🚽', '🗿', '😎', '🐸', '🦖', '👑', '🔥', '🤖', '🐱', '💀'];
  const SDK = 'https://www.gstatic.com/firebasejs/10.12.2/';

  const lsGet = (k) => { try { return localStorage.getItem(k); } catch (_) { return null; } };
  const lsSet = (k, v) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch (_) { } };
  const esc = (s) => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const $ = (id) => document.getElementById(id);
  const num = (n) => (typeof fmt === 'function' ? fmt(n) : String(Math.floor(n)));

  const params = new URLSearchParams(location.search);
  const forceLocal = params.get('mp') === 'local';
  const useEmu = params.get('mp') === 'emu';
  const fbConfig = useEmu
    ? { apiKey: 'demo-key', projectId: 'demo-nugget', databaseURL: 'http://127.0.0.1:9000/?ns=demo-nugget' }
    : window.NUGGET_FIREBASE_CONFIG;
  const hasFirebase = !!fbConfig;
  const available = forceLocal || hasFirebase;

  // ---------- profile ----------
  function loadProfile() {
    try { const p = JSON.parse(lsGet(LS_PROFILE)); if (p && p.name) return p; } catch (_) { }
    return null;
  }
  let profile = loadProfile();
  function cleanName(s) { return String(s || '').replace(/[^\p{L}\p{N} _\-!.]/gu, '').trim().slice(0, 16); }

  function randomCode() {
    let s = '';
    for (let i = 0; i < 4; i++) s += CODE_LETTERS[Math.floor(Math.random() * CODE_LETTERS.length)];
    return s;
  }
  function normCode(s) { return String(s || '').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4); }

  // ---------- script loading ----------
  function loadScript(src) {
    return new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = src; s.onload = res; s.onerror = () => rej(new Error('Could not load ' + src));
      document.head.appendChild(s);
    });
  }

  // ---------- transports ----------
  // Each transport: connect() -> pid; join(code, onPlayers, onEvent); publish(payload);
  // send(event); leave().
  function localTransport() {
    let ch = null, pid = sessionStorage.getItem(LS_PID) || ('p' + Math.random().toString(36).slice(2, 10));
    sessionStorage.setItem(LS_PID, pid);
    const players = {};
    let onPlayers = null, onEvent = null;
    return {
      kind: 'local',
      async connect() { return pid; },
      async join(code, cbPlayers, cbEvent) {
        onPlayers = cbPlayers; onEvent = cbEvent;
        ch = new BroadcastChannel('nugget-mp-' + code);
        ch.onmessage = (m) => {
          const d = m.data || {};
          if (d.from === pid) return;
          if (d.type === 'state') { players[d.from] = d.payload; onPlayers && onPlayers({ ...players }); }
          else if (d.type === 'leave') { delete players[d.from]; onPlayers && onPlayers({ ...players }); }
          else if (d.type === 'event') { onEvent && onEvent({ from: d.from, ...d.event }); }
        };
      },
      publish(payload) { ch && ch.postMessage({ type: 'state', from: pid, payload: { ...payload, t: Date.now() } }); },
      send(event) { ch && ch.postMessage({ type: 'event', from: pid, event: { ...event, t: Date.now() } }); },
      leave() { if (ch) { ch.postMessage({ type: 'leave', from: pid }); ch.close(); ch = null; } },
    };
  }

  function firebaseTransport() {
    let db = null, pid = null, roomRef = null, meRef = null, evQuery = null, playersRef = null;
    let serverOffset = 0;
    return {
      kind: 'firebase',
      async connect() {
        if (!window.firebase) {
          await loadScript(SDK + 'firebase-app-compat.js');
          await loadScript(SDK + 'firebase-auth-compat.js');
          await loadScript(SDK + 'firebase-database-compat.js');
        }
        if (!firebase.apps.length) {
          firebase.initializeApp(fbConfig);
          if (useEmu) {
            firebase.auth().useEmulator('http://127.0.0.1:9099');
            firebase.database().useEmulator('127.0.0.1', 9000);
          }
        }
        const cred = firebase.auth().currentUser ? { user: firebase.auth().currentUser } : await firebase.auth().signInAnonymously();
        pid = cred.user.uid;
        db = firebase.database();
        db.ref('.info/serverTimeOffset').on('value', s => { serverOffset = s.val() || 0; });
        return pid;
      },
      async join(code, onPlayers, onEvent) {
        roomRef = db.ref('rooms/' + code);
        meRef = roomRef.child('players/' + pid);
        await meRef.onDisconnect().update({ online: false });
        playersRef = roomRef.child('players');
        playersRef.on('value', snap => {
          const all = snap.val() || {};
          const out = {};
          for (const [k, v] of Object.entries(all)) {
            if (k === pid || !v) continue;
            // t is server time; convert to local clock so "away" checks work across devices
            out[k] = { ...v, t: (v.t || 0) - serverOffset };
          }
          onPlayers(out);
        });
        // Only events sent after we joined: push keys sort by creation time.
        const startKey = roomRef.child('events').push().key;
        evQuery = roomRef.child('events').orderByKey().startAt(startKey);
        evQuery.on('child_added', snap => {
          const v = snap.val();
          if (!v || v.from === pid) return;
          onEvent(v);
        });
        // Tidy our own old events so the room stays small.
        roomRef.child('events').orderByChild('from').equalTo(pid).once('value', s => {
          s.forEach(c => { c.ref.remove().catch(() => { }); });
        }).catch(() => { });
      },
      publish(payload) {
        if (!meRef) return;
        meRef.set({ ...payload, online: true, t: firebase.database.ServerValue.TIMESTAMP }).catch(e => console.warn('MP publish failed', e));
      },
      send(event) {
        if (!roomRef) return;
        roomRef.child('events').push({ ...event, from: pid, t: firebase.database.ServerValue.TIMESTAMP }).catch(() => { });
      },
      leave() {
        if (playersRef) playersRef.off();
        if (evQuery) evQuery.off();
        if (meRef) { meRef.onDisconnect().cancel(); meRef.remove().catch(() => { }); }
        roomRef = meRef = evQuery = playersRef = null;
      },
    };
  }

  // ---------- local game snapshot ----------
  function snapshot() {
    const bs = getBinderStats();
    const fieldMult = getFieldMult();
    const mult = G.allAuraMult * (1 + bs.addMult + fieldMult) * (G.frenzyActive ? 10 : 1);
    const aps = (G.auraPerSecond + bs.addAps) * apsBuffMult() * mult;
    const apc = (G.auraPerClick + bs.addApc) * mult * clickBuffMult(true);
    const burns = [...new Set([...(G.clickBuffs || []), ...(G.apsBuffs || [])].map(b => b.src).filter(Boolean))].slice(0, 4);
    return {
      name: profile.name, emoji: profile.emoji,
      aura: G.aura, aps, apc, kek: G.kekCoins, clicks: G.totalClicks,
      field: G.fieldSlot || null,
      binder: (G.binderSlots || []).map(x => x || null),
      owned: G.owned || {},
      frenzy: !!G.frenzyActive,
      boss: !!(G.boss && G.boss.active),
      burns,
      packs: G.packsPurchased || 0,
      uniq: Object.keys(G.collection || {}).length,
    };
  }

  // ---------- state ----------
  let transport = null, myPid = null, room = null, connecting = false;
  let buddyPid = null, buddy = null, buddyRecvAt = 0, buddyClicksPrev = null, buddyCps = 0;
  const cpsSamples = [];
  let lastSent = 0, lastSentJSON = '', sendTimer = null, renderTimer = null;
  const feed = [];
  let lastNyanFeed = 0;

  function setStatus(text) { const el = $('mp-status'); if (el) el.textContent = text || ''; }

  async function joinRoom(code, { silent } = {}) {
    code = normCode(code);
    if (code.length !== 4) { setStatus('Codes are 4 letters.'); return false; }
    if (!profile) { setStatus('Pick a name first.'); return false; }
    if (connecting) return false;
    connecting = true;
    setStatus('Connecting…');
    try {
      if (room) leaveRoom(true);
      transport = (forceLocal || !hasFirebase) ? localTransport() : firebaseTransport();
      myPid = await transport.connect();
      await transport.join(code, onPlayers, onEvent);
      room = code;
      lsSet(LS_ROOM, code);
      buddyPid = null; buddy = null; buddyClicksPrev = null; feed.length = 0;
      lastSentJSON = '';
      sendNow();
      clearInterval(sendTimer); sendTimer = setInterval(sendTick, SEND_MS);
      clearInterval(renderTimer); renderTimer = setInterval(renderTick, 100);
      document.body.classList.add('mp-on');
      applyHidden();
      renderPanel();
      renderModal();
      if (!silent) addFeed(`You joined room <b>${code}</b>. Waiting for your buddy…`);
      setStatus('');
      return true;
    } catch (e) {
      console.warn('MP join failed', e);
      setStatus('Could not connect: ' + (e && e.message ? e.message : e));
      transport = null; room = null;
      return false;
    } finally {
      connecting = false;
      kickResize();
    }
  }

  function leaveRoom(keepUi) {
    if (transport) transport.leave();
    transport = null; room = null; buddy = null; buddyPid = null;
    clearInterval(sendTimer); clearInterval(renderTimer);
    lsSet(LS_ROOM, null);
    if (!keepUi) {
      document.body.classList.remove('mp-on', 'mp-split', 'mp-hidden', 'mp-open');
      renderModal();
      kickResize();
    }
  }

  function sendTick() {
    if (!transport || !profile) return;
    const now = Date.now();
    const snap = snapshot();
    const json = JSON.stringify(snap);
    if (json === lastSentJSON && now - lastSent < HEARTBEAT_MS) return;
    lastSentJSON = json; lastSent = now;
    transport.publish(snap);
  }
  function sendNow() { lastSentJSON = ''; lastSent = 0; sendTick(); }

  function onPlayers(all) {
    // Pick the buddy: keep the current one if still present, else the freshest online player.
    let pick = null;
    if (buddyPid && all[buddyPid]) pick = buddyPid;
    else {
      let best = -1;
      for (const [k, v] of Object.entries(all)) {
        if (v.online === false) continue;
        if ((v.t || 0) > best) { best = v.t || 0; pick = k; }
      }
    }
    const prevName = buddy && buddy.name;
    if (!pick) {
      if (buddy && buddy.online !== false) buddy = { ...buddy, online: false };
      renderPanel();
      return;
    }
    const v = all[pick];
    const fresh = !buddy || buddyPid !== pick;
    if (buddyPid !== pick) { buddyPid = pick; buddyClicksPrev = null; cpsSamples.length = 0; }
    const now = Date.now();
    if (buddyClicksPrev != null && v.clicks > buddyClicksPrev) {
      bounceBuddyNugget(Math.min(5, v.clicks - buddyClicksPrev));
    }
    if (typeof v.clicks === 'number') {
      cpsSamples.push({ t: now, c: v.clicks });
      while (cpsSamples.length && now - cpsSamples[0].t > 3000) cpsSamples.shift();
      if (cpsSamples.length >= 2) {
        const a = cpsSamples[0], b = cpsSamples[cpsSamples.length - 1];
        buddyCps = b.t > a.t ? (b.c - a.c) / ((b.t - a.t) / 1000) : 0;
      }
      buddyClicksPrev = v.clicks;
    }
    buddy = v; buddyRecvAt = now;
    if (fresh || prevName !== v.name) {
      if (v.online !== false) {
        addFeed(`${esc(v.emoji || '🙂')} <b>${esc(v.name || 'Buddy')}</b> is here!`);
        if (typeof sfx === 'function') sfx('vine-boom-sound-meme', 0.5);
      }
    }
    renderPanel();
  }

  function buddyOnline() {
    return !!buddy && buddy.online !== false && Date.now() - buddyRecvAt < AWAY_MS;
  }

  // ---------- events ----------
  function cardName(id) { const c = CARD_BY_ID.get(id); return c ? c.name : id; }
  const RARITY_LABEL = { common: 'Common', uncommon: 'Uncommon', rare: 'RARE', 'mythic-rare': 'MYTHIC' };

  function onEvent(ev) {
    const who = `<b>${esc((buddy && buddy.name) || 'Buddy')}</b>`;
    const d = ev.data || {};
    switch (ev.kind) {
      case 'pack': {
        const c = CARD_BY_ID.get(d.id);
        const r = c ? c.rarity : d.rarity;
        const label = RARITY_LABEL[r] || '';
        addFeed(`🃏 ${who} pulled ${label ? `<span class="mp-r-${esc(r)}">${label}</span> ` : ''}${esc(cardName(d.id))}${d.dupe ? ' (dupe)' : ''}`);
        if (r === 'mythic-rare') flashPanel('gold');
        else if (r === 'rare') flashPanel('purple');
        break;
      }
      case 'boss_start': addFeed(`🚽 Skibidi Toilet is attacking ${who}!`); flashPanel('red'); break;
      case 'boss_end': addFeed(d.victory ? `🏆 ${who} flushed the Skibidi Toilet!` : `💩 Skibidi got away from ${who}.`); break;
      case 'frenzy': addFeed(`⚡ ${who} hit MAX RIZZ!`); flashPanel('gold'); break;
      case 'nyan':
        nyanAcrossPanel();
        if (Date.now() - lastNyanFeed > 60000) { lastNyanFeed = Date.now(); addFeed(`🌈 Nyan Cat flew by ${who}!`); }
        break;
      case 'burn': addFeed(`🔥 ${who} used ${esc(cardName(d.id))}`); break;
      case 'field': addFeed(`★ ${who} played ${esc(cardName(d.id))} as their Field`); break;
      default: break;
    }
  }

  // Called from game.js hook points.
  window.mpEmit = function (kind, data) {
    try { if (transport && room) { transport.send({ kind, data: data || {} }); sendNow(); } } catch (_) { }
  };

  function addFeed(html) {
    feed.unshift({ html, t: Date.now() });
    if (feed.length > 6) feed.length = 6;
    const el = $('mp-feed');
    if (el) el.innerHTML = feed.map(f => `<div class="mp-feed-item">${f.html}</div>`).join('');
  }

  // ---------- panel ----------
  function cardThumb(id, cls) {
    if (!id) return `<div class="mp-thumb ${cls || ''} mp-empty">·</div>`;
    const c = CARD_BY_ID.get(id);
    if (!c) return `<div class="mp-thumb ${cls || ''} mp-empty">?</div>`;
    const img = CARD_IMAGES[id];
    const art = img ? `<img src="${esc(img)}" alt="">` : `<span>${c.emoji || '🃏'}</span>`;
    return `<div class="mp-thumb ${cls || ''} mp-r-${esc(c.rarity)}" title="${esc(c.name)}">${art}</div>`;
  }

  let lastStaticKey = '';
  function renderPanel() {
    const p = $('mp-panel');
    if (!p) return;
    p.classList.toggle('mp-away', !buddyOnline());
    if (!room) return;
    const b = buddy;
    $('mp-room-code').textContent = room;
    $('mp-waiting-code').textContent = room;
    if (!b) {
      $('mp-buddy-name').textContent = 'Waiting for buddy…';
      $('mp-buddy-emoji').textContent = '⏳';
      $('mp-waiting').style.display = '';
      $('mp-body').style.display = 'none';
      $('mp-strip-text').textContent = `Room ${room}: waiting for buddy`;
      return;
    }
    $('mp-waiting').style.display = 'none';
    $('mp-body').style.display = '';
    $('mp-buddy-name').textContent = (b.name || 'Buddy') + (buddyOnline() ? '' : ' (away)');
    $('mp-buddy-emoji').textContent = b.emoji || '🙂';
    // Static-ish parts only re-render when they change (images would flicker otherwise).
    const key = JSON.stringify([b.field, b.binder, b.owned, b.frenzy, b.boss, b.burns]);
    if (key !== lastStaticKey) {
      lastStaticKey = key;
      $('mp-field').innerHTML = cardThumb(b.field, 'mp-field-card') +
        `<div class="mp-field-name">${b.field ? esc(cardName(b.field)) : 'No Field card'}</div>`;
      $('mp-binder').innerHTML = (b.binder && b.binder.length ? b.binder : [null, null, null, null, null]).map(id => cardThumb(id)).join('');
      const sauces = (typeof UPGRADES !== 'undefined' ? UPGRADES : []).map(u => {
        const n = (b.owned || {})[u.id] || 0;
        const icon = [...(u.name || '🥫')][0];
        return n ? `<span class="mp-sauce" title="${esc(u.name)}">${icon}${n}</span>` : '';
      }).join('');
      $('mp-sauces').innerHTML = sauces || '<span class="mp-dim">No sauces yet</span>';
      const badges = [];
      if (b.frenzy) badges.push('<span class="mp-badge mp-badge-frenzy">⚡ FRENZY</span>');
      if (b.boss) badges.push('<span class="mp-badge mp-badge-boss">🚽 BOSS FIGHT</span>');
      for (const s of b.burns || []) badges.push(`<span class="mp-badge">🔥 ${esc(typeof buffName === 'function' ? buffName(s) : s)}</span>`);
      $('mp-badges').innerHTML = badges.join('');
    }
    $('mp-kek').textContent = num(b.kek || 0);
    $('mp-aps').textContent = num(b.aps || 0);
    $('mp-apc').textContent = num(b.apc || 0);
    $('mp-cards').textContent = `${b.uniq || 0} cards · ${b.packs || 0} packs`;
    renderTick();
  }

  // Aura counts up smoothly between updates using the buddy's Aura/sec.
  function renderTick() {
    if (!buddy) return;
    const el = $('mp-aura');
    if (!el) return;
    const online = buddyOnline();
    const dt = online ? Math.min(3, (Date.now() - buddyRecvAt) / 1000) : 0;
    const aura = (buddy.aura || 0) + (buddy.aps || 0) * dt;
    el.textContent = num(aura);
    const cps = online ? buddyCps : 0;
    $('mp-cps-fill').style.width = Math.min(100, cps / 12 * 100) + '%';
    $('mp-cps').textContent = cps.toFixed(1) + ' clicks/s';
    $('mp-strip-text').textContent = `${buddy.emoji || '🙂'} ${buddy.name || 'Buddy'}: ${num(aura)} Aura · +${num(buddy.aps || 0)}/s${online ? '' : ' (away)'}`;
    const p = $('mp-panel');
    if (p) p.classList.toggle('mp-away', !online);
  }

  function bounceBuddyNugget(n) {
    const el = $('mp-nugget');
    if (!el) return;
    el.classList.remove('mp-bounce'); void el.offsetWidth; el.classList.add('mp-bounce');
    if (n >= 3) { el.dataset.plus = '+' + n; el.classList.add('mp-plus'); setTimeout(() => el.classList.remove('mp-plus'), 400); }
  }
  function flashPanel(color) {
    const p = $('mp-panel');
    if (!p) return;
    p.classList.remove('mp-flash-gold', 'mp-flash-purple', 'mp-flash-red');
    void p.offsetWidth;
    p.classList.add('mp-flash-' + color);
    setTimeout(() => p.classList.remove('mp-flash-' + color), 1600);
    if (color === 'gold' && typeof sfx === 'function') sfx('vine-boom-sound-meme', 0.35);
  }
  function nyanAcrossPanel() {
    const p = $('mp-panel');
    if (!p) return;
    const n = document.createElement('img');
    n.src = 'Images/Effects/nyan-cat.gif';
    n.className = 'mp-nyan';
    n.alt = '';
    p.appendChild(n);
    setTimeout(() => n.remove(), 3200);
  }

  // ---------- layout ----------
  function applyHidden() {
    const hidden = lsGet(LS_HIDE) === '1';
    document.body.classList.toggle('mp-hidden', hidden);
    document.body.classList.toggle('mp-split', !!room && !hidden);
    const t = $('mp-hide-btn'); if (t) t.textContent = hidden ? '👥 Show buddy' : '🙈 Hide buddy';
    kickResize();
  }
  function kickResize() {
    // The 3D nugget sizes itself on window resize.
    setTimeout(() => window.dispatchEvent(new Event('resize')), 30);
    setTimeout(() => window.dispatchEvent(new Event('resize')), 350);
  }

  // ---------- modal ----------
  function renderModal() {
    const box = $('mp-modal-body');
    if (!box) return;
    if (!available) {
      box.innerHTML = `
        <p>Multiplayer isn't set up yet.</p>
        <p class="mp-dim">It needs a free Firebase project. Once its settings are pasted into <code>firebase-config.js</code>, this button lets you pair up with a 4-letter code.</p>
        <button class="mp-btn" onclick="MP.close()">OK</button>`;
      return;
    }
    if (room) {
      const link = location.origin + location.pathname + '?room=' + room + (forceLocal ? '&mp=local' : '');
      box.innerHTML = `
        <p>You're in room</p>
        <div class="mp-code-big">${room}</div>
        <div id="mp-qr"></div>
        <p class="mp-dim">Your buddy taps <b>👥 BUDDY</b>, then <b>Join</b>, and types this code. Or they scan the QR code with their camera.</p>
        <div class="mp-row">
          <button class="mp-btn" id="mp-hide-btn" onclick="MP.toggleHidden()">🙈 Hide buddy</button>
          <button class="mp-btn mp-btn-red" onclick="MP.leave()">🚪 Leave room</button>
        </div>
        <button class="mp-btn mp-btn-ghost" onclick="MP.close()">Close</button>`;
      applyHidden();
      drawQR(link);
      return;
    }
    const p = profile || { name: '', emoji: EMOJIS[0] };
    const pre = normCode(params.get('room') || '');
    box.innerHTML = `
      <label class="mp-label">Your name</label>
      <input id="mp-name" class="mp-input" maxlength="16" placeholder="e.g. Nugget King" value="${esc(p.name)}" autocomplete="off">
      <label class="mp-label">Your face</label>
      <div class="mp-emojis">${EMOJIS.map(e => `<button class="mp-emoji${e === p.emoji ? ' sel' : ''}" data-e="${e}" onclick="MP.pickEmoji(this)">${e}</button>`).join('')}</div>
      <button class="mp-btn mp-btn-big" onclick="MP.create()">✨ Make a room</button>
      <div class="mp-or">or join your buddy</div>
      <div class="mp-row">
        <input id="mp-code" class="mp-input mp-code-input" maxlength="4" placeholder="CODE" value="${esc(pre)}" autocomplete="off" autocapitalize="characters">
        <button class="mp-btn" onclick="MP.join()">Join</button>
      </div>
      <div id="mp-status" class="mp-status"></div>
      <button class="mp-btn mp-btn-ghost" onclick="MP.close()">Close</button>`;
    const codeInput = $('mp-code');
    codeInput.addEventListener('input', () => { codeInput.value = normCode(codeInput.value); });
    codeInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') window.MP.join(); });
  }

  let _qrLoading = null;
  async function drawQR(text) {
    const el = $('mp-qr');
    if (!el) return;
    try {
      if (!window.QRCode) _qrLoading = _qrLoading || loadScript('https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js');
      await _qrLoading;
      if (!$('mp-qr')) return;
      el.innerHTML = '';
      new window.QRCode(el, { text, width: 140, height: 140, colorDark: '#000000', colorLight: '#ffffff', correctLevel: window.QRCode.CorrectLevel.M });
    } catch (_) { el.innerHTML = `<div class="mp-dim">${esc(text)}</div>`; }
  }

  function saveProfileFromForm() {
    const name = cleanName($('mp-name') && $('mp-name').value);
    if (!name) { setStatus('Type a name first.'); $('mp-name') && $('mp-name').focus(); return false; }
    const sel = document.querySelector('.mp-emoji.sel');
    profile = { name, emoji: sel ? sel.dataset.e : EMOJIS[0] };
    lsSet(LS_PROFILE, JSON.stringify(profile));
    return true;
  }

  window.MP = {
    open() { $('mp-modal').classList.add('active'); renderModal(); },
    close() { $('mp-modal').classList.remove('active'); },
    pickEmoji(btn) { document.querySelectorAll('.mp-emoji').forEach(b => b.classList.remove('sel')); btn.classList.add('sel'); },
    async create() { if (saveProfileFromForm()) await joinRoom(randomCode()); },
    async join() {
      if (!saveProfileFromForm()) return;
      const code = normCode($('mp-code').value);
      if (code.length !== 4) { setStatus('Codes are 4 letters.'); return; }
      if (await joinRoom(code)) window.MP.close();
    },
    leave() { leaveRoom(false); window.MP.close(); },
    toggleHidden() { lsSet(LS_HIDE, lsGet(LS_HIDE) === '1' ? null : '1'); applyHidden(); },
    togglePanelOpen() { document.body.classList.toggle('mp-open'); },
    get room() { return room; },
    get buddy() { return buddy; },
    get transport() { return transport && transport.kind; },
  };

  // ---------- boot ----------
  function boot() {
    const btn = $('mp-btn');
    if (btn) btn.onclick = () => window.MP.open();
    const saved = normCode(lsGet(LS_ROOM));
    const fromUrl = normCode(params.get('room') || '');
    if (!available) return;
    if (fromUrl && fromUrl.length === 4 && fromUrl !== saved) {
      if (profile) joinRoom(fromUrl);
      else window.MP.open();
    } else if (saved.length === 4 && profile) {
      joinRoom(saved, { silent: true });
    }
  }
  // Firebase marks us offline by itself (onDisconnect); the tab channel needs a goodbye.
  window.addEventListener('pagehide', () => { if (transport && transport.kind === 'local') transport.leave(); });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
