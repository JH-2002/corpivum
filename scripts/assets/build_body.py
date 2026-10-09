"""
Gera os corpos do twin (ADR-0028) a partir da malha base do MakeHuman que vem no MPFB2 (assets CC0).

Roda dentro do Blender, com o MPFB2 instalado e ativo:

    blender -b -P scripts/assets/build_body.py -- --out <pasta-temporária> [--variant neutral]

Para cada variante grava `body-<variante>.glb` (sem compressão) e, ao final, `calibration.json`.
Depois, `node scripts/assets/pack-models.mjs <pasta-temporária>` comprime, nomeia por hash e gera o manifesto.

O que o script faz (e o que ele garante):
- só a pele do corpo (grupo `body`): olhos, dentes, língua, geometria genital e roupas-guia são auxiliares e
  saem; sem pele, textura, UV ou rig;
- mamilos achatados (targets `nipple-*-decr`) e suavizados em cada corpo; região genital suavizada;
- morphs regionais `<região>_min`/`_max` dos targets de circunferência do MakeHuman e morph global
  `size_min`/`size_max` da macro de massa (só base de forma; o app usa só as medidas informadas);
- calibração em cm medida na malha completa (perímetro do fecho convexo do corte, como uma fita métrica);
- malha final por remesh de voxels (fecha boca, narinas e olhos; rosto de manequim), decimada e cortada nos
  planos entre regiões; morphs transferidos da malha completa por Surface Deform;
- uma primitiva por região (material `region_<região>`), para o clique e o destaque por região.
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
TARGET_TRIANGLES = 8500
# Remesh por voxels: fecha boca, narinas e olhos e deixa a superfície uniforme (rosto estilizado).
VOXEL_SIZE_M = 0.008
FACE_SMOOTH_ITERATIONS = 30
SURFACE_SMOOTH_ITERATIONS = 4
LOW_SMOOTH_ITERATIONS = 5
# Meia largura do rosto suavizado (as orelhas ficam de fora).
FACE_HALF_WIDTH_M = 0.06
DETAIL_SMOOTH_ITERATIONS = 12
MAX_HOLE_EDGES = 160
# Início do braço ao longo do eixo ombro → mão (fração).
ARM_START_T = 0.05
# Morph global de tamanho: macro `weight` do MakeHuman em 0 e 1 (a variante usa 0,5).
SIZE_MORPHS = {"size_min": 0.0, "size_max": 1.0}
# Raio suavizado em volta de cada mamilo (o grupo `nipple` cobre só a aréola; a borda ficaria marcada).
NIPPLE_RADIUS_M = 0.035


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


def detail_vertices(obj):
    """Mamilos (com folga em volta) e região genital do corpo, para suavizar."""
    nipples = group_indices(obj, "nipple") | group_indices(obj, "nippleTip")
    return near_any(obj, nipples, NIPPLE_RADIUS_M) | group_indices(obj, "genitals")


def near_any(obj, indices, radius):
    """Vértices do corpo a até `radius` do centro de cada lado (esquerdo/direito) do conjunto `indices`."""
    centers = []
    for side in (1, -1):
        pts = [obj.data.vertices[i].co for i in indices if obj.data.vertices[i].co.x * side > 0]
        if pts:
            centers.append(sum(pts, Vector()) / len(pts))
    return {
        i for i in range(BODY_VERTS)
        if any((obj.data.vertices[i].co - c).length < radius for c in centers)
    }


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
        self.nipple_z = c("nipple").z
        self.side = 1.0 if self.shoulder.x > 0 else -1.0
        body = [obj.data.vertices[i].co for i in range(BODY_VERTS)]
        # Entreperna: ponto mais baixo da linha média abaixo do quadril.
        self.crotch_z = min(p.z for p in body if abs(p.x) < 0.01 and p.z < self.upper_leg.z + 0.1)
        self.arm_radius = 0.38 * (self.elbow - self.shoulder).length

    def boundary_planes(self):
        """Planos das bordas entre regiões (mesmos limites de egion): alturas e cortes do braço."""
        up = Vector((0.0, 0.0, 1.0))
        span = self.neck.z - self.crotch_z
        planes = [(Vector((0.0, 0.0, z)), up) for z in (
            self.knee.z, self.crotch_z, self.crotch_z + 0.3 * span, self.crotch_z + 0.55 * span, self.neck.z,
        )]
        for side in (1.0, -1.0):
            mirror = lambda v: Vector((v.x * side * self.side, v.y, v.z))  # noqa: E731
            shoulder, hand = mirror(self.shoulder), mirror(self.hand)
            axis = (hand - shoulder).normalized()
            planes += [(shoulder.lerp(hand, ARM_START_T), axis), (hand, axis)]
        return planes

    def torso_f(self, z):
        return (z - self.crotch_z) / (self.neck.z - self.crotch_z)

    def region(self, p):
        q = Vector((abs(p.x) * self.side, p.y, p.z))
        t, d = segment_t_dist(q, self.shoulder, self.hand)
        if ARM_START_T < t <= 1.0 and d < self.arm_radius:
            return "arm"
        if p.z >= self.neck.z or (t > 1.0 and d < self.arm_radius * 4):
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
        # Busto: na altura dos mamilos, como a fita métrica.
        "chest": (center(lm.nipple_z), up),
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

    def baked_human(body_mass):
        macros = TargetService.get_default_macro_info_dict()
        macros["gender"] = gender
        macros["weight"] = body_mass
        obj = HumanService.create_human(mask_helpers=False, feet_on_ground=True, scale=0.1, macro_detail_dict=macros)
        for target in ("nipple-point-decr", "nipple-size-decr"):
            TargetService.load_target(obj, os.path.join(targets, "breast", f"{target}.target.gz"), weight=1.0)
        TargetService.bake_targets(obj)
        for mod in list(obj.modifiers):
            obj.modifiers.remove(mod)
        return obj

    # Tamanho global: corpos menor e maior da própria macro de massa do MakeHuman (mesma topologia). Só uma base
    # de forma; quem decide o quanto usar são as medidas informadas (bodyMorphWeights), nunca o peso da pessoa.
    clear_scene()
    size_coords, size_detail = {}, {}
    for key_name, body_mass in SIZE_MORPHS.items():
        obj = baked_human(body_mass)
        size_coords[key_name] = [v.co.copy() for v in obj.data.vertices]
        # Os mamilos mudam de lugar com o tamanho: cada corpo é suavizado nos próprios.
        size_detail[key_name] = detail_vertices(obj)
        bpy.data.objects.remove(obj, do_unlink=True)
    human = baked_human(0.5)

    lm = Landmarks(human)
    detail = detail_vertices(human)
    head = [i for i in range(BODY_VERTS) if human.data.vertices[i].co.z > lm.neck.z + 0.03]
    head_center = sum((human.data.vertices[i].co for i in head), Vector()) / len(head)

    for region, (folder, stem) in MEASURE_TARGETS.items():
        for side, suffix in (("min", "decr"), ("max", "incr")):
            path = os.path.join(targets, folder, f"{stem}-{suffix}.target.gz")
            TargetService.load_target(human, path, weight=0.0, name=f"{region}_{side}")
    for key_name, coords in size_coords.items():
        block = human.shape_key_add(name=key_name, from_mix=False)
        for point, co in zip(block.data, coords):
            point.co = co

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

    # Mamilos e região genital: na base, deslocamento aplicado também aos morphs de circunferência; os corpos de
    # tamanho são suavizados nos próprios mamilos.
    keys = human.data.shape_keys.key_blocks
    base = [k.co.copy() for k in keys[0].data]
    delta = {i: co - base[i] for i, co in smoothed(base, adj, detail, DETAIL_SMOOTH_ITERATIONS).items()}
    for key in keys:
        if key.name in size_detail:
            coords = [p.co.copy() for p in key.data]
            for i, co in smoothed(coords, adj, size_detail[key.name], DETAIL_SMOOTH_ITERATIONS).items():
                key.data[i].co = co
            continue
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
    lm.nipple_z -= min_z
    head_center.z -= min_z
    height_m = max(v.co.z for v in keys[0].data)
    # Fora do modo de edição, os vértices da malha não acompanham a Basis: sem isto, a cópia decimada voltaria à
    # forma sem suavização e a translação dos pés iria parar nos morphs.
    for vertex, point in zip(human.data.vertices, keys[0].data):
        vertex.co = point.co
    human.data.update()

    planes = measure_planes(human, lm)
    key_index = {k.name: i for i, k in enumerate(keys)}
    calibration = {}
    for region in REGIONS:
        co, no, near = planes[region]
        calibration[region] = {
            "min": round(girth_cm(human, key_index[f"{region}_min"], co, no, near), 1),
            "base": round(girth_cm(human, 0, co, no, near), 1),
            "max": round(girth_cm(human, key_index[f"{region}_max"], co, no, near), 1),
            "sizeMin": round(girth_cm(human, key_index["size_min"], co, no, near), 1),
            "sizeMax": round(girth_cm(human, key_index["size_max"], co, no, near), 1),
        }

    body = remeshed_with_morphs(human, head_center, lm)
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


def remeshed_with_morphs(full, head_center, lm):
    """Malha final: remesh por voxels da malha completa, rosto suavizado na topologia nova, decimada; os morphs
    vêm da malha completa por Surface Deform (que não exige a mesma topologia)."""
    bpy.ops.object.select_all(action="DESELECT")
    low = full.copy()
    low.data = full.data.copy()
    bpy.context.collection.objects.link(low)
    low.shape_key_clear()
    bpy.context.view_layer.objects.active = low
    remesh = low.modifiers.new("remesh", "REMESH")
    remesh.mode = "VOXEL"
    remesh.voxel_size = VOXEL_SIZE_M
    remesh.adaptivity = 0.0
    bpy.ops.object.modifier_apply(modifier=remesh.name)

    bm = bmesh.new()
    bm.from_mesh(low.data)
    coords = [v.co.copy() for v in bm.verts]
    face = {
        v.index for v in bm.verts
        if v.co.z > lm.neck.z + 0.03 and v.co.y < head_center.y and abs(v.co.x) < FACE_HALF_WIDTH_M
    }
    adj = neighbours(bm)
    # Tira os degraus do voxel (leve, na malha toda) e depois estiliza o rosto.
    for i, co in smoothed(coords, adj, set(range(len(coords))), SURFACE_SMOOTH_ITERATIONS).items():
        coords[i] = co
    for i, co in smoothed(coords, adj, face, FACE_SMOOTH_ITERATIONS).items():
        coords[i] = co
    for v in bm.verts:
        v.co = coords[v.index]
    bm.to_mesh(low.data)
    bm.free()

    tris = sum(len(p.vertices) - 2 for p in low.data.polygons)
    dec = low.modifiers.new("decimate", "DECIMATE")
    dec.decimate_type = "COLLAPSE"
    dec.ratio = min(1.0, TARGET_TRIANGLES / tris)
    dec.use_symmetry = True
    dec.symmetry_axis = "X"
    bpy.ops.object.modifier_apply(modifier=dec.name)

    # Corta a malha nos planos que separam as regiões: nenhum triângulo atravessa uma borda (borda reta).
    bm = bmesh.new()
    bm.from_mesh(low.data)
    # Antes, tira as dobrinhas que a decimação deixa em vincos (ex.: sob o peito), que lembrariam mamilos.
    coords = [v.co.copy() for v in bm.verts]
    for i, co in smoothed(coords, neighbours(bm), set(range(len(coords))), LOW_SMOOTH_ITERATIONS, 0.3).items():
        bm.verts[i].co = co
    for co, no in lm.boundary_planes():
        geom = bm.verts[:] + bm.edges[:] + bm.faces[:]
        bmesh.ops.bisect_plane(bm, geom=geom, plane_co=co, plane_no=no, dist=1e-5)
    bm.to_mesh(low.data)
    bm.free()
    assign_regions(low, lm)

    keys = full.data.shape_keys.key_blocks
    for key in keys:
        key.value = 0.0
    # O Surface Deform recusa alvo com polígono côncavo (a suavização do rosto cria alguns): alvo triangulado.
    full.modifiers.new("triangulate", "TRIANGULATE")
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
