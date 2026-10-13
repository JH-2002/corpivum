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
- pose natural: braços a 12–15° da vertical e mãos ao lado das coxas, pelo rig `default` do MPFB2 (só para
  posar; sai antes da exportação), com folga entre braço e tronco conferida também nos morphs extrapolados;
- forma fixa por modelo e base ajustada às circunferências de referência (`fit_base`), conferida na malha final;
- morphs regionais `<região>_min`/`_max` próprios e localizados (faixas no tronco, eixo do osso nos membros) e
  morph global `size_min`/`size_max` da macro de massa (só base de forma; o app usa só as medidas informadas);
- calibração em cm medida na malha final pelo protocolo do README (fecho convexo do corte, como uma fita; tronco
  e coxa por baixo dos braços), com o efeito cruzado entre regiões e os planos de medida para o teste do CI;
- malha final por remesh de voxels na pose A (fecha boca, narinas e olhos; rosto de manequim; braço e tronco
  não se fundem), decimada e cortada nos planos entre regiões; a pose e os morphs vêm da malha completa, cada
  vértice preso ao triângulo mais próximo;
- uma primitiva por região (material `region_<região>`; braço = o que se move com o braço nos pesos do rig),
  para o clique e o destaque por região.
"""

import argparse
import importlib
import json
import math
import os
import sys

import bmesh
import bpy
from mathutils import Matrix, Vector
from mathutils.bvhtree import BVHTree
from mathutils.geometry import barycentric_transform
from mathutils.kdtree import KDTree

# Forma de cada modelo. Três grupos de parâmetros, nenhum deles exposto na interface:
# - `macros`/`targets`/`mass`: forma fixa do modelo (largura de ombro, profundidade do tórax, projeção do busto,
#   glúteos, abdômen), do MakeHuman. Ninguém mede esses parâmetros; eles só aproximam a forma da referência.
#   No masculino, ombro mais estreito que o padrão do MakeHuman e peito pela profundidade do tórax (não pela
#   largura, que encostaria o tronco no braço caído).
# - `pose` (graus): úmero em relação à vertical (`arm`, medido entre as juntas de ombro e cotovelo), clavícula
#   baixada (`clavicle`: trapézio inclinado, sem linha reta do pescoço ao ombro), flexão que sobra no cotovelo
#   (`elbow`) e giro do antebraço para as palmas ficarem voltadas para as coxas (`twist`).
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
        "pose": {"arm": 14.5, "clavicle": 4.0, "elbow": 15.0, "twist": 30.0},
        "reference": {"chest": 86.0, "arm": 25.0, "waist": 68.0, "hip": 96.0, "thigh": 54.0},
    },
    "masculine": {
        "macros": {"gender": 1.0, "proportions": 1.0, "muscle": 0.5},
        "targets": {
            "measure-shoulder-dist-decr": 0.3,
            "torso-vshape-incr": 0.15,
            "torso-scale-depth-incr": 0.3,
            "stomach-pregnant-decr": 0.5,
            "bulge-decr": 1.0,
        },
        "pose": {"arm": 12.5, "clavicle": 12.0, "elbow": 12.0, "twist": 30.0},
        "shoulders_over_hips": True,
        "reference": {"chest": 96.0, "arm": 31.0, "waist": 80.0, "hip": 98.0, "thigh": 57.0},
    },
}
REGIONS = ("chest", "arm", "waist", "hip", "thigh")
# Fita de cada região (protocolo do README): o braço só na primitiva do braço; o resto por baixo dos braços, sem
# ela. Com o braço caído, a axila pode cruzar o plano do peito e partir o corte do tronco em pedaços: no peito e na
# cintura (`WHOLE_CUT`), alturas sem mão nem antebraço na fita, a circunferência abraça o corte inteiro. No quadril e
# na coxa, onde ficam as mãos, vale o laço mais próximo do ponto de referência (lá o tronco nunca se parte).
TAPE = {"chest": "body", "waist": "body", "hip": "body", "thigh": "body", "arm": "arm"}
WHOLE_CUT = ("chest", "waist")
# Conferência do corte inteiro: nenhum ponto além disto do eixo (seria mão ou braço na fita).
WHOLE_CUT_MAX_M = 0.3
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
# Morph global de tamanho: macro `weight` do MakeHuman em 0 e 1 (a base usa `mass` da variante, 0,5 por padrão).
SIZE_MORPHS = {"size_min": 0.0, "size_max": 1.0}
# Raio suavizado em volta de cada mamilo (o grupo `nipple` cobre só a aréola; a borda ficaria marcada).
NIPPLE_RADIUS_M = 0.035
# Pose: passadas para o úmero chegar ao ângulo pedido (o rig gira o osso; o ângulo é medido nas juntas).
POSE_PASSES = 3
# Folga braço/mão × tronco/coxa (cm, distância com sinal pela normal do tronco), abaixo da dobra da axila
# (`ARMPIT_DROP_M` sob a junta do ombro; na dobra, braço e tronco se tocam como num corpo real). A base precisa de
# `CLEARANCE_MIN_CM`, e os morphs que engrossam o corpo também, no limite de extrapolação do app (`MORPH_LIMITS`
# em src/modules/twin/morph.ts): o tamanho sozinho e cada morph regional sozinho e somado ao tamanho no limite (um
# corpo grande usa os dois). Nesses morphs o braço abre junto o mínimo necessário (até `ABDUCTION_MAX_DEG` no limite),
# como num corpo maior de verdade.
ARMPIT_DROP_M = 0.15
CLEARANCE_MIN_CM = 0.3
ABDUCTION_MAX_DEG = 30.0
GROWTH_LIMITS = {
    **{f"{region}_max": 1.5 for region in ("chest", "arm", "waist", "hip", "thigh")},
    "size_max": 3.0,
}


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
        if lm.labels[i] in regions and coords[i].z > lm.crotch_z - below
    ]
    centers = torso_slices(coords, lm, torso)
    out = [c.copy() for c in coords]
    for i in torso:
        p = coords[i]
        sigma = cfg["up"] if p.z > center_z else cfg["down"]
        # O que se move com o braço (perto do ombro) fica de fora.
        weight = math.exp(-0.5 * ((p.z - center_z) / sigma) ** 2) * (1.0 - lm.limb[i])
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
        if lm.labels[i] != region:
            continue
        side = 1.0 if p.x * lm.side >= 0 else -1.0
        q = Vector((p.x * side, p.y, p.z))  # lado do marco (esquerdo)
        ab = b - a
        t = (q - a).dot(ab) / ab.length_squared
        weight = 1.0 - smoothstep(cfg["ramp_out"][0], cfg["ramp_out"][1], t)
        if region == "arm":
            # Só o que se move com o braço (a lateral do tronco perto da axila fica parada).
            weight *= lm.limb[i]
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
    """Diagnóstico da silhueta (malha completa posada): largura nos ombros (deltoides) e no quadril, sem braços e
    mãos, em cm."""
    shoulders = [p.x for p in coords if abs(p.z - lm.shoulder.z) < 0.03]
    hips = [p.x for i, p in enumerate(coords) if abs(p.z - hip_z) < 0.01 and lm.limb[i] < 0.01]
    return round(100 * (max(shoulders) - min(shoulders)), 1), round(100 * (max(hips) - min(hips)), 1)


# --- pose ----------------------------------------------------------------------------------------------


def limb_weights(obj, rig):
    """Peso de cada vértice nos ossos do braço (úmero para baixo, mão e dedos), dos pesos do MakeHuman: 1 se move
    todo com o braço, 0 se é tronco."""
    names = set()
    for root in ("upperarm01.L", "upperarm01.R"):
        bone = rig.data.bones[root]
        names |= {bone.name} | {child.name for child in bone.children_recursive}
    groups = {g.index for g in obj.vertex_groups if g.name in names}
    return [min(1.0, sum(g.weight for g in v.groups if g.group in groups)) for v in obj.data.vertices]


def rotate_bone(rig, name, axis, degrees):
    """Gira o osso posado em volta da própria cabeça, num eixo do espaço do rig (os filhos acompanham)."""
    bone = rig.pose.bones[name]
    head = bone.head.copy()
    turn = Matrix.Rotation(math.radians(degrees), 4, axis)
    bone.matrix = Matrix.Translation(head) @ turn @ Matrix.Translation(-head) @ bone.matrix
    bpy.context.view_layer.update()


def evaluated_coords(obj):
    depsgraph = bpy.context.evaluated_depsgraph_get()
    return [v.co.copy() for v in obj.evaluated_get(depsgraph).data.vertices]


def arm_angle(obj, coords):
    """Ângulo (graus) do úmero com a vertical, entre as juntas de ombro e cotovelo (as mesmas dos marcos)."""
    def center(name):
        idx = group_indices(obj, name)
        return sum((coords[i] for i in idx), Vector()) / len(idx)

    axis = (center("joint-l-elbow") - center("joint-l-shoulder")).normalized()
    return math.degrees(math.acos(max(-1.0, min(1.0, -axis.z))))


def pose_human(obj, pose):
    """Pose natural com o rig `default` do MPFB2 (pesos do MakeHuman): clavícula baixada, úmero até `pose["arm"]`
    graus da vertical, cotovelo quase estendido e palmas voltadas para as coxas. Aplica a deformação na malha
    (vértices auxiliares e juntas acompanham) e remove o rig. Devolve o peso de braço de cada vértice."""
    HumanService = mpfb("mpfb.services.humanservice", "HumanService")
    rig = HumanService.add_builtin_rig(obj, "default")
    bpy.context.view_layer.update()
    limb = limb_weights(obj, rig)
    front_back = Vector((0.0, 1.0, 0.0))
    # Eixo Y: girar +x para baixo é ângulo positivo do lado esquerdo (x > 0) e negativo do direito.
    sides = (("L", 1.0 if rig.data.bones["upperarm01.L"].head_local.x > 0 else -1.0),)
    sides += (("R", -sides[0][1]),)
    for side, sign in sides:
        rotate_bone(rig, f"clavicle.{side}", front_back, sign * pose["clavicle"])
    for _ in range(POSE_PASSES):
        error = arm_angle(obj, evaluated_coords(obj)) - pose["arm"]
        if abs(error) < 0.05:
            break
        for side, sign in sides:
            rotate_bone(rig, f"upperarm01.{side}", front_back, sign * error)
    for side, sign in sides:
        upper, lower = rig.pose.bones[f"upperarm02.{side}"], rig.pose.bones[f"lowerarm01.{side}"]
        wrist = rig.pose.bones[f"wrist.{side}"]
        u = (upper.tail - upper.head).normalized()
        f = (wrist.head - lower.head).normalized()
        rotate_bone(rig, f"lowerarm01.{side}", f.cross(u).normalized(), math.degrees(u.angle(f)) - pose["elbow"])
        lower, wrist = rig.pose.bones[f"lowerarm01.{side}"], rig.pose.bones[f"wrist.{side}"]
        rotate_bone(rig, f"lowerarm01.{side}", (wrist.head - lower.head).normalized(), sign * pose["twist"])
    coords = evaluated_coords(obj)
    obj.modifiers.clear()
    obj.parent = None
    bpy.data.objects.remove(rig, do_unlink=True)
    for vertex, co in zip(obj.data.vertices, coords):
        vertex.co = co
    obj.data.update()
    return limb


def abducted(coords, lm, degrees):
    """Braços abertos `degrees` em volta da junta do ombro (no plano frontal), na proporção do peso de braço."""
    out = []
    for i, p in enumerate(coords):
        w = lm.limb[i]
        if w <= 0.0:
            out.append(p.copy())
            continue
        side = 1.0 if p.x >= 0 else -1.0
        pivot = Vector((abs(lm.shoulder.x) * side, lm.shoulder.y, lm.shoulder.z))
        turn = Matrix.Rotation(math.radians(-side * degrees), 3, "Y")
        out.append(p.lerp(pivot + turn @ (p - pivot), w))
    return out


def clearance_cm(mesh, coords, lm):
    """Menor folga (cm, com sinal: negativo = atravessa) entre o que é só braço ou mão abaixo da axila e o que é só
    corpo: distância ao vértice do corpo mais próximo, projetada na normal dele."""
    bm = bmesh.new()
    bm.from_mesh(mesh)
    bm.verts.ensure_lookup_table()
    for v in bm.verts:
        v.co = coords[v.index]
    bm.normal_update()
    body = [v for v in bm.verts if lm.limb[v.index] < 0.01]
    tree = KDTree(len(body))
    for v in body:
        tree.insert(v.co, v.index)
    tree.balance()
    normals = {v.index: v.normal.copy() for v in body}
    bm.free()
    top = lm.shoulder.z - ARMPIT_DROP_M
    best = math.inf
    for i, p in enumerate(coords):
        if lm.limb[i] > 0.99 and p.z < top:
            co, j, _ = tree.find(p)
            best = min(best, (p - co).dot(normals[j]))
    return 100.0 * best


def keep_clearance(mesh, base, keys, lm):
    """Nos morphs que engrossam o corpo, abre o braço o mínimo para a folga, no limite de extrapolação do app,
    continuar em `CLEARANCE_MIN_CM`: primeiro o tamanho sozinho; depois cada morph regional sozinho e somado ao
    tamanho no limite (um corpo grande usa os dois). Devolve a folga da base e a abertura (graus, por unidade de morph) de
    cada morph corrigido."""
    clearance = clearance_cm(mesh, base, lm)
    if clearance < CLEARANCE_MIN_CM:
        raise RuntimeError(f"Folga braço × corpo de {clearance:.2f} cm na base: revise a pose ou a forma fixa.")
    opened = {}

    def solve(key, limit, unders):
        def at_limit(degrees):
            moved = abducted(keys[key], lm, degrees)
            worst = min(
                clearance_cm(mesh, [u + (m - b) * limit for b, u, m in zip(base, under, moved)], lm)
                for under in unders
            )
            return worst, moved

        if at_limit(0.0)[0] >= CLEARANCE_MIN_CM:
            return
        lo, hi = 0.0, ABDUCTION_MAX_DEG / limit
        if at_limit(hi)[0] < CLEARANCE_MIN_CM:
            raise RuntimeError(f"{key}: o braço não sai do tronco nem aberto {ABDUCTION_MAX_DEG}°.")
        for _ in range(12):
            mid = (lo + hi) / 2
            lo, hi = (lo, mid) if at_limit(mid)[0] >= CLEARANCE_MIN_CM else (mid, hi)
        keys[key] = at_limit(hi)[1]
        opened[key] = round(hi, 2)

    size_limit = GROWTH_LIMITS["size_max"]
    solve("size_max", size_limit, [base])
    big = [b + (k - b) * size_limit for b, k in zip(base, keys["size_max"])]
    for key, limit in GROWTH_LIMITS.items():
        if key != "size_max":
            solve(key, limit, [base, big])
    return round(clearance, 2), opened


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

    def boundary_planes(self):
        """Planos das bordas entre regiões (mesmos limites de `region`): alturas e punhos. A borda entre braço e
        tronco segue os pesos do rig (o que se move com o braço), sem plano."""
        up = Vector((0.0, 0.0, 1.0))
        span = self.neck.z - self.crotch_z
        planes = [(Vector((0.0, 0.0, z)), up) for z in (
            self.knee.z, self.crotch_z, self.crotch_z + 0.3 * span, self.crotch_z + 0.55 * span, self.neck.z,
        )]
        for side in (1.0, -1.0):
            mirror = lambda v: Vector((v.x * side * self.side, v.y, v.z))  # noqa: E731
            shoulder, hand = mirror(self.shoulder), mirror(self.hand)
            planes.append((hand, (hand - shoulder).normalized()))
        return planes

    def torso_f(self, z):
        return (z - self.crotch_z) / (self.neck.z - self.crotch_z)

    def region(self, p, limb):
        """Região de um ponto (pose A). `limb`: peso de braço do ponto (pesos do rig). O que se move com o braço é
        braço até o punho e, depois dele, mão (`rest`); o resto se divide por altura."""
        if limb >= 0.5:
            q = Vector((abs(p.x) * self.side, p.y, p.z))
            t, _ = segment_t_dist(q, self.shoulder, self.hand)
            return "arm" if t <= 1.0 else "rest"
        if p.z >= self.neck.z or p.z < self.knee.z:
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


def girth_cm(mesh, coords, plane_co, plane_no, near, whole=False):
    """Perímetro (cm) do fecho convexo do corte da malha (com as posições `coords`) pelo plano, no laço mais
    próximo de `near` ou, com `whole`, no corte inteiro: a fita métrica passa por cima das concavidades (protocolo
    do README)."""
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
    # Arestas soltas (sem face, nas malhas da fita) dão pontos isolados no corte: não são laço.
    loops = {k: pts for k, pts in loops.items() if len(pts) >= 3}
    n = plane_no.normalized()
    u = n.orthogonal().normalized()
    w = n.cross(u)
    away = {k: ((sum(pts, Vector()) / len(pts)) - near).length for k, pts in loops.items()}
    bm.free()
    if whole:
        best = [p for pts in loops.values() for p in pts]
        far = max((p - plane_co - n * (p - plane_co).dot(n)).length for p in best)
        if far > WHOLE_CUT_MAX_M:
            raise RuntimeError(f"Corte do tronco com ponto a {far:.3f} m do eixo (z {plane_co.z:.3f}): mão ou braço.")
    else:
        best = loops[min(away, key=away.get)]
    return 100.0 * hull_perimeter([((p - plane_co).dot(u), (p - plane_co).dot(w)) for p in best])


def tape_meshes(mesh, arm_faces):
    """Malha que a fita de cada região enxerga (`TAPE`): só as faces do braço ou todas menos elas. Saem só faces;
    os vértices ficam, com os mesmos índices."""
    def keep(inside):
        bm = bmesh.new()
        bm.from_mesh(mesh)
        bmesh.ops.delete(bm, geom=[f for f in bm.faces if (f.index in arm_faces) != inside], context="FACES_ONLY")
        out = bpy.data.meshes.new("tape")
        bm.to_mesh(out)
        bm.free()
        return out

    meshes = {"arm": keep(True), "body": keep(False)}
    return {region: meshes[TAPE[region]] for region in REGIONS}


def tape_girth(tapes, coords, planes, region):
    """Circunferência (cm) de uma região pelo protocolo: fita, plano e regra do laço."""
    return girth_cm(tapes[region], coords, *planes[region], whole=region in WHOLE_CUT)


def measure_planes(tapes, coords, lm):
    """Protocolo de medição (README): plano, normal e ponto de referência do laço de cada circunferência.
    Peito: horizontal nos mamilos. Cintura: horizontal de menor circunferência entre 30% e 55% da altura
    entreperna→pescoço. Quadril: horizontal de maior circunferência entre 5% e 35%. Coxa: horizontal a 10% da
    distância entreperna→joelho. Braço: perpendicular ao úmero, a 55% de ombro→cotovelo."""
    span = lm.neck.z - lm.crotch_z
    center = lambda z: Vector((0.0, 0.0, z))  # noqa: E731
    up = Vector((0.0, 0.0, 1.0))

    def scan(region, f0, f1, pick):
        zs = [lm.crotch_z + span * (f0 + (f1 - f0) * i / 24) for i in range(25)]
        whole = region in WHOLE_CUT
        return pick((girth_cm(tapes[region], coords, center(z), up, center(z), whole), z) for z in zs)[1]

    planes = {
        "chest": (center(lm.nipple_z), up, center(lm.nipple_z)),
        "waist": (center(scan("waist", 0.3, 0.55, min)), up, None),
        "hip": (center(scan("hip", 0.05, 0.35, max)), up, None),
    }
    for name in ("waist", "hip"):
        co, no, _ = planes[name]
        planes[name] = (co, no, co)
    thigh_z = lm.crotch_z - 0.1 * (lm.crotch_z - lm.knee.z)
    planes["thigh"] = (center(thigh_z), up, Vector((lm.upper_leg.x, lm.upper_leg.y, thigh_z)))
    arm_co = lm.shoulder.lerp(lm.elbow, 0.55)
    planes["arm"] = (arm_co, (lm.elbow - lm.shoulder).normalized(), arm_co)
    return planes


def girths(tapes, coords, planes):
    return {r: tape_girth(tapes, coords, planes, r) for r in REGIONS}


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


def fit_base(tapes, base, lm, planes, targets):
    """Ajusta a base com os próprios morphs regionais até cada circunferência (malha completa) chegar ao alvo.
    Os parâmetros fixos do modelo já devem deixar a base perto da referência: um ajuste grande é erro de forma."""
    coords = [c.copy() for c in base]
    total = dict.fromkeys(REGIONS, 0.0)
    for _ in range(FIT_ITERATIONS):
        current = girths(tapes, coords, planes)
        errors = {r: targets[r] - current[r] for r in REGIONS}
        if all(abs(e) < 0.1 for e in errors.values()):
            break
        for region, error in errors.items():
            if abs(error) < 0.1:
                continue
            scale = REGION_SCALE["max"] if error > 0 else REGION_SCALE["min"]
            moved = region_morph(coords, lm, planes, region, scale)
            slope = tape_girth(tapes, moved, planes, region) - current[region]
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


def full_with_keys(mesh, rest, keys):
    """Objeto com a malha completa na pose A (`rest`, a forma de ligação, primeira shape key) e as shape keys
    dadas (a base posada e os morphs)."""
    obj = bpy.data.objects.new("full", mesh.copy())
    bpy.context.collection.objects.link(obj)
    for vertex, co in zip(obj.data.vertices, rest):
        vertex.co = co
    obj.data.update()
    for name, coords in {"Rest": rest, **keys}.items():
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
    # Cada corpo de tamanho é posado pelo próprio rig, no mesmo ângulo de braço da base.
    clear_scene()
    size_coords, size_detail = {}, {}
    for key_name, body_mass in SIZE_MORPHS.items():
        obj = baked_human(body_mass)
        # Os mamilos mudam de lugar com o tamanho: cada corpo é suavizado nos próprios.
        size_detail[key_name] = detail_vertices(obj)
        pose_human(obj, config["pose"])
        size_coords[key_name] = [v.co.copy() for v in obj.data.vertices][:BODY_VERTS]
        bpy.data.objects.remove(obj, do_unlink=True)
    human = baked_human(config.get("mass", 0.5))
    # Pose A do MakeHuman (`rest`): nela as regiões são classificadas e a malha final é gerada (remesh, cortes),
    # com braço e tronco bem separados; a pose entra depois, como forma (`remeshed_with_morphs`).
    rest_lm = Landmarks(human)
    rest = [human.data.vertices[i].co.copy() for i in range(BODY_VERTS)]
    detail = detail_vertices(human)
    head = [i for i in range(BODY_VERTS) if human.data.vertices[i].co.z > rest_lm.neck.z + 0.03]
    head_center = sum((human.data.vertices[i].co for i in head), Vector()) / len(head)
    limb = pose_human(human, config["pose"])[:BODY_VERTS]
    lm = Landmarks(human)
    lm.limb = limb
    lm.labels = [rest_lm.region(rest[i], limb[i]) for i in range(BODY_VERTS)]

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
    arm_faces = {
        p.index for p in mesh.polygons if 2 * sum(lm.labels[v] == "arm" for v in p.vertices) > len(p.vertices)
    }
    tapes = tape_meshes(mesh, arm_faces)

    # Mamilos e região genital suavizados em cada corpo (base posada, pose A e tamanhos); pés no chão pela base.
    base = [v.co.copy() for v in mesh.vertices]
    for coords in (base, rest):
        for i, co in smoothed(coords, adj, detail, DETAIL_SMOOTH_ITERATIONS).items():
            coords[i] = co
    for key_name, coords in size_coords.items():
        for i, co in smoothed(coords, adj, size_detail[key_name], DETAIL_SMOOTH_ITERATIONS).items():
            coords[i] = co
    min_z = min(p.z for p in base)
    for coords in (base, rest, *size_coords.values()):
        for p in coords:
            p.z -= min_z
    for marks in (lm, rest_lm):
        for attr in ("neck", "head", "shoulder", "elbow", "hand", "upper_leg", "knee"):
            getattr(marks, attr).z -= min_z
        marks.crotch_z -= min_z
        marks.nipple_z -= min_z
    head_center.z -= min_z
    height_m = max(p.z for p in base)
    size_delta = {k: [c - b for c, b in zip(coords, base)] for k, coords in size_coords.items()}

    planes = measure_planes(tapes, base, lm)
    rest_tree = KDTree(len(rest))
    for i, co in enumerate(rest):
        rest_tree.insert(co, i)
    rest_tree.balance()
    limb_at = lambda p: limb[rest_tree.find(p)[1]]  # noqa: E731
    reference = config["reference"]
    targets = dict(reference)
    low = None
    for attempt in range(1, FIT_PASSES + 1):
        fitted = fit_base(tapes, base, lm, planes, targets)
        keys = {"Basis": fitted}
        for region in REGIONS:
            for side, scale in REGION_SCALE.items():
                keys[f"{region}_{side}"] = region_morph(fitted, lm, planes, region, scale)
        for key_name, delta in size_delta.items():
            keys[key_name] = [b + d for b, d in zip(fitted, delta)]
        clearance, opened = keep_clearance(mesh, fitted, keys, lm)
        if low is not None:
            bpy.data.objects.remove(low, do_unlink=True)
        low, low_arm_faces = remeshed_with_morphs(full_with_keys(mesh, rest, keys), head_center, rest_lm, limb_at)
        low_tapes = tape_meshes(low.data, low_arm_faces)
        # Base medida na malha final (a que a pessoa vê): o remesh e a decimação encolhem um pouco.
        drawn = girths(low_tapes, key_coords(low, "Basis"), planes)
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
        measure = lambda key: round(tape_girth(low_tapes, key_coords(low, key), planes, region), 2)  # noqa: E731
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
    shoulder_cm, hip_cm = body_breadths(fitted, lm, planes["hip"][0].z)
    if config.get("shoulders_over_hips") and shoulder_cm <= hip_cm:
        raise RuntimeError(f"{name}: ombros ({shoulder_cm} cm) não ficaram mais largos que o quadril ({hip_cm} cm).")
    humerus = (lm.elbow - lm.shoulder).normalized()
    return {
        "baseHeightM": round(height_m, 3),
        "girthCm": calibration,
        # Planos do protocolo em coordenadas glTF, para o teste de geometria no CI medir a malha final.
        "planes": {
            r: {
                "point": to_gltf(co), "normal": to_gltf(no), "near": to_gltf(near), "tape": TAPE[r],
                "loop": "whole" if r in WHOLE_CUT else "nearest",
            }
            for r, (co, no, near) in planes.items()
        },
        "triangles": triangles,
        # Diagnóstico interno (nunca vai à interface, LEG-M06).
        "silhouette": {
            "shoulderCm": shoulder_cm,
            "hipCm": hip_cm,
            "waistToHip": round(calibration["waist"]["base"] / calibration["hip"]["base"], 2),
        },
        # Pose: ângulo do úmero com a vertical, folga braço × corpo na base e abertura extra por morph.
        "pose": {
            "armDeg": round(math.degrees(math.acos(-humerus.z)), 1),
            "clearanceCm": clearance,
            "openedDeg": opened,
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


def remeshed_with_morphs(full, head_center, lm, limb_at):
    """Malha final: remesh por voxels da malha completa na pose A (`lm` são os marcos dela), rosto suavizado na
    topologia nova, decimada, cortada e dividida em regiões; a base posada e os morphs vêm da malha completa.
    Devolve a malha e as faces do braço."""
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
    arm_faces = assign_regions(low, lm, limb_at)

    # Cada vértice da malha final fica preso ao triângulo mais próximo da malha completa na pose A e o acompanha
    # (posição e afastamento pela normal) em cada forma. Diferente do Surface Deform, nenhum vértice fica sem
    # ligação, mesmo com o braço girando ~30° até a pose.
    keys = full.data.shape_keys.key_blocks
    full.data.calc_loop_triangles()
    tris = [tuple(t.vertices) for t in full.data.loop_triangles]
    rest = [p.co.copy() for p in keys[0].data]
    tree = BVHTree.FromPolygons(rest, tris)
    bound = [(v.co.copy(), tris[tree.find_nearest(v.co)[2]]) for v in low.data.vertices]
    morphs = {}
    for key in list(keys)[1:]:
        co = [p.co for p in key.data]
        morphs[key.name] = [
            barycentric_transform(p, rest[a], rest[b], rest[c], co[a], co[b], co[c]) for p, (a, b, c) in bound
        ]
    for vertex, co in zip(low.data.vertices, morphs.pop("Basis")):
        vertex.co = co
    low.data.update()
    low.shape_key_add(name="Basis", from_mix=False)
    for name, coords in morphs.items():
        block = low.shape_key_add(name=name, from_mix=False)
        block.value = 0.0  # peso padrão no .glb: a forma base
        for i, co in enumerate(coords):
            block.data[i].co = co
    for poly in low.data.polygons:
        poly.use_smooth = True
    while low.data.uv_layers:
        low.data.uv_layers.remove(low.data.uv_layers[0])
    bpy.data.objects.remove(full, do_unlink=True)
    return low, arm_faces


def assign_regions(obj, lm, limb_at):
    """Material `region_<região>` de cada face (pose A), com o peso de braço do vértice mais próximo da malha
    completa. Devolve as faces do braço."""
    obj.data.materials.clear()
    for name in MATERIALS:
        # Reaproveita o material de uma passada anterior: um novo viraria `region_x.001` e o app não o reconheceria.
        mat = bpy.data.materials.get(f"region_{name}") or bpy.data.materials.new(f"region_{name}")
        obj.data.materials.append(mat)
    index = {name: i for i, name in enumerate(MATERIALS)}
    for poly in obj.data.polygons:
        poly.material_index = index[lm.region(poly.center, limb_at(poly.center))]
    return {poly.index for poly in obj.data.polygons if poly.material_index == index["arm"]}


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
