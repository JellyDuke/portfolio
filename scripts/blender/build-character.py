"""CC0 인체 토폴로지에 캐릭터 비율·의상·연속 스킨 리그를 적용한다.

MPFB 도구와 원본 팩은 vendor 캐시에서 읽고, 사용자 Blender 설정은 저장하지 않는다.
"""
import json
import math
import sys
from pathlib import Path

import bpy
import bmesh
from mathutils import Vector, Matrix
from mathutils.bvhtree import BVHTree

sys.path.insert(0, str(Path(__file__).resolve().parent))


ROOT_PATH = Path(__file__).resolve().parents[2]
SOURCE_PATH = ROOT_PATH / 'assets/source/blender'
VENDOR_PATH = SOURCE_PATH / 'vendor'
ASSET_PATH = VENDOR_PATH / 'system-assets'
MPFB_PATH = VENDOR_PATH / 'mpfb2-2.0.17/src'


def initialize_human_tools():
    """도구를 현재 백그라운드 프로세스에서만 등록하고 캐시는 프로젝트 내부로 한정한다."""
    sys.path.insert(0, str(MPFB_PATH))
    import addon_utils
    original_user_path = bpy.utils.extension_path_user

    def local_user_path(package, *, path='', create=False):
        """임시 도구의 작업 파일이 사용자 홈 설정을 변경하지 않게 한다."""
        if package != 'mpfb':
            return original_user_path(package, path=path, create=create)
        result = VENDOR_PATH / 'mpfb-profile' / path
        result.mkdir(parents=True, exist_ok=True)
        return str(result)

    bpy.utils.extension_path_user = local_user_path
    addon_utils.enable('mpfb', default_set=True, persistent=False)
    from mpfb.services.humanservice import HumanService
    from mpfb.services.targetservice import TargetService
    return HumanService, TargetService


