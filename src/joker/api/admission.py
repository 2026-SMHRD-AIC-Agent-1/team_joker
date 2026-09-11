"""진단 시도 예산. 성공 결과를 삭제하거나 서버를 재시작해도 초기화되지 않는다."""
import time
from joker.store.sqlite import connect


def consume(db_path: str, subject: str, limit: int = 10) -> bool:
    con = connect(db_path)
    try:
        con.execute("CREATE TABLE IF NOT EXISTS tb_diagnosis_budget (subject TEXT NOT NULL, at REAL NOT NULL)")
        con.execute("BEGIN IMMEDIATE")
        now = time.time()
        con.execute("DELETE FROM tb_diagnosis_budget WHERE at < ?", (now - 86400,))
        used = con.execute("SELECT COUNT(*) FROM tb_diagnosis_budget WHERE subject = ?", (subject,)).fetchone()[0]
        if used >= limit:
            con.rollback()
            return False
        con.execute("INSERT INTO tb_diagnosis_budget VALUES (?, ?)", (subject, now))
        con.commit()
        return True
    finally:
        con.close()
