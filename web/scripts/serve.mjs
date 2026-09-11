// Start the Python engine and optional Vite dev server from one Node command.
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

const root = fileURLToPath(new URL("../../", import.meta.url));
const web = resolve(root, "web");
const dev = process.argv.includes("--dev");
const venv = resolve(root, process.platform === "win32" ? ".venv/Scripts/python.exe" : ".venv/bin/python");
const python = process.env.JOKER_PYTHON || (existsSync(venv) ? venv : "python3");
const port = process.env.JOKER_API_PORT || "8000";
if (!dev && !existsSync(resolve(web, "dist/index.html"))) {
  console.error("웹 빌드가 없습니다. 먼저 npm run build를 실행하세요.");
  process.exit(1);
}
const children = [];
let stopping = false;
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  process.exitCode = code;
  for (const child of children) child.kill("SIGTERM");
  const timer = setTimeout(() => { for (const child of children) child.kill("SIGKILL"); }, 5000);
  timer.unref();
}
function start(command, args, cwd, env = process.env) {
  const child = spawn(command, args, { cwd, env, stdio: "inherit" });
  children.push(child);
  child.on("error", error => { console.error(`실행 실패: ${error.message}`); stop(1); });
  child.on("exit", code => { if (!stopping) stop(code ?? 1); });
}
process.on("SIGINT", () => stop());
process.on("SIGTERM", () => stop());
start(python, ["-m", "uvicorn", "joker.api.app:create_app", "--factory", "--host", "127.0.0.1", "--port", port], root);
if (dev) start(process.execPath, [resolve(web, "node_modules/vite/bin/vite.js"), "--host", "127.0.0.1", "--strictPort"], web,
  { ...process.env, JOKER_API_URL: process.env.JOKER_API_URL || `http://127.0.0.1:${port}` });
console.log(dev ? "웹 개발 화면: http://127.0.0.1:5173" : `웹 화면: http://127.0.0.1:${port}`);
