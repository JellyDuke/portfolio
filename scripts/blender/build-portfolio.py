"""포트폴리오의 편집용 Blender 원본과 웹용 GLB를 생성한다.

Blender 4.5 LTS: blender --background --factory-startup --python scripts/blender/build-portfolio.py
모델의 내부 좌표는 웹과 동일한 Y-up이고, .blend에서만 루트를 Z-up으로 돌린다.
"""

import json
import math
import subprocess
import sys
from pathlib import Path

import bpy
from mathutils import Quaternion, Vector


ROOT_PATH = Path(__file__).resolve().parents[2]
SOURCE_PATH = ROOT_PATH / "assets/source/blender"
MODEL_PATH = ROOT_PATH / "assets/models"
JOINTS = {}
MATERIALS = {}


def material(name, hex_color, roughness=0.7):
    """기존 웹 색상을 선형 공간 재질로 만든다."""
    channels = [int(hex_color[index:index + 2], 16) / 255 for index in (0, 2, 4)]
    linear = [channel / 12.92 if channel <= 0.04045 else ((channel + 0.055) / 1.055) ** 2.4 for channel in channels]
    result = bpy.data.materials.new(name)
    result.use_nodes = True
    result.diffuse_color = (*linear, 1)
    shader = result.node_tree.nodes.get('Principled BSDF')
    shader.inputs['Base Color'].default_value = (*linear, 1)
    shader.inputs['Roughness'].default_value = roughness
    MATERIALS[name] = result


def joint(name, parent=None, location=(0, 0, 0)):
    """웹 애니메이션이 이름으로 찾는 회전축을 만든다."""
    result = bpy.data.objects.new(name, None)
    bpy.context.collection.objects.link(result)
    result.parent = parent
    result.location = location
    result.empty_display_size = 0.06
    JOINTS[name] = result
    return result


def attach(mesh, name, parent, color, location=(0, 0, 0)):
    """생성 메시를 관절에 붙이고 부드러운 법선과 재질을 지정한다."""
    mesh.name = name
    mesh.parent = parent
    mesh.location = location
    mesh.data.materials.append(MATERIALS[color])
    for polygon in mesh.data.polygons:
        polygon.use_smooth = True
    return mesh


def apply(mesh, modifier):
    """GLB에서도 같은 실루엣이 보이도록 Blender 모디파이어를 확정한다."""
    bpy.context.view_layer.objects.active = mesh
    bpy.ops.object.modifier_apply(modifier=modifier.name)


def box(name, parent, color, location, dimensions, radius=0.03):
    """재킷 디테일과 폴더의 단단한 부분을 둥근 상자로 만든다."""
    bpy.ops.mesh.primitive_cube_add(size=1)
    mesh = bpy.context.object
    mesh.scale = dimensions
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    attach(mesh, name, parent, color, location)
    bevel = mesh.modifiers.new('rounded_edges', 'BEVEL')
    bevel.width = radius
    bevel.segments = 3
    apply(mesh, bevel)
    normals = mesh.modifiers.new('face_normals', 'WEIGHTED_NORMAL')
    apply(mesh, normals)
    return mesh


def sphere(name, parent, color, location, dimensions, segments=16, rings=10):
    """부드러운 얼굴·손·신발 재료를 저용량 타원체로 만든다."""
    bpy.ops.mesh.primitive_uv_sphere_add(segments=segments, ring_count=rings, radius=1)
    mesh = bpy.context.object
    mesh.scale = dimensions
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    return attach(mesh, name, parent, color, location)


def tapered(name, parent, color, rings, segments=24):
    """높이별 타원 단면으로 몸통과 팔다리의 옷 주름을 만든다."""
    vertices = []
    for height, radius_x, radius_z in rings:
        for step in range(segments):
            angle = step * 2 * math.pi / segments
            vertices.append((radius_x * math.cos(angle), height, radius_z * math.sin(angle)))
    faces = [tuple(range(segments))]
    for row in range(len(rings) - 1):
        for column in range(segments):
            left = row * segments + column
            right = row * segments + (column + 1) % segments
            faces.append((left, left + segments, right + segments, right))
    faces.append(tuple(reversed(tuple((len(rings) - 1) * segments + column for column in range(segments)))))
    geometry = bpy.data.meshes.new(name)
    geometry.from_pydata(vertices, [], faces)
    geometry.update()
    mesh = bpy.data.objects.new(name, geometry)
    bpy.context.collection.objects.link(mesh)
    attach(mesh, name, parent, color)
    subdivision = mesh.modifiers.new('tailored_surface', 'SUBSURF')
    subdivision.levels = 2 if name == 'face' else 1
    apply(mesh, subdivision)
    return mesh


