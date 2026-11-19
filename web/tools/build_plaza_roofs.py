"""Build the plaza roof kit in Blender and export it with its packed tile atlas.

blender --background --factory-startup --python-exit-code 1 --python build_plaza_roofs.py
Set MOOPET_ROOF_BLEND to also save the editable Blender kit.
"""

import math
import os
from pathlib import Path

import bpy
import numpy as np


KIT = {
    "Gable": (0.47, [(0, 0), (0.02, 0.075), (0.16, 0.18), (0.82, 0.84), (0.95, 0.95), (1, 1)]),
    "Hipped": (0.265, [(0, 0), (0.02, 0.075), (0.16, 0.17), (0.82, 0.83), (0.95, 0.95), (1, 1)]),
    "Gambrel": (0.45, [(0, 0), (0.02, 0.075), (0.35, 0.58), (0.82, 0.88), (0.95, 0.96), (1, 1)]),
}
# UV charts for the two main slopes, the two ends, the ridge and the underside.
CHARTS = [(0, 0.5, 0.5, 0.5), (0.5, 0.5, 0.5, 0.5),
          (0, 0, 0.25, 0.5), (0.25, 0, 0.25, 0.5),
          (0.5, 0, 0.25, 0.5), (0.75, 0, 0.25, 0.5)]
MARGIN = 0.016


def texture_atlas():
    size = 256
    pixels = np.ones((size, size, 4), dtype=np.float32)
    rng = np.random.default_rng(715)
    for index, (left, bottom, width, height) in enumerate(CHARTS):
        x0, y0 = round(left * size), round(bottom * size)
        cols, rows = round(width * size), round(height * size)
        x, y = np.meshgrid((np.arange(cols) + 0.5) / cols, (np.arange(rows) + 0.5) / rows)
        x = np.clip((x - MARGIN) / (1 - 2 * MARGIN), 0, 1)
        y = np.clip((y - MARGIN) / (1 - 2 * MARGIN), 0, 1)
        if index < 4:
            # Different lengths across a slope and an end, with staggered joints.
            course = np.maximum(0, (y - 0.073) / 0.855) * 7
            row = course.astype(int)
            up = course % 1
            columns = 10 if index < 2 else 6
            across = x * columns + 0.5 * (row % 2)
            tile = across.astype(int)
            joint = np.minimum(across % 1, 1 - across % 1)
            tones = rng.uniform(0.86, 0.99, (9, columns + 2))
            shade = tones[row, tile] * (0.94 + 0.06 * np.sin(math.pi * (across % 1)))
            shade *= np.where(up < 0.105, 0.74, 0.96 + 0.04 * (1 - up))
            shade *= np.where(joint < 0.06, 0.79, 1)
            shade = np.where(y < 0.055, 0.59, shade)
            shade = np.where((y >= 0.055) & (y < 0.077), 0.98, shade)
            shade = np.where(y > 0.935, 0.72 + 0.23 * np.sin(np.pi * (y - 0.935) / 0.065), shade)
        elif index == 4:
            shade = np.where((x * 12) % 1 < 0.11, 0.63, 0.87 - 0.10 * (2 * y - 1) ** 2)
        else:
            shade = np.full_like(x, 0.45)
        pixels[y0:y0 + rows, x0:x0 + cols, :3] = shade[..., np.newaxis]

    image = bpy.data.images.new("Moopet Roof Tiles", width=size, height=size, alpha=False)
    image.pixels.foreach_set(pixels.ravel())
    image.update()
    image.pack()
    return image


def roof_material():
    material = bpy.data.materials.new("Plaza Roof Tiles")
    node = material.node_tree.nodes.new("ShaderNodeTexImage")
    node.image = texture_atlas()
    shader = next(n for n in material.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    shader.inputs["Roughness"].default_value = 0.9
    material.node_tree.links.new(node.outputs["Color"], shader.inputs["Base Color"])
    return material


def build_roof(name, ridge_width, profile, group, material):
    vertices = []
    faces = []
    charts = []
    for t, z in profile:
        x = 0.5 - (0.5 - ridge_width) * t
        y = 0.5 - 0.472 * t
        vertices.extend([(x, -y, z), (-x, -y, z), (-x, y, z), (x, y, z)])

    for ring, ((start, _), (end, _)) in enumerate(zip(profile, profile[1:])):
        first = 4 * ring
        for side, chart in enumerate((0, 2, 1, 3)):
            current, following = first + side, first + (side + 1) % 4
            faces.append((following, current, current + 4, following + 4))
            charts.append((chart, [(0, start), (1, start), (1, end), (0, end)]))

    cap = len(vertices) - 4
    faces.extend([(cap + 3, cap + 2, cap + 1, cap), (0, 1, 2, 3)])
    square = [(0, 0), (1, 0), (1, 1), (0, 1)]
    charts.extend([(4, square), (5, square)])
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    group.objects.link(obj)
    mesh.materials.append(material)
    uvs = mesh.uv_layers.new(name="UVMap")
    for face, (index, coordinates) in zip(mesh.polygons, charts):
        left, bottom, width, height = CHARTS[index]
        for i, (u, v) in zip(face.loop_indices, coordinates):
            uvs.uv[i].vector = (
                left + width * (MARGIN + u * (1 - 2 * MARGIN)),
                bottom + height * (MARGIN + v * (1 - 2 * MARGIN)),
            )
    return obj


def main():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.context.scene.unit_settings.system = "METRIC"
    kit = bpy.data.collections.new("Plaza Roof Kit")
    bpy.context.scene.collection.children.link(kit)
    material = roof_material()
    roofs = [build_roof(name, ridge, profile, kit, material) for name, (ridge, profile) in KIT.items()]
    source = os.environ.get("MOOPET_ROOF_BLEND")
    if source:
        for i, roof in enumerate(roofs):
            roof.location.x = (i - 1) * 1.4
        for screen in bpy.data.screens:
            for area in screen.areas:
                if area.type == "VIEW_3D":
                    area.spaces.active.region_3d.view_distance = 5.6
        bpy.context.preferences.filepaths.save_version = 0
        bpy.ops.wm.save_as_mainfile(filepath=str(Path(source).resolve()))

    for roof in roofs:
        roof.location.x = 0
        roof.select_set(True)
    output = Path(__file__).resolve().parents[1] / "public" / "models" / "landmark" / "plaza-roofs.glb"
    assert bpy.ops.export_scene.gltf(
        filepath=str(output), export_format="GLB", use_selection=True,
        export_animations=False, export_cameras=False, export_lights=False,
    ) == {"FINISHED"}


if __name__ == "__main__":
    main()
