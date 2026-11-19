"""Build the expanded park's props from the licensed source GLBs and custom stones."""

import os
import sys
from pathlib import Path

import bpy
from mathutils import Vector
from mathutils.bvhtree import BVHTree

sys.path.insert(0, str(Path(__file__).resolve().parent))
from build_plaza_architecture import ColoredMesh, material


MODELS = {
    "Boardwalk": ("trapiche", {"agua", "terra", "grama"}),
    "Heron": ("garca", {"agua"}),
    "Ginkgo": ("ipe_amarelo", {"grama"}),
    "Pine": ("araucaria", {"grama"}),
    "Fence": ("cerca_madeira", set()),
    "CastBench": ("banco_praca", set()),
    "FlowerShrubs": ("arbustos", set()),
    "Rockery": ("pedras", {"verde", "folha"}),
}
TINT = {
    "madeira_escura": "705343", "madeira": "bb8b59", "escuro": "424c50",
    "creme": "dabb8e", "flor_amarela": "edc680", "amarelo": "e8b768",
    "verde": "759267", "verde_garrafa": "4e745f", "verde_escuro": "547064",
    "folha": "8da675", "flor_rosa": "d0a0b7", "marrom": "8c715b",
    "parede": "eee2cf", "pedra": "83938e", "concreto_escuro": "687d7e",
}


def split_shells(model):
    linked = [[] for _ in model.vertices]
    for index, face in enumerate(model.faces):
        for vertex in face:
            linked[vertex].append(index)

    remaining = set(range(len(model.faces)))
    while remaining:
        pending = [remaining.pop()]
        faces, verts = [], set()
        while pending:
            face = pending.pop()
            faces.append(face)
            for vertex in model.faces[face]:
                if vertex in verts:
                    continue
                verts.add(vertex)
                for neighbor in linked[vertex]:
                    if neighbor in remaining:
                        remaining.remove(neighbor)
                        pending.append(neighbor)
        yield faces, verts


def clean_joints(model, name):
    shells = list(split_shells(model))
    blooms = {TINT["flor_rosa"], TINT["flor_amarela"]}
    leaves = None
    if name == "FlowerShrubs":
        for faces, indices in shells:
            if any(model.styles[i][0] not in blooms for i in faces):
                center_x = sum(model.vertices[i][0] for i in indices) / len(indices)
                center_y = sum(model.vertices[i][1] for i in indices) / len(indices)
                for i in indices:
                    x, y, z = model.vertices[i]
                    model.vertices[i] = (x - center_x * 0.25, y - center_y * 0.25, z)
        bush_faces = [face for face, (color, _) in zip(model.faces, model.styles) if color not in blooms]
        leaves = BVHTree.FromPolygons(model.vertices, bush_faces)
    for faces, indices in shells:
        points = [model.vertices[i] for i in indices]
        bottom, top = min(p[2] for p in points), max(p[2] for p in points)
        colors = {model.styles[i][0] for i in faces}
        drop, rise = 0.0, 0.0
        if name == "Boardwalk":
            if colors == {TINT["madeira_escura"]}:
                if abs(top - 0.2) < 0.001:
                    rise = -0.02 if bottom < 0.01 else 0.007
                if abs(bottom - 0.22) < 0.001:
                    drop = -0.005
            if abs(bottom - 0.64) < 0.001 or abs(bottom - 0.72) < 0.001:
                drop = -0.005
        elif name == "CastBench" and colors == {TINT["escuro"]}:
            if abs(top - 0.17) < 0.001:
                rise = 0.006
            if abs(bottom - 0.17) < 0.001:
                drop = -0.008
        elif name == "Fence" and abs(bottom - 0.30) < 0.001:
            drop = -0.006
        elif name == "Pine" and abs(bottom - 1.75) < 0.001:
            drop = -0.006
        elif name == "Rockery":
            drop = rise = -bottom
            if top < 0.20:
                center_x = sum(p[0] for p in points) / len(points)
                center_y = sum(p[1] for p in points) / len(points)
                for i in indices:
                    x, y, z = model.vertices[i]
                    model.vertices[i] = (x - center_x * 0.25, y - (center_y + 0.05) * 0.25, z)
        elif leaves is not None and colors <= blooms:
            x, y = [(min(p[i] for p in points) + max(p[i] for p in points)) / 2 for i in range(2)]
            contact, _, _, _ = leaves.ray_cast(Vector((x, y, 2)), Vector((0, 0, -1)))
            if contact is None:
                contact, _, _, _ = leaves.find_nearest(Vector((x, y, bottom)))
            if contact is not None:
                dz = contact.z - bottom - 0.022
                for i in indices:
                    px, py, pz = model.vertices[i]
                    model.vertices[i] = (px + contact.x - x, py + contact.y - y, pz + dz)
        if rise or drop:
            for i in indices:
                x, y, z = model.vertices[i]
                blend = (z - bottom) / (top - bottom) if top > bottom else 0.0
                model.vertices[i] = (x, y, z + drop * (1 - blend) + rise * blend)