def line(name, parent, color, points, radius=0.009):
    """눈썹·미소·운동화 끈을 작은 곡선 메시로 만든다."""
    curve = bpy.data.curves.new(name, 'CURVE')
    curve.dimensions = '3D'
    curve.resolution_u = 6
    curve.bevel_depth = radius
    curve.bevel_resolution = 1
    spline = curve.splines.new('BEZIER')
    spline.bezier_points.add(len(points) - 1)
    for handle, point in zip(spline.bezier_points, points):
        handle.co = point
        handle.handle_left_type = 'AUTO'
        handle.handle_right_type = 'AUTO'
    obj = bpy.data.objects.new(name, curve)
    bpy.context.collection.objects.link(obj)
    obj.parent = parent
    curve.materials.append(MATERIALS[color])
    bpy.ops.object.select_all(action='DESELECT')
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.convert(target='MESH')


def surface(name, parent, color, vertices, faces, thickness=0):
    """머리카락과 옷의 얇은 곡면을 덩어리 중첩 없이 직접 만든다."""
    geometry = bpy.data.meshes.new(name)
    geometry.from_pydata(vertices, [], faces)
    geometry.update()
    mesh = bpy.data.objects.new(name, geometry)
    bpy.context.collection.objects.link(mesh)
    attach(mesh, name, parent, color)
    if thickness:
        modifier = mesh.modifiers.new('fabric_thickness', 'SOLIDIFY')
        modifier.thickness = thickness
        apply(mesh, modifier)
    return mesh


def hairstyle(skull):
    """앞머리·옆머리를 하나의 비대칭 두피 곡면으로 연결해 구슬 모양을 없앤다."""
    columns, rows = 48, 18
    vertices, faces = [], []
    for row in range(rows + 1):
        for column in range(columns):
            angle = column / columns * math.tau
            front = max(0, math.sin(angle))
            boundary = 1.98 - front ** 0.25 * 0.78 + 0.10 * math.cos(angle) * front
            latitude = 0.018 + (boundary - 0.018) * row / rows
            sweep = max(0, -math.cos(angle)) * front * math.sin(latitude)
            # 가르마 방향의 낮은 능선을 같은 표면에 넣고, 이마와 눈썹 위는 드러낸다.
            ridge = 0.004 * math.sin(10 * (angle + latitude * 0.8)) * math.sin(latitude)
            vertices.append(((0.334 + ridge) * math.sin(latitude) * math.cos(angle) - 0.012 * front,
                             0.040 + 0.430 * math.cos(latitude) + sweep * 0.066,
                             -0.014 + (0.346 + ridge) * math.sin(latitude) * math.sin(angle)))
    for row in range(rows):
        for column in range(columns):
            a = row * columns + column
            b = row * columns + (column + 1) % columns
            faces.append((a, b, b + columns, a + columns))
    faces.append(tuple(reversed(range(columns))))
    surface('swept_hair', skull, 'hair', vertices, faces, 0.012)


