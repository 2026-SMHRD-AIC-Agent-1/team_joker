// 원본 지시문 → 보강안 줄 단위 변경.
// ★ 색만으로 추가/삭제를 말하지 않는다. 기호(＋ − =)와 범례를 같이 준다 — 흑백 인쇄·프로젝터 대비에서
//   색은 제일 먼저 사라지는 정보다. (Streamlit 은 difflib 을 썼다. 여기서는 LCS 로 같은 결과를 만든다.)

export interface DiffRow { mk: "＋" | "−" | "="; cls: "add" | "del" | "same"; text: string }

export function diffLines(before: string, after: string): DiffRow[] {
  const a = (before ?? "").split(/\r?\n/);
  const b = (after ?? "").split(/\r?\n/);
  const n = a.length;
  const m = b.length;
  // lcs[i][j] = a[i..] 와 b[j..] 의 최장 공통 부분열 길이
  const lcs: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      lcs[i][j] = a[i] === b[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
    }
  }
  const out: DiffRow[] = [];
  let dels: DiffRow[] = [];
  let adds: DiffRow[] = [];
  // 한 변경 덩어리 안에서는 difflib 처럼 '빠진 줄' 을 먼저, '추가된 줄' 을 뒤에 둔다.
  const flush = () => { out.push(...dels, ...adds); dels = []; adds = []; };
  let i = 0;
  let j = 0;
  while (i < n || j < m) {
    if (i < n && j < m && a[i] === b[j]) {
      flush();
      out.push({ mk: "=", cls: "same", text: a[i] });
      i++; j++;
    } else if (j >= m || (i < n && lcs[i + 1][j] >= lcs[i][j + 1])) {
      dels.push({ mk: "−", cls: "del", text: a[i] });
      i++;
    } else {
      adds.push({ mk: "＋", cls: "add", text: b[j] });
      j++;
    }
  }
  flush();
  // 그대로 유지된 빈 줄은 뺀다(보강안은 문단 사이가 비어 있어 비교가 늘어진다).
  return out.filter((r) => r.text.trim() || r.cls !== "same");
}
