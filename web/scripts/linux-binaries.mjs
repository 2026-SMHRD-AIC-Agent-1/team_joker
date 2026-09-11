// 맥에서 `npm install` 한 뒤 한 번 실행한다(`npm run setup:linux`).
//
// 왜 필요한가: vite·vitest 는 esbuild·rollup 의 **플랫폼별 실행 파일**을 쓴다. 맥에서 설치하면
// darwin-arm64 용만 받아지는데, 코드 검증은 리눅스(Claude 작업 환경: x64 컨테이너 · arm64 VM)에서도
// 돌린다. 그 두 환경은 npm 레지스트리에 접근할 수 없어서, 여기서 같은 버전의 리눅스용을 미리 받아 둔다.
// package.json·package-lock.json 은 바꾸지 않는다(--no-save). 나중에 `npm install` 을 다시 하면
// 이 파일들이 지워질 수 있으니 그때는 이 명령을 한 번 더 실행한다.
import { execSync } from "node:child_process";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const esbuild = require("esbuild/package.json").version;
const rollup = require("rollup/package.json").version;
const pkgs = [
  `@esbuild/linux-x64@${esbuild}`,
  `@esbuild/linux-arm64@${esbuild}`,
  `@rollup/rollup-linux-x64-gnu@${rollup}`,
  `@rollup/rollup-linux-arm64-gnu@${rollup}`,
];
console.log(`[setup:linux] esbuild ${esbuild} · rollup ${rollup}`);
// --force: 운영체제가 다른 패키지(EBADPLATFORM)를 설치하도록 허용. 실행 파일만 내려받고 맥에서는 쓰지 않는다.
execSync(`npm install --no-save --force ${pkgs.join(" ")}`, { stdio: "inherit" });
console.log("[setup:linux] 완료");
