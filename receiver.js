/* ───────────────────────────────────────────────────────────────────────────
   Weird Good Radio — custom CAF receiver
   ---------------------------------------------------------------------------
   This is the ONE thing a custom receiver gives us over the Styled Media
   Receiver: our own JS runs on the device. The sender pushes fresh now-playing
   info over a custom message channel every time the live stream rolls to a new
   track, and we update the on-screen card via setMediaInformation — which
   refreshes the metadata WITHOUT re-loading the stream, so there's no audible
   rebuffer gap. (On the styled/default receiver the only way to change the card
   is loadMedia, which restarts the stream — which is why we left it static.)

   The visible UI is still the stock <cast-media-player> CAF element, themed by
   receiver.css exactly as before.
   ─────────────────────────────────────────────────────────────────────────── */

// Custom channel the sender talks to. Must match CAST_NAMESPACE in the app's
// src/services/cast.ts. Custom namespaces must be of the form urn:x-cast:<id>.
const NAMESPACE = 'urn:x-cast:design.today.wgr';

// Cream "unwinding monkey" card, shown whenever a track has no real album art.
// Hosted alongside this file so the receiver is self-sufficient — it falls back
// here even if a metadata push arrives with an empty image.
const FALLBACK_IMAGE = 'https://adam-today.github.io/wgr-cast/no-artwork.png';

const context = cast.framework.CastReceiverContext.getInstance();
const playerManager = context.getPlayerManager();

/**
 * Replace the displayed now-playing metadata on the current media without
 * touching the audio stream. Expects { title, artist, album, image }.
 */
function applyMetadata(data) {
  const info = playerManager.getMediaInformation();
  if (!info) return; // nothing loaded yet — ignore

  const md = new cast.framework.messages.MusicTrackMediaMetadata();
  md.title = data.title || '';
  if (data.artist) md.artist = data.artist;
  if (data.album) md.albumName = data.album;
  md.images = [new cast.framework.messages.Image(data.image || FALLBACK_IMAGE)];

  info.metadata = md;
  // broadcast=true keeps connected senders' status in sync. This updates only
  // the metadata on the existing media session — the stream keeps playing.
  playerManager.setMediaInformation(info, true);
}

context.addCustomMessageListener(NAMESPACE, (event) => {
  try {
    applyMetadata(event.data || {});
  } catch (e) {
    // Malformed payload — keep whatever is currently shown.
  }
});

const options = new cast.framework.CastReceiverOptions();
// Declare our channel so senders can reach it; JSON payloads are parsed for us.
options.customNamespaces = {
  [NAMESPACE]: cast.framework.system.MessageType.JSON,
};
// Live radio has no fixed end; don't let the receiver idle-timeout mid-stream
// just because the sender app went to the background.
options.disableIdleTimeout = true;

context.start(options);
