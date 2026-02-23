import fs from "fs";

export function resolveDevRoot() {
  const fromEnv = process.env.DEV_ROOT?.trim();
  if (fromEnv) {
    const devRoot = fromEnv;
    validateDirectory(devRoot, "DEV_ROOT");
    return { devRoot, source: "env" };
  }

  const devRoot = process.cwd();
  validateDirectory(devRoot, "cwd");
  return { devRoot, source: "cwd" };
}

function validateDirectory(targetPath, sourceLabel) {
  if (!targetPath) {
    throw new Error(`${sourceLabel} 경로가 비어 있습니다.`);
  }

  let stat;
  try {
    stat = fs.statSync(targetPath);
  } catch {
    throw new Error(`${sourceLabel} 경로를 찾을 수 없습니다: ${targetPath}`);
  }

  if (!stat.isDirectory()) {
    throw new Error(`${sourceLabel} 경로가 디렉토리가 아닙니다: ${targetPath}`);
  }
}
