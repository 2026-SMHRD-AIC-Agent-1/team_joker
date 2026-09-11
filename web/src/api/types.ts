// API 응답 타입 — contracts/api_contract.md v0.7 을 옮긴 것.
// ★ 여기 없는 필드를 화면이 쓰면 타입 검사(tsc)가 빌드를 멈춘다. 화면이 응답에 없는 값을
//   '지어내는' 실수를 컴파일 단계에서 막으려는 목적이다. 계약이 바뀌면 이 파일부터 고친다.

export type Fidelity = "proxy_model" | "real_model";
export type Verdict = "leak" | "block" | "gray" | string;
export type FindingState = "unresolved" | "regressed" | "unjudged" | "resolved" | "unaffected" | "no_retry";

export interface ApiErrorBody {
  error: { code?: string; message?: string; run_id?: string };
}

export interface Health {
  status: string;
  profile: string;            // "mock" 이면 화면이 가짜 응답 경고를 띄운다
  langgraph?: boolean;
  corpus_loaded?: number;
  default_preset?: string;
  detector_ready?: boolean;
}

export interface Preset {
  id: string;
  label: string;
  backend: string;
  requires_key: boolean;
  verified: boolean;
  fidelity: Fidelity;
  note?: string;
}
export interface CallEstimate { victim_min: number; victim_max: number; preflight: number; configured_limit: number; note: string }
export interface Models { default: string; presets: Preset[]; estimates?: Record<"screening" | "full", CallEstimate> }

export interface GuestSession {
  guest_id: string;
  token: string;
  issued: boolean;
  free_runs: { limit: number; used: number; remaining: number; running: number };
  limit_note: string;
  running_run_id: string | null;
}

export interface User { user_id: string; email: string }
export interface LoginResponse { token: string; expires_at: string; user: User }

// GET /api/runs 한 행
export interface RunRow {
  run_id: string;
  created_at: string;
  status?: string;
  grade: string | null;
  inconclusive?: number | boolean;
  asr_before: number | null;
  asr_after: number | null;
  asr_delta?: number | null;
  comparable?: number | boolean | null;
  persona?: string | null;
  target_model?: string | null;
  fidelity?: Fidelity;
  backend?: string;           // "mock" 행은 집계에서 뺀다
  unresolved?: number;
  regressed?: number;
  unjudged?: number;
  resolved?: number;
  unaffected?: number;
  no_retry?: number;
  findings_total?: number;
  action_required?: number;   // 미해결 + 보강 후 신규 — 화면은 이 값을 쓴다(v0.7)
}
export interface RunList { runs: RunRow[] }

export interface Target {
  model: string;
  backend: string;
  preset?: string;
  temperature?: number;
  seed?: number;
  fidelity: Fidelity;
  scope_notice: string;       // 항상 온다 — 항상 표시한다
  model_notice?: string | null;
}

export interface Attempt {
  attack_id: string;
  technique: string;
  technique_ko: string;
  goal: string;
  round_no: 1 | 2;
  verdict: Verdict;
  verdict_by: "rule" | "llm" | string;
  leak_channel: string | null;
  rendered_text?: string;
  response_excerpt?: string;
  evidence_excerpt?: string;
  hit_assets?: string[];
  verdict_reason?: string;
}

export interface RepresentativeFinding {
  attack_id: string;
  state: FindingState;
  title: string;
  technique_ko: string;
  rendered_text?: string;
  before?: Attempt | null;
  after?: Attempt | null;
  locked?: boolean;
}

export interface FindingsSummary {
  unresolved: number; regressed: number; unjudged?: number;
  resolved: number; unaffected: number; no_retry: number; total: number;
}

export interface FilterRecommendation {
  residual: number;
  rule_blockable: number;
  flags: Record<string, number>;
  note: string;
  basis: string;
}

export interface TechniqueRow { technique: string; technique_ko: string; before: number | null; after: number | null; total: number }

export interface Report {
  grade: string | null;
  grade_basis?: string;
  unjudged?: number;
  inconclusive?: boolean;
  reason?: string;
  comparable: boolean;
  asr_before: number | null;
  asr_after: number | null;
  asr_delta: number | null;
  by_technique: TechniqueRow[];
  applied_patterns: string[];
  findings_summary: FindingsSummary;
  action_required: number;
  filter_recommendation?: FilterRecommendation;
  patched_prompt: string;
  original_prompt?: string | null;     // 회원 전용
  attempts: Attempt[];                  // 비회원은 []
  representative_findings?: RepresentativeFinding[];
  leaks_before?: number;
  leaks_after?: number;
}

export interface Gated {
  is_gated: boolean;
  patched_prompt_total_lines?: number;
  patched_prompt_hidden_lines?: number;
  attempts_total?: number;
  attempts_hidden?: number;
  representative_locked?: number;
  unlock?: string;
}

export interface ProgressStage { key: string; label: string }
export interface Progress {
  stage?: string;
  stage_index?: number;
  stages?: ProgressStage[];
  stage_done?: number;
  stage_total?: number;
  calls_done?: number;
  queued?: boolean;
}

export interface Run {
  run_id: string;
  created_at?: string;
  status: "running" | "done" | "inconclusive" | "error" | string;
  target: Target;
  recon?: { persona?: string; org?: string; assets?: { name: string; kind: string; confidence?: number }[] };
  privacy_notice?: string;
  report?: Report;
  gated?: Gated;
  progress?: Progress;
  estimated_calls?: number;
  error?: { code?: string; message?: string };
}

export interface DetectResult {
  label: string;
  score: number;
  is_injection: boolean;
  threshold: number;
  model: string;
  rule_flags: Record<string, number> | string[];
}
