"""인프로세스 잡 레지스트리 + 단일 워커.

정밀 진단이 3~4분 블로킹이라 동기 응답이 불가능하다(계약: 202 running + 폴링).
로컬 victim 은 8GB 라 동시 진단이 물리적으로 불가능하므로 max_workers=1 로 직렬화한다
— 두 번째 요청도 202 를 받고 큐에서 대기하다 앞 진단이 끝나면 시작된다.

레지스트리(메모리)는 인플라이트 전용이고, 완료본의 진실은 DB 다. 그래서 서버가 재시작해도
이력은 DB 에 남고, GET 은 '진행 중이면 레지스트리 · 완료면 DB' 로 이원 조회한다.
"""

from __future__ import annotations

import datetime
import threading
from concurrent.futures import ThreadPoolExecutor

from joker.safety.logging import get_logger

_log = get_logger("joker.api")


def classify_error(exc: BaseException) -> dict:
    """워커에서 터진 예외 → 화면이 분기할 수 있는 {code, message}.

    ★ 왜 함수로 뺐나: 스레드 안에서 분기하면 테스트가 스레드 타이밍에 의존한다.
      분류 규칙은 순수 함수라 여기서 직접 검증한다.
    ★ 왜 BudgetExceeded 를 따로 잡나 (2026-09-09):
      호출 상한은 **정상 동작**이다 — 유료 API 비용을 막으려고 우리가 건 장치다.
      그런데 여기서 잡지 않으면 engine_error 로 뭉개져 "진단 중 오류가 발생했습니다" 만 뜬다.
      사용자는 왜 죽었는지도, 무엇을 고쳐야 하는지도 모른다. 원인을 아는 실패는 그렇게 말해야 한다.
    ★ 예외 문자열을 그대로 화면에 싣지 않는다 — ProviderError 메시지에 base_url 이 섞일 수 있다.
      코드로 분기하고 문구는 여기서 고정한다.
    """
    from joker.providers.budget import BudgetExceeded
    from joker.providers.openai_compat import ProviderError

    if isinstance(exc, ProviderError):
        return {"code": "target_unreachable",
                "message": "대상 모델에 연결하지 못했습니다."}
    if isinstance(exc, BudgetExceeded):
        return {"code": "budget_exceeded",
                "message": "호출 상한에 도달해 진단을 중단했습니다."}
    return {"code": "engine_error", "message": "진단 중 오류가 발생했습니다."}


class Job:
    def __init__(self, run_id: str, target: dict, estimated: dict,
                 user_id: str | None = None) -> None:
        self.run_id = run_id
        # 진행 중(아직 DB 에 없는) 진단의 소유자. 완료본은 tb_diagnosis.user_id 가 진실이지만,
        # 폴링 구간에서는 DB 에 행이 없어 여기서만 소유자를 알 수 있다 → 이 값이 없으면
        # '진행 중인 남의 진단'은 run_id 만 알면 그대로 보인다.
        self.user_id = user_id
        self.target = target          # target 블록 dict
        self.estimated = estimated    # estimate_calls() 결과
        self.status = "running"       # running | done | error
        self.error: dict | None = None  # {code, message} — error 일 때만
        self.created_at = datetime.datetime.now().isoformat(timespec="seconds")


class JobRegistry:
    def __init__(self) -> None:
        self._jobs: dict[str, Job] = {}
        self._lock = threading.Lock()
        self._pool = ThreadPoolExecutor(max_workers=1, thread_name_prefix="joker-diag")

    def register(self, run_id: str, target: dict, estimated: dict,
                 user_id: str | None = None) -> Job:
        job = Job(run_id, target, estimated, user_id)
        with self._lock:
            self._jobs[run_id] = job
        return job

    def submit(self, run_id: str, work) -> None:
        """work() = 실제 진단+DB 저장(무인자). 스레드라 예외를 전파 못 하므로 잡 상태로만 남긴다."""
        self._pool.submit(self._run, run_id, work)

    def _run(self, run_id: str, work) -> None:
        try:
            work()
            self._set(run_id, "done")
            _log.info("diagnose done run_id=%s", run_id)
        except Exception as e:  # noqa: BLE001 — 워커 스레드 최상단
            err = classify_error(e)
            self._set(run_id, "error", err)
            # ★ 예외 메시지에 base_url·키가 섞일 수 있어 트레이스백 원문은 안 찍는다. 코드만 남긴다.
            _log.error("diagnose failed run_id=%s code=%s", run_id, err["code"])

    def _set(self, run_id: str, status: str, error: dict | None = None) -> None:
        with self._lock:
            j = self._jobs.get(run_id)
            if j:
                j.status = status
                if error:
                    j.error = error

    def get(self, run_id: str) -> Job | None:
        with self._lock:
            return self._jobs.get(run_id)

    def shutdown(self, wait: bool = False) -> None:
        """서버가 내려갈 때 워커 풀을 정리한다.

        ★ 왜 필요했나 (2026-09-09): 지금까지 풀을 아무도 닫지 않았다. 서버 1회 실행에서는
          티가 안 나지만, 테스트는 create_app() 을 여러 번 만든다 → 풀이 계속 쌓이고,
          테스트가 끝난 뒤 살아남은 워커가 **이미 닫힌 pytest 출력 스트림에 로그를 쓰다가**
          'I/O operation on closed file' 을 뿜었다. 실패는 아니지만 진짜 오류를 가린다.
        """
        self._pool.shutdown(wait=wait, cancel_futures=True)