def character(root):
    """연속적인 턱선·머리카락·옷깃과 손가락을 갖춘 청색 오버셔츠 캐릭터를 만든다."""
    actor = joint('character', root, (-1.1, 0, 0))
    hips = joint('hips', actor, (0, 0.98, 0))
    box('waist', hips, 'trousers', (0, 0, 0), (0.52, 0.19, 0.32), 0.065)
    torso = joint('torso', hips, (0, 0.06, 0))
    tapered('jacket_body', torso, 'jacket', [(0.02, 0.27, 0.157), (0.055, 0.29, 0.17), (0.14, 0.305, 0.18), (0.4, 0.325, 0.2), (0.64, 0.355, 0.185), (0.75, 0.33, 0.163), (0.82, 0.20, 0.119)])
    shirt_rows = [(0.075, 0.086, 0.179), (0.2, 0.09, 0.19), (0.42, 0.103, 0.204), (0.65, 0.106, 0.195), (0.80, 0.085, 0.164)]
    vertices = [(side * half_width, y, z) for y, half_width, z in shirt_rows for side in (-1, 1)]
    surface('tee_insert', torso, 'shirt', vertices, [(i * 2, i * 2 + 1, i * 2 + 3, i * 2 + 2) for i in range(4)], 0.008)
    for side in (-1, 1):
        line(f'placket_{side}', torso, 'jacket_light', [(side * width, y, z + 0.003) for y, width, z in shirt_rows], 0.012)
        collar = [(side * 0.10, 0.83, 0.12), (side * 0.235, 0.74, 0.155), (side * 0.145, 0.58, 0.198), (side * 0.098, 0.69, 0.187)]
        surface(f'collar_{side}', torso, 'jacket_light', collar, [(0, 1, 2, 3) if side == -1 else (3, 2, 1, 0)], 0.013)
    line('pocket_welt', torso, 'jacket_light', [(0.17, 0.48, 0.177), (0.22, 0.48, 0.154), (0.275, 0.48, 0.116)], 0.012)
    for y in (0.21, 0.39, 0.56):
        sphere(f'button_{y}', torso, 'button', (0.12, y, 0.191), (0.011, 0.011, 0.007), 10, 6)
    sphere('neck', torso, 'skin', (0, 0.88, 0), (0.115, 0.17, 0.11), 24, 12)
    head = joint('head', torso, (0, 0.98, 0))
    skull = joint('skull', head, (0, 0.22, 0))
    tapered('face', skull, 'skin', [(-0.35, 0.08, 0.10), (-0.31, 0.165, 0.17), (-0.20, 0.25, 0.23), (-0.06, 0.29, 0.267), (0.09, 0.294, 0.27), (0.23, 0.27, 0.25), (0.33, 0.195, 0.18), (0.37, 0.07, 0.075)], 32)
    hairstyle(skull)
    for suffix, side in (('left', -1), ('right', 1)):
        sphere(f'ear_{suffix}', skull, 'skin', (side * 0.285, -0.025, -0.008), (0.051, 0.079, 0.043), 20, 12)
        sphere(f'ear_inner_{suffix}', skull, 'skin_warm', (side * 0.307, -0.02, 0.025), (0.023, 0.044, 0.012), 12, 8)
        eye = joint(f'eye_{suffix}', skull, (side * 0.113, 0.01, 0.241))
        sphere(f'eye_white_{suffix}', eye, 'shirt', (0, 0, 0), (0.067, 0.038, 0.019), 24, 12)
        pupil = joint(f'pupil_{suffix}', eye, (0, -0.001, 0.017))
        sphere(f'pupil_surface_{suffix}', pupil, 'iris', (0, 0, 0), (0.025, 0.031, 0.009), 20, 12)
        sphere(f'eye_glint_{suffix}', pupil, 'shirt', (-0.008, 0.01, 0.008), (0.005, 0.006, 0.003), 10, 6)
        line(f'eyelid_{suffix}', eye, 'skin_warm', [(-0.062, 0.008, 0.007), (0, 0.034, 0.015), (0.061, 0.005, 0.006)], 0.006)
        line(f'brow_{suffix}', skull, 'hair', [(side * 0.059, 0.093, 0.256), (side * 0.112, 0.109, 0.250), (side * 0.178, 0.089, 0.213)], 0.014)
        arm(torso, suffix, side)
        leg(hips, suffix, side)
    sphere('nose_bridge', skull, 'skin', (0, -0.013, 0.257), (0.028, 0.073, 0.036), 20, 12)
    sphere('nose', skull, 'skin', (0, -0.064, 0.280), (0.047, 0.038, 0.044), 24, 12)
    line('smile', skull, 'skin_warm', [(-0.070, -0.142, 0.238), (-0.012, -0.154, 0.251), (0.062, -0.138, 0.239)], 0.006)


