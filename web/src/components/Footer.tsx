import { Link } from "react-router-dom";
export function Footer() {
  return <footer className="foot"><div><b>Chat Shield</b><br />챗봇의 정보 유출을 검사하고, 수정안을 제안합니다.</div>
    <div><Link to="/">서비스 소개</Link> · <Link to="/detect">입력문 검사</Link><br />© 2026 Team JOKER · 탐지 모델 JOKER-KO</div></footer>;
}
