import fs from "fs";
import path from "path";

export function resolveDevRoot() {
  const devRoot = path.resolve(process.cwd());
  let stat;
  try {
    stat = fs.statSync(devRoot);
  } catch {
    throw new Error(`경로를 찾을 수 없습니다: ${devRoot}`);
  }
  if (!stat.isDirectory()) {
    throw new Error(`경로가 디렉토리가 아닙니다: ${devRoot}`);
  }
  return devRoot;
}
