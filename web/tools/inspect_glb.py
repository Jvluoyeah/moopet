#!/usr/bin/env python3
"""看一眼 Kenney GLB 里到底有什么（网格名 / 材质 / 颜色 / 透明设置）。

GLB 结构：12 字节头 + 若干 chunk，第一个 chunk 是 JSON。
"""
import json
import os
import struct
import sys

BASE = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                    'public', 'models', 'nature')


def read_glb_json(path):
    with open(path, 'rb') as fh:
        data = fh.read()
    magic, ver, total = struct.unpack('<III', data[:12])
    assert magic == 0x46546C67, f'不是 GLB：{path}'
    off = 12
    while off < len(data):
        clen, ctype = struct.unpack('<II', data[off:off + 8])
        chunk = data[off + 8:off + 8 + clen]
        if ctype == 0x4E4F534A:          # 'JSON'
            return json.loads(chunk.decode('utf-8'))
        off += 8 + clen + ((4 - clen % 4) % 4 if clen % 4 else 0)
    raise RuntimeError('没找到 JSON chunk')


def describe(name):
    path = os.path.join(BASE, name)
    if not os.path.exists(path):
        return f'  ✗ {name} 不存在'
    g = read_glb_json(path)
    meshes = [m.get('name', '?') for m in g.get('meshes', [])]
    mats = []
    for m in g.get('materials', []):
        pbr = m.get('pbrMetallicRoughness', {})
        col = pbr.get('baseColorFactor')
        mats.append({
            'name': m.get('name', '?'),
            'color': [round(c, 3) for c in col] if col else None,
            'alphaMode': m.get('alphaMode', 'OPAQUE'),
            'unlit': 'KHR_materials_unlit' in (m.get('extensions') or {}),
            'doubleSided': m.get('doubleSided', False),
        })
    prim_counts = [len(m.get('primitives', [])) for m in g.get('meshes', [])]
    return (f'  {name}\n'
            f'    网格: {meshes}\n'
            f'    材质: {json.dumps(mats, ensure_ascii=False)}\n'
            f'    图元数: {prim_counts}  节点: {len(g.get("nodes", []))}')


if __name__ == '__main__':
    names = sys.argv[1:] or ['tree_default.glb', 'tree_oak.glb', 'tree_pineDefaultA.glb',
                             'plant_bush.glb', 'grass.glb']
    for n in names:
        print(describe(n))
