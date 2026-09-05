import { z } from "zod";
import { CHANNELS, DomainError, type Workspace } from "@/domain/model";
import { digest } from "@/domain/canonical";

const bps = z.number().int().min(0).max(10000);
export const feePolicySchema = z.object({ d2c: bps, naver: bps, coupang: bps }).strict();
export function policyCandidate(
  current: Workspace,
  feeBps: z.infer<typeof feePolicySchema>,
  period: string,
) {
  if (period !== current.period)
    throw new DomainError(
      "POLICY_PERIOD_MISMATCH",
      "현재 마감 월에만 정책을 적용할 수 있습니다.",
      409,
    );
  if (!current.profile)
    throw new DomainError("POLICY_PROFILE_REQUIRED", "현재 프로필을 확인하세요.", 409);
  for (const channel of CHANNELS) {
    if (
      !current.profile.policy.enabledChannels.includes(channel) &&
      feeBps[channel] !== current.profile.policy.feeBps[channel]
    )
      throw new DomainError(
        "INACTIVE_CHANNEL_POLICY",
        "사용하지 않는 채널의 요율은 변경할 수 없습니다.",
      );
  }
  if (digest(feeBps) === digest(current.profile.policy.feeBps))
    throw new DomainError("POLICY_UNCHANGED", "현재와 같은 요율입니다.", 409);
  const candidate = structuredClone(current);
  candidate.profile!.policy.feeBps = structuredClone(feeBps);
  return candidate;
}
