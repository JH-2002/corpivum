"""
Gera os corpos do twin (ADR-0028) a partir da malha base do MakeHuman que vem no MPFB2 (assets CC0).

Roda dentro do Blender, com o MPFB2 instalado e ativo:

    blender -b -P scripts/assets/build_body.py -- --out <pasta-temporária> [--variant feminine]

Para cada variante grava `body-<variante>.glb` (sem compressão) e, ao final, `calibration.json`.
Depois, `node scripts/assets/pack-models.mjs <pasta-temporária>` comprime, nomeia por hash e gera o manifesto.

O que o script faz (e o que ele garante):
- só a pele do corpo (grupo `body`): olhos, dentes, língua, geometria genital e roupas-guia são auxiliares e
  saem; sem pele, textura, UV ou rig;
- mamilos achatados (targets `nipple-*-decr`) e suavizados em cada corpo; região genital suavizada;
- forma fixa por modelo e base ajustada às circunferências de referência (`fit_base`), conferida na malha final;
- morphs regionais `<região>_min`/`_max` próprios e localizados (faixas no tronco, eixo do osso nos membros) e
  morph global `size_min`/`size_max` da macro de massa (só base de forma; o app usa só as medidas informadas);
- calibração em cm medida na malha final pelo protocolo do README (fecho convexo do corte, como uma fita),
  com o efeito cruzado entre regiões e os planos de medida para o teste de geometria do CI;
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

# Forma de cada variante: macros do MakeHuman e targets (peso) aplicados à base e aos corpos de tamanho, para
# os sexos se distinguirem à primeira vista. MakeHuman: gênero 0 = feminino, 1 = masculino.
# Forma de cada modelo. Dois grupos de parâmetros, nenhum deles exposto na interface:
# - `macros`/`targets`/`mass`: forma fixa do modelo (largura de ombro, profundidade do tórax, projeção do busto,
#   glúteos, abdômen), do MakeHuman. Ninguém mede esses parâmetros; eles só aproximam a forma da referência.
# - `reference`: circunferências da base em cm (docs/specs/twin-ajustes-corporais.md, seção 4). O ajuste
#   automático (`fit_base`) leva a malha final até elas, dentro de `REFERENCE_TOLERANCE`. Não são padrão de saúde
#   nem de beleza, e a relação cintura/quadril que delas resulta é só interna (LEG-M06).
# MakeHuman: gênero 0 = feminino, 1 = masculino.
VARIANTS = {
    "feminine": {
        "macros": {"gender": 0.0, "proportions": 1.0, "cupsize": 0.6, "firmness": 0.7},
        "targets": {
            "measure-shoulder-dist-decr": 0.6,
            "torso-vshape-decr": 0.5,
            "hip-scale-horiz-incr": 0.2,
            "buttocks-volume-incr": 0.3,
            "stomach-pregnant-decr": 0.5,
            "neck-scale-horiz-decr": 0.5,
            "measure-neck-circ-decr": 0.5,
        },
        "reference": {"chest": 86.0, "arm": 25.0, "waist": 68.0, "hip": 96.0, "thigh": 54.0},
    },
    "masculine": {
        "macros": {"gender": 1.0, "proportions": 1.0, "muscle": 0.5},
        "targets": {
            "measure-shoulder-dist-incr": 0.35,
            "torso-vshape-incr": 0.3,
            "torso-muscle-pectoral-decr": 0.3,
            "stomach-pregnant-decr": 0.5,
            "bulge-decr": 1.0,
        },
        "reference": {"chest": 96.0, "arm": 31.0, "waist": 80.0, "hip": 98.0, "thigh": 57.0},
    },
}
REGIONS = ("chest", "arm", "waist", "hip", "thigh")
MATERIALS = REGIONS + ("rest",)
# Tolerância da base × referência, medida na malha final: máx(0,5 cm; 1%) (plano aprovado). O ajuste mira metade.
def reference_tolerance(cm):
    return max(0.5, 0.01 * cm)


# Morphs regionais próprios e localizados (seções 5–7 da especificação): por unidade, a escala radial.
# Tronco (peito, cintura, quadril): faixa em altura (gaussiana com sigma acima/abaixo em m) em volta do centro de
# cada fatia, sem braços; para a frente só `front` do deslocamento. As faixas se sobrepõem (sem degrau entre elas);
# o efeito de cada morph nas outras regiões vai para a calibração (`cross`) e o app compensa. O peito sobe pouco
# (ombros e pescoço parados); o quadril desce coxa abaixo, sumindo em `below` m (sem vinco na entreperna). Membros (braço, coxa): em volta do eixo do osso, com subida e
# descida ao longo dele (frações do eixo) para não mexer em ombro, cotovelo, virilha e joelho.
REGION_SCALE = {"min": -0.22, "max": 0.24}
TORSO_MORPHS = {
    "chest": {"up": 0.055, "down": 0.09, "front": 0.8, "reach": (0.8, 1.0)},
    "waist": {"up": 0.09, "down": 0.09, "front": 0.5, "reach": (0.7, 0.9)},
    "hip": {"up": 0.09, "down": 0.09, "front": 0.6, "reach": (1.8, 2.2), "below": 0.09},
}
LIMB_MORPHS = {
    # Começa longe da axila: engrossado, o braço não encosta no tronco na altura do peito.
    "arm": {"ramp_in": (0.25, 0.45), "ramp_out": (0.8, 1.0)},
    "thigh": {"ramp_in": (0.0, 0.0), "ramp_out": (0.75, 0.95), "groin": 0.07},
}
# Ajuste da base: iterações, passo máximo por iteração (unidades de morph) e total máximo antes de exigir
# revisão da forma fixa do modelo.
FIT_ITERATIONS = 10
FIT_STEP_MAX = 0.6
FIT_TOTAL_MAX = 1.5
FIT_PASSES = 3
# Vértices 0..BODY_VERTS-1 formam a pele do corpo; acima disso, só geometria auxiliar (grupo `body` do MPFB2).
BODY_VERTS = 13380
TARGET_TRIANGLES = 8500
# Remesh por voxels: fecha boca, narinas e olhos e deixa a superfície uniforme (rosto estilizado).
VOXEL_SIZE_M = 0.008
FACE_SMOOTH_ITERATIONS = 30
SURFACE_SMOOTH_ITERATIONS = 4
LOW_SMOOTH_ITERATIONS = 5
# Face cuja normal se afasta mais que ~72° da média das vizinhas é dobra (vinco sob o peito, esterno): colapsa.
FOLD_MIN_DOT = 0.3
# Meia largura do rosto suavizado (as orelhas ficam de fora).
FACE_HALF_WIDTH_M = 0.06
DETAIL_SMOOTH_ITERATIONS = 12
MAX_HOLE_EDGES = 160
# Início do braço ao longo do eixo ombro → mão (fração).
ARM_START_T = 0.05
# Morph global de tamanho: macro `weight` do MakeHuman em 0 e 1 (a base usa `mass` da variante, 0,5 por padrão).
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


def smoothstep(edge0, edge1, x):
    t = min(1.0, max(0.0, (x - edge0) / (edge1 - edge0)))
    return t * t * (3 - 2 * t)


def torso_slices(coords, lm, indices):
    """Centro (em y) de cada fatia de 1 cm do tronco: x = 0 (simetria), y = meio entre frente e costas."""
    slices = {}
    for i in indices:
        key = round(coords[i].z * 100)
        lo, hi = slices.get(key, (math.inf, -math.inf))
        slices[key] = (min(lo, coords[i].y), max(hi, coords[i].y))
    return {k: (lo + hi) / 2 for k, (lo, hi) in slices.items()}


def torso_morph(coords, lm, region, center_z, scale):
    """Morph de uma faixa do tronco: escala radial em volta do centro de cada fatia, gaussiana em altura em torno
    de `center_z`, nada perto dos braços; para a frente (-Y), só `front` do deslocamento. O quadril some na
    entreperna (continuidade com as coxas)."""
    cfg = TORSO_MORPHS[region]
    below = cfg.get("below", 0.0)
    regions = ("chest", "waist", "hip", "thigh") if below else ("chest", "waist", "hip")
    torso = [
        i for i in range(len(coords))
        if lm.region(coords[i]) in regions and coords[i].z > lm.crotch_z - below
    ]
    centers = torso_slices(coords, lm, torso)
    out = [c.copy() for c in coords]
    for i in torso:
        p = coords[i]
        sigma = cfg["up"] if p.z > center_z else cfg["down"]
        weight = math.exp(-0.5 * ((p.z - center_z) / sigma) ** 2)
        weight *= 1.0 - smoothstep(cfg["reach"][0], cfg["reach"][1], abs(p.x) / abs(lm.shoulder.x))
        if below:
            weight *= smoothstep(lm.crotch_z - below, lm.crotch_z, p.z)
        else:
            weight *= smoothstep(lm.crotch_z, lm.crotch_z + 0.06, p.z)
        dy = p.y - centers[round(p.z * 100)]
        if dy < 0:
            dy *= cfg["front"]
        out[i] = p + Vector((p.x, dy, 0.0)) * (weight * scale)
    return out


def limb_morph(coords, lm, region, scale):
    """Morph de braço ou coxa: escala radial em volta do eixo do osso (ombro→cotovelo, quadril→joelho), com subida
    e descida ao longo dele; ombro, cotovelo, virilha e joelho ficam parados."""
    cfg = LIMB_MORPHS[region]
    a, b = (lm.shoulder, lm.elbow) if region == "arm" else (lm.upper_leg, lm.knee)
    out = [c.copy() for c in coords]
    for i, p in enumerate(coords):
        if lm.region(p) != region:
            continue
        side = 1.0 if p.x * lm.side >= 0 else -1.0
        q = Vector((p.x * side, p.y, p.z))  # lado do marco (esquerdo)
        ab = b - a
        t = (q - a).dot(ab) / ab.length_squared
        weight = 1.0 - smoothstep(cfg["ramp_out"][0], cfg["ramp_out"][1], t)
        if cfg["ramp_in"][1] > cfg["ramp_in"][0]:
            weight *= smoothstep(cfg["ramp_in"][0], cfg["ramp_in"][1], t)
        if region == "thigh":
            weight *= smoothstep(lm.crotch_z, lm.crotch_z - cfg["groin"], p.z)
        radial = q - (a + ab * t)
        moved = q + radial * (weight * scale)
        out[i] = Vector((moved.x * side, moved.y, moved.z))
    return out


def region_morph(coords, lm, planes, region, scale):
    if region in TORSO_MORPHS:
        return torso_morph(coords, lm, region, planes[region][0].z, scale)
    return limb_morph(coords, lm, region, scale)

def body_breadths(coords, lm, hip_z):
    """Diagnóstico da silhueta: largura nos ombros (deltoides) e no quadril, em cm."""
    shoulders = [p.x for p in coords if abs(p.z - lm.shoulder.z) < 0.03]
    hips = [p.x for p in coords if abs(p.z - hip_z) < 0.01 and lm.region(p) in ("hip", "waist", "thigh")]
    return round(100 * (max(shoulders) - min(shoulders)), 1), round(100 * (max(hips) - min(hips)), 1)


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
        """Planos das bordas entre regiões (mesmos limites de `region`): alturas e cortes do braço."""
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
        # Mão e dedos: além do punho, perto do eixo e do lado de fora do quadril (sem pegar a lateral da coxa).
        hand = t > 1.0 and d < self.arm_radius * 2.5 and abs(p.x) > 0.8 * abs(self.hand.x)
        if p.z >= self.neck.z or hand:
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


def girth_cm(mesh, coords, plane_co, plane_no, near):
    """Perímetro (cm) do fecho convexo do corte da malha (com as posições `coords`) pelo plano, no laço mais
    próximo de `near`: a fita métrica passa por cima das concavidades (protocolo do README)."""
    bm = bmesh.new()
    bm.from_mesh(mesh)
    bm.verts.ensure_lookup_table()
    for v in bm.verts:
        v.co = coords[v.index]
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


def measure_planes(mesh, coords, lm):
    """Protocolo de medição (README): plano, normal e ponto de referência do laço de cada circunferência.
    Peito: horizontal nos mamilos. Cintura: horizontal de menor circunferência entre 30% e 55% da altura
    entreperna→pescoço. Quadril: horizontal de maior circunferência entre 5% e 35%. Coxa: horizontal a 10% da
    distância entreperna→joelho. Braço: perpendicular ao úmero, a 55% de ombro→cotovelo."""
    span = lm.neck.z - lm.crotch_z
    center = lambda z: Vector((0.0, 0.0, z))  # noqa: E731
    up = Vector((0.0, 0.0, 1.0))

    def scan(f0, f1, pick):
        zs = [lm.crotch_z + span * (f0 + (f1 - f0) * i / 24) for i in range(25)]
        return pick((girth_cm(mesh, coords, center(z), up, center(z)), z) for z in zs)[1]

    planes = {
        "chest": (center(lm.nipple_z), up, center(lm.nipple_z)),
        "waist": (center(scan(0.3, 0.55, min)), up, None),
        "hip": (center(scan(0.05, 0.35, max)), up, None),
    }
    for name in ("waist", "hip"):
        co, no, _ = planes[name]
        planes[name] = (co, no, co)
    thigh_z = lm.crotch_z - 0.1 * (lm.crotch_z - lm.knee.z)
    planes["thigh"] = (center(thigh_z), up, Vector((lm.upper_leg.x, lm.upper_leg.y, thigh_z)))
    arm_co = lm.shoulder.lerp(lm.elbow, 0.55)
    planes["arm"] = (arm_co, (lm.elbow - lm.shoulder).normalized(), arm_co)
    return planes


def girths(mesh, coords, planes):
    return {r: girth_cm(mesh, coords, *planes[r]) for r in REGIONS}


def to_gltf(v):
    """Blender (Z para cima, frente -Y) → glTF (Y para cima, frente +Z)."""
    return [round(v.x, 5), round(v.z, 5), round(-v.y, 5)]

# --- etapas --------------------------------------------------------------------------------------------


def clear_scene():
    """Cena vazia entre variantes (sem `read_factory_settings`, que desativaria o MPFB2)."""
    for obj in list(bpy.data.objects):
        bpy.data.objects.remove(obj, do_unlink=True)
    for collection in (bpy.data.meshes, bpy.data.materials):
        for block in list(collection):
            if block.users == 0:
                collection.remove(block)


def fit_base(mesh, base, lm, planes, targets):
    """Ajusta a base com os próprios morphs regionais até cada circunferência (malha completa) chegar ao alvo.
    Os parâmetros fixos do modelo já devem deixar a base perto da referência: um ajuste grande é erro de forma."""
    coords = [c.copy() for c in base]
    total = dict.fromkeys(REGIONS, 0.0)
    for _ in range(FIT_ITERATIONS):
        current = girths(mesh, coords, planes)
        errors = {r: targets[r] - current[r] for r in REGIONS}
        if all(abs(e) < 0.1 for e in errors.values()):
            break
        for region, error in errors.items():
            if abs(error) < 0.1:
                continue
            scale = REGION_SCALE["max"] if error > 0 else REGION_SCALE["min"]
            moved = region_morph(coords, lm, planes, region, scale)
            slope = girth_cm(mesh, moved, *planes[region]) - current[region]
            if abs(slope) < 1e-3:
                raise RuntimeError(f"Morph de {region} não muda a circunferência medida.")
            weight = min(FIT_STEP_MAX, max(0.0, error / slope))
            coords = [c + (m - c) * weight for c, m in zip(coords, moved)]
            total[region] += weight if error > 0 else -weight
    for region, amount in total.items():
        if abs(amount) > FIT_TOTAL_MAX:
            raise RuntimeError(
                f"Ajuste de {region} grande demais ({amount:.2f} unidades): revise a forma fixa do modelo."
            )
    return coords


def full_with_keys(mesh, keys):
    """Objeto com a malha completa e as shape keys dadas (a primeira é a base)."""
    obj = bpy.data.objects.new("full", mesh.copy())
    bpy.context.collection.objects.link(obj)
    base = keys["Basis"]
    for vertex, co in zip(obj.data.vertices, base):
        vertex.co = co
    obj.data.update()
    for name, coords in keys.items():
        block = obj.shape_key_add(name=name, from_mix=False)
        for point, co in zip(block.data, coords):
            point.co = co
    return obj


def key_coords(obj, name):
    return [p.co.copy() for p in obj.data.shape_keys.key_blocks[name].data]


def build_variant(name, config, out_dir):
    HumanService = mpfb("mpfb.services.humanservice", "HumanService")
    TargetService = mpfb("mpfb.services.targetservice", "TargetService")

    def target_path(stem):
        path = TargetService.target_full_path(stem)
        if path is None or os.path.basename(path).split(".")[0] != stem:
            raise RuntimeError(f"Target do MakeHuman não encontrado: {stem}")
        return path

    def baked_human(body_mass):
        macros = TargetService.get_default_macro_info_dict()
        macros.update(config["macros"])
        macros["weight"] = body_mass
        obj = HumanService.create_human(mask_helpers=False, feet_on_ground=True, scale=0.1, macro_detail_dict=macros)
        shape = {**config["targets"], "nipple-point-decr": 1.0, "nipple-size-decr": 1.0}
        for stem, weight in shape.items():
            TargetService.load_target(obj, target_path(stem), weight=weight)
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
        size_coords[key_name] = [v.co.copy() for v in obj.data.vertices][:BODY_VERTS]
        # Os mamilos mudam de lugar com o tamanho: cada corpo é suavizado nos próprios.
        size_detail[key_name] = detail_vertices(obj)
        bpy.data.objects.remove(obj, do_unlink=True)
    human = baked_human(config.get("mass", 0.5))
    lm = Landmarks(human)
    detail = detail_vertices(human)
    head = [i for i in range(BODY_VERTS) if human.data.vertices[i].co.z > lm.neck.z + 0.03]
    head_center = sum((human.data.vertices[i].co for i in head), Vector()) / len(head)

    # Só a pele do corpo (a geometria auxiliar sai antes de medir: a genital cruzaria o plano do quadril); fecha
    # as aberturas dos olhos.
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
    mesh = human.data.copy()
    bpy.data.objects.remove(human, do_unlink=True)

    # Mamilos e região genital suavizados em cada corpo (base e tamanhos); pés no chão pela base.
    base = [v.co.copy() for v in mesh.vertices]
    for i, co in smoothed(base, adj, detail, DETAIL_SMOOTH_ITERATIONS).items():
        base[i] = co
    for key_name, coords in size_coords.items():
        for i, co in smoothed(coords, adj, size_detail[key_name], DETAIL_SMOOTH_ITERATIONS).items():
            coords[i] = co
    min_z = min(p.z for p in base)
    for coords in (base, *size_coords.values()):
        for p in coords:
            p.z -= min_z
    for attr in ("neck", "head", "shoulder", "elbow", "hand", "upper_leg", "knee"):
        getattr(lm, attr).z -= min_z
    lm.crotch_z -= min_z
    lm.nipple_z -= min_z
    head_center.z -= min_z
    height_m = max(p.z for p in base)
    size_delta = {k: [c - b for c, b in zip(coords, base)] for k, coords in size_coords.items()}

    planes = measure_planes(mesh, base, lm)
    reference = config["reference"]
    targets = dict(reference)
    low = None
    for attempt in range(1, FIT_PASSES + 1):
        fitted = fit_base(mesh, base, lm, planes, targets)
        keys = {"Basis": fitted}
        for region in REGIONS:
            for side, scale in REGION_SCALE.items():
                keys[f"{region}_{side}"] = region_morph(fitted, lm, planes, region, scale)
        for key_name, delta in size_delta.items():
            keys[key_name] = [b + d for b, d in zip(fitted, delta)]
        if low is not None:
            bpy.data.objects.remove(low, do_unlink=True)
        low = remeshed_with_morphs(full_with_keys(mesh, keys), head_center, lm)
        # Base medida na malha final (a que a pessoa vê): o remesh e a decimação encolhem um pouco.
        drawn = girths(low.data, key_coords(low, "Basis"), planes)
        errors = {r: reference[r] - drawn[r] for r in REGIONS}
        print(f"[build_body] {name} passada {attempt}: " + ", ".join(f"{r} {drawn[r]:.1f}" for r in REGIONS))
        if all(abs(errors[r]) <= reference_tolerance(reference[r]) / 2 for r in REGIONS):
            break
        for region in REGIONS:
            targets[region] += errors[region]
    for region in REGIONS:
        if abs(errors[region]) > reference_tolerance(reference[region]):
            raise RuntimeError(f"{name}: {region} {drawn[region]:.1f} cm fora da referência {reference[region]}.")

    # Calibração na malha final. `cross`: circunferência desta região com o morph de OUTRA região em 1 (só os
    # efeitos acima de 0,05 cm); o app resolve os pesos juntos para cada medida informada sair certa.
    calibration = {}
    for region in REGIONS:
        measure = lambda key: round(girth_cm(low.data, key_coords(low, key), *planes[region]), 2)  # noqa: E731
        base_cm = measure("Basis")
        cross = {}
        for other in REGIONS:
            if other == region:
                continue
            for side in REGION_SCALE:
                value = measure(f"{other}_{side}")
                if abs(value - base_cm) > 0.05:
                    cross[f"{other}_{side}"] = value
        calibration[region] = {
            "min": measure(f"{region}_min"),
            "base": base_cm,
            "max": measure(f"{region}_max"),
            "sizeMin": measure("size_min"),
            "sizeMax": measure("size_max"),
            "cross": cross,
        }

    low.name = low.data.name = "body"
    bpy.ops.object.select_all(action="DESELECT")
    low.select_set(True)
    bpy.context.view_layer.objects.active = low
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
    triangles = sum(len(p.vertices) - 2 for p in low.data.polygons)
    shoulder_cm, hip_cm = body_breadths(key_coords(low, "Basis"), lm, planes["hip"][0].z)
    return {
        "baseHeightM": round(height_m, 3),
        "girthCm": calibration,
        # Planos do protocolo em coordenadas glTF, para o teste de geometria no CI medir a malha final.
        "planes": {
            r: {"point": to_gltf(co), "normal": to_gltf(no), "near": to_gltf(near)}
            for r, (co, no, near) in planes.items()
        },
        "triangles": triangles,
        # Diagnóstico interno (nunca vai à interface, LEG-M06).
        "silhouette": {
            "shoulderCm": shoulder_cm,
            "hipCm": hip_cm,
            "waistToHip": round(calibration["waist"]["base"] / calibration["hip"]["base"], 2),
        },
    }

def remove_folds(bm, passes=4):
    """Colapsa faces dobradas sobre si mesmas (normal contra a das vizinhas): a decimação as deixa em vincos,
    como o do esterno, e elas aparecem como uma fenda escura."""
    for _ in range(passes):
        bm.normal_update()
        folded = []
        for face in bm.faces:
            ring = [g for e in face.edges for g in e.link_faces if g is not face]
            avg = sum((g.normal for g in ring), Vector())
            if avg.length > 1e-9 and face.normal.dot(avg.normalized()) < FOLD_MIN_DOT:
                folded.append(face)
        if not folded:
            return
        edges = list({e for face in folded for e in face.edges})
        bmesh.ops.collapse(bm, edges=edges, uvs=False)
    bm.normal_update()


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
    remove_folds(bm)
    for co, no in lm.boundary_planes():
        geom = bm.verts[:] + bm.edges[:] + bm.faces[:]
        bmesh.ops.bisect_plane(bm, geom=geom, plane_co=co, plane_no=no, dist=1e-5)
    # Sem faces degeneradas nem invertidas (a decimação deixa algumas em vincos, como o do esterno).
    bmesh.ops.dissolve_degenerate(bm, edges=bm.edges[:], dist=1e-5)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
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
        # Reaproveita o material de uma passada anterior: um novo viraria `region_x.001` e o app não o reconheceria.
        mat = bpy.data.materials.get(f"region_{name}") or bpy.data.materials.new(f"region_{name}")
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
