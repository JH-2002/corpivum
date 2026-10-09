"""
Gera os corpos do twin (ADR-0028) a partir da malha base do MakeHuman que vem no MPFB2 (assets CC0).

Roda dentro do Blender, com o MPFB2 instalado e ativo:

    blender -b -P scripts/assets/build_body.py -- --out <pasta-temporária> [--variant neutral]

Para cada variante grava `body-<variante>.glb` (sem compressão) e, ao final, `calibration.json`.
Depois, `node scripts/assets/pack-models.mjs <pasta-temporária>` comprime, nomeia por hash e gera o manifesto.

O que o script faz (e o que ele garante):
- só a pele do corpo (grupo `body`): olhos, dentes, língua, geometria genital e roupas-guia são auxiliares e
  saem; sem pele, textura, UV ou rig;
- mamilos achatados (targets `nipple-*-decr`) e suavizados; região genital e rosto suavizados (rosto
  estilizado, olhos fechados pela malha);
- morphs `<região>_min`/`<região>_max` a partir dos targets de circunferência do MakeHuman, em peso 1;
- malha decimada sem shape keys e morphs transferidos por Surface Deform (o Decimate não aplica com shape keys);
- uma primitiva por região (material `region_<região>`), para o clique e o destaque por região;
- calibração em cm medida na própria malha (perímetro do fecho convexo do corte, como uma fita métrica).
"""

import argparse
import importlib
import json
import math
import os
import sys

import bmesh
import bpy
from mathutils import Vector

VARIANTS = {"feminine": 0.0, "neutral": 0.5, "masculine": 1.0}
REGIONS = ("chest", "arm", "waist", "hip", "thigh")
MATERIALS = REGIONS + ("rest",)
MEASURE_TARGETS = {
    "chest": ("torso", "measure-bust-circ"),
    "arm": ("arms", "measure-upperarm-circ"),
    "waist": ("torso", "measure-waist-circ"),
    "hip": ("torso", "measure-hips-circ"),
    "thigh": ("legs", "measure-thigh-circ"),
}
# Vértices 0..BODY_VERTS-1 formam a pele do corpo; acima disso, só geometria auxiliar (grupo `body` do MPFB2).
BODY_VERTS = 13380
TARGET_TRIANGLES = 7000
FACE_SMOOTH_ITERATIONS = 24
DETAIL_SMOOTH_ITERATIONS = 12
MAX_HOLE_EDGES = 64


# --- MPFB2 ---------------------------------------------------------------------------------------------


def mpfb(module, key):
    """Extensões do Blender ficam em pacotes de nome variável: procura o módulo pelo sufixo (padrão do MPFB2)."""
    for name in list(sys.modules):
        if name.endswith(module):
            return getattr(importlib.import_module(name), key)
    raise RuntimeError(f"MPFB2 não encontrado ({module}). Instale e ative a extensão MPFB no Blender.")


def ensure_mpfb():
    if any(name.endswith("mpfb.services.humanservice") for name in sys.modules):
        return
    for module in ("bl_ext.blender_org.mpfb", "bl_ext.user_default.mpfb", "mpfb"):
        try:
            bpy.ops.preferences.addon_enable(module=module)
            return
        except Exception:  # noqa: BLE001 - tenta o próximo nome de pacote
            continue


# --- geometria -----------------------------------------------------------------------------------------


def group_center(obj, name):
    group = obj.vertex_groups.get(name)
    if group is None:
        raise RuntimeError(f"Grupo de vértices ausente: {name}")
    pts = [obj.data.vertices[v.index].co for v in obj.data.vertices if any(g.group == group.index for g in v.groups)]
    return sum(pts, Vector()) / len(pts)


def group_indices(obj, name):
    group = obj.vertex_groups.get(name)
    if group is None:
        return set()
    return {v.index for v in obj.data.vertices if any(g.group == group.index for g in v.groups)}


def segment_t_dist(p, a, b):
    ab = b - a
    t = (p - a).dot(ab) / ab.length_squared
    return t, (a + ab * max(0.0, min(1.0, t)) - p).length


