export const FADE_DURATION = 0.4;

export function getCharacterOpacity(progress, duration, fadeIn, fadeOut) {
  const time = progress * duration;

  if (fadeIn !== "none" && time < FADE_DURATION) {
    return time / FADE_DURATION;
  }

  if (fadeOut !== "none" && time > duration - FADE_DURATION) {
    return Math.max(0, (duration - time) / FADE_DURATION);
  }

  return 1;
}

export function getTypedDialogue(dialogue, progress, duration, textEffect) {
  if (!dialogue) return "";
  if (textEffect === "none") return dialogue;

  const start = FADE_DURATION;
  const end = duration - FADE_DURATION;
  const typingDuration = Math.max(end - start, 0.5);
  const time = progress * duration;

  if (time < start) return "";
  if (time >= end) return dialogue;

  const typingProgress = (time - start) / typingDuration;
  const visibleChars = Math.floor(dialogue.length * typingProgress);
  return dialogue.slice(0, visibleChars);
}
