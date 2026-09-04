"use client";

import { useState } from "react";
import { Check, Code2, Copy, GitBranch, Network, Save, Settings2, Target } from "lucide-react";
import type { WorkspaceView } from "@/application/workbench";
import { CHANNEL_LABELS } from "@/domain/model";
import { timestamp } from "./format";
import type { SessionSelection } from "./use-workspace-session";

export function OnboardingPanel({
  workspace,
  busy,
  onPrepareSession,
}: {
  workspace: WorkspaceView;
  busy: boolean;
  onPrepareSession: (selection: SessionSelection) => void;
}) {
  const [brandName, setBrandName] = useState("");
  const profile = workspace.profile;
  const savedMappingCount =
    Object.keys(profile.mappings.orders).length + Object.keys(profile.mappings.settlements).length;

  return (
    <div className="onboarding-layout">
      <section className="card onboarding-hero">
        <div className="onboarding-hero-copy">
          <span className="eyebrow">ACTIVE PROFILE · v{profile.version}</span>
          <h2>{profile.brandName} 온보딩 설정</h2>
          <p>
            고객 진단에서 확인한 채널, 열 연결, 수수료와 검토 규칙을 하나의 버전 스냅샷으로
            고정합니다. 이 설정은 현재 작업공간과 마감 패키지에 함께 보관됩니다.
          </p>
          <div className="profile-tags" aria-label="현재 프로필 요약">
            <span>{profile.industry}</span>
            <span>프로필 v{profile.version}</span>
            <span>{profile.policy.enabledChannels.length}개 채널</span>
            <span>열 연결 {savedMappingCount}개</span>
          </div>
        </div>
        <dl className="profile-policy-summary">
          <div>
            <dt>마감 기간</dt>
            <dd>{profile.period}</dd>
          </div>
          <div>
            <dt>계산 기준일</dt>
            <dd>{profile.asOf}</dd>
          </div>
          <div>
            <dt>수수료 기준</dt>
            <dd>{profile.policy.feeBasis}</dd>
          </div>
          <div>
            <dt>마지막 열 연결 저장</dt>
            <dd>
              {profile.mappings.updatedAt ? timestamp(profile.mappings.updatedAt) : "기본 템플릿"}
            </dd>
          </div>
        </dl>
      </section>

      <section className="onboarding-section" aria-labelledby="profile-library-title">
        <div className="section-heading onboarding-section-heading">
          <div>
            <span className="eyebrow">REUSABLE ONBOARDING ASSET</span>
            <h2 id="profile-library-title">브랜드 설정 라이브러리</h2>
            <p>
              두 가상 브랜드를 바꿔 실행하며 같은 코어 규칙이 다른 운영 조건을 받는 과정을 확인할 수
              있습니다.
            </p>
          </div>
        </div>
        <div className="profile-library">
          {workspace.availableProfiles.map((template) => {
            const active = template.templateId === profile.templateId;
            return (
              <article
                className={`card profile-template ${active ? "is-active" : ""}`}
                key={template.templateId}
              >
                <div className="profile-template-heading">
                  <span className="profile-monogram">{template.monogram}</span>
                  <div>
                    <span>{template.industry}</span>
                    <h3>{template.brandName}</h3>
                  </div>
                  {active && (
                    <span className="status-badge matched">
                      <Check size={13} /> 현재 사용 중
                    </span>
                  )}
                </div>
                <div className="profile-channel-list">
                  {template.policy.enabledChannels.map((channel) => (
                    <span key={channel}>
                      {CHANNEL_LABELS[channel]} <b>{template.policy.feeBps[channel] / 100}%</b>
                    </span>
                  ))}
                </div>
                <p>{template.diagnosis[0].finding}</p>
                <dl>
                  <div>
                    <dt>검토 규칙</dt>
                    <dd>{template.policy.reviewRules.length}개</dd>
                  </div>
                  <div>
                    <dt>저장된 열 연결</dt>
                    <dd>
                      {Object.keys(template.mappings.orders).length +
                        Object.keys(template.mappings.settlements).length}
                      개
                    </dd>
                  </div>
                </dl>
                <button
                  className="button secondary full-width"
                  disabled={busy || active}
                  onClick={() =>
                    onPrepareSession({
                      templateId: template.templateId as SessionSelection["templateId"],
                    })
                  }
                >
                  <Settings2 size={15} />
                  {active ? "현재 작업공간의 설정" : "이 설정으로 새 데모"}
                </button>
              </article>
            );
          })}
        </div>
        <div className="card profile-clone-card">
          <div>
            <Copy size={19} />
            <div>
              <h3>현재 설정을 새 브랜드로 복제</h3>
              <p>
                {profile.brandName}의 채널·요율·열 연결·검토 규칙을 복사한 독립 작업공간을 만듭니다.
              </p>
            </div>
          </div>
          <label>
            <span className="sr-only">새 가상 브랜드 이름</span>
            <input
              value={brandName}
              maxLength={40}
              placeholder="새 가상 브랜드 이름"
              onChange={(event) => setBrandName(event.target.value)}
            />
          </label>
          <button
            className="button primary"
            disabled={busy || brandName.trim().length < 2}
            onClick={() =>
              onPrepareSession({
                templateId: profile.templateId as SessionSelection["templateId"],
                brandName: brandName.trim(),
              })
            }
          >
            <Copy size={15} /> 설정 복제
          </button>
        </div>
      </section>

      <section className="card diagnosis-card" aria-labelledby="diagnosis-title">
        <div className="card-heading">
          <div>
            <span className="eyebrow">FIELD INSIGHT TO PRODUCT ROADMAP</span>
            <h2 id="diagnosis-title">현장 진단에서 공통 기능까지</h2>
            <p>
              아래 내용은 실제 인터뷰 결과가 아닌, 가상 고객 온보딩을 위한 문제 정의 예시입니다.
            </p>
          </div>
          <GitBranch size={20} className="icon-muted" />
        </div>
        <ol className="diagnosis-flow">
          {profile.diagnosis.map((item, index) => (
            <li key={item.hypothesis}>
              <span>{index + 1}</span>
              <div>
                <strong>문제 가설</strong>
                <p>{item.hypothesis}</p>
              </div>
              <div>
                <strong>확인 질문</strong>
                <p>{item.discoveryQuestion}</p>
              </div>
              <div>
                <strong>설정에 반영</strong>
                <p>{item.finding}</p>
              </div>
            </li>
          ))}
        </ol>
        <div className="capability-roadmap">
          <div>
            <h3>
              <Save size={17} /> 재사용 가능한 제품 자산
            </h3>
            <ul>
              {profile.reusableCapabilities.map((capability) => (
                <li key={capability}>
                  <Check size={13} /> {capability}
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h3>
              <Target size={17} /> 지표와 로드맵
            </h3>
            <ol>
              {profile.roadmap.map((item) => (
                <li key={item.horizon}>
                  <span>{item.horizon}</span>
                  <div>
                    <strong>{item.capability}</strong>
                    <small>관찰 지표 · {item.metric}</small>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </section>

      <section className="card kotlin-boundary-card">
        <div>
          <span className="kotlin-icon">
            <Code2 size={21} />
          </span>
          <div>
            <span className="eyebrow">KOTLIN DOMAIN SERVICE</span>
            <h2>대사 코어를 독립 REST 계약으로 검증</h2>
            <p>
              Kotlin/JVM 서비스의 <code>POST /reconcile</code>이 주문·정산·프로필 요율을 받아 분류와
              금액을 반환합니다. 같은 유스케이스가 마감 패키지 재검증에도 사용됩니다.
            </p>
          </div>
        </div>
        <div className="runtime-boundaries">
          <span>
            <Network size={15} /> 로컬·CI: Kotlin REST 실행
          </span>
          <span>공개 Vercel 데모: TypeScript 인프로세스 어댑터</span>
        </div>
        <p className="runtime-note">
          공개 데모가 JVM을 실행하는 것으로 오해되지 않도록 런타임 경계를 구분해 표시합니다.
        </p>
      </section>
    </div>
  );
}
