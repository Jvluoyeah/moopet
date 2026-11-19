"""Build the park's lily pond and reusable wildflower bed in Blender."""

import math
import os
import random
import sys
from pathlib import Path

import bpy

TOOLS = Path(__file__).resolve().parent
sys.path.insert(0, str(TOOLS))
from build_plaza_architecture import ColoredMesh, material


def shore_shape(angle):
    return 1 + 0.06 * math.sin(3 * angle + 0.42) + 0.046 * math.cos(5 * angle - 0.3)


def pond_center(angle, radius):
    r = radius * shore_shape(angle)
    return r * math.cos(angle), r * math.sin(angle)


def pond_bank(mesh):
    # Closed volume. The upper rings are continuous across the bank and water.
    rings = [
        (0.425, 0, "56635c", "Stonework"),
        (0.482, 0.013, "6c7567", "Stonework"),
        (0.473, 0.059, "97a38a", "Stonework"),
        (0.420, 0.052, "bcc5a5", "Stonework"),
        (0.395, 0.041, "5b9690", "Water"),
        (0.362, 0.041, "478981", "Water"),
        (0.285, 0.041, "397776", "Water"),
        (0.166, 0.041, "316773", "Water"),
    ]
    count = 52
    angles = [i * math.tau / count for i in range(count)]
    first = mesh.points([(*pond_center(angle, r), z) for r, z, _, _ in rings for angle in angles])
    for row, (_, _, _, _) in enumerate(rings[:-1]):
        _, _, color, style = rings[row]
        a = first + row * count
        for i in range(count):
            j = (i + 1) % count
            tint = "9ba88e" if row == 2 and i % 5 in (0, 2) else color
            mesh.face((a + i, a + j, a + j + count, a + i + count), tint, style)
    for row in (0, len(rings) - 1):
        _, z, color, kind = rings[row]
        center = mesh.points([(0, 0, z)])
        start = first + row * count
        for i in range(count):
            a, b = start + i, start + (i + 1) % count
            mesh.face((center, b, a) if row == 0 else (center, a, b), color, kind)


def prism(mesh, points, bottom, top, color, style="Stonework"):
    """Extrude a counterclockwise profile that can be triangulated from its first point."""
    n = len(points)
    first = mesh.points([(x, y, z) for z in (bottom, top) for x, y in points])
    for i in range(n):
        j = (i + 1) % n
        mesh.face((first + i, first + j, first + j + n, first + i + n), color, style)
    for i in range(1, n - 1):
        mesh.face((first, first + i + 1, first + i), color, style)
        mesh.face((first + n, first + n + i, first + n + i + 1), color, style)


def lily(mesh, x, y, radius, rotation, color, bloom):
    outline = [(x, y)]
    for i in range(11):
        a = rotation + math.radians(25 + 310 * i / 10)
        outline.append((x + radius * math.cos(a), y + radius * math.sin(a)))
    prism(mesh, outline, 0.038, 0.048, color, "Water")
    if bloom:
        mesh.lathe([(radius * 0.39, 0.047, "c688aa"), (radius * 0.28, 0.076, "f2c3d0"),
                    (radius * 0.20, 0.082, "e9c796")], 7, (x, y), material="WindowLight")


def blade(mesh, x, y, z, tall, width, angle, color):
    cx, cy = math.cos(angle), math.sin(angle)
    first = mesh.points([
        (x - width * cy, y + width * cx, z),
        (x + width * cy, y - width * cx, z),
        (x + width * cx * 0.42, y + width * cy * 0.42, z),
        (x + tall * cx * 0.17, y + tall * cy * 0.17, z + tall),
    ])
    for face in ((0, 2, 1), (0, 1, 3), (1, 2, 3), (2, 0, 3)):
        mesh.face(tuple(first + i for i in face), color)


