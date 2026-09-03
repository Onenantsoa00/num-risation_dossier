/**
 * Son de notification via Web Audio API.
 * Gère la restriction AudioContext (doit être créé après une interaction utilisateur).
 * File d'attente : les sons reçus avant le déblocage sont joués après.
 */

let audioCtx = null;
let audioUnlocked = false;
let pendingSounds = 0;
let _gestureHandler = null;

/**
 * Initialiser le contexte audio (à appeler après une interaction utilisateur).
 * Configure un listener global pour débloquer dès le premier geste.
 */
export function initAudio() {
  if (audioUnlocked) return;

  // Créer le contexte audio
  try {
    if (!audioCtx) {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (audioCtx.state === "suspended") {
      audioCtx.resume().then(() => {
        audioUnlocked = true;
        console.log("[Audio] AudioContext débloqué (resume réussi)");
        _playPending();
      }).catch(() => {});
    } else {
      audioUnlocked = true;
      console.log("[Audio] AudioContext débloqué (state:", audioCtx.state, ")");
      _playPending();
    }
  } catch (e) {
    console.warn("[Audio] Impossible de créer AudioContext:", e.message);
  }
}

/**
 * Enregistrer un listener global pour débloquer l'audio
 * au premier geste utilisateur (click, keydown, touch).
 */
export function setupAudioUnlock() {
  if (_gestureHandler) return; // Déjà configuré

  _gestureHandler = () => {
    initAudio();
    // Retirer les listeners une fois débloqué
    if (audioUnlocked) {
      document.removeEventListener("click", _gestureHandler, true);
      document.removeEventListener("keydown", _gestureHandler, true);
      document.removeEventListener("touchstart", _gestureHandler, true);
      _gestureHandler = null;
    }
  };

  document.addEventListener("click", _gestureHandler, { capture: true, once: false });
  document.addEventListener("keydown", _gestureHandler, { capture: true, once: false });
  document.addEventListener("touchstart", _gestureHandler, { capture: true, once: false });

  console.log("[Audio] Listeners de déblocage configurés (click/keydown/touchstart)");
}

/**
 * Joue le son de notification.
 * Si l'audio n'est pas débloqué, met en file d'attente.
 */
export function playNotificationSound() {
  if (!audioUnlocked || !audioCtx) {
    pendingSounds++;
    console.log(`[Audio] Notification reçue avant déblocage (${pendingSounds} en attente)`);
    return;
  }

  try {
    if (audioCtx.state === "suspended") {
      audioCtx.resume().then(() => playBeep()).catch(() => {});
    } else {
      playBeep();
    }
  } catch (e) {
    console.warn("[Audio] Erreur lecture son:", e.message);
  }
}

/**
 * Jouer les sons en attente
 */
function _playPending() {
  if (pendingSounds > 0) {
    console.log(`[Audio] Lecture de ${pendingSounds} notification(s) en attente`);
    for (let i = 0; i < pendingSounds; i++) {
      setTimeout(() => playBeep(), i * 500);
    }
    pendingSounds = 0;
  }
}

/**
 * Joue un double beep court et agréable.
 */
function playBeep() {
  if (!audioCtx) return;
  try {
    const now = audioCtx.currentTime;

    // Premier beep (880Hz, 0.15s)
    const osc1 = audioCtx.createOscillator();
    const gain1 = audioCtx.createGain();
    osc1.type = "sine";
    osc1.frequency.setValueAtTime(880, now);
    gain1.gain.setValueAtTime(0.4, now);
    gain1.gain.exponentialRampToValueAtTime(0.01, now + 0.15);
    osc1.connect(gain1);
    gain1.connect(audioCtx.destination);
    osc1.start(now);
    osc1.stop(now + 0.15);

    // Deuxième beep (1100Hz, 0.2s après)
    const osc2 = audioCtx.createOscillator();
    const gain2 = audioCtx.createGain();
    osc2.type = "sine";
    osc2.frequency.setValueAtTime(1100, now + 0.18);
    gain2.gain.setValueAtTime(0, now);
    gain2.gain.setValueAtTime(0.4, now + 0.18);
    gain2.gain.exponentialRampToValueAtTime(0.01, now + 0.38);
    osc2.connect(gain2);
    gain2.connect(audioCtx.destination);
    osc2.start(now + 0.18);
    osc2.stop(now + 0.38);

    console.log("[Audio] Beep joué ✓");
  } catch (e) {
    console.warn("[Audio] Erreur beep:", e.message);
  }
}
