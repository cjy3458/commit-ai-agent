import fs from 'fs';
import path from 'path';

const QUEUE_DIR_NAME = '.commit-ai-queue';

/**
 * 서버가 꺼진 상태에서 post-commit 이벤트가 발생했을 때
 * 분석 작업을 큐 파일로 저장합니다.
 */
export function saveToQueue(projectPath, type = 'post-commit') {
  const queueDir = path.join(projectPath, QUEUE_DIR_NAME);
  try {
    if (!fs.existsSync(queueDir)) {
      fs.mkdirSync(queueDir, { recursive: true, mode: 0o700 });
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const filename = `${type}-${timestamp}.json`;
    const filePath = path.join(queueDir, filename);

    fs.writeFileSync(
      filePath,
      JSON.stringify({ projectPath, type, savedAt: new Date().toISOString() }),
      'utf-8'
    );

    return filePath;
  } catch {
    // Git 작업을 절대 방해하지 않음 — 실패는 조용히 무시
  }
}

/**
 * DEV_ROOT 하위 모든 프로젝트에서 pending 큐 항목을 수집합니다.
 * 서버 시작 시 한 번 호출됩니다.
 */
export function loadPendingJobs(devRoot) {
  const jobs = [];

  try {
    const entries = fs.readdirSync(devRoot, { withFileTypes: true });

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const projectPath = path.join(devRoot, entry.name);
      const queueDir = path.join(projectPath, QUEUE_DIR_NAME);
      if (!fs.existsSync(queueDir)) continue;

      const files = fs.readdirSync(queueDir).filter((f) => f.endsWith('.json'));
      for (const file of files) {
        try {
          const raw = fs.readFileSync(path.join(queueDir, file), 'utf-8');
          const data = JSON.parse(raw);
          jobs.push({ ...data, queueFile: path.join(queueDir, file) });
        } catch {
          // 손상된 큐 파일은 스킵
        }
      }
    }
  } catch {
    // DEV_ROOT 읽기 실패 — 빈 배열 반환
  }

  return jobs;
}

/**
 * 처리 완료된 큐 파일을 삭제합니다.
 */
export function deleteQueueFile(filePath) {
  try {
    fs.unlinkSync(filePath);
  } catch {
    // 이미 삭제됐거나 없으면 무시
  }
}