def create_material(name, color, roughness=0.65, subsurface=0):
    """웹과 Blender에서 공유할 단순한 물리 기반 재질을 만든다."""
    material = bpy.data.materials.new(name)
    material.use_nodes = True
    channels = [int(color[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    linear = [c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4 for c in channels]
    shader = material.node_tree.nodes.get('Principled BSDF')
    shader.inputs['Base Color'].default_value = (*linear, 1)
    shader.inputs['Roughness'].default_value = roughness
    shader.inputs['Subsurface Weight'].default_value = subsurface
    shader.inputs['Subsurface Scale'].default_value = 0.004
    shader.inputs['Specular IOR Level'].default_value = 0.3
    material.diffuse_color = (*linear, 1)
    return material


def group_center(body, name):
    """원본의 해부학 기준 그룹에서 중심을 구해 모델 크기에 따른 하드코딩을 피한다."""
    group_index = body.vertex_groups[name].index
    points = [vertex.co for vertex in body.data.vertices if any(group.group == group_index for group in vertex.groups)]
    return sum(points, Vector()) / len(points)


def sculpt_proportions(body):
    """얼굴 윤곽 변형을 확정하고 목에서 매끈하게 이어지는 캐릭터 머리 비율로 조정한다."""
    mixed = body.shape_key_add(name='portrait_sculpt', from_mix=True)
    coordinates = [point.co.copy() for point in mixed.data]
    body.shape_key_clear()
    for vertex, coordinate in zip(body.data.vertices, coordinates):
        vertex.co = coordinate
    neck = group_center(body, 'joint-neck')
    head = group_center(body, 'joint-head')
    for vertex in body.data.vertices:
        blend = min(1.0, max(0.0, (vertex.co.z - neck.z + 0.025) / max(0.055, head.z - neck.z)))
        blend = blend * blend * (3 - 2 * blend)
        vertex.co.x *= 1 + 0.42 * blend
        vertex.co.y = neck.y + (vertex.co.y - neck.y) * (1 + 0.34 * blend)
        vertex.co.z = neck.z + (vertex.co.z - neck.z) * (1 + 0.30 * blend)
    body.data.update()


def color_skin(body):
    """사진의 입술·귀·피부 대비를 부드러운 정점 색으로 표현하며 사진 자체는 사용하지 않는다."""
    skin = create_material('portrait_skin', 'ffffff', 0.48, 0.045)
    shader = skin.node_tree.nodes.get('Principled BSDF')
    colors = skin.node_tree.nodes.new('ShaderNodeVertexColor')
    colors.layer_name = 'portrait_color'
    skin.node_tree.links.new(colors.outputs['Color'], shader.inputs['Base Color'])
    attribute = body.data.color_attributes.new(name='portrait_color', type='FLOAT_COLOR', domain='POINT')
    lip_index = body.vertex_groups['lips'].index
    ear_index = body.vertex_groups['ears'].index
    nail_index = body.vertex_groups['fingernails'].index
    for vertex in body.data.vertices:
        groups = {group.group: group.weight for group in vertex.groups}
        color = (0.66, 0.405, 0.29, 1)
        if lip_index in groups:
            color = (0.54, 0.265, 0.23, 1)
        elif ear_index in groups:
            color = (0.63, 0.335, 0.26, 1)
        elif nail_index in groups:
            color = (0.77, 0.50, 0.41, 1)
        attribute.data[vertex.index].color = color
    body.data.materials.clear()
    body.data.materials.append(skin)
    # 사진은 형상 참고에만 사용한다. 공개 CC0 피부의 미세한 명암으로 코·눈가가 지워지지 않게 한다.
    texture = skin.node_tree.nodes.new('ShaderNodeTexImage')
    texture.image = bpy.data.images.load(str(ASSET_PATH / 'skins/young_asian_male/young_lightskinned_male_diffuse3.png'))
    mix = skin.node_tree.nodes.new('ShaderNodeMixRGB')
    mix.blend_type = 'MIX'
    mix.inputs[0].default_value = 0.62
    skin.node_tree.links.new(colors.outputs['Color'], mix.inputs[1])
    skin.node_tree.links.new(texture.outputs['Color'], mix.inputs[2])
    skin.node_tree.links.new(mix.outputs[0], shader.inputs['Base Color'])


def refine_outfit(outfit, shoes):
    """재질 경계를 UV 봉제선으로 나눠 셔츠 밑단의 톱니와 신발의 색 불일치를 없앤다."""
    outfit.data.materials.clear()
    outfit.data.materials.append(create_material('cobalt_shirt', '456ca8', 0.80))
    outfit.data.materials.append(create_material('ink_trousers', '26313f', 0.87))
    uv_layer = outfit.data.uv_layers.active.data
    for polygon in outfit.data.polygons:
        uv = sum((uv_layer[index].uv for index in polygon.loop_indices), Vector((0, 0))) / len(polygon.loop_indices)
        # 원본 아틀라스에서 두 바지 섬은 중앙 열, 셔츠는 좌우 열을 쓴다.
        polygon.material_index = 1 if 0.355 < uv.x < 0.713 else 0
    shoes.data.materials.clear()
    shoes.data.materials.append(create_material('charcoal_shoes', '202a38', 0.58))


def refine_portrait_hair(hair, body):
    """연속된 헤어 표면과 가는 모발 알파를 유지하며 가르마·앞머리 길이를 사진에 맞춘다."""
    eye_height = group_center(body, 'joint-l-eye').z
    # 넓은 앞머리를 양쪽에 배치한 뒤 중앙 경계를 용접한다. 아래 두피 보정이 절단면의 함몰을 막는다.
    part_x = 0.050
    mesh = bmesh.new()
    mesh.from_mesh(hair.data)
    bmesh.ops.bisect_plane(mesh, geom=list(mesh.verts) + list(mesh.edges) + list(mesh.faces), dist=0.00001,
                          plane_co=(part_x, 0, 0), plane_no=(1, 0, 0), clear_outer=True, clear_inner=False)
    for vertex in mesh.verts:
        vertex.co.x = (vertex.co.x - part_x) * 0.69
    duplicate = bmesh.ops.duplicate(mesh, geom=list(mesh.verts) + list(mesh.edges) + list(mesh.faces))
    for vertex in duplicate['geom']:
        if isinstance(vertex, bmesh.types.BMVert):
            vertex.co.x *= -1
    bmesh.ops.remove_doubles(mesh, verts=list(mesh.verts), dist=0.00003)
    bmesh.ops.recalc_face_normals(mesh, faces=list(mesh.faces))
    mesh.to_mesh(hair.data)
    mesh.free()
    scalp_index = body.vertex_groups['scalp'].index
    scalp_vertices = {vertex.index for vertex in body.data.vertices if any(group.group == scalp_index for group in vertex.groups)}
    scalp_faces = [list(polygon.vertices) for polygon in body.data.polygons if all(index in scalp_vertices for index in polygon.vertices)]
    scalp_surface = BVHTree.FromPolygons([vertex.co for vertex in body.data.vertices], scalp_faces)
    for vertex in hair.data.vertices:
        front = min(1.0, max(0.0, (-vertex.co.y - 0.07) / 0.07))
        fringe = min(1.0, max(0.0, (eye_height + 0.105 - vertex.co.z) / 0.075))
        vertex.co.z += 0.026 * front * fringe * fringe * (3 - 2 * fringe)
        if vertex.co.y >= -0.12 and vertex.co.z < eye_height - 0.025:
            vertex.co.z = eye_height - 0.025 + (vertex.co.z - eye_height + 0.025) * 0.45
        # 가르마를 옮기면 정수리 곡률이 달라진다. 이동한 모발이 두피 안으로 들어가지 않게 실제 표면에서 밀어낸다.
        surface, normal, _, _ = scalp_surface.find_nearest(vertex.co)
        clearance = (vertex.co - surface).dot(normal)
        if clearance < 0.016:
            vertex.co += normal * (0.016 - clearance)
    hair.data.update()
    material = hair.data.materials[0]
    shader = material.node_tree.nodes.get('Principled BSDF')
    texture = next(node for node in material.node_tree.nodes if node.type == 'TEX_IMAGE')
    tint = material.node_tree.nodes.new('ShaderNodeMixRGB')
    tint.blend_type = 'MULTIPLY'
    tint.inputs[0].default_value = 1
    tint.inputs[2].default_value = (0.085, 0.095, 0.12, 1)
    material.node_tree.links.new(texture.outputs['Color'], tint.inputs[1])
    material.node_tree.links.new(tint.outputs[0], shader.inputs['Base Color'])
    material.node_tree.links.new(texture.outputs['Alpha'], shader.inputs['Alpha'])
    shader.inputs['Roughness'].default_value = 0.64
    shader.inputs['Specular IOR Level'].default_value = 0.22
    shader.inputs['Subsurface Weight'].default_value = 0
    material.surface_render_method = 'DITHERED'
    hair.name = 'portrait_hair'


def create_hair_underlay(body, rig):
    """가르마 꼭대기의 절단면 안쪽을 실제 두피 형상의 짙은 표면으로 채운다."""
    scalp_index = body.vertex_groups['scalp'].index
    scalp_vertices = {vertex.index for vertex in body.data.vertices if any(group.group == scalp_index for group in vertex.groups)}
    top = max(body.data.vertices[index].co.z for index in scalp_vertices)
    coordinates, faces, remapped = [], [], {}
    for polygon in body.data.polygons:
        if not all(index in scalp_vertices for index in polygon.vertices):
            continue
        if polygon.center.y < -0.075 and polygon.center.z < top - 0.025:
            continue
        face = []
        for index in polygon.vertices:
            if index not in remapped:
                vertex = body.data.vertices[index]
                remapped[index] = len(coordinates)
                coordinates.append(vertex.co + vertex.normal * 0.002)
            face.append(remapped[index])
        faces.append(face)
    mesh = bpy.data.meshes.new('hair_underlay_geometry')
    mesh.from_pydata(coordinates, [], faces)
    mesh.update()
    obj = bpy.data.objects.new('portrait_hair_underlay', mesh)
    bpy.context.collection.objects.link(obj)
    obj.parent = rig
    obj.data.materials.append(create_material('hair_underlay', '090b0f', 0.70))
    obj.vertex_groups.new(name='head').add(list(range(len(coordinates))), 1, 'REPLACE')
    obj.modifiers.new('head_skinning', 'ARMATURE').object = rig
    return obj


def add_eye_controls(body, rig, eyes):
    """눈동자가 고개보다 먼저 향하도록 두 눈의 회전축을 머리 뼈 아래에 추가한다."""
    centers = {suffix: group_center(body, f'joint-{suffix}-eye') for suffix in ['l', 'r']}
    bpy.ops.object.select_all(action='DESELECT')
    rig.select_set(True)
    bpy.context.view_layer.objects.active = rig
    bpy.ops.object.mode_set(mode='EDIT')
    for suffix, center in centers.items():
        bone = rig.data.edit_bones.new(f'eye_{suffix}')
        bone.head = center
        bone.tail = center + Vector((0, -0.025, 0))
        bone.parent = rig.data.edit_bones['head']
    bpy.ops.object.mode_set(mode='OBJECT')
    eyes.vertex_groups.clear()
    for suffix, direction in [('l', 1), ('r', -1)]:
        indices = [vertex.index for vertex in eyes.data.vertices if vertex.co.x * direction > 0]
        eyes.vertex_groups.new(name=f'eye_{suffix}').add(indices, 1, 'REPLACE')


def create_character():
    """인체 원본에 적당한 머리 확대와 눈·입 표정을 적용하고 맞춤 의상을 입힌다."""
    human_service, target_service = initialize_human_tools()
    phenotype = target_service.get_default_macro_info_dict()
    phenotype.update(gender=1.0, age=0.50, muscle=0.40, weight=0.43, height=0.50, proportions=0.45)
    phenotype['race'] = {'asian': 0.65, 'caucasian': 0.35, 'african': 0.0}
    body = human_service.create_human(macro_detail_dict=phenotype)
    body.name = 'character_skin'
    targets = {'head/head-oval': 0.35, 'head/head-fat-incr': 0.12,
               'chin/chin-width-decr': 0.30, 'chin/chin-prominent-decr': 0.16,
               'eyes/l-eye-scale-incr': 0.95, 'eyes/r-eye-scale-incr': 0.95,
               'eyes/l-eye-height1-incr': 0.45, 'eyes/r-eye-height1-incr': 0.45,
               'eyes/l-eye-height2-incr': 0.65, 'eyes/r-eye-height2-incr': 0.65,
               'eyes/l-eye-height3-incr': 0.35, 'eyes/r-eye-height3-incr': 0.35,
               'nose/nose-scale-depth-incr': 0.48,
               'mouth/mouth-lowerlip-height-decr': 0.2, 'mouth/mouth-upperlip-height-decr': 0.08,
               'mouth/mouth-scale-horiz-decr': 0.12, 'mouth/mouth-angles-up': 0.16}
    for name, weight in targets.items():
        path = MPFB_PATH / 'mpfb/data/targets' / f'{name}.target.gz'
        target_service.load_target(body, str(path), weight=weight)
    sculpt_proportions(body)
    rig = human_service.add_builtin_rig(body, 'game_engine')
    rig.name = 'character_skeleton'
    equipped = {}
    for kind, name in [('Eyes', 'high-poly'), ('Eyebrows', 'eyebrow008'), ('Hair', 'short03'), ('Clothes', 'male_casualsuit01'), ('Clothes', 'shoes01')]:
        category = {'Eyes': 'eyes', 'Eyebrows': 'eyebrows', 'Hair': 'hair', 'Clothes': 'clothes'}[kind]
        equipped[name] = human_service.add_mhclo_asset(str(ASSET_PATH / category / name / f'{name}.mhclo'), body, asset_type=kind, subdiv_levels=0)
    color_skin(body)
    refine_portrait_hair(equipped['short03'], body)
    equipped['hair_underlay'] = create_hair_underlay(body, rig)
    add_eye_controls(body, rig, equipped['high-poly'])
    refine_outfit(equipped['male_casualsuit01'], equipped['shoes01'])
    for obj in [body, *equipped.values()]:
        for polygon in obj.data.polygons:
            polygon.use_smooth = True
        modifier = obj.modifiers.new('surface_finish', 'SUBSURF')
        modifier.levels = 1
        modifier.render_levels = 1
    return rig, body, equipped


def point_bone(rig, name, direction):
    """관절의 현재 머리 위치를 유지하면서 뼈의 방향만 바꿔 연결 피부가 함께 변형되게 한다."""
    bone = rig.pose.bones[name]
    current = bone.matrix.copy()
    rotation = (current.to_3x3() @ Vector((0, 1, 0))).normalized().rotation_difference(Vector(direction).normalized())
    result = rotation.to_matrix().to_4x4() @ current
    result.translation = current.translation
    bone.matrix = result
    bpy.context.view_layer.update()


def pose_for_review(rig):
    """양팔을 편안히 내린 자세로 얼굴과 옷의 연결을 검토한다."""
    for suffix, side in [('l', 1), ('r', -1)]:
        point_bone(rig, f'upperarm_{suffix}', (side * 0.12, 0.015, -1))
        point_bone(rig, f'lowerarm_{suffix}', (side * 0.05, -0.13, -1))


def build_studio():
    """실루엣과 재질을 판단할 수 있는 중립 배경과 넓은 면광원을 만든다."""
    ground_material = create_material('studio_backdrop', 'e9edf4', 0.92)
    bpy.ops.mesh.primitive_plane_add(size=200)
    bpy.context.object.name = 'studio_ground'
    bpy.context.object.location.z = -0.007
    bpy.context.object.data.materials.append(ground_material)
    for name, location, energy, size in [('key', (-3, -4, 5), 460, 2.5), ('fill', (3, -1, 3), 80, 3), ('rim', (1, 3, 4), 240, 3)]:
        data = bpy.data.lights.new(name, 'AREA')
        data.energy = energy
        data.shape = 'DISK'
        data.size = size
        light = bpy.data.objects.new(name, data)
        bpy.context.collection.objects.link(light)
        light.location = location
        light.rotation_euler = (Vector((0, 0, 1)) - light.location).to_track_quat('-Z', 'Y').to_euler()
    camera_data = bpy.data.cameras.new('character_review_camera')
    camera = bpy.data.objects.new('character_review_camera', camera_data)
    bpy.context.collection.objects.link(camera)
    camera.location = (1.8, -7, 2.0)
    camera.rotation_euler = (Vector((0, 0, 0.93)) - camera.location).to_track_quat('-Z', 'Y').to_euler()
    camera_data.type = 'ORTHO'
    camera_data.ortho_scale = 2.20
    scene = bpy.context.scene
    scene.camera = camera
    scene.render.engine = 'CYCLES'
    scene.cycles.samples = 32
    scene.cycles.use_denoising = True
    scene.render.resolution_x = 900
    scene.render.resolution_y = 1100
    scene.world = bpy.data.worlds.new('studio_world')
    scene.world.use_nodes = True
    scene.world.node_tree.nodes['Background'].inputs['Color'].default_value = (0.75, 0.82, 1, 1)
    scene.world.node_tree.nodes['Background'].inputs['Strength'].default_value = 0.3
    scene.view_settings.view_transform = 'AgX'


def main():
    """빈 장면에서 캐릭터를 생성해 원본·구조 기록·검토용 이미지를 저장한다."""
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.context.preferences.filepaths.save_version = 0
    rig, body, equipped = create_character()
    bpy.context.view_layer.update()
    facts = {'bones': {bone.name: {'head': list(bone.head_local), 'tail': list(bone.tail_local), 'parent': bone.parent.name if bone.parent else None} for bone in rig.data.bones},
             'objects': [{'name': obj.name, 'vertices': len(obj.data.vertices), 'modifiers': [modifier.type for modifier in obj.modifiers]} for obj in [body, *equipped.values()]]}
    (SOURCE_PATH / 'character-v3-structure.json').write_text(json.dumps(facts, ensure_ascii=False, indent=2), encoding='utf-8')
    bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE_PATH / 'portfolio-character-v3.blend'))
    pose_for_review(rig)
    build_studio()
    bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE_PATH / 'character-v3-review.blend'))
    if '--face-only' not in sys.argv:
        bpy.context.scene.render.filepath = str(SOURCE_PATH / 'character-v3-full.png')
        bpy.ops.render.render(write_still=True)
    camera = bpy.context.scene.camera
    head_height = rig.data.bones['head'].tail_local.z - 0.11
    camera.location = (0.2, -5, head_height + 0.035)
    camera.rotation_euler = (Vector((0, -0.02, head_height)) - camera.location).to_track_quat('-Z', 'Y').to_euler()
    camera.data.ortho_scale = 0.57
    bpy.context.scene.render.resolution_x = 900
    bpy.context.scene.render.resolution_y = 900
    bpy.context.scene.render.filepath = str(SOURCE_PATH / 'character-v3-face.png')
    bpy.ops.render.render(write_still=True)


if __name__ == '__main__':
    main()
