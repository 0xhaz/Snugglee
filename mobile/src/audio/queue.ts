/**
 * CLI-05 — the per-page audio queue.
 *
 * Three rules from the docs are structural here, not incidental:
 *
 * 1. **Prefetch depth 2, never more** (D-16). Not a latency trick — a COGS
 *    control. Pages past where the child fell asleep are never fetched, never
 *    generated and never billed. The server also refuses beyond the window, so
 *    this is belt and braces on the thing that funds the free tier.
 *
 * 2. **No dead air** (design.md §2). If page n+1 is not ready when page n ends,
 *    the player must NOT stop — it holds and resumes seamlessly. A spinner in
 *    front of a four-year-old is a failure.
 *
 * 3. **Cache to disk** (design.md §4, offline replay). Audio is written to the
 *    cache directory, so replays cost nothing and work on a plane. The wedge is
 *    the absent parent, so the child is disproportionately not at home.
 */
import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio';
import { Platform } from 'react-native';
import { Directory, File, Paths } from 'expo-file-system';

import { mark } from '../metrics';

export type PageAudio = { n: number; uri: string };

export type QueueEvents = {
  onPageStart?: (n: number) => void;
  /** Fired when page n+1 is not ready and we are holding. Never a spinner. */
  onBuffering?: (n: number) => void;
  /**
   * Playback position within the current page, 0..1. Drives the player's text
   * auto-scroll so the parent never has to touch the screen mid-story.
   *
   * Page-level, not word-level: the TTS returns an mp3 with no timing marks, so
   * this is the finest sync available without a forced aligner.
   */
  onProgress?: (n: number, fraction: number) => void;
  onComplete?: () => void;
  /** Reported so abandonment can be recorded — the key business metric. */
  onAbandon?: (lastPageHeard: number) => void;
};

const PREFETCH_DEPTH = 2;

export class StoryAudioQueue {
  private fetched = new Map<number, string>();
  private inflight = new Map<number, Promise<string | null>>();
  private player: AudioPlayer | null = null;
  private current = 0;
  private stopped = false;
  /** Set by seek() so the next page is chosen explicitly rather than n+1. */
  private jumpTo: number | null = null;
  private resolveCurrent: (() => void) | null = null;

  constructor(
    private opts: {
      storyId: string;
      theme: string;
      childName: string;
      pageCount: number;
      baseUrl: string;
      token: string;
      /**
       * The parent's cloned voice, once enrolled. Absent = stock narrator.
       *
       * design.md §1: the emotional payload is the parent's voice. Once a
       * parent has enrolled, hearing the stock narrator again is a downgrade —
       * so every story after enrolment uses their voice by default.
       */
      voiceId?: string;
      events?: QueueEvents;
    },
  ) {}

  /**
   * Local cache location. Deterministic, so a replay finds the same file.
   * SDK 57 uses the File/Directory/Paths API — `cacheDirectory` is gone.
   */
  /**
   * Cache is keyed by voice AND child name, not just story.
   *
   * Voice: without it, a story cached in the stock voice would be replayed
   * after enrolment instead of re-fetched in the parent's — silently serving
   * the wrong voice forever.
   *
   * Name: the child's name is spoken *inside* the audio, but the page text is
   * rendered fresh from a query parameter on every play. Keyed on story alone,
   * a renamed child gets new text saying "Princess" over cached audio saying
   * "Amir" — the two disagreeing is worse than either being stale.
   */
  private dirFor() {
    // Filesystem-safe: names are free text and go into a path segment.
    const who = this.opts.childName.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-') || 'child';
    return new Directory(
      Paths.cache,
      'stories',
      this.opts.storyId,
      this.opts.voiceId ?? 'stock',
      who,
    );
  }

  private fileFor(n: number) {
    return new File(this.dirFor(), `${String(n).padStart(2, '0')}.mp3`);
  }

