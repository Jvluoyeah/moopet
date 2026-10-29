#!/usr/bin/env python3
"""信封协议用例：序列化 / 校验 / 过期 / 目标过滤 / 版本协商。"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from moopet_link import (ENVELOPE_VERSION, Envelope, EnvelopeError,  # noqa: E402
                         KIND_STATE)
from moopet_link.envelope import new_msg_id  # noqa: E402


def test_round_trip_bytes():
    env = Envelope(kind=KIND_STATE, payload={'level': 7, '火花': '燃烧中'},
                   src='dog', dst='backpack', seq=3, ts=12.5, ttl=30.0)
    back = Envelope.from_bytes(env.to_bytes())
    assert back == env
    assert back.payload['火花'] == '燃烧中'          # 中文不被转义破坏


def test_round_trip_dict():
    env = Envelope(kind='state', payload={'a': 1}, src='dog', seq=1, ts=1.0)
    assert Envelope.from_dict(env.to_dict()) == env


def test_missing_field_rejected():
    d = Envelope(kind='state', src='dog', seq=1, ts=1.0).to_dict()
    del d['kind']
    try:
        Envelope.from_dict(d)
        raise AssertionError('缺字段应当报错')
    except EnvelopeError as e:
        assert 'kind' in str(e)


def test_version_mismatch_rejected():
    d = Envelope(kind='state', src='dog', seq=1, ts=1.0).to_dict()
    d['ver'] = ENVELOPE_VERSION + 9
    try:
        Envelope.from_dict(d)
        raise AssertionError('版本不符应当报错')
    except EnvelopeError as e:
        assert '版本' in str(e)


def test_payload_must_be_object():
    d = Envelope(kind='state', src='dog', seq=1, ts=1.0).to_dict()
    d['payload'] = [1, 2, 3]
    try:
        Envelope.from_dict(d)
        raise AssertionError('payload 非对象应当报错')
    except EnvelopeError:
        pass


def test_negative_numbers_rejected():
    for field, bad in (('seq', -1), ('ts', -1.0), ('ttl', -0.5)):
        d = Envelope(kind='state', src='dog', seq=1, ts=1.0).to_dict()
        d[field] = bad
        try:
            Envelope.from_dict(d)
            raise AssertionError(f'{field} 为负应当报错')
        except EnvelopeError:
            pass


def test_empty_src_rejected():
    d = Envelope(kind='state', src='dog', seq=1, ts=1.0).to_dict()
    d['src'] = ''
    try:
        Envelope.from_dict(d)
        raise AssertionError('空 src 应当报错')
    except EnvelopeError:
        pass


def test_bad_json_rejected():
    try:
        Envelope.from_bytes(b'{ not json')
        raise AssertionError('坏 JSON 应当报错')
    except EnvelopeError:
        pass


def test_ttl_expiry():
    env = Envelope(kind='state', src='dog', seq=1, ts=100.0, ttl=10.0)
    assert not env.is_expired(105.0)
    assert env.is_expired(111.0)
    forever = Envelope(kind='state', src='dog', seq=1, ts=100.0, ttl=0.0)
    assert not forever.is_expired(10_000.0)          # ttl=0 表示不过期


def test_dst_filter():
    env = Envelope(kind='state', src='dog', dst='backpack', seq=1, ts=1.0)
    assert env.is_for('backpack')
    assert not env.is_for('dog')
    bcast = Envelope(kind='state', src='dog', dst='*', seq=1, ts=1.0)
    assert bcast.is_for('anyone')


def test_stamped_keeps_msg_id():
    env = Envelope(kind='state', src='dog', seq=1, ts=1.0)
    out = env.stamped(seq=9, ts=5.0)
    assert out.msg_id == env.msg_id          # 补发必须复用 id，否则去重失效
    assert out.seq == 9 and out.ts == 5.0


def test_msg_id_unique_and_prefixed():
    ids = {new_msg_id('dog') for _ in range(200)}
    assert len(ids) == 200
    assert all(i.startswith('dog-') for i in ids)


def test_msg_id_factory_injectable():
    env = Envelope(kind='state', src='dog', seq=1, ts=1.0,
                   msg_id=new_msg_id('dog', factory=lambda: 'fixed-1'))
    assert env.msg_id == 'fixed-1'
