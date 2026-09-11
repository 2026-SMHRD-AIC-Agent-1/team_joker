import { defineConfig } from "vitest/config";
import { loadEnv } from "vite";
import react from "@vitejs/plugin-react";

// 개발: /api 는 FastAPI(:8000)로 넘긴다 — 같은 출처로 부르므로 서버에 CORS 를 열 필요가 없다.
// 시연: `npm run build` 결과(dist/)를 FastAPI 가 그대로 내준다(서버 하나 · 포트 하나).
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, "..", "JOKER_");
  return {
    plugins: [react()],
    server: {
      port: 5173,
      proxy: { "/api": env.JOKER_API_URL || "http://127.0.0.1:8000" },
      // ../data/evidence/headline_metrics.json 을 빌드 때 가져온다(수치의 단일 출처 유지).
      fs: { allow: [".."] },
    },
    build: { outDir: "dist", sourcemap: false },
    test: { environment: "jsdom", include: ["src/**/*.test.{ts,tsx}"] },
  };
});