class Landmarks:
    """Marcos anatômicos do lado esquerdo (juntas do MakeHuman) e alturas do tronco, em metros."""

    def __init__(self, obj):
        c = lambda n: group_center(obj, n)  # noqa: E731
        self.shoulder, self.elbow, self.hand = c("joint-l-shoulder"), c("joint-l-elbow"), c("joint-l-hand")
        self.upper_leg, self.knee = c("joint-l-upper-leg"), c("joint-l-knee")
        self.neck = c("joint-neck")
        self.head = c("joint-head")
        self.side = 1.0 if self.shoulder.x > 0 else -1.0
        body = [obj.data.vertices[i].co for i in range(BODY_VERTS)]
        # Entreperna: ponto mais baixo da linha média abaixo do quadril.
        self.crotch_z = min(p.z for p in body if abs(p.x) < 0.01 and p.z < self.upper_leg.z + 0.1)
        self.arm_radius = 0.38 * (self.elbow - self.shoulder).length

    def torso_f(self, z):
        return (z - self.crotch_z) / (self.neck.z - self.crotch_z)

    def region(self, p):
        q = Vector((abs(p.x) * self.side, p.y, p.z))
        t, d = segment_t_dist(q, self.shoulder, self.hand)
        if 0.05 < t <= 1.0 and d < self.arm_radius:
            return "arm"
        if p.z >= self.neck.z or t > 1.0 and d < self.arm_radius * 1.6:
            return "rest"
        if p.z < self.knee.z:
            return "rest"
        if p.z < self.crotch_z:
            return "thigh"
        f = self.torso_f(p.z)
        return "hip" if f < 0.3 else "waist" if f < 0.55 else "chest"


def neighbours(bm):
    bm.verts.ensure_lookup_table()
    return {v.index: [e.other_vert(v).index for e in v.link_edges] for v in bm.verts}


def smoothed(coords, adj, selected, iterations, factor=0.5):
    """Média com os vizinhos só nos vértices escolhidos (os demais ficam presos e fazem a transição)."""
    pos = {i: coords[i].copy() for i in selected}
    for _ in range(iterations):
        nxt = {}
        for i in selected:
            ring = adj[i]
            if not ring:
                continue
            avg = sum((pos.get(j, coords[j]) for j in ring), Vector()) / len(ring)
            nxt[i] = pos[i].lerp(avg, factor)
        pos.update(nxt)
    return pos


def hull_perimeter(points):
    pts = sorted(set((round(u, 6), round(v, 6)) for u, v in points))
    if len(pts) < 3:
        return 0.0

    def cross(o, a, b):
        return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])

    lower, upper = [], []
    for p in pts:
        while len(lower) >= 2 and cross(lower[-2], lower[-1], p) <= 0:
            lower.pop()
        lower.append(p)
    for p in reversed(pts):
        while len(upper) >= 2 and cross(upper[-2], upper[-1], p) <= 0:
            upper.pop()
        upper.append(p)
    hull = lower[:-1] + upper[:-1]
    return sum(math.dist(hull[i], hull[(i + 1) % len(hull)]) for i in range(len(hull)))


def girth_cm(obj, key_index, plane_co, plane_no, near):
    """Perímetro (cm) do fecho convexo do corte da malha pelo plano, no laço mais próximo de `near`."""
    bm = bmesh.new()
    bm.from_mesh(obj.data, use_shape_key=True, shape_key_index=key_index)
    cut = bmesh.ops.bisect_plane(bm, geom=bm.verts[:] + bm.edges[:] + bm.faces[:], plane_co=plane_co,
                                 plane_no=plane_no, dist=1e-6)["geom_cut"]
    verts = {v for v in cut if isinstance(v, bmesh.types.BMVert)}
    parent = {v: v for v in verts}

    def find(v):
        while parent[v] is not v:
            parent[v] = parent[parent[v]]
            v = parent[v]
        return v

    for e in (e for e in cut if isinstance(e, bmesh.types.BMEdge)):
        a, b = e.verts
        if a in verts and b in verts:
            parent[find(a)] = find(b)
    loops = {}
    for v in verts:
        loops.setdefault(find(v), []).append(v.co.copy())
    n = plane_no.normalized()
    u = n.orthogonal().normalized()
    w = n.cross(u)
    best = min(loops.values(), key=lambda pts: ((sum(pts, Vector()) / len(pts)) - near).length)
    bm.free()
    return 100.0 * hull_perimeter([((p - plane_co).dot(u), (p - plane_co).dot(w)) for p in best])