def convert(filename, excluded, name, kit, materials):
    before = set(bpy.data.objects)
    assert bpy.ops.import_scene.gltf(filepath=str(filename)) == {"FINISHED"}
    imports = set(bpy.data.objects) - before
    model = ColoredMesh()
    welded = {}
    for obj in sorted(imports, key=lambda ob: ob.name):
        if obj.type != "MESH":
            continue
        vertices = {}
        for polygon in obj.data.polygons:
            original = obj.data.materials[polygon.material_index].name.split(".")[0]
            if original in excluded:
                continue
            if name == "Ginkgo" and original == "flor_amarela" and all(
                (obj.matrix_world @ obj.data.vertices[i].co).z < 0.04 for i in polygon.vertices
            ):
                continue
            for index in polygon.vertices:
                if index not in vertices:
                    coordinate = obj.matrix_world @ obj.data.vertices[index].co
                    key = tuple(round(v, 7) for v in coordinate)
                    if key not in welded:
                        welded[key] = model.points([tuple(coordinate)])
                    vertices[index] = welded[key]
            material_kind = ("WindowLight"
                             if name == "Boardwalk" and original == "flor_amarela" else "Stonework")
            corners = tuple(vertices[i] for i in polygon.vertices)
            if len(set(corners)) == len(corners):
                model.face(corners, TINT[original], material_kind)
    for obj in imports:
        bpy.data.objects.remove(obj, do_unlink=True)

    clean_joints(model, name)
    lower = [min(vertex[i] for vertex in model.vertices) for i in range(3)]
    upper = [max(vertex[i] for vertex in model.vertices) for i in range(3)]
    mid_x, mid_y = [(lower[i] + upper[i]) * 0.5 for i in range(2)]
    x_size, y_size, z_size = [upper[i] - lower[i] for i in range(3)]
    model.vertices = [((x - mid_x) / x_size, (y - mid_y) / y_size, (z - lower[2]) / z_size)
                      for x, y, z in model.vertices]
    return model.object(name, kit, materials)


def star_stone(kit, materials):
    mesh = ColoredMesh()
    mesh.lathe([(0.45, 0, "57686b"), (0.5, 0.11, "8a9a98"),
                (0.43, 0.20, "667b80"), (0.36, 0.61, "6c888e"),
                (0.24, 0.90, "a3b4a8"), (0.16, 1.0, "a7b49f")], 8)
    mesh.box((0, -0.297, 0.491), (0.17, 0.047, 0.15), "a69977")
    mesh.box((0, -0.330, 0.501), (0.068, 0.028, 0.09), "d6ad6e", "WindowLight")
    return mesh.object("StarStone", kit, materials)


def main():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.context.scene.unit_settings.system = "METRIC"
    kit = bpy.data.collections.new("Long Night Park Props")
    bpy.context.scene.collection.children.link(kit)
    materials = {name: material(name) for name in ("Stonework", "WindowLight")}
    folder = Path(os.environ["MOOPET_PARK_CC0"])
    objects = [convert(folder / f"{file}.glb", excluded, name, kit, materials)
               for name, (file, excluded) in MODELS.items()]
    objects.append(star_stone(kit, materials))
    source = os.environ.get("MOOPET_PARK_PROPS_BLEND")
    if source:
        for i, obj in enumerate(objects):
            obj.location = (1.25 * (i % 3 - 1), 1.35 * (i // 3 - 1), 0)
        for screen in bpy.data.screens:
            for area in screen.areas:
                if area.type == "VIEW_3D":
                    area.spaces.active.shading.color_type = "VERTEX"
                    area.spaces.active.region_3d.view_distance = 6.1
        bpy.context.preferences.filepaths.save_version = 0
        bpy.ops.wm.save_as_mainfile(filepath=str(Path(source).resolve()))
    for obj in objects:
        obj.location = (0, 0, 0)
        obj.select_set(True)
    output = Path(__file__).resolve().parents[1] / "public" / "models" / "landmark" / "park-props.glb"
    assert bpy.ops.export_scene.gltf(filepath=str(output), export_format="GLB", use_selection=True,
                                      export_animations=False, export_cameras=False, export_lights=False) == {"FINISHED"}


if __name__ == "__main__":
    main()