def make_pond():
    mesh = ColoredMesh()
    pond_bank(mesh)
    for data in [
        (-0.16, -0.105, 0.047, 1.75, "829b57", True),
        (-0.245, -0.047, 0.058, 0.63, "90a75f", False),
        (-0.223, 0.067, 0.041, 3.6, "728d5b", True),
        (0.18, 0.075, 0.065, 1.7, "7f9e56", True),
        (0.274, 0.158, 0.039, 1.1, "a1ac69", False),
        (0.070, 0.253, 0.053, 2.5, "8fa366", False),
        (0.024, -0.228, 0.039, 4.12, "7b9a60", True),
    ]:
        lily(mesh, *data)

    for x, y, width in [
        (-0.10, -0.018, 0.05), (0.05, -0.08, 0.046), (0.095, -0.068, 0.041),
        (0.09, 0.143, 0.060), (0.155, 0.188, 0.050), (-0.09, 0.202, 0.058),
        (-0.015, 0.245, 0.03), (0.26, -0.135, 0.040), (0.28, -0.109, 0.027),
    ]:
        points = [(x - width, y), (x - width * 0.40, y - 0.006), (x + width * 0.55, y - 0.006),
                  (x + width, y + 0.002), (x + width * 0.24, y + 0.003), (x - width * 0.36, y + 0.003)]
        prism(mesh, points, 0.039, 0.043, "76ada3", "Water")

    rng = random.Random(106)
    for angle in [0.52, 1.02, 1.63, 2.55, 3.28, 3.98, 4.36, 5.14, 5.85]:
        x, y = pond_center(angle, 0.442)
        size = rng.uniform(0.024, 0.044)
        mesh.lathe([(size * 0.90, 0.035, "859487"), (size, 0.072, "a8aaa0"),
                    (size * 0.74, rng.uniform(0.102, 0.144), "b7baa6")], 6, (x, y))

    for angle in [0.85, 1.98, 3.50, 4.57, 5.60, 6.07]:
        x, y = pond_center(angle, 0.423)
        for i, color in enumerate(("7d8b54", "a9a56e", "79906a", "98a36a")):
            offset = i * 1.56 + angle
            blade(mesh, x + 0.016 * math.cos(offset), y + 0.016 * math.sin(offset),
                  0.042, rng.uniform(0.13, 0.22), rng.uniform(0.006, 0.010), offset, color)
    return mesh


def make_flowers():
    mesh = ColoredMesh()
    rng = random.Random(94)
    palette = [("ddadc7", "f1dba7"), ("b0a5cf", "f2cc99"), ("eee1bd", "dfb67c")]
    for i in range(13):
        angle = i * 2.399963
        r = 0.39 * math.sqrt((i + 0.5) / 13)
        x, y = r * math.cos(angle), 0.8 * r * math.sin(angle)
        z = rng.uniform(0.31, 0.88)
        bloom, heart = palette[i % len(palette)]
        mesh.lathe([(0.014, 0, "6d905c"), (0.012, z, "86a369")], 5, (x, y))
        for start, side in ((0.22, angle), (0.30, angle + math.pi)):
            blade(mesh, x, y, z * start, z * 0.49, 0.019, side, "94a96c")
        mesh.lathe([(0.018, z - 0.036, bloom), (0.044, z, bloom),
                    (0.035, z + 0.047, heart)], 7, (x, y), material="WindowLight")
    return mesh


def main():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.context.scene.unit_settings.system = "METRIC"
    collection = bpy.data.collections.new("Moopet Park Landscape")
    bpy.context.scene.collection.children.link(collection)
    materials = {name: material(name) for name in ("Stonework", "Water", "WindowLight")}
    assets = [make_pond().object("LilyPond", collection, materials),
              make_flowers().object("Wildflowers", collection, materials)]
    source = os.environ.get("MOOPET_PARK_BLEND")
    if source:
        assets[1].location.x = 1.15
        for screen in bpy.data.screens:
            for area in screen.areas:
                if area.type == "VIEW_3D":
                    area.spaces.active.shading.color_type = "VERTEX"
                    area.spaces.active.region_3d.view_distance = 3.7
        bpy.context.preferences.filepaths.save_version = 0
        bpy.ops.wm.save_as_mainfile(filepath=str(Path(source).resolve()))

    for asset in assets:
        asset.location.x = 0
        asset.select_set(True)
    output = TOOLS.parent / "public" / "models" / "landmark" / "park-landscape.glb"
    assert bpy.ops.export_scene.gltf(filepath=str(output), export_format="GLB", use_selection=True,
                                      export_animations=False, export_cameras=False, export_lights=False) == {"FINISHED"}


if __name__ == "__main__":
    main()
