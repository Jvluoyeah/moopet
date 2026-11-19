"""Generate the Moopet plaza's facade, moon observatory and fountain in Blender."""

import math
import os
from pathlib import Path

import bpy
from mathutils import Vector


class ColoredMesh:
    def __init__(self):
        self.vertices = []
        self.faces = []
        self.styles = []

    def points(self, points):
        first = len(self.vertices)
        self.vertices.extend(points)
        return first

    def face(self, indices, color, material="Stonework"):
        self.faces.append(indices)
        self.styles.append((color, material))

    def box(self, center, size, color, material="Stonework"):
        x, y, z = center
        a, b, c = (s / 2 for s in size)
        first = self.points([(x + dx, y + dy, z + dz)
                             for dz in (-c, c) for dx, dy in [(-a, -b), (a, -b), (a, b), (-a, b)]])
        for offsets in ((3, 2, 1, 0), (4, 5, 6, 7), (0, 1, 5, 4),
                        (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7)):
            self.face(tuple(first + i for i in offsets), color, material)

    def arch(self, x, front, bottom, width, height, depth, color, material="Stonework", angle=0):
        radius = width / 2
        spring = bottom + height - radius
        profile = [(x - radius, bottom), (x + radius, bottom)]
        profile.extend((x + radius * math.cos(t * math.pi / 8), spring + radius * math.sin(t * math.pi / 8))
                       for t in range(9))
        cosine, sine = math.cos(angle), math.sin(angle)
        first = self.points([(u * cosine - v * sine, u * sine + v * cosine, z)
                             for v in (front, front + depth) for u, z in profile])
        count = len(profile)
        for i in range(count):
            j = (i + 1) % count
            self.face((first + j, first + i, first + i + count, first + j + count), color, material)
        for i in range(1, count - 1):
            self.face((first, first + i, first + i + 1), color, material)
            self.face((first + count, first + i + count + 1, first + i + count), color, material)

    def lathe(self, rings, sides, center=(0, 0), material="Stonework", stripe=None):
        x, y = center
        angles = [math.tau * (i + 0.5) / sides for i in range(sides)]
        first = self.points([(x + r * math.cos(a), y + r * math.sin(a), z)
                             for r, z, _ in rings for a in angles])
        for row, (_, _, color) in enumerate(rings[:-1]):
            for i in range(sides):
                j = (i + 1) % sides
                a = first + row * sides
                shade = stripe if stripe and 5 <= row <= 8 and i % 2 == 0 else color
                self.face((a + i, a + j, a + j + sides, a + i + sides), shade, material)
        for end in (0, len(rings) - 1):
            _, z, color = rings[end]
            hub = self.points([(x, y, z)])
            for i in range(sides):
                a = first + end * sides + i
                b = first + end * sides + (i + 1) % sides
                self.face((hub, b, a) if end == 0 else (hub, a, b), color, material)

    def crescent(self, z, rx, rz, thickness, color):
        points = []
        steps = 24
        for i in range(steps + 1):
            t = i / steps
            angle = math.radians(47 + 266 * t)
            inner = 1 - (0.025 + 0.49 * math.sin(math.pi * t))
            c, s = math.cos(angle), math.sin(angle)
            points.extend([(rx * c, z + rz * s), (rx * c * inner, z + rz * s * inner)])
        self._band(points, thickness, color)

    def _band(self, points, thickness, color):
        count = len(points)
        first = self.points([(x, y, z) for y in (-thickness / 2, thickness / 2) for x, z in points])
        for i in range(0, count - 2, 2):
            a, b = first + i, first + i + count
            self.face((a, a + 2, a + 3, a + 1), color)
            self.face((b + 1, b + 3, b + 2, b), color)
            self.face((a, b, b + 2, a + 2), color)
            self.face((a + 3, b + 3, b + 1, a + 1), color)
        a, b = first + count - 2, first + 2 * count - 2
        self.face((first + 1, first + count + 1, first + count, first), color)
        self.face((a, b, b + 1, a + 1), color)

    def water_jet(self, angle, color):
        path = [Vector(((0.14 + 0.24 * t) * math.cos(angle),
                        (0.14 + 0.24 * t) * math.sin(angle),
                        0.111 + 0.19 * (1 - t) + 0.22 * math.sin(math.pi * t)))
                for t in (0, 0.16, 0.34, 0.5, 0.66, 0.84, 1)]
        lateral = Vector((-math.sin(angle), math.cos(angle), 0))
        points = []
        for i, point in enumerate(path):
            tangent = (path[min(i + 1, len(path) - 1)] - path[max(i - 1, 0)]).normalized()
            up = tangent.cross(lateral)
            points.extend(tuple(point + 0.006 * (math.cos(a) * lateral + math.sin(a) * up))
                          for a in (0, math.pi / 2, math.pi, math.pi * 1.5))
        first = self.points(points)
        for i in range(len(path) - 1):
            a = first + 4 * i
            for j in range(4):
                k = (j + 1) % 4
                self.face((a + j, a + k, a + k + 4, a + j + 4), color, "Water")
        end = first + len(points) - 4
        self.face((first + 3, first + 2, first + 1, first), color, "Water")
        self.face((end, end + 1, end + 2, end + 3), color, "Water")

    def object(self, name, collection, materials):
        mesh = bpy.data.meshes.new(name)
        mesh.from_pydata(self.vertices, [], self.faces)
        mesh.update()
        color = mesh.color_attributes.new(name="Tint", type="BYTE_COLOR", domain="CORNER")
        used = list(dict.fromkeys(style[1] for style in self.styles))
        for material in used:
            mesh.materials.append(materials[material])
        for face, (hex_color, material) in zip(mesh.polygons, self.styles):
            face.material_index = used.index(material)
            rgba = tuple(int(hex_color[i:i + 2], 16) / 255 for i in (0, 2, 4)) + (1,)
            for loop in face.loop_indices:
                color.data[loop].color_srgb = rgba
        obj = bpy.data.objects.new(name, mesh)
        collection.objects.link(obj)
        return obj