def arm(torso, suffix, side):
    """기존 웹 IK의 0.42 단위 길이를 지키는 팔·손 피벗을 만든다."""
    shoulder = joint(f'shoulder_{suffix}', torso, (side * 0.38, 0.71, 0))
    tapered(f'upper_sleeve_{suffix}', shoulder, 'jacket', [(-0.44, 0.10, 0.103), (-0.39, 0.111, 0.114), (-0.28, 0.122, 0.125), (-0.08, 0.147, 0.14), (0.035, 0.13, 0.128), (0.085, 0.055, 0.06)])
    elbow = joint(f'elbow_{suffix}', shoulder, (0, -0.42, 0))
    sphere(f'elbow_fold_{suffix}', elbow, 'jacket', (0, 0, 0), (0.105, 0.105, 0.105), 16, 10)
    tapered(f'lower_sleeve_{suffix}', elbow, 'jacket', [(-0.355, 0.078, 0.082), (-0.31, 0.085, 0.088), (-0.24, 0.10, 0.107), (-0.09, 0.11, 0.114), (0.04, 0.098, 0.098)])
    cuff = tapered(f'cuff_{suffix}', elbow, 'jacket_light', [(-0.363, 0.083, 0.085), (-0.355, 0.089, 0.09), (-0.305, 0.091, 0.093), (-0.298, 0.086, 0.09)])
    hand = joint(f'hand_{suffix}', elbow, (0, -0.42, 0))
    sphere(f'palm_{suffix}', hand, 'skin', (0, -0.024, 0), (0.067, 0.084, 0.043), 20, 12)
    fingers = joint(f'fingers_{suffix}', hand, (0, -0.07, 0))
    for index in range(4):
        x = (index - 1.5) * 0.030
        line(f'finger_{suffix}_{index}', fingers, 'skin', [(x, 0, 0), (x, -0.045 - (1.5 - abs(index - 1.5)) * 0.007, 0.004), (x, -0.076, 0.024)], 0.016)
    line(f'thumb_{suffix}', hand, 'skin', [(-side * 0.05, -0.01, 0.01), (-side * 0.082, -0.046, 0.03), (-side * 0.073, -0.077, 0.045)], 0.024)


def leg(hips, suffix, side):
    """무릎과 발목을 유지하고 신발의 밝은 밑창을 따로 만든다."""
    thigh = joint(f'thigh_{suffix}', hips, (side * 0.17, -0.08, 0))
    tapered(f'thigh_mesh_{suffix}', thigh, 'trousers', [(-0.44, 0.13, 0.13), (-0.32, 0.15, 0.14), (-0.05, 0.16, 0.15), (0.02, 0.13, 0.13)])
    knee = joint(f'knee_{suffix}', thigh, (0, -0.44, 0))
    sphere(f'knee_fold_{suffix}', knee, 'trousers', (0, 0, 0), (0.128, 0.128, 0.124), 20, 12)
    tapered(f'calf_mesh_{suffix}', knee, 'trousers', [(-0.42, 0.11, 0.11), (-0.30, 0.12, 0.12), (-0.05, 0.135, 0.13), (0.025, 0.12, 0.12)])
    ankle = joint(f'ankle_{suffix}', knee, (0, -0.43, 0))
    box(f'shoe_{suffix}', ankle, 'hair', (0, -0.01, 0.075), (0.25, 0.15, 0.43), 0.055)
    box(f'sole_{suffix}', ankle, 'sole', (0, -0.083, 0.075), (0.26, 0.046, 0.445), 0.022)
    for number in range(3):
        z = 0.07 + number * 0.042
        line(f'lace_{suffix}_{number}', ankle, 'shirt', [(-0.06, 0.065, z), (0, 0.075, z + 0.008), (0.06, 0.065, z)], 0.006)


def panel(name, parent, color, has_tab, depth):
    """문서철의 앞뒤 판을 실제 두께와 상단 인덱스 탭으로 만든다."""
    outline = [(-1.4, 0), (1.4, 0), (1.44, 0.05), (1.44, 2.59 if has_tab else 2.30)]
    if has_tab:
        outline += [(1.4, 2.64), (-0.05, 2.64), (-0.26, 2.91), (-1.20, 2.91), (-1.44, 2.77)]
    else:
        outline += [(1.4, 2.35), (-1.4, 2.35), (-1.44, 2.30)]
    outline.append((-1.44, 0.05))
    count = len(outline)
    vertices = [(x, y, z) for z in (-0.027, 0.027) for x, y in outline]
    faces = [tuple(reversed(range(count))), tuple(range(count, count * 2))]
    faces += [(step, (step + 1) % count, (step + 1) % count + count, step + count) for step in range(count)]
    geometry = bpy.data.meshes.new(name)
    geometry.from_pydata(vertices, [], faces)
    geometry.update()
    mesh = bpy.data.objects.new(name, geometry)
    bpy.context.collection.objects.link(mesh)
    attach(mesh, name, parent, color, (0, 0, depth))
    bevel = mesh.modifiers.new('soft_edges', 'BEVEL')
    bevel.width = 0.025
    bevel.segments = 2
    apply(mesh, bevel)


