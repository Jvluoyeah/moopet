"""Build the plaza and kennel expansion kit with bottom-center pivots and vertex colors."""

import math
import os
from pathlib import Path
import sys

import bmesh
import bpy

sys.path.insert(0, str(Path(__file__).resolve().parent))
from build_plaza_architecture import ColoredMesh, material


WOOD = '815840'
BEAM = '584538'
TRIM = 'c49460'
LIGHT = 'WindowLight'
STONE = 'a3aaa0'


def strip(mesh, a, b, width, y, depth, color):
    dx, dz = b[0] - a[0], b[1] - a[1]
    length = math.hypot(dx, dz)
    nx, nz = -dz * width / (2 * length), dx * width / (2 * length)
    mesh._band([(a[0] - nx, a[1] - nz), (a[0] + nx, a[1] + nz),
                (b[0] - nx, b[1] - nz), (b[0] + nx, b[1] + nz)], depth, color)
    for i in range(len(mesh.vertices) - 8, len(mesh.vertices)):
        x, py, z = mesh.vertices[i]
        mesh.vertices[i] = (x, py + y, z)


def rectangular_roof(mesh, levels):
    first = mesh.points([(x * rx, y * ry, z) for z, rx, ry, _ in levels
                         for x, y in ((-1, -1), (1, -1), (1, 1), (-1, 1))])
    mesh.face((first + 3, first + 2, first + 1, first), levels[0][3])
    for index, (_, _, _, color) in enumerate(levels[:-1]):
        start = first + 4 * index
        for i in range(4):
            j = (i + 1) % 4
            mesh.face((start + i, start + j, start + j + 4, start + i + 4), color)
    final = first + 4 * (len(levels) - 1)
    mesh.face(tuple(range(final, final + 4)), levels[-1][3])


def market(awning, accent):
    m = ColoredMesh()
    for x in (-0.414, 0.414):
        for y in (-0.329, 0.329):
            m.box((x, y, 0.44), (0.064, 0.062, 0.88), BEAM)
    m.box((0, 0, 0.21), (0.88, 0.68, 0.38), WOOD)
    m.box((0, 0, 0.412), (0.963, 0.76, 0.056), TRIM)
    m.box((0, -0.333, 0.226), (0.777, 0.04, 0.26), BEAM)
    for index in range(7):
        x = (index - 3) * 0.121
        m.box((x, -0.355 + 0.003 * (index % 2), 0.23), (0.073, 0.018, 0.21), WOOD)
    for i in range(8):
        x = (i - 3.5) * 0.124
        color = accent if i % 2 else awning
        # Long strips share a slope towards the aisle. Thin seams separate the cloth bands.
        m.box((x, 0, 0.894), (0.119, 0.994, 0.052), color)
        for j in range(len(m.vertices) - 8, len(m.vertices)):
            px, py, pz = m.vertices[j]
            m.vertices[j] = (px, py, pz + py * 0.16)
        m.box((x, -0.473, 0.788 - 0.012 * (i % 2)), (0.113, 0.051, 0.105), color)
    for x, z in [(-0.254, 0.492), (0.021, 0.464), (0.254, 0.475)]:
        m.box((x, 0.103, 0.44), (0.193, 0.165, 0.048), BEAM)
        for i in range(3):
            m.box((x + (i - 1) * 0.052, 0.09, z), (0.041, 0.103, 0.084),
                  [TRIM, '9b6e56', 'bca46b'][i])
    for x in (-0.414, 0.414):
        m.box((x, -0.365, 0.699), (0.102, 0.09, 0.10), 'eecb8d', LIGHT)
        m.box((x, -0.37, 0.762), (0.119, 0.103, 0.041), BEAM)
    return m