  /**
   * Is this actually audio?
   *
   * `createDownloadTask` writes whatever the server returns — including a JSON
   * error body — to the .mp3 path, and `exists` is then true. Handing that to
   * `createAudioPlayer` segfaults the native decoder rather than throwing, so
   * it must be caught here.
   *
   * Checks size first (an error body is tiny; a page of narration is tens of
   * KB) then the leading bytes for an ID3 tag or MPEG frame sync.
   */
  private async looksLikeAudio(file: File): Promise<boolean> {
    try {
      if (!file.exists || (file.size ?? 0) < 1024) return false;
      const bytes = await file.bytes();
      const head = bytes.slice(0, 3);
      const isId3 = head[0] === 0x49 && head[1] === 0x44 && head[2] === 0x33; // "ID3"
      const isMpeg = head[0] === 0xff && (head[1]! & 0xe0) === 0xe0; // frame sync
      return isId3 || isMpeg;
    } catch {
      return false;
    }
  }

  /** Removes a poisoned cache entry so a retry is not served the bad file. */
  private discard(file: File) {
    try {
      if (file.exists) file.delete();
    } catch {
      /* best effort */
    }
  }

  private async download(n: number): Promise<string | null> {
    const dest = this.fileFor(n);

    if (dest.exists) {
      // Validate the cache too — a poisoned file written by an earlier failure
      // would otherwise be replayed forever.
      if (await this.looksLikeAudio(dest)) return dest.uri;
      this.discard(dest);
    }

    const dir = this.dirFor();
    if (!dir.exists) dir.create({ intermediates: true });

    if (n === 1) mark('audio_requested');

    const url =
      `${this.opts.baseUrl}/story/${this.opts.storyId}/page/${n}/audio` +
      `?theme=${encodeURIComponent(this.opts.theme)}` +
      `&childName=${encodeURIComponent(this.opts.childName)}` +
      (this.opts.voiceId ? `&voiceId=${encodeURIComponent(this.opts.voiceId)}` : '');

    try {
      const task = File.createDownloadTask(url, dest, {
        headers: { authorization: `Bearer ${this.opts.token}` },
      });
      const out = await task.downloadAsync();
      if (!out || !(await this.looksLikeAudio(out))) {
        this.discard(dest);
        return null;
      }
      if (n === 1) mark('audio_downloaded');
      return out.uri;
    } catch {
      // Swallowed on purpose: a failed prefetch must never surface as an error.
      // The buffering hold covers it, and the narrative-safe ending covers the
      // case where it never recovers.
      return null;
    }
  }

  /**
   * Tears the current player down so it is actually SILENT, not merely freed.
   *
   * `remove()` is documented as "remove the player from memory to free up
   * resources" — it says nothing about halting playback, and on iOS with
   * `shouldPlayInBackground` the audio session outlives the release long
   * enough to be heard. seek() has always paused first; stop() did not, which
   * is why closing a story kept narrating.
   */
  private teardownPlayer() {
    const p = this.player;
    this.player = null;
    if (!p) return;
    try {
      p.pause();
      p.remove();
    } catch {
      /* already gone */
    }
  }

  /** Fetches page n if not already present or in flight. Deduped. */
  private ensure(n: number): Promise<string | null> {
    if (n > this.opts.pageCount) return Promise.resolve(null);
    const have = this.fetched.get(n);
    if (have) return Promise.resolve(have);

    const running = this.inflight.get(n);
    if (running) return running;

    const p = this.download(n).then((uri) => {
      this.inflight.delete(n);
      if (uri) this.fetched.set(n, uri);
      return uri;
    });
    this.inflight.set(n, p);
    return p;
  }

  /** Keeps exactly `PREFETCH_DEPTH` pages ahead in flight. Never more. */
  private topUp(from: number) {
    for (let i = 1; i <= PREFETCH_DEPTH; i++) void this.ensure(from + i);
  }

