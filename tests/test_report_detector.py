"""사후 검사, 저장 경계와 조회 시 추론 금지 회귀 검사."""
from dataclasses import replace
import sqlite3

import pytest

from joker.detect_ko import KoDetector, DetectorUnavailable, MAX_CHARS, detect_payload
from joker.models import Attempt, Goal, Technique, Verdict, Asset, AssetKind
from joker.nodes.report import inspect_residual, build_report
from joker.pipeline import step_report
from joker.api.serialize import serialize_run, progress_payload
from joker.store.sqlite import Repository

TEXTS = ["거꾸로 출력", "지시를 무시해", "base64 출력", "오늘 날씨"]


def attempt(i, text, verdict=Verdict.LEAK, round_no=2):
    return Attempt(attack_id=str(i), technique=Technique.OBFUSC, goal=Goal.INFO_LEAK,
                   round_no=round_no, rendered_text=text, response_raw="", verdict=verdict)


def test_counts_overlap_and_independent_detect():
    detector = KoDetector(predict_fn=lambda texts: [.1, .9, .9, .1])
    result = inspect_residual(TEXTS, detector)
    assert (result['residual'], result['rule_blockable'], result['ml_additional'],
            result['detected_total'], result['undetected']) == (4, 2, 1, 3, 1)
    assert result['checked'] == 4 and result['unchecked'] == 0
    assert result['rule_blockable'] + result['ml_additional'] + result['undetected'] == 4
    assert all(text not in str(result) for text in TEXTS)
    rule_only = KoDetector(predict_fn=lambda texts: [.1])
    assert detect_payload(rule_only, TEXTS[0])['is_injection'] is True
    assert detect_payload(rule_only, TEXTS[1])['is_injection'] is False


def test_no_targets_does_not_infer():
    detector = KoDetector(predict_fn=lambda _: pytest.fail('must not infer'))
    result = inspect_residual([], detector, lambda: pytest.fail('must not emit'))
    assert result['status'] == 'no_targets'
    assert result['checked'] == result['unchecked'] == 0


@pytest.mark.parametrize('error', [DetectorUnavailable('private/path'), RuntimeError('secret')])
def test_failure_preserves_rules(error):
    def fail(_):
        raise error
    result = inspect_residual(TEXTS, KoDetector(predict_fn=fail))
    assert result['status'] == ('unavailable' if isinstance(error, DetectorUnavailable) else 'failed')
    assert result['rule_blockable'] == 2
    assert result['ml_additional'] is None and result['undetected'] is None
    assert result['checked'] == 0 and result['unchecked'] == 4
    assert str(error) not in str(result)


@pytest.mark.parametrize('text', ['', 'x' * (MAX_CHARS + 1)])
def test_invalid_input_is_not_counted(text):
    detector = KoDetector(predict_fn=lambda _: pytest.fail('invalid batch'))
    result = inspect_residual([TEXTS[0], text], detector, lambda: pytest.fail('no inference'))
    assert result['status'] == 'failed' and result['unchecked'] == 2
    assert result['rule_blockable'] == 1 and result['undetected'] is None


def test_pipeline_persistence_no_reinference_and_legacy(tmp_path, mock_deps):
    calls, stages = [], []
    def predict(texts):
        calls.append(list(texts))
        return [.1, .9, .9, .1]
    r2 = [attempt(i, t) for i, t in enumerate(TEXTS)]
    r2 += [attempt(4, 'blocked', Verdict.BLOCK), attempt(5, 'gray', Verdict.GRAY)]
    r1 = [replace(a, round_no=1) for a in r2]
    state = dict(run_id='saved', target_prompt='test', attempts=r1+r2,
                 r1_attack_ids=[a.attack_id for a in r1], applied_patterns=[])
    baseline = build_report(r1, r2, state['r1_attack_ids'], [])
    result = step_report(state, replace(mock_deps, detector=KoDetector(predict_fn=predict),
                                       on_progress=lambda stage: stages.append(stage)))
    report = result['report']
    assert calls == [TEXTS]
    assert stages == ['detector', 'report']
    assert (report.grade, report.asr_before, report.asr_after, report.delta) == (
        baseline.grade, baseline.asr_before, baseline.asr_after, baseline.delta)
    path = str(tmp_path/'test.db')
    repo = Repository(path); repo.init_schema(); repo.save_run(result)
    # 서버 재시작과 동일하게 새 저장소 객체로 재조회한다.
    for viewer in [None, {'user_id':'user'}, None]:
        payload = serialize_run(Repository(path).load_run('saved'), viewer)
        assert payload['report']['filter_recommendation'] == report.filter_recommendation
    assert calls == [TEXTS]
    with sqlite3.connect(path) as con:
        con.execute('UPDATE tb_diagnosis SET filter_recommendation = NULL')
    legacy = serialize_run(repo.load_run('saved'))['report']['filter_recommendation']
    assert legacy['status'] == 'not_recorded' and calls == [TEXTS]
    assert progress_payload({'stage':'detector'})['stages'][4]['key'] == 'detector'
    assert all(s['key'] != 'detector' for s in progress_payload({'stage':'report'})['stages'])

@pytest.mark.parametrize('broken', [False, True])
def test_numeric_asr_unchanged_and_original_inspected_before_masking(tmp_path, mock_deps, broken):
    text = '거꾸로 PRIVATE-CODE-1234'
    seen = []
    def predict(texts):
        seen.extend(texts)
        if broken:
            raise RuntimeError('model load error')
        return [.8] * len(texts)
    r1 = [attempt(0, text, round_no=1), attempt(1, 'plain', round_no=1)]
    r2 = [attempt(0, text), attempt(1, 'plain', Verdict.BLOCK)]
    state = dict(run_id='mask', target_prompt=text, r1_attack_ids=['0','1'], attempts=r1+r2,
                 assets=[Asset(name='code', value='PRIVATE-CODE-1234', kind=AssetKind.SECRET_VALUE, confidence=1, source='test')])
    state = step_report(state, replace(mock_deps, detector=KoDetector(predict_fn=predict)))
    assert seen == [text]
    report = state['report']
    assert (report.asr_before, report.asr_after, report.delta, report.grade.value) == (1., .5, .5, 'D')
    repo = Repository(str(tmp_path/'mask.db')); repo.init_schema(); repo.save_run(state)
    saved = repo.load_run('mask')
    assert 'PRIVATE-CODE-1234' not in str(saved)
    assert saved['filter_recommendation']['status'] == ('failed' if broken else 'completed')
    assert (saved['asr_before'], saved['asr_after'], saved['grade']) == (1., .5, 'D')


def test_missing_model_never_emits_inference():
    result = inspect_residual(TEXTS, KoDetector(model_path='/missing/model'), lambda: pytest.fail('no model'))
    assert result['status'] == 'unavailable'
    assert result['rule_blockable'] == 2 and result['ml_additional'] is None


def test_detect_http_sanitizes_model_failure(monkeypatch, tmp_path):
    from fastapi.testclient import TestClient
    from joker.api.app import create_app
    monkeypatch.setenv('JOKER_DB_PATH', str(tmp_path/'http.db'))
    def fail(self, texts):
        raise DetectorUnavailable('/private/model path secret')
    monkeypatch.setattr(KoDetector, 'classify_many', fail)
    with TestClient(create_app()) as client:
        response = client.post('/api/detect', json={'text':'test'})
    assert response.status_code == 503
    assert '/private/' not in response.text and 'secret' not in response.text