def pavilion():
    m = ColoredMesh()
    for x in (-0.385, 0.385):
        for y in (-0.373, 0.373):
            m.box((x, y, 0.045), (0.144, 0.138, 0.09), STONE)
            m.box((x, y, 0.352), (0.095, 0.091, 0.58), BEAM)
            m.box((x, y, 0.569), (0.125, 0.121, 0.07), TRIM)
        m.box((x, 0, 0.233), (0.066, 0.761, 0.045), TRIM)
        m.box((x, 0, 0.104), (0.057, 0.71, 0.035), WOOD)
        for y in (-0.25, -0.125, 0, 0.125, 0.25):
            m.box((x, y, 0.164), (0.025, 0.043, 0.129), WOOD)
    rectangular_roof(m, [(0.62, 0.497, 0.497, 'af9164'), (0.656, 0.5, 0.5, '6b797d'),
                         (0.704, 0.396, 0.38, '54727a'), (0.903, 0.173, 0.126, '46616b'),
                         (0.94, 0.087, 0.056, 'bc9860')])
    m.crescent(0.949, 0.063, 0.049, 0.036, 'e3bc72')
    for x in (-0.27, 0.27):
        m.box((x, -0.28, 0.584), (0.032, 0.035, 0.107), BEAM)
        m.box((x, -0.28, 0.521), (0.089, 0.10, 0.077), 'ffda9a', LIGHT)
    return m


def festoon():
    m = ColoredMesh()
    for x in (-0.465, 0.465):
        m.box((x, 0, 0.062), (0.07, 0.79, 0.124), STONE)
        m.box((x, 0, 0.525), (0.041, 0.42, 0.95), BEAM)
        m.box((x, 0, 0.962), (0.066, 0.59, 0.071), TRIM)
    points = [(i * 0.117, 0.78 + 0.0091 * i * i) for i in range(-4, 5)]
    for a, b in zip(points, points[1:]):
        strip(m, a, b, 0.012, 0, 0.105, BEAM)
    for i, (x, z) in enumerate(points[1:-1]):
        m.box((x, 0, z - 0.021), (0.017, 0.18, 0.052), BEAM)
        m.box((x, 0, z - 0.062), (0.046, 0.48, 0.057),
              ['ffca82', 'ffe1ab', 'fcb49d'][i % 3], LIGHT)
    return m


def wall_panel(window):
    m = ColoredMesh()
    m.box((0, 0, 0.49), (0.986, 0.81, 0.98), 'dec49d')
    m.box((0, 0.002, 0.117), (0.994, 0.93, 0.224), 'a16f4c')
    m.box((0, 0, 0.233), (1, 0.96, 0.055), TRIM)
    m.box((0, 0, 0.963), (1, 1, 0.073), 'b18865')
    if window:
        m.box((0, -0.401, 0.621), (0.61, 0.124, 0.503), BEAM)
        m.box((0, -0.466, 0.621), (0.536, 0.064, 0.424), 'ffd494', LIGHT)
        for x in (-0.122, 0.122):
            m.box((x, -0.498, 0.624), (0.022, 0.022, 0.414), WOOD)
        m.box((0, -0.5, 0.59), (0.543, 0.03, 0.041), WOOD)
    return m


def seat():
    m = ColoredMesh()
    for x in (-0.414, 0.414):
        for y in (-0.347, 0.347):
            m.box((x, y, 0.092), (0.101, 0.121, 0.184), BEAM)
    m.box((0, 0, 0.232), (0.925, 0.888, 0.194), WOOD)
    m.box((0, 0.367, 0.562), (0.943, 0.232, 0.781), '965658')
    for x, color in [(-0.19, 'be7266'), (0.19, 'c87d70')]:
        m.box((x, -0.022, 0.37), (0.375, 0.722, 0.165), color)
        m.box((x, 0.259, 0.653), (0.372, 0.141, 0.47), color)
    for x in (-0.447, 0.447):
        m.box((x, -0.015, 0.445), (0.106, 0.943, 0.308), 'a8615d')
    return m


def bookshelf():
    m = ColoredMesh()
    for x in (-0.464, 0.464):
        m.box((x, 0, 0.49), (0.063, 0.91, 0.98), WOOD)
    m.box((0, 0.374, 0.505), (0.90, 0.12, 0.92), BEAM)
    for z in (0.067, 0.478, 0.964):
        m.box((0, 0, z), (1, 0.985, 0.069), TRIM if z > 0.95 else WOOD)
    tones = ('a36b59', '69867e', 'b69665', '8d7390', 'b7a17b', '5d7985')
    for row, base in enumerate((0.096, 0.507)):
        for i in range(7):
            x = -0.371 + i * 0.117
            height = (0.29, 0.327, 0.26, 0.305)[(i + row) % 4]
            front = -0.355 + 0.024 * ((i * 3 + row) % 4)
            m.box((x, front + 0.28, base + height / 2), (0.081, 0.56, height), tones[(i + row * 2) % 6])
            m.box((x, front, base + height * 0.76), (0.064, 0.014, 0.025), 'd7bd8a')
    return m


