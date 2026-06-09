import musicUrl from '../../../shared/music.mp3';

const MUSIC_MUTE_KEY = 'catan.musicMuted';
let audio: HTMLAudioElement | null = null;
let on = localStorage.getItem(MUSIC_MUTE_KEY) !== '1'; // on by default

export function isMusicOn(): boolean {
  return on;
}

function getAudio(): HTMLAudioElement {
  if (!audio) {
    audio = new Audio(musicUrl);
    audio.loop = true;
    audio.volume = 0.35;
  }
  return audio;
}

/** Called from unlockAudio() — begins playback if not muted. */
export function startMusic(): void {
  if (!on) return;
  void getAudio().play().catch(() => {});
}

export function setMusicOn(value: boolean): void {
  on = value;
  localStorage.setItem(MUSIC_MUTE_KEY, value ? '0' : '1');
  if (value) {
    void getAudio().play().catch(() => {});
  } else {
    getAudio().pause();
  }
}