def measure_planes(obj, lm):
    """Planos de medida de cada região, escolhidos na forma base (os mesmos para min e max)."""
    span = lm.neck.z - lm.crotch_z
    center = lambda z: Vector((0.0, 0.0, z))  # noqa: E731
    up = Vector((0.0, 0.0, 1.0))

    def scan(f0, f1, pick):
        zs = [lm.crotch_z + span * (f0 + (f1 - f0) * i / 16) for i in range(17)]
        vals = [(girth_cm(obj, 0, center(z), up, center(z)), z) for z in zs]
        return pick(vals)[1]

    planes = {
        "waist": (center(scan(0.3, 0.55, min)), up),
        "hip": (center(scan(0.05, 0.35, max)), up),
        "chest": (center(scan(0.6, 0.85, max)), up),
    }
    for name in ("waist", "hip", "chest"):
        co, no = planes[name]
        planes[name] = (co, no, co)
    thigh_z = lm.crotch_z - 0.1 * (lm.crotch_z - lm.knee.z)
    thigh_near = Vector((lm.upper_leg.x, lm.upper_leg.y, thigh_z))
    planes["thigh"] = (Vector((0.0, 0.0, thigh_z)), up, thigh_near)
    arm_co = lm.shoulder.lerp(lm.elbow, 0.55)
    planes["arm"] = (arm_co, (lm.elbow - lm.shoulder).normalized(), arm_co)
    return planes


# --- etapas --------------------------------------------------------------------------------------------


def clear_scene():
    """Cena vazia entre variantes (sem `read_factory_settings`, que desativaria o MPFB2)."""
    for obj in list(bpy.data.objects):
        bpy.data.objects.remove(obj, do_unlink=True)
    for collection in (bpy.data.meshes, bpy.data.materials):
        for block in list(collection):
            if block.users == 0:
                collection.remove(block)


def build_variant(name, gender, out_dir):
    HumanService = mpfb("mpfb.services.humanservice", "HumanService")
    TargetService = mpfb("mpfb.services.targetservice", "TargetService")
    LocationService = mpfb("mpfb.services.locationservice", "LocationService")
    targets = LocationService.get_mpfb_data("targets")

    clear_scene()
    macros = TargetService.get_default_macro_info_dict()
    macros["gender"] = gender
    human = HumanService.create_human(mask_helpers=False, feet_on_ground=True, scale=0.1, macro_detail_dict=macros)
    for target in ("nipple-point-decr", "nipple-size-decr"):
        TargetService.load_target(human, os.path.join(targets, "breast", f"{target}.target.gz"), weight=1.0)
    TargetService.bake_targets(human)
    for mod in list(human.modifiers):
        human.modifiers.remove(mod)

    lm = Landmarks(human)
    smooth_sets = {
        "detail": (group_indices(human, "nipple") | group_indices(human, "nippleTip") | group_indices(human, "genitals")),
        "face": {
            i for i in range(BODY_VERTS)
            if human.data.vertices[i].co.z > lm.neck.z + 0.03 and human.data.vertices[i].co.y < lm.head.y
        } - group_indices(human, "ears") - group_indices(human, "scalp"),
    }

    for region, (folder, stem) in MEASURE_TARGETS.items():
        for side, suffix in (("min", "decr"), ("max", "incr")):
            path = os.path.join(targets, folder, f"{stem}-{suffix}.target.gz")
            TargetService.load_target(human, path, weight=0.0, name=f"{region}_{side}")

    # Só a pele do corpo; fecha as aberturas dos olhos deixadas pela geometria auxiliar.
    bm = bmesh.new()
    bm.from_mesh(human.data)
    bm.verts.ensure_lookup_table()
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if v.index >= BODY_VERTS], context="VERTS")
    boundary = [e for e in bm.edges if e.is_boundary]
    filled = bmesh.ops.holes_fill(bm, edges=boundary, sides=MAX_HOLE_EDGES)["faces"]
    bmesh.ops.triangulate(bm, faces=filled)
    adj = neighbours(bm)
    bm.to_mesh(human.data)
    bm.free()
    human.vertex_groups.clear()

    # Suavização aplicada como deslocamento em todas as shape keys (a base e os morphs andam juntos).
    keys = human.data.shape_keys.key_blocks
    base = [k.co.copy() for k in keys[0].data]
    delta = {}
    for set_name, iterations in (("detail", DETAIL_SMOOTH_ITERATIONS), ("face", FACE_SMOOTH_ITERATIONS)):
        for i, co in smoothed(base, adj, smooth_sets[set_name], iterations).items():
            delta[i] = co - base[i]
            base[i] = co
    for key in keys:
        for i, d in delta.items():
            key.data[i].co += d

    # Altura da base e pés no chão.
    min_z = min(v.co.z for v in keys[0].data)
    for key in keys:
        for p in key.data:
            p.co.z -= min_z
    for attr in ("neck", "head", "shoulder", "elbow", "hand", "upper_leg", "knee"):
        getattr(lm, attr).z -= min_z
    lm.crotch_z -= min_z
    height_m = max(v.co.z for v in keys[0].data)

    planes = measure_planes(human, lm)
    key_index = {k.name: i for i, k in enumerate(keys)}
    calibration = {}
    for region in REGIONS:
        co, no, near = planes[region]
        calibration[region] = {
            "min": round(girth_cm(human, key_index[f"{region}_min"], co, no, near), 1),
            "base": round(girth_cm(human, 0, co, no, near), 1),
            "max": round(girth_cm(human, key_index[f"{region}_max"], co, no, near), 1),
        }

    body = decimated_with_morphs(human)
    assign_regions(body, lm)
    body.name = body.data.name = "body"
    bpy.ops.object.select_all(action="DESELECT")
    body.select_set(True)
    bpy.context.view_layer.objects.active = body
    bpy.ops.export_scene.gltf(
        filepath=os.path.join(out_dir, f"body-{name}.glb"),
        export_format="GLB",
        use_selection=True,
        export_yup=True,
        export_texcoords=False,
        export_normals=True,
        export_morph=True,
        export_morph_normal=False,
        export_materials="EXPORT",
        export_image_format="NONE",
        export_extras=False,
        export_apply=False,
        export_animations=False,
        export_skins=False,
        export_cameras=False,
        export_lights=False,
    )
    triangles = sum(len(p.vertices) - 2 for p in body.data.polygons)
    return {"baseHeightM": round(height_m, 3), "girthCm": calibration, "triangles": triangles}