def folder(root):
    """회전하는 앞표지와 독립적으로 날아가는 종이 네 장을 만든다."""
    container = joint('folder', root, (-0.15, 0, 0))
    body = joint('folder_body', container, (1.44, 0, 0))
    panel('folder_back_surface', body, 'folder_back', True, -0.15)
    box('folder_spine', body, 'folder_back', (0, 0.04, 0.025), (2.82, 0.095, 0.35))
    front = joint('folder_front', body, (0, 0.025, 0.2))
    panel('folder_front_surface', front, 'folder', False, 0)
    line('cover_crease', front, 'folder_detail', [(-1.32, 0.16, 0.03), (0, 0.16, 0.03), (1.32, 0.16, 0.03)], 0.006)
    for index in range(4):
        paper = joint(f'paper_{index}', body, ((index - 1.5) * 0.07, 1.48, 0.015 + index * 0.028))
        columns, rows = 10, 16
        vertices, faces = [], []
        for row in range(rows + 1):
            y = -0.875 + row / rows * 1.75
            for column in range(columns + 1):
                x = -0.62 + column / columns * 1.24
                vertices.append((x, y, 0.012 * (y / 0.875) ** 2 + 0.004 * math.cos(x * math.pi / 1.24)))
        for row in range(rows):
            for column in range(columns):
                corner = row * (columns + 1) + column
                faces.append((corner, corner + 1, corner + columns + 2, corner + columns + 1))
        geometry = bpy.data.meshes.new(f'paper_surface_{index}')
        geometry.from_pydata(vertices, [], faces)
        geometry.update()
        mesh = bpy.data.objects.new(f'paper_surface_{index}', geometry)
        bpy.context.collection.objects.link(mesh)
        attach(mesh, mesh.name, paper, 'paper')
        solidify = mesh.modifiers.new('paper_thickness', 'SOLIDIFY')
        solidify.thickness = 0.002
        apply(mesh, solidify)


def animate():
    """웹 관절 결과를 그대로 기록해 Blender 미리보기와 실제 사이트 동작을 일치시킨다."""
    subprocess.run(['node', str(ROOT_PATH / 'scripts/export-portfolio-poses.mjs'), '--rig'], cwd=ROOT_PATH, check=True)
    timeline = json.loads((SOURCE_PATH / 'portfolio-poses.json').read_text(encoding='utf-8'))
    scene = bpy.context.scene
    scene.render.fps = timeline['framesPerSecond']
    scene.frame_end = timeline['frames'][-1]['frame']
    previous_rotations = {}
    paper_keys = []
    for index in range(4):
        mesh = bpy.data.objects[f'paper_surface_{index}']
        mesh.shape_key_add(name='기본 종이')
        curl = mesh.shape_key_add(name='꺼낼 때 휘어짐')
        for vertex in curl.data:
            vertex.co.z += ((vertex.co.y + 0.875) / 1.75) ** 2
        paper_keys.append(curl)
    for sample in timeline['frames']:
        frame = sample['frame']
        for name, transform in sample['joints'].items():
            obj = JOINTS.get(name)
            if obj is None:
                continue
            obj.location = transform['position']
            x, y, z, w = transform['quaternion']
            obj.rotation_mode = 'QUATERNION'
            rotation = Quaternion((w, x, y, z))
            # 같은 방향의 반대 부호 쿼터니언 사이에서 중간 프레임이 뒤집히지 않게 한다.
            if name in previous_rotations and previous_rotations[name].dot(rotation) < 0:
                rotation.negate()
            previous_rotations[name] = rotation.copy()
            obj.rotation_quaternion = rotation
            obj.scale = transform['scale']
            for channel in ('location', 'rotation_quaternion', 'scale'):
                obj.keyframe_insert(data_path=channel, frame=frame, group='포트폴리오 연출')
        # 빈 오브젝트의 숨김은 자식 렌더에 전파되지 않으므로 각 메시에서 기록한다.
        for obj in JOINTS['folder'].children_recursive:
            if obj.type != 'MESH':
                continue
            hidden = not sample['pose']['folderVisible']
            parent = obj.parent
            if parent.name.startswith('paper_'):
                hidden = hidden or not sample['joints'][parent.name]['visible']
            obj.hide_render = hidden
            obj.hide_viewport = hidden
            obj.keyframe_insert(data_path='hide_render', frame=frame)
            obj.keyframe_insert(data_path='hide_viewport', frame=frame)
        for index, curl in enumerate(paper_keys):
            curl.value = sample['paperBends'][index]
            curl.keyframe_insert(data_path='value', frame=frame)
    # 이미 웹에서 완성된 곡선을 굽기 때문에 추가 베지어 보간으로 관절이 튀지 않게 한다.
    for action in bpy.data.actions:
        for fcurve in action.fcurves:
            for point in fcurve.keyframe_points:
                point.interpolation = 'LINEAR'
    for name, frame in (('얼굴 클로즈업', 1), ('달리기', 43), ('폴더 낙하', 154), ('두 손 접촉', 196), ('무게 받기', 203), ('들어 올리기', 229), ('내려놓기', 297), ('표지 열기', 331), ('종이 꺼내기', 343)):
        scene.timeline_markers.new(name, frame=frame)


