/**
 * VOX-01/02/03 — voice enrolment, deletion and misuse controls.
 *
 * The pipeline (techstacks.md §5):
 *
 *   15s capture (device)
 *      -> explicit consent gate, logged and timestamped
 *      -> upload over TLS
 *      -> vendor clone API
 *      -> store voice_id
 *      -> DISCARD raw audio
 *
 * **The raw sample is never persisted** (D-07). Storing only `voice_id`
 * sidesteps most of the GDPR Art. 9 / BIPA / CUBI biometric surface. The cost
 * is that a lost clone means re-recording 15 seconds, which is acceptable.
 *
 * The sample arrives in memory, goes straight to the vendor, and the buffer is
 * dropped when the request ends. It is never written to disk, never logged, and
 * never put in Firestore.
 */
import { FieldValue, getFirestore } from 'firebase-admin/firestore';

import { voiceProvider } from './providers/voice.ts';

export type ParentRole = 'mother' | 'father' | 'grandmother' | 'grandfather' | 'other';

/** Rate limit on clone creation (VOX-03). Cheap defence against abuse. */
const MAX_CLONES_PER_DAY = 5;

type VoiceRecord = {
  voiceId: string;
  vendor: string;
  role: ParentRole;
  lang: string;
  createdAt: FirebaseFirestore.FieldValue;
  /** Consent is logged, timestamped and revocable (techstacks.md §9). */
  consent: {
    grantedAt: FirebaseFirestore.FieldValue;
    /** Version of the consent copy shown, so we know what was agreed to. */
    policyVersion: string;
  };
};

const voices = () => getFirestore().collection('voices');
const clones = () => getFirestore().collection('clone_events');

async function recentCloneCount(userId: string): Promise<number> {
  const since = Date.now() - 24 * 60 * 60 * 1000;
  const snap = await clones()
    .where('userId', '==', userId)
    .where('at', '>=', since)
    .get();
  return snap.size;
}

/**
 * Clones the parent's voice and stores ONLY the resulting id.
 *
 * @param sample raw audio — used once, never persisted
 */
export async function enrol(opts: {
  userId: string;
  sample: Buffer;
  role: ParentRole;
  lang: string;
  policyVersion: string;
}): Promise<{ voiceId: string }> {
  if ((await recentCloneCount(opts.userId)) >= MAX_CLONES_PER_DAY) {
    throw new Error('clone rate limit reached');
  }

  const { voiceId, vendor } = await voiceProvider.clone(opts.sample, opts.lang);

  const record: VoiceRecord = {
    voiceId,
    vendor,
    role: opts.role,
    lang: opts.lang,
    createdAt: FieldValue.serverTimestamp(),
    consent: {
      grantedAt: FieldValue.serverTimestamp(),
      policyVersion: opts.policyVersion,
    },
  };

  await voices().doc(opts.userId).set(record);
  await clones().add({ userId: opts.userId, at: Date.now() });

  // `opts.sample` goes out of scope here and is never written anywhere.
  return { voiceId };
}

export async function getVoice(userId: string): Promise<VoiceRecord | null> {
  const snap = await voices().doc(userId).get();
  return snap.exists ? (snap.data() as VoiceRecord) : null;
}

/**
 * Deletion. **Propagates to the vendor and is confirmed before the local
 * record clears** (techstacks.md §5) — clearing ours first would leave an
 * orphaned clone at the vendor with no way to find it again, which is the
 * failure mode a privacy request cannot have.
 */
export async function deleteVoice(userId: string): Promise<void> {
  const record = await getVoice(userId);
  if (!record) return;

  await voiceProvider.deleteVoice(record.voiceId); // throws => we keep our record
  await voices().doc(userId).delete();
}