def decimated_with_morphs(full):
    bpy.ops.object.select_all(action="DESELECT")
    low = full.copy()
    low.data = full.data.copy()
    bpy.context.collection.objects.link(low)
    low.shape_key_clear()
    tris = sum(len(p.vertices) - 2 for p in low.data.polygons)
    dec = low.modifiers.new("decimate", "DECIMATE")
    dec.decimate_type = "COLLAPSE"
    dec.ratio = min(1.0, TARGET_TRIANGLES / tris)
    dec.use_symmetry = True
    dec.symmetry_axis = "X"
    bpy.context.view_layer.objects.active = low
    bpy.ops.object.modifier_apply(modifier=dec.name)

    keys = full.data.shape_keys.key_blocks
    for key in keys:
        key.value = 0.0
    sd = low.modifiers.new("surface", "SURFACE_DEFORM")
    sd.target = full
    bpy.ops.object.surfacedeform_bind(modifier=sd.name)
    if not sd.is_bound:
        raise RuntimeError("Surface Deform não conseguiu ligar a malha decimada à malha completa.")

    morphs = {}
    for key in list(keys)[1:]:
        key.value = 1.0
        depsgraph = bpy.context.evaluated_depsgraph_get()
        depsgraph.update()
        evaluated = low.evaluated_get(depsgraph)
        morphs[key.name] = [v.co.copy() for v in evaluated.data.vertices]
        key.value = 0.0
    low.modifiers.remove(sd)
    low.shape_key_add(name="Basis", from_mix=False)
    for name, coords in morphs.items():
        block = low.shape_key_add(name=name, from_mix=False)
        for i, co in enumerate(coords):
            block.data[i].co = co
    for poly in low.data.polygons:
        poly.use_smooth = True
    while low.data.uv_layers:
        low.data.uv_layers.remove(low.data.uv_layers[0])
    bpy.data.objects.remove(full, do_unlink=True)
    return low


def assign_regions(obj, lm):
    obj.data.materials.clear()
    for name in MATERIALS:
        mat = bpy.data.materials.new(f"region_{name}")
        obj.data.materials.append(mat)
    index = {name: i for i, name in enumerate(MATERIALS)}
    for poly in obj.data.polygons:
        poly.material_index = index[lm.region(poly.center)]


def main():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    parser = argparse.ArgumentParser()
    parser.add_argument("--out", required=True)
    parser.add_argument("--variant", choices=sorted(VARIANTS), action="append")
    args = parser.parse_args(argv)
    os.makedirs(args.out, exist_ok=True)
    ensure_mpfb()
    result = {}
    for name in args.variant or VARIANTS:
        result[name] = build_variant(name, VARIANTS[name], args.out)
        print(f"[build_body] {name}: {json.dumps(result[name])}")
    with open(os.path.join(args.out, "calibration.json"), "w", encoding="utf-8") as f:
        json.dump({"blender": bpy.app.version_string, "variants": result}, f, indent=2)


if __name__ == "__main__":
    main()
