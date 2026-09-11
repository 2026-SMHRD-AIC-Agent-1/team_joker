// ★ mock 은 가짜 응답이라 수치가 의미 없다. 조용히 두면 발표에서 가짜를 진짜로 읽는다.
import { useHealth } from "../hooks/useHealth";

export function MockBanner() {
  const h = useHealth();
  if (!h || h.profile !== "mock") return null;
  return (
    <div className="alert alert-error" role="status">
      ⚠️ <b>mock 프로파일로 실행 중입니다.</b> 응답이 가짜라 이 화면의 등급·공격 성공률은 실제 측정값이 아닙니다. 인용하지 마세요.
    </div>
  );
}