def facade():
    m = ColoredMesh()
    m.box((0, 0, 0.50), (1, 1, 1), "f0d5af")
    m.box((0, 0, 0.085), (1.020, 1.018, 0.168), "88939c")
    m.box((0, 0, 0.174), (1.026, 1.024, 0.024), "b6b6a7")
    m.box((0, 0, 0.926), (1.027, 1.026, 0.047), "97704e")
    m.box((0, 0, 0.983), (1.045, 1.038, 0.030), "d3a66e")
    for x in (-0.467, 0.467):
        m.box((x, -0.506, 0.558), (0.051, 0.035, 0.754), "675042")
        for i in range(5):
            width = 0.114 if i % 2 else 0.090
            tone = "d9bda0" if i % 2 else "c2ac99"
            m.box((x, -0.512, 0.239 + 0.127 * i), (width, 0.043, 0.061), tone)
    m.arch(0, -0.538, 0.053, 0.354, 0.628, 0.060, "946f52")
    m.arch(0, -0.551, 0.067, 0.296, 0.577, 0.022, "e8d1ad", "Accents")
    for x in (-0.076, 0.076):
        for z in (0.19, 0.395):
            m.box((x, -0.558, z), (0.116, 0.022, 0.143), "b39e81", "Accents")
    m.box((0.043, -0.576, 0.305), (0.035, 0.027, 0.029), "ffce83")
    m.box((0, -0.563, 0.664), (0.109, 0.027, 0.042), "d7a887")
    for x in (-0.304, 0.304):
        m.arch(x, -0.525, 0.298, 0.231, 0.451, 0.043, "8b684e")
        m.arch(x, -0.536, 0.324, 0.181, 0.382, 0.021, "f5c879", "WindowLight")
        m.box((x, -0.541, 0.498), (0.012, 0.021, 0.360), "5e4f47")
        m.box((x, -0.548, 0.502), (0.172, 0.030, 0.019), "665044")
        m.box((x, -0.522, 0.298), (0.248, 0.100, 0.044), "d7a77c")
    for angle in (math.pi / 2, -math.pi / 2, math.pi):
        for x in (-0.244, 0.244):
            m.arch(x, -0.520, 0.348, 0.252, 0.367, 0.035, "8d715c", angle=angle)
            m.arch(x, -0.531, 0.366, 0.205, 0.322, 0.018, "d3a873", "WindowLight", angle)
    return m


