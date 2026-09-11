// ★ 임시 화면(React 전환 중). 아직 옮기지 않은 화면에 가짜 내용을 채우지 않고 사실대로 말한다.
//   전환이 끝나면 이 파일과 이 경로는 지운다(tests/test_web_guard.py 가 마지막 단계에서 확인).
export function NotPorted({ name }: { name: string }) {
  return (
    <div className="notice" role="status">
      <b>{name}</b> 화면은 아직 React 로 옮기는 중입니다. 지금은 Streamlit 화면
      (<code>streamlit run ui/streamlit_app.py</code>)에서 사용하세요.
    </div>
  );
}