def tunnel():
    m = ColoredMesh()
    colors = ['918568', '5c8883', '6d9f90', '69948a', '829875', '969473']
    profile = [(-0.5, 0.49), (-0.435, 0.473), (-0.243, 0.425), (-0.007, 0.414),
               (0.217, 0.429), (0.419, 0.473), (0.5, 0.49)]
    steps = 12
    first = m.points([(math.cos(i * math.pi / steps) * (width - inset), y,
                       math.sin(i * math.pi / steps) * 2 * (width - inset))
                      for inset in (0, 0.064) for y, width in profile
                      for i in range(steps + 1)])
    cols = steps + 1
    inside = cols * len(profile)
    for row, color in enumerate(colors):
        base = first + row * cols
        for i in range(steps):
            a = base + i
            m.face((a, a + 1, a + 1 + cols, a + cols), color)
            m.face((a + inside, a + inside + cols, a + inside + cols + 1, a + inside + 1), '4c6967')
        for a in (base, base + steps):
            m.face((a, a + cols, a + cols + inside, a + inside), 'a39b79')
    for base in (first, first + cols * (len(profile) - 1)):
        for i in range(steps):
            a = base + i
            m.face((a, a + inside, a + inside + 1, a + 1), 'd2ad7c')
    return m


def fence():
    m = ColoredMesh()
    for i in range(8):
        x = (i - 3.5) * 0.132
        height = 0.93 if i in (0, 7) else 0.79 + 0.033 * (i % 2)
        m.box((x, -0.107, height / 2), (0.071, 0.61, height), 'a17453' if i % 2 else 'ae8763')
    m.box((0, 0.165, 0.275), (0.996, 0.469, 0.115), BEAM)
    m.box((0, 0.177, 0.606), (0.981, 0.51, 0.142), WOOD)
    return m


def main():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.context.scene.unit_settings.system = 'METRIC'
    kit = bpy.data.collections.new('Plaza and kennel expansion props')
    bpy.context.scene.collection.children.link(kit)
    mats = {name: material(name) for name in ('Stonework', LIGHT)}
    designs = {
        'MarketAmber': market('ae6a4d', 'e3bd85'), 'MarketJade': market('59867c', 'd0c292'),
        'MoonPavilion': pavilion(), 'LanternSpan': festoon(), 'WindowPanel': wall_panel(True),
        'WallPanel': wall_panel(False), 'CushionSeat': seat(), 'ReadingShelf': bookshelf(),
        'ToyTunnel': tunnel(), 'YardFence': fence(),
    }
    objects = []
    for name, design in designs.items():
        lowest = min(v[2] for v in design.vertices)
        highest = max(v[2] for v in design.vertices)
        design.vertices = [(x, y, (z - lowest) / (highest - lowest)) for x, y, z in design.vertices]
        obj = design.object(name, kit, mats)
        mesh = bmesh.new()
        mesh.from_mesh(obj.data)
        bmesh.ops.recalc_face_normals(mesh, faces=list(mesh.faces))
        mesh.to_mesh(obj.data)
        mesh.free()
        objects.append(obj)

    source = os.environ.get('MOOPET_EXTENSION_BLEND')
    if source:
        for i, obj in enumerate(objects):
            obj.location = (1.32 * (i % 4 - 1.5), 1.35 * (i // 4 - 1), 0)
        for screen in bpy.data.screens:
            for area in screen.areas:
                if area.type == 'VIEW_3D':
                    area.spaces.active.shading.color_type = 'VERTEX'
                    area.spaces.active.region_3d.view_distance = 6.6
        bpy.context.preferences.filepaths.save_version = 0
        bpy.ops.wm.save_as_mainfile(filepath=str(Path(source).resolve()))
    for obj in objects:
        obj.location = (0, 0, 0)
        obj.select_set(True)
    dest = Path(__file__).resolve().parents[1] / 'public' / 'models' / 'landmark' / 'world-expansion.glb'
    assert bpy.ops.export_scene.gltf(filepath=str(dest), export_format='GLB', use_selection=True,
                                     export_animations=False, export_lights=False, export_cameras=False) == {'FINISHED'}


if __name__ == '__main__':
    main()
