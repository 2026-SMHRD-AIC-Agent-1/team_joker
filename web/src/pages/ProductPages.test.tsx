import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { DiagnosePage, DetectPage } from "./ProductPages";
import { DetectionCard } from "./Detect";
import { api } from "../api/client";
import { EXAMPLE_PROMPTS, DETECT_EXAMPLES } from "../lib/examples";

vi.mock("../auth/AuthContext", () => ({ useAuth: () => ({ loggedIn: true, guest: {}, rememberRun: vi.fn() }) }));
vi.mock("../hooks/useHealth", () => ({ useHealth: () => ({ detector_ready: true }) }));
vi.mock("../hooks/useApi", () => ({ useApi: () => ({ data: { presets: [{id:"local", label:"로컬", fidelity:"proxy_model"}] }, loading:false, error:null }) }));
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

it("지시문 입력·예시·설정·제출이 첫 구간에서 동작한다", async () => {
  const post = vi.spyOn(api, 'post').mockResolvedValue({run_id:'created'});
  const {container} = render(<MemoryRouter initialEntries={['/diagnose']}><Routes>
    <Route path="/diagnose" element={<DiagnosePage />} /><Route path="/runs/created" element={<p>결과 페이지</p>} />
  </Routes></MemoryRouter>);
  const sections = [...container.querySelectorAll('.inspection-page > section')];
  expect(sections.map(s => s.id)).toEqual(['start','techniques']);
  expect(sections[0].contains(screen.getByLabelText('챗봇에게 정해준 역할과 규칙'))).toBe(true);
  expect(container.querySelector('.quiet-hero')).toBeNull();
  expect(container.querySelector('#overview')?.closest('section')).toBe(sections[0]);
  fireEvent.click(screen.getByRole('button', {name:'지시문 검사 시작'}));
  expect(screen.getByRole('alert')).toBeTruthy();
  fireEvent.click(screen.getByText('처음이라면 예시로 시작하기'));
  fireEvent.click(screen.getByRole('button', {name:EXAMPLE_PROMPTS[0].label}));
  expect((screen.getByLabelText('챗봇에게 정해준 역할과 규칙') as HTMLTextAreaElement).value).toBe(EXAMPLE_PROMPTS[0].text);
  fireEvent.click(screen.getByText('고급 설정 — AI 모델 · 검사 범위'));
  fireEvent.change(screen.getByLabelText('진단 대상 모델'), {target:{value:'local'}});
  fireEvent.click(screen.getByRole('button', {name:'지시문 검사 시작'}));
  await screen.findByText('결과 페이지');
  expect(post).toHaveBeenCalledWith('/api/diagnose', expect.objectContaining({target_prompt:EXAMPLE_PROMPTS[0].text}));
});

it("전달 문구·예시·입력·검사 결과를 첫 구간에 유지한다", async () => {
  const post = vi.spyOn(api, 'post').mockResolvedValue({label:'SAFE',is_injection:false,score:.1,threshold:.5,model:'joker-ko',rule_flags:[]});
  const {container} = render(<MemoryRouter initialEntries={[{pathname:'/detect',state:{text:'전달된 문구',from:'residual'}}]}><DetectPage /></MemoryRouter>);
  const input = screen.getByRole('textbox') as HTMLTextAreaElement;
  expect(input.value).toBe('전달된 문구');
  expect([...container.querySelectorAll('.inspection-page > section')].map(s=>s.id)).toEqual(['start','method']);
  fireEvent.click(screen.getByRole('button',{name:DETECT_EXAMPLES[0].label}));
  expect(input.value).toBe(DETECT_EXAMPLES[0].text);
  fireEvent.change(input,{target:{value:'검사 입력'}});
  fireEvent.click(screen.getByRole('button',{name:'메시지 검사하기 →'}));
  await waitFor(() => expect(screen.getByTestId('detection')).toBeTruthy());
  expect(screen.getByTestId('detection').closest('section')?.id).toBe('start');
  expect(post).toHaveBeenCalledWith('/api/detect',{text:'검사 입력'});
  expect(screen.getByText('이번 검사에서 공격 징후를 찾지 못했습니다')).toBeTruthy();
  expect(screen.getByTestId('detection').textContent).toContain('안전을 보장하지는 않습니다');
});

it("AI 점수가 낮아도 규칙이 감지한 공격을 정상으로 설명하지 않는다", () => {
  const { container } = render(<DetectionCard d={{ label:'INJECTION', is_injection:true, score:.1, threshold:.5, model:'joker-ko', rule_flags:['역순요청'] }} />);
  expect(screen.getByText('챗봇을 속이려는 요청이 의심됩니다')).toBeTruthy();
  expect(screen.getByText('거꾸로 출력 요구')).toBeTruthy();
  expect(screen.getByText(/AI 점수는 기준보다 낮지만/)).toBeTruthy();
  expect((container.querySelector('.bar i') as HTMLElement).style.width).toBe('10%');
});