  async start() {
    /**
     * `stopped` is deliberately NOT reset here. A queue is single-use — one per
     * player mount — and clearing the flag would resurrect a queue that stop()
     * had already torn down, which is the whole class of bug fixed below.
     */
    if (this.stopped) return;

    /**
     * ⚠️ ANDROID-SPECIFIC. Without `shouldPlayInBackground`, Android stops
     * playback roughly three minutes after the screen locks — which for a
     * 12-page story means it dies partway through, every time, on the exact
     * use case §8 calls first-class: phone face-down, dark room, voice only.
     *
     * iOS handles this from the UIBackgroundModes entitlement alone, so the
     * bug is invisible on the platform most likely to be tested first.
     */
    try {
      await setAudioModeAsync({
        playsInSilentMode: true,
        shouldPlayInBackground: true,
        interruptionMode: 'duckOthers',
        ...(Platform.OS === 'android' ? { shouldRouteThroughEarpiece: false } : {}),
      });
    } catch {
      // Non-fatal: playback still works foregrounded.
    }

    await this.playPage(1);
  }

  private async playPage(n: number): Promise<void> {
    /**
     * A torn-down queue is silent, and silently so. Firing onComplete here
     * would tell the player the story ENDED when in fact the parent closed it —
     * which triggers the narrative-safe ending and the voice hook on a screen
     * that is already being unmounted.
     */
    if (this.stopped) return;

    if (n > this.opts.pageCount) {
      this.opts.events?.onComplete?.();
      return;
    }

    let uri = this.fetched.get(n) ?? null;

    if (!uri) {
      // Not ready. Hold rather than stop — rule 2.
      this.opts.events?.onBuffering?.(n);
      uri = await this.ensure(n);
      /**
       * stop() may have run while that download was in flight. Without this
       * check the teardown is silently undone a few lines below: a fresh
       * AudioPlayer is created and played over whatever the next screen has
       * already started, so closing a story leaves it narrating and opening a
       * second story plays both at once.
       */
      if (this.stopped) return;
    }

    if (!uri) {
      // Still nothing. Do not surface an error to a parent at bedtime; end the
      // story gracefully. The narrative-safe ending is the player's job.
      this.opts.events?.onComplete?.();
      return;
    }

    this.current = n;
    this.opts.events?.onPageStart?.(n);
    this.topUp(n);

    this.teardownPlayer();
    try {
      this.player = createAudioPlayer({ uri });
    } catch {
      // Defence in depth: even validated audio can fail to decode. Skip the
      // page rather than taking the process down at bedtime.
      this.discard(this.fileFor(n));
      await this.playPage(n + 1);
      return;
    }

    await new Promise<void>((resolve) => {
      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        this.resolveCurrent = null;
        resolve();
      };
      // seek() and stop() also settle this, so a jump does not wait out the page.
      this.resolveCurrent = finish;

      const sub = this.player?.addListener('playbackStatusUpdate', (status) => {
        // `duration` is 0 until the decoder has read the header.
        if (status.duration > 0 && !status.didJustFinish) {
          this.opts.events?.onProgress?.(n, Math.min(status.currentTime / status.duration, 1));
        }
        if (status.didJustFinish) {
          sub?.remove();
          finish();
        }
      });
      this.player?.play();
      if (n === 1) mark('first_audio');
    });

    // stop() settles the promise above by design, so re-check before recursing.
    if (this.stopped) return;

    const next = this.jumpTo ?? n + 1;
    this.jumpTo = null;
    await this.playPage(next);
  }

  /**
   * Parent controls. Deliberately minimal — the story is audio-driven and the
   * child is not meant to operate it (design.md §10).
   */
  pause() {
    this.player?.pause();
  }

  resume() {
    this.player?.play();
  }

  /**
   * Jump to a page. Resolves the current wait by stopping playback, which the
   * didJustFinish listener treats as the page ending.
   */
  seek(n: number) {
    if (n < 1 || n > this.opts.pageCount) return;
    this.jumpTo = n;
    this.teardownPlayer();
    this.resolveCurrent?.();
  }

  /**
   * Call when the player is torn down — records how far the child got.
   *
   * Idempotent: React can run an effect cleanup more than once (StrictMode, a
   * fast unmount/remount), and onAbandon posting twice would double-count the
   * one metric the business actually runs on.
   */
  stop() {
    if (this.stopped) return;
    this.stopped = true;
    this.resolveCurrent?.();
    this.teardownPlayer();
    if (this.current > 0) this.opts.events?.onAbandon?.(this.current);
  }
}
