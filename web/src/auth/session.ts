// 로그인 토큰·게스트 토큰 보관.
//
// ★ sessionStorage(탭 단위)에 둔다. localStorage 는 브라우저를 닫아도 남고 모든 탭이 공유해서,
//   공용 PC(학원·시연장)에서 다음 사람이 그대로 로그인 상태를 물려받는다.
// ★ 어디에 두든 자바스크립트가 읽을 수 있는 저장소는 XSS 에 노출된다. 그래서 이 화면은
//   받은 문자열을 HTML 로 해석하는 코드(dangerouslySetInnerHTML)를 쓰지 않고, 시연 서버는 CSP 를 건다.
//   tests/test_web_guard.py 가 두 가지를 강제한다.
// ★ 저장소 접근은 사생활 보호 모드 등에서 예외를 던질 수 있어 전부 try/catch 로 감싼다 —
//   저장이 안 되면 메모리에만 두고 새로고침 때 로그인이 풀릴 뿐, 화면이 죽지는 않는다.

export interface Session {
  token: string | null;
  email: string | null;
  guestToken: string | null;
  /** 이 탭에서 마지막으로 시작·연 진단. 비회원이 가입하면 이 진단을 자기 것으로 귀속(claim)한다. */
  lastRunId: string | null;
}

const KEYS = { token: "cs.token", email: "cs.email", guestToken: "cs.guest", lastRunId: "cs.run" } as const;
let memory: Session = { token: null, email: null, guestToken: null, lastRunId: null };

function read(key: string): string | null {
  try {
    return window.sessionStorage.getItem(key);
  } catch {
    return null;
  }
}
function write(key: string, value: string | null) {
  try {
    if (value === null) window.sessionStorage.removeItem(key);
    else window.sessionStorage.setItem(key, value);
  } catch {
    /* 저장 불가 — 메모리만 쓴다 */
  }
}

export function loadSession(): Session {
  memory = {
    token: read(KEYS.token) ?? memory.token,
    email: read(KEYS.email) ?? memory.email,
    guestToken: read(KEYS.guestToken) ?? memory.guestToken,
    lastRunId: read(KEYS.lastRunId) ?? memory.lastRunId,
  };
  return { ...memory };
}

export function getSession(): Session {
  return { ...memory };
}

export function setSession(patch: Partial<Session>): Session {
  memory = { ...memory, ...patch };
  (Object.keys(patch) as (keyof Session)[]).forEach((k) => write(KEYS[k], memory[k]));
  return { ...memory };
}

/**
 * 진단을 시작한 시각과 정밀도. 진행 화면의 '경과 시간 · 예상 소요' 에만 쓴다(서버 값이 아니므로
 * 계산에 섞지 않는다). 새로고침해도 경과 시간이 0 으로 돌아가지 않게 탭 저장소에 둔다.
 */
export interface RunStart { runId: string; mode: "screening" | "full"; at: number }
const START_KEY = "cs.start";
let startMemory: RunStart | null = null;

export function rememberStart(v: RunStart) {
  startMemory = v;
  write(START_KEY, JSON.stringify(v));
}

export function getStart(runId: string): RunStart | null {
  let v = startMemory;
  const raw = read(START_KEY);
  if (raw) {
    try {
      v = JSON.parse(raw) as RunStart;
    } catch {
      v = startMemory;
    }
  }
  return v && v.runId === runId ? v : null;
}

export function clearLogin(): Session {
  // 로그아웃은 로그인 토큰만 지운다. 게스트 토큰은 '무료 1회' 계산에 쓰이므로 남긴다
  // (지우면 새 방문자가 되어 체험이 다시 생긴다 — 서버가 IP 해시로도 막지만 화면이 도울 이유는 없다).
  return setSession({ token: null, email: null });
}
