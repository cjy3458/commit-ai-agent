import { GoogleGenerativeAI } from '@google/generative-ai';

// 사용할 모델 우선순위
const MODEL_PRIORITY = [
  'gemini-2.5-flash',
  'gemini-2.0-flash',
  'gemini-2.0-flash-lite',
];

let genAI = null;

function getClient(apiKey) {
  if (!genAI) {
    genAI = new GoogleGenerativeAI(apiKey);
  }
  return genAI;
}

/**
 * 429 Too Many Requests 시 지수 백오프로 재시도합니다.
 */
async function generateWithRetry(apiKey, prompt, maxRetries = 2) {
  const client = getClient(apiKey);

  for (const modelName of MODEL_PRIORITY) {
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const model = client.getGenerativeModel({ model: modelName });
        const result = await model.generateContent(prompt);
        return result.response.text();
      } catch (err) {
        const is429 = err.message?.includes('429') || err.message?.includes('quota');
        const isLastModel = modelName === MODEL_PRIORITY[MODEL_PRIORITY.length - 1];
        const isLastAttempt = attempt === maxRetries;

        if (is429 && !isLastAttempt) {
          // 재시도 대기 (429 응답의 retryDelay 참고)
          const waitSec = Math.pow(2, attempt + 1) * 5; // 10s, 20s
          console.log(`[${modelName}] 429 할당량 초과, ${waitSec}초 후 재시도...`);
          await new Promise(r => setTimeout(r, waitSec * 1000));
          continue;
        }

        if (is429 && isLastAttempt && !isLastModel) {
          // 다음 모델로 전환
          console.log(`[${modelName}] 할당량 소진, 다음 모델로 전환...`);
          break;
        }

        throw err; // 429가 아닌 오류는 즉시 throw
      }
    }
  }

  throw new Error('모든 모델의 할당량이 초과되었습니다. 잠시 후 다시 시도해 주세요.\n\n💡 해결 방법:\n- Google AI Studio에서 새 API 키를 발급받거나\n- https://ai.google.dev 에서 유료 플랜으로 업그레이드하세요.');
}

/**
 * 커밋 정보를 Gemini AI로 분석하여 문서화 + 코드 리뷰를 생성합니다.
 */
export async function analyzeCommit(commit, projectName, apiKey) {
  const prompt = `
당신은 시니어 소프트웨어 엔지니어입니다. 아래 git 커밋 정보를 분석하여 **반드시 한국어로** 상세한 문서와 코드 리뷰를 작성하세요.

## 프로젝트 정보
- 프로젝트명: ${projectName}
- 커밋 해시: ${commit.shortHash}
- 커밋 메시지: ${commit.message}
- 작성자: ${commit.author} (${commit.email})
- 날짜: ${commit.date}

## 변경 파일 요약 (diff --stat)
\`\`\`
${commit.diffStat}
\`\`\`

## 코드 변경 내용 (diff)
\`\`\`diff
${commit.diffContent}
\`\`\`

---

위 커밋을 분석하여 아래 형식으로 **정확히** 작성하세요. 각 섹션은 "##"로 시작합니다.

## 의도
이 커밋이 작성된 목적과 배경을 설명합니다. (왜 이 변경이 필요했는가?)

## 근거
이 구현 방식이나 접근법을 선택한 이유와 기술적 배경을 설명합니다.

## 작성한 코드
변경된 주요 코드를 파일별로 정리하고, 핵심 코드 블록을 인용하여 설명합니다.

## 코드 기능
각 코드가 실제로 어떤 동작을 수행하는지 사용자 관점에서 기능을 설명합니다.

## 코드 리뷰: 예외 처리
현재 코드에서 예외 처리가 부족하거나 개선이 필요한 부분을 구체적으로 지적하고, 개선된 코드 예시를 제시합니다.

## 코드 리뷰: 성능 개선
현재 코드에서 성능 관점에서 개선 가능한 부분을 구체적으로 지적하고, 개선 방향을 제안합니다.

## 코드 리뷰: 코드 품질 개선
가독성, 유지보수성, 네이밍, 구조 등 코드 품질 측면에서 개선할 수 있는 부분을 제안합니다.

모든 내용은 **한국어**로 작성하고, 코드 예시는 적절한 Markdown 코드 블록으로 감싸주세요.
`;

  return generateWithRetry(apiKey, prompt);
}

/**
 * 현재 git status (작업 중인 변경사항)를 Gemini AI로 분석합니다.
 */
export async function analyzeWorkingStatus(status, projectName, apiKey) {
  const prompt = `
당신은 시니어 소프트웨어 엔지니어입니다. 아래는 현재 작업 중인 \`git status\` 변경사항입니다. **반드시 한국어로** 상세한 분석과 코드 리뷰를 작성하세요.

## 프로젝트 정보
- 프로젝트명: ${projectName}
- 분석 모드: 현재 작업 중인 변경사항 (미커밋)
- 변경된 파일 수: ${status.totalFiles}개
  - Staged: ${status.stagedCount}개
  - Modified (unstaged): ${status.modifiedCount}개
  - Deleted: ${status.deletedCount}개
  - Untracked (신규): ${status.untrackedCount}개

## git status
\`\`\`
${status.statusText}
\`\`\`

## 코드 변경 내용
\`\`\`diff
${status.diffContent}
\`\`\`

---

위 변경사항을 분석하여 아래 형식으로 **정확히** 작성하세요. 각 섹션은 "##"로 시작합니다.

## 의도
현재 작업 중인 내용이 무엇인지, 어떤 기능/버그픽스/리팩토링으로 보이는지 설명합니다.

## 근거
이 구현 방식이나 접근법을 선택한 이유와 기술적 배경을 추론하여 설명합니다.

## 작성한 코드
변경된 주요 코드를 파일별로 정리하고, 핵심 코드 블록을 인용하여 설명합니다.

## 코드 기능
각 코드가 실제로 어떤 동작을 수행하는지 사용자 관점에서 기능을 설명합니다.

## 코드 리뷰: 예외 처리
현재 코드에서 예외 처리가 부족하거나 개선이 필요한 부분을 구체적으로 지적하고, 개선된 코드 예시를 제시합니다.

## 코드 리뷰: 성능 개선
현재 코드에서 성능 관점에서 개선 가능한 부분을 구체적으로 지적하고, 개선 방향을 제안합니다.

## 코드 리뷰: 코드 품질 개선
가독성, 유지보수성, 네이밍, 구조 등 코드 품질 측면에서 개선할 수 있는 부분을 제안합니다.

## 커밋 메시지 제안
현재 변경사항을 바탕으로 적절한 커밋 메시지를 Conventional Commits 형식으로 3가지 제안합니다.
예시: \`feat: 사용자 로그인 기능 추가\`, \`fix: 입력값 검증 로직 수정\`

모든 내용은 **한국어**로 작성하고, 코드 예시는 적절한 Markdown 코드 블록으로 감싸주세요.
`;

  return generateWithRetry(apiKey, prompt);
}

