/* ───────────────────────────────────────────────────────────────────────────
   Weird Good Radio — custom CAF receiver
   ---------------------------------------------------------------------------
   Fully custom now-playing UI (see index.html / receiver.css): art on the left,
   logo top-left, track + artist lockup on the right, station icon + name
   bottom-left, LIVE bottom-right. We DON'T use the stock <cast-media-player>
   chrome — that element stays in the DOM only so CAF has a media element to
   play through; our overlay renders the visible card.

   We populate the card from two sources, both funnelled through render():
     1. The player itself (initial loadMedia + any player-driven change), via
        PlayerDataBinder.
     2. The sender's live now-playing pushes over our custom message channel
        (urn:x-cast:design.today.wgr) as tracks change — no stream reload, so
        no audible rebuffer.
   ─────────────────────────────────────────────────────────────────────────── */

const NAMESPACE = 'urn:x-cast:design.today.wgr';
// Cream "unwinding monkey" card — shown whenever a track has no real album art.
const FALLBACK_IMAGE = 'https://adam-today.github.io/wgr-cast/no-artwork.png';

const els = {
  art: document.getElementById('art'),
  title: document.getElementById('title'),
  artist: document.getElementById('artist'),
  station: document.getElementById('station'),
  stationIcon: document.getElementById('stationIcon'),
  clock: document.getElementById('clock'),
};

let currentArt = '';
let currentIcon = '';

/** Paint the card. data: { title, artist, station, stationIcon, image }.
    Only fields actually present on `data` are updated, so a player-driven
    refresh (no stationIcon) never wipes the station identity a push set. */
function render(data) {
  if (!data) return;
  if (typeof data.title === 'string') els.title.textContent = data.title || 'Weird Good Radio';
  if (typeof data.artist === 'string') els.artist.textContent = data.artist || '';
  if (typeof data.station === 'string') els.station.textContent = data.station || '';

  if (typeof data.stationIcon === 'string' && data.stationIcon !== currentIcon) {
    currentIcon = data.stationIcon;
    if (data.stationIcon) els.stationIcon.setAttribute('src', data.stationIcon);
    else els.stationIcon.removeAttribute('src');
  }

  if (typeof data.image === 'string' || data.image == null) {
    const img = data.image || FALLBACK_IMAGE;
    if (img !== currentArt) {
      currentArt = img;
      els.art.style.backgroundImage = `url("${img}")`;
    }
  }
}

/** Normalize the player's current MediaInformation into render()'s shape.
    (No stationIcon here — that only arrives via the custom message channel.) */
function fromPlayer(playerData) {
  const md = (playerData && playerData.metadata) || {};
  const image = md.images && md.images[0] && md.images[0].url;
  return {
    title: md.title || (playerData && playerData.title) || '',
    artist: md.artist || md.subtitle || '',
    station: md.albumName || '',
    image: image || FALLBACK_IMAGE,
  };
}

// ── Wall clock (matches the CAF top-right convention) ───────────────────────
function tickClock() {
  const d = new Date();
  let h = d.getHours();
  const m = String(d.getMinutes()).padStart(2, '0');
  const ampm = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  els.clock.textContent = `${h}:${m} ${ampm}`;
}
tickClock();
setInterval(tickClock, 15000);

// ── CAF wiring ──────────────────────────────────────────────────────────────
const context = cast.framework.CastReceiverContext.getInstance();
const playerManager = context.getPlayerManager();

// Bind to player state so the card populates on load and on any player change.
const playerData = new cast.framework.ui.PlayerData();
const binder = new cast.framework.ui.PlayerDataBinder(playerData);
binder.addEventListener(cast.framework.ui.PlayerDataEventType.ANY_CHANGE, () => {
  render(fromPlayer(playerData));
});

// Live now-playing pushes from the sender → instant card refresh. We also fold
// them into the player's MediaInformation so the binder + connected senders
// stay consistent; this updates metadata only and never reloads the stream.
context.addCustomMessageListener(NAMESPACE, (event) => {
  const data = event.data || {};
  try {
    render(data);
    const info = playerManager.getMediaInformation();
    if (info) {
      const md = new cast.framework.messages.MusicTrackMediaMetadata();
      md.title = data.title || '';
      if (data.artist) md.artist = data.artist;
      if (data.station) md.albumName = data.station;
      md.images = [new cast.framework.messages.Image(data.image || FALLBACK_IMAGE)];
      info.metadata = md;
      playerManager.setMediaInformation(info, true);
    }
  } catch (e) {
    // Malformed payload — keep whatever is currently shown.
  }
});

const options = new cast.framework.CastReceiverOptions();
options.customNamespaces = { [NAMESPACE]: cast.framework.system.MessageType.JSON };
// Live radio has no fixed end; don't idle-timeout mid-stream.
options.disableIdleTimeout = true;

context.start(options);
