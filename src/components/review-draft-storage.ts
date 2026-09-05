import { z } from "zod";

const schema = z.object({
  note: z.string().max(600),
  evidence: z.string().max(200),
  fingerprint: z.string().regex(/^[a-f0-9]{64}$/),
  expiresAt: z.number().finite(),
});
export type LocalReviewDraft = z.infer<typeof schema>;
export const reviewDraftKey = (scope: string, rowKey: string) =>
  `closepilot:draft:${scope}:${rowKey}`;
export function readReviewDraft(storage: Storage, key: string, now = Date.now()) {
  const raw = storage.getItem(key);
  if (!raw) return null;
  try {
    const value = schema.parse(JSON.parse(raw));
    if (value.expiresAt > now) return value;
  } catch {
    /* Invalid local state is never applied to review inputs. */
  }
  storage.removeItem(key);
  return null;
}
export function saveReviewDraft(
  storage: Storage,
  key: string,
  value: LocalReviewDraft,
  now = Date.now(),
) {
  const parsed = schema.parse(value);
  if (parsed.expiresAt <= now) throw new Error("데모 세션의 임시 저장 기간이 지났습니다.");
  // Remove expired drafts without touching other application storage.
  for (let index = storage.length - 1; index >= 0; index--) {
    const entry = storage.key(index);
    if (entry?.startsWith("closepilot:draft:")) readReviewDraft(storage, entry, now);
  }
  storage.setItem(key, JSON.stringify(parsed));
}