def studio(root):
    """Blender 원본 미리보기 전용 바닥·카메라·부드러운 조명을 배치한다."""
    root.rotation_euler.x = math.pi / 2
    bpy.ops.mesh.primitive_plane_add(size=200)
    ground = bpy.context.object
    ground.name = 'studio_ground'
    ground.location.z = -0.065
    ground.data.materials.append(MATERIALS['background'])
    for name, position, power, size in (('key_light', (-3, -5, 7), 1100, 5), ('fill_light', (4, -2, 5), 650, 4)):
        data = bpy.data.lights.new(name, 'AREA')
        data.energy = power
        data.shape = 'DISK'
        data.size = size
        light = bpy.data.objects.new(name, data)
        bpy.context.collection.objects.link(light)
        light.location = position
        light.rotation_euler = (Vector((0, 0, 1.5)) - light.location).to_track_quat('-Z', 'Y').to_euler()
    camera_data = bpy.data.cameras.new('studio_camera')
    camera = bpy.data.objects.new('studio_camera', camera_data)
    bpy.context.collection.objects.link(camera)
    camera.location = (3.8, -12, 5.3)
    camera_data.type = 'ORTHO'
    camera_data.ortho_scale = 5.5
    camera.rotation_euler = (Vector((1.0, 0, 1.4)) - camera.location).to_track_quat('-Z', 'Y').to_euler()
    scene = bpy.context.scene
    scene.camera = camera
    scene.render.engine = 'CYCLES'
    scene.cycles.samples = 24
    scene.cycles.use_denoising = True
    scene.world = bpy.data.worlds.new('studio_world')
    scene.world.use_nodes = True
    scene.world.node_tree.nodes['Background'].inputs['Color'].default_value = (0.75, 0.8, 0.9, 1)
    scene.world.node_tree.nodes['Background'].inputs['Strength'].default_value = 0.35
    scene.render.resolution_x = 1280
    scene.render.resolution_y = 800
    scene.view_settings.view_transform = 'AgX'