def tower():
    m = ColoredMesh()
    m.lathe([(0.472, 0, "637485"), (0.487, 0.022, "acaaa2"),
             (0.482, 0.061, "8b969c"), (0.435, 0.086, "dbc5a0"),
             (0.424, 0.105, "7f8d9c"), (0.45, 0.123, "a4a8a5"),
             (0.376, 0.148, "b4babc"), (0.359, 0.165, "a0aab4"),
             (0.322, 0.384, "889bae"), (0.315, 0.605, "909eb2"),
             (0.338, 0.617, "5d7486"), (0.389, 0.637, "d8b379"),
             (0.397, 0.677, "768a91"), (0.371, 0.692, "8c9e9c")], 16, stripe="8497aa")
    for i in range(8):
        angle = i * math.tau / 8
        x, y = 0.354 * math.cos(angle), 0.354 * math.sin(angle)
        m.lathe([(0.056, 0.142, "9ca6a6"), (0.061, 0.163, "d0b99a"),
                 (0.047, 0.209, "9ca9af"), (0.038, 0.306, "abb7bc"),
                 (0.021, 0.345, "8499a8")], 6, (x, y))
    for angle in (0, math.pi / 2, math.pi, -math.pi / 2):
        m.arch(0, -0.348, 0.149, 0.283, 0.273, 0.069, "bea78a", angle=angle)
        m.arch(0, -0.362, 0.158, 0.213, 0.230, 0.027, "273a47", angle=angle)
        m.arch(0, -0.375, 0.174, 0.148, 0.184, 0.022, "ffe1a0", "WindowLight", angle)
        m.arch(0, -0.338, 0.459, 0.166, 0.139, 0.043, "c7b394", angle=angle)
        m.arch(0, -0.350, 0.473, 0.121, 0.109, 0.022, "f6c979", "WindowLight", angle)
    m.lathe([(0.375, 0.684, "517277"), (0.407, 0.705, "d0ad68"),
             (0.409, 0.717, "2b5f65"), (0.386, 0.755, "4c8482"),
             (0.317, 0.803, "5f9790"), (0.209, 0.845, "59958b"),
             (0.100, 0.870, "77aaa0"), (0.049, 0.881, "e3bf7d")], 16)
    m.lathe([(0.051, 0.876, "b99866"), (0.040, 0.900, "f6cb80"),
             (0.024, 0.916, "d1a86b")], 12)
    m.crescent(0.946, 0.155, 0.054, 0.04, "f3c778")
    return m


def fountain():
    m = ColoredMesh()
    m.lathe([(0.459, 0, "566d73"), (0.50, 0.024, "afafa0"),
             (0.494, 0.065, "738c91"), (0.493, 0.102, "a4b5ad"),
             (0.474, 0.134, "e5d3ae"), (0.416, 0.137, "b4c5b6"),
             (0.405, 0.118, "50717a"), (0.398, 0.074, "3c606d"),
             (0.172, 0.064, "396b77")], 12)
    m.lathe([(0.403, 0.102, "365d71"), (0.410, 0.115, "54b7be")], 36, material="Water")
    m.lathe([(0.189, 0.07, "617f82"), (0.186, 0.139, "b1c0ad"),
             (0.10, 0.174, "879f9b"), (0.08, 0.252, "e0cba6"),
             (0.146, 0.279, "8ca9a3"), (0.195, 0.299, "c7cbb1"),
             (0.172, 0.329, "78aaa2"), (0.108, 0.318, "5d999b"),
             (0.055, 0.298, "83d7d0")], 12)
    m.lathe([(0.063, 0.305, "7eafae"), (0.045, 0.397, "cfcabb"),
             (0.056, 0.427, "d7cdaf")], 8)
    m.crescent(0.495, 0.120, 0.081, 0.040, "e0c48e")
    for i in range(6):
        m.water_jet((i + 0.25) * math.tau / 6, "9de1d9")
    return m


def material(kind):
    mat = bpy.data.materials.new("Plaza_" + kind)
    nodes = mat.node_tree.nodes
    vertex = nodes.new("ShaderNodeVertexColor")
    vertex.layer_name = "Tint"
    shader = next(n for n in nodes if n.type == "BSDF_PRINCIPLED")
    shader.inputs["Roughness"].default_value = 0.86
    mat.node_tree.links.new(vertex.outputs["Color"], shader.inputs["Base Color"])
    return mat


def main():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.context.scene.unit_settings.system = "METRIC"
    collection = bpy.data.collections.new("Moopet Plaza Architecture")
    bpy.context.scene.collection.children.link(collection)
    materials = {name: material(name) for name in ("Stonework", "Accents", "WindowLight", "Water")}
    assets = [builder().object(name, collection, materials) for name, builder
              in (("Storefront", facade), ("MoonObservatory", tower), ("MoonFountain", fountain))]
    source = os.environ.get("MOOPET_ARCHITECTURE_BLEND")
    if source:
        for i, obj in enumerate(assets):
            obj.location.x = (i - 1) * 1.5
        for screen in bpy.data.screens:
            for area in screen.areas:
                if area.type == "VIEW_3D":
                    area.spaces.active.shading.color_type = "VERTEX"
                    area.spaces.active.region_3d.view_distance = 5.4
        bpy.context.preferences.filepaths.save_version = 0
        bpy.ops.wm.save_as_mainfile(filepath=str(Path(source).resolve()))

    for obj in assets:
        obj.location.x = 0
        obj.select_set(True)
    output = Path(__file__).resolve().parents[1] / "public" / "models" / "landmark" / "plaza-architecture.glb"
    assert bpy.ops.export_scene.gltf(
        filepath=str(output), export_format="GLB", use_selection=True,
        export_animations=False, export_cameras=False, export_lights=False,
    ) == {"FINISHED"}


if __name__ == "__main__":
    main()