def inspect_motion():
    """대표 프레임의 바닥 접촉·손 위치·방향을 원본 좌표로 기록한다."""
    frames = json.loads((SOURCE_PATH / 'portfolio-poses.json').read_text(encoding='utf-8'))['frames']
    observations = []
    for frame in (1, 43, 154, 187, 196, 203, 229, 277, 297, 310, 331, 343, 356, 409):
        bpy.context.scene.frame_set(frame)
        bpy.context.view_layer.update()
        shoe_vertices = [
            (shoe.matrix_world @ vertex.co).y
            for suffix in ('left', 'right')
            for shoe in (bpy.data.objects[f'shoe_{suffix}'], bpy.data.objects[f'sole_{suffix}'])
            for vertex in shoe.data.vertices
        ]
        folder_obj = JOINTS['folder']
        grip_distances = []
        if frames[frame - 1]['pose']['grip'] >= 0.99:
            for index, suffix in enumerate(('left', 'right')):
                target = JOINTS['folder_body'].matrix_world @ Vector(((-1 if index == 0 else 1) * 1.62, 2.08, -0.30))
                hand = JOINTS[f'hand_{suffix}'].matrix_world.translation
                grip_distances.append(round((target - hand).length, 3))
        observations.append({
            'frame': frame, 'phase': frames[frame - 1]['pose']['phase'],
            'characterWorld': [round(value, 3) for value in JOINTS['character'].matrix_world.translation],
            'faceForward': [round(value, 3) for value in JOINTS['head'].matrix_world.to_quaternion() @ Vector((0, 0, 1))],
            'shoeMinY': round(min(shoe_vertices), 3),
            'folderY': round(folder_obj.matrix_world.translation.y, 3),
            'handToGripMeters': grip_distances,
            'feetWorld': [[round(value, 3) for value in JOINTS[f'ankle_{suffix}'].matrix_world.translation] for suffix in ('left', 'right')],
            'visiblePapers': [index for index in range(4) if not bpy.data.objects[f'paper_surface_{index}'].hide_render],
        })
    (SOURCE_PATH / 'portfolio-motion-inspection.json').write_text(json.dumps(observations, ensure_ascii=False, indent=2), encoding='utf-8')


def main():
    """공식 Blender의 빈 장면에서만 생성하고 원본·배포 자산을 저장한다."""
    if not (SOURCE_PATH / 'portfolio-poses.json').exists():
        raise RuntimeError('먼저 node scripts/export-portfolio-poses.mjs를 실행하세요.')
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.context.preferences.filepaths.save_version = 0
    MODEL_PATH.mkdir(parents=True, exist_ok=True)
    for name, color, roughness in (('jacket', '345edf', 0.78), ('jacket_light', '4064cc', 0.8), ('shirt', 'f9fafc', 0.85), ('trousers', '273750', 0.85), ('skin', 'e8b49a', 0.58), ('skin_warm', 'bd7f68', 0.72), ('hair', '202936', 0.56), ('hair_detail', '28313e', 0.6), ('iris', '35312f', 0.28), ('button', 'aab9d9', 0.4), ('sole', 'dce5f1', 0.8), ('folder', '315ae0', 0.5), ('folder_back', '2443ae', 0.55), ('folder_detail', '6080ee', 0.6), ('paper', 'f8faff', 0.9), ('background', 'edf1f6', 0.9)):
        material(name, color, roughness)
    root = joint('portfolio_root')
    character(root)
    folder(root)
    bpy.context.view_layer.update()
    meshes = [obj for obj in root.children_recursive if obj.type == 'MESH']
    triangles = 0
    for mesh in meshes:
        mesh.data.calc_loop_triangles()
        triangles += len(mesh.data.loop_triangles)
    bpy.ops.object.select_all(action='DESELECT')
    for obj in [root, *root.children_recursive]:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = root
    bpy.ops.export_scene.gltf(filepath=str(MODEL_PATH / 'portfolio-scene-v2.glb'), export_format='GLB', use_selection=True, export_yup=False, export_animations=False, export_cameras=False, export_lights=False)
    manifest = {'webUpAxis': '+Y', 'webForwardAxis': '+Z', 'blenderUpAxis': '+Z', 'paperCount': 4, 'meshCount': len(meshes), 'triangleCount': triangles, 'joints': list(JOINTS)}
    (SOURCE_PATH / 'portfolio-manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding='utf-8')
    print(f'에셋 생성: {len(meshes)} meshes / {triangles} triangles')
    animate()
    inspect_motion()
    studio(root)
    scene = bpy.context.scene
    scene.frame_set(356)
    bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE_PATH / 'portfolio-scene-v2.blend'))
    if '--skip-preview' not in sys.argv:
        scene.render.filepath = str(SOURCE_PATH / 'portfolio-preview.png')
        bpy.ops.render.render(write_still=True)


if __name__ == '__main__':
    main()
