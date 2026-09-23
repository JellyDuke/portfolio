"""Blender 4.5에서 편집 가능한 포트폴리오 원본, 경량 GLB, 미리보기를 생성한다.

실행: blender --background --factory-startup --python scripts/blender/build_portfolio.py
내부 관절은 웹의 Y-up을 유지하고, Blender 원본의 최상위 노드만 Z-up으로 회전한다.
유료 에셋·애드온·외부 텍스처를 사용하지 않는다.
"""

import json
import math
from pathlib import Path

import bpy
from mathutils import Euler, Vector


PROJECT_ROOT = Path(__file__).resolve().parents[2]
SOURCE_DIRECTORY = PROJECT_ROOT / "assets/source/blender"
MODEL_DIRECTORY = PROJECT_ROOT / "assets/models"
MODEL_NAME = "portfolio-scene-v1"
RIG = {}
MATERIALS = {}


def make_material(name, hex_color, roughness=0.65, metallic=0.0):
    """웹 색상 토큰을 선형 공간으로 변환한 Principled 재질을 만든다."""
    components = [int(hex_color[index:index + 2], 16) / 255 for index in (0, 2, 4)]
    linear = [component / 12.92 if component <= 0.04045 else ((component + 0.055) / 1.055) ** 2.4 for component in components]
    material = bpy.data.materials.new(name)
    material.diffuse_color = (*linear, 1)
    material.use_nodes = True
    shader = material.node_tree.nodes.get("Principled BSDF")
    shader.inputs["Base Color"].default_value = (*linear, 1)
    shader.inputs["Roughness"].default_value = roughness
    shader.inputs["Metallic"].default_value = metallic
    MATERIALS[name] = material
    return material


def make_joint(name, parent=None, location=(0, 0, 0)):
    """원점이 곧 웹 회전축인 빈 노드를 만들고 이름을 GLB 계약으로 보존한다."""
    joint = bpy.data.objects.new(name, None)
    bpy.context.collection.objects.link(joint)
    joint.empty_display_type = 'PLAIN_AXES'
    joint.empty_display_size = 0.08
    joint.parent = parent
    joint.location = location
    joint.rotation_mode = 'XYZ'
    RIG[name] = joint
    return joint


def finish_mesh(mesh, name, parent, material, location, smooth=True):
    """메시를 관절 로컬 좌표에 배치하고 일관된 재질과 법선을 적용한다."""
    mesh.name = name
    mesh.parent = parent
    mesh.location = location
    mesh.data.materials.append(MATERIALS[material])
    for polygon in mesh.data.polygons:
        polygon.use_smooth = smooth
    return mesh


def apply_modifier(mesh, modifier):
    """웹에서 Blender 전용 모디파이어가 누락되지 않도록 형상을 확정한다."""
    bpy.context.view_layer.objects.active = mesh
    bpy.ops.object.modifier_apply(modifier=modifier.name)


def rounded_box(name, parent, material, location, dimensions, radius=0.035):
    """각진 장난감 느낌을 줄이는 작은 모서리 라운드를 가진 상자를 만든다."""
    bpy.ops.mesh.primitive_cube_add(size=1)
    mesh = bpy.context.object
    mesh.scale = dimensions
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    finish_mesh(mesh, name, parent, material, location)
    bevel = mesh.modifiers.new("부드러운 모서리", 'BEVEL')
    bevel.width = radius
    bevel.segments = 3
    apply_modifier(mesh, bevel)
    normals = mesh.modifiers.new("면 법선", 'WEIGHTED_NORMAL')
    apply_modifier(mesh, normals)
    return mesh


def ellipsoid(name, parent, material, location, scale, segments=20, rings=12):
    """피부·눈·머리카락의 곡면을 텍스처 없는 저용량 타원체로 만든다."""
    bpy.ops.mesh.primitive_uv_sphere_add(segments=segments, ring_count=rings, radius=1)
    mesh = bpy.context.object
    mesh.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    return finish_mesh(mesh, name, parent, material, location)


def profile_mesh(name, parent, material, rings, segments=20):
    """높이별 타원 단면으로 옷과 팔다리의 둥근 테이퍼를 만든다."""
    vertices = []
    for height, radius_x, radius_z in rings:
        for index in range(segments):
            angle = index * 2 * math.pi / segments
            vertices.append((math.cos(angle) * radius_x, height, math.sin(angle) * radius_z))
    faces = [tuple(reversed(range(segments)))]
    for row in range(len(rings) - 1):
        for column in range(segments):
            left = row * segments + column
            right = row * segments + (column + 1) % segments
            faces.append((left, right, right + segments, left + segments))
    faces.append(tuple((len(rings) - 1) * segments + index for index in range(segments)))
    geometry = bpy.data.meshes.new(name)
    geometry.from_pydata(vertices, [], faces)
    geometry.update()
    mesh = bpy.data.objects.new(name, geometry)
    bpy.context.collection.objects.link(mesh)
    return finish_mesh(mesh, name, parent, material, (0, 0, 0))


def tube(name, parent, material, points, radius=0.009):
    """눈썹·미소·스티치처럼 짧은 디테일을 베지어 곡선으로 만든다."""
    curve = bpy.data.curves.new(name, 'CURVE')
    curve.dimensions = '3D'
    curve.resolution_u = 6
    curve.bevel_depth = radius
    curve.bevel_resolution = 2
    spline = curve.splines.new('BEZIER')
    spline.bezier_points.add(len(points) - 1)
    for control, point in zip(spline.bezier_points, points):
        control.co = point
        control.handle_left_type = 'AUTO'
        control.handle_right_type = 'AUTO'
    mesh = bpy.data.objects.new(name, curve)
    bpy.context.collection.objects.link(mesh)
    mesh.parent = parent
    curve.materials.append(MATERIALS[material])
    bpy.ops.object.select_all(action='DESELECT')
    mesh.select_set(True)
    bpy.context.view_layer.objects.active = mesh
    bpy.ops.object.convert(target='MESH')
    return mesh


def create_hair(skull):
    """顔を隠さない 짧은 헤어캡과 한 방향의 앞머리로 실루엣을 만든다."""
    columns, rows = 32, 10
    vertices, faces = [], []
    for row in range(rows + 1):
        for column in range(columns):
            angle = column * 2 * math.pi / columns
            front = max(0, math.sin(angle))
            edge_angle = 1.89 - front * 0.65
            polar = 0.015 + row / rows * edge_angle
            vertices.append((0.326 * math.sin(polar) * math.cos(angle),
                             0.07 + 0.374 * math.cos(polar),
                             -0.03 + 0.306 * math.sin(polar) * math.sin(angle)))
    for row in range(rows):
        for column in range(columns):
            left = row * columns + column
            right = row * columns + (column + 1) % columns
            faces.append((left, left + columns, right + columns, right))
    geometry = bpy.data.meshes.new("hair_cap")
    geometry.from_pydata(vertices, [], faces)
    geometry.update()
    mesh = bpy.data.objects.new("hair_cap", geometry)
    bpy.context.collection.objects.link(mesh)
    finish_mesh(mesh, "hair_cap", skull, "hair", (0, 0, 0))
    for index, (x, y, z, width) in enumerate([(-0.14, 0.277, 0.188, 0.20), (0.02, 0.305, 0.211, 0.18), (0.158, 0.294, 0.151, 0.13)]):
        lock = ellipsoid(f"hair_lock_{index}", skull, "hair", (x, y, z), (width, 0.107, 0.10))
        lock.rotation_euler.z = -0.22


def create_character(root):
    """청색 재킷·흰 티셔츠·남색 바지의 독립 관절 캐릭터를 만든다."""
    character = make_joint("character", root, (-1.15, 0, 0))
    hips = make_joint("hips", character, (0, 1.04, 0))
    rounded_box("waist", hips, "trousers", (0, 0, 0), (0.55, 0.24, 0.33), 0.095)
    torso = make_joint("torso", hips, (0, 0.06, 0))
    profile_mesh("jacket_body", torso, "jacket", [(0.045, 0.245, 0.14), (0.08, 0.306, 0.185), (0.22, 0.32, 0.195), (0.58, 0.368, 0.22), (0.76, 0.334, 0.20), (0.825, 0.245, 0.14)])
    rounded_box("shirt", torso, "shirt", (0, 0.465, 0.203), (0.235, 0.624, 0.073), 0.05)
    for side in (-1, 1):
        lapel = rounded_box(f"lapel_{side}", torso, "jacket_light", (side * 0.154, 0.586, 0.23), (0.075, 0.405, 0.045), 0.018)
        lapel.rotation_euler.z = side * -0.10
        tube(f"hem_{side}", torso, "jacket_light", [(side * 0.13, 0.11, 0.2), (side * 0.24, 0.11, 0.165), (side * 0.29, 0.115, 0.115)], 0.005)
    rounded_box("chest_pocket", torso, "jacket_light", (0.25, 0.50, 0.218), (0.095, 0.113, 0.018), 0.017)
    ellipsoid("neck", torso, "skin", (0, 0.922, 0), (0.113, 0.153, 0.112))
    head = make_joint("head", torso, (0, 0.98, 0))
    skull = make_joint("skull", head, (0, 0.22, 0))
    ellipsoid("face", skull, "skin", (0, 0, 0), (0.305, 0.383, 0.29), 28, 18)
    create_hair(skull)
    for suffix, side in (("left", -1), ("right", 1)):
        ellipsoid(f"ear_{suffix}", skull, "skin", (side * 0.298, -0.018, 0), (0.052, 0.08, 0.047))
        ellipsoid(f"ear_inner_{suffix}", skull, "skin_warm", (side * 0.329, -0.017, 0.018), (0.020, 0.045, 0.027), 12, 8)
        eye = make_joint(f"eye_{suffix}", skull, (side * 0.116, 0.017, 0.267))
        ellipsoid(f"eye_white_{suffix}", eye, "shirt", (0, 0, 0), (0.052, 0.057, 0.027))
        pupil = make_joint(f"pupil_{suffix}", eye, (0, -0.001, 0.025))
        ellipsoid(f"iris_{suffix}", pupil, "hair", (0, 0, 0), (0.025, 0.032, 0.015))
        ellipsoid(f"eye_glint_{suffix}", pupil, "shirt", (-0.007, 0.010, 0.013), (0.007, 0.008, 0.004), 10, 6)
        tube(f"brow_{suffix}", skull, "hair", [(side * 0.063, 0.112, 0.27), (side * 0.111, 0.13, 0.28), (side * 0.165, 0.114, 0.264)], 0.013)
        create_arm(torso, suffix, side)
        create_leg(hips, suffix, side)
    ellipsoid("nose", skull, "skin", (0, -0.044, 0.29), (0.05, 0.066, 0.06))
    tube("smile", skull, "skin_warm", [(-0.062, -0.132, 0.266), (0, -0.148, 0.274), (0.062, -0.132, 0.266)], 0.010)


def create_arm(torso, suffix, side):
    """기존 웹 IK와 동일한 0.42m 관절 길이를 가진 팔을 만든다."""
    shoulder = make_joint(f"shoulder_{suffix}", torso, (side * 0.38, 0.73, 0))
    profile_mesh(f"sleeve_upper_{suffix}", shoulder, "jacket", [(-0.43, 0.098, 0.1), (-0.38, 0.11, 0.114), (-0.12, 0.133, 0.135), (0, 0.095, 0.10)])
    elbow = make_joint(f"elbow_{suffix}", shoulder, (0, -0.42, 0))
    profile_mesh(f"sleeve_lower_{suffix}", elbow, "jacket", [(-0.353, 0.083, 0.088), (-0.31, 0.095, 0.098), (-0.10, 0.108, 0.11), (0.024, 0.096, 0.096)])
    rounded_box(f"cuff_{suffix}", elbow, "jacket_light", (0, -0.329, 0), (0.173, 0.060, 0.18), 0.023)
    hand = make_joint(f"hand_{suffix}", elbow, (0, -0.42, 0))
    ellipsoid(f"palm_{suffix}", hand, "skin", (0, 0, 0), (0.084, 0.111, 0.065))
    ellipsoid(f"thumb_{suffix}", hand, "skin", (-side * 0.067, 0.015, 0.021), (0.032, 0.060, 0.038), 12, 8)


def create_leg(hips, suffix, side):
    """무릎·발목 피벗을 유지한 바지와 밝은 밑창의 운동화를 만든다."""
    thigh = make_joint(f"thigh_{suffix}", hips, (side * 0.17, -0.08, 0))
    profile_mesh(f"trouser_upper_{suffix}", thigh, "trousers", [(-0.46, 0.125, 0.125), (-0.40, 0.139, 0.135), (-0.08, 0.155, 0.145), (0.026, 0.115, 0.13)])
    knee = make_joint(f"knee_{suffix}", thigh, (0, -0.44, 0))
    profile_mesh(f"trouser_lower_{suffix}", knee, "trousers", [(-0.425, 0.101, 0.105), (-0.37, 0.115, 0.111), (-0.12, 0.13, 0.126), (0.035, 0.121, 0.123)])
    ankle = make_joint(f"ankle_{suffix}", knee, (0, -0.43, 0))
    rounded_box(f"shoe_{suffix}", ankle, "hair", (0, -0.010, 0.075), (0.25, 0.155, 0.43), 0.055)
    rounded_box(f"sole_{suffix}", ankle, "sole", (0, -0.081, 0.075), (0.264, 0.05, 0.442), 0.022)
    for lace_index in range(3):
        z = 0.07 + lace_index * 0.043
        tube(f"lace_{suffix}_{lace_index}", ankle, "shirt", [(-0.063, 0.067, z), (0, 0.073, z + 0.01), (0.063, 0.067, z)], 0.006)


def folder_panel(name, parent, material, has_tab, z):
    """フォルダ가 아닌 실제 문서철 형태의 얇은 판과 상단 탭을 만든다."""
    outline = [(-1.40, 0), (1.40, 0), (1.44, 0.045), (1.44, 2.60 if has_tab else 2.31)]
    if has_tab:
        outline += [(1.40, 2.64), (-0.05, 2.64), (-0.26, 2.91), (-1.20, 2.91), (-1.44, 2.77)]
    else:
        outline += [(1.40, 2.35), (-1.40, 2.35), (-1.44, 2.31)]
    outline.append((-1.44, 0.045))
    count = len(outline)
    vertices = [(x, y, depth) for depth in (-0.027, 0.027) for x, y in outline]
    faces = [tuple(reversed(range(count))), tuple(range(count, count * 2))]
    faces += [(index, (index + 1) % count, (index + 1) % count + count, index + count) for index in range(count)]
    geometry = bpy.data.meshes.new(name)
    geometry.from_pydata(vertices, [], faces)
    geometry.update()
    mesh = bpy.data.objects.new(name, geometry)
    bpy.context.collection.objects.link(mesh)
    finish_mesh(mesh, name, parent, material, (0, 0, z))
    bevel = mesh.modifiers.new("종이철 모서리", 'BEVEL')
    bevel.width = 0.028
    bevel.segments = 3
    apply_modifier(mesh, bevel)
    normals = mesh.modifiers.new("면 법선", 'WEIGHTED_NORMAL')
    apply_modifier(mesh, normals)


def create_folder(root):
    """바닥 힌지의 앞표지와 독립적으로 펼칠 수 있는 종이 네 장을 만든다."""
    folder = make_joint("folder", root, (-0.15, 0, 0))
    body = make_joint("folder_body", folder, (1.44, 0, 0))
    body.rotation_euler.y = -0.12
    folder_panel("folder_back_surface", body, "folder_back", True, -0.15)
    rounded_box("folder_spine", body, "folder_back", (0, 0.04, 0.025), (2.82, 0.1, 0.35), 0.03)
    front = make_joint("folder_front", body, (0, 0.025, 0.2))
    folder_panel("folder_front_surface", front, "folder", False, 0)
    tube("cover_crease", front, "folder_detail", [(-1.34, 0.16, 0.030), (0, 0.16, 0.030), (1.34, 0.16, 0.030)], 0.006)
    rounded_box("index_label", body, "folder_detail", (-0.83, 2.776, -0.113), (0.67, 0.085, 0.008), 0.015)
    for index in range(4):
        paper = make_joint(f"paper_{index}", body, ((index - 1.5) * 0.07, 1.50, 0.015 + index * 0.032))
        vertices, faces = [], []
        columns, rows = 10, 16
        for row in range(rows + 1):
            y = -0.875 + row / rows * 1.75
            for column in range(columns + 1):
                x = -0.46 + column / columns * 0.92
                vertices.append((x, y, 0.055 * (y / 0.875) ** 2 + 0.025 * math.cos(x * math.pi / 0.92)))
        for row in range(rows):
            for column in range(columns):
                left = row * (columns + 1) + column
                faces.append((left, left + 1, left + columns + 2, left + columns + 1))
        geometry = bpy.data.meshes.new(f"paper_surface_{index}")
        geometry.from_pydata(vertices, [], faces)
        geometry.update()
        mesh = bpy.data.objects.new(f"paper_surface_{index}", geometry)
        bpy.context.collection.objects.link(mesh)
        finish_mesh(mesh, mesh.name, paper, "paper", (0, 0, 0))
        solidify = mesh.modifiers.new("실제 종이 두께", 'SOLIDIFY')
        solidify.thickness = 0.004
        apply_modifier(mesh, solidify)


def align_arm(suffix, target, weight):
    """웹과 같은 2관절 IK로 손 중심을 폴더의 그립 지점에 맞춘다."""
    torso = RIG["torso"]
    shoulder = RIG[f"shoulder_{suffix}"]
    elbow = RIG[f"elbow_{suffix}"]
    local_target = torso.matrix_world.inverted() @ target
    direction = local_target - shoulder.location
    distance = min(0.839, max(0.001, direction.length))
    direction.normalize()
    bend = torso.matrix_world.to_quaternion().inverted() @ Vector((0, 0, 1))
    bend = (bend - direction * bend.dot(direction)).normalized()
    elbow_position = shoulder.location + direction * (distance / 2) + bend * math.sqrt(0.42 ** 2 - (distance / 2) ** 2)
    down = Vector((0, -1, 0))
    shoulder_rotation = down.rotation_difference((elbow_position - shoulder.location).normalized())
    elbow_rotation = down.rotation_difference(shoulder_rotation.inverted() @ (local_target - elbow_position).normalized())
    shoulder.rotation_euler = shoulder.rotation_euler.to_quaternion().slerp(shoulder_rotation, weight).to_euler('XYZ')
    elbow.rotation_euler = elbow.rotation_euler.to_quaternion().slerp(elbow_rotation, weight).to_euler('XYZ')


def apply_pose(pose, seconds):
    """JS 자세 파일을 편집 가능한 Blender 키프레임으로 변환할 준비를 한다."""
    step = math.sin(seconds * 10) * pose["stride"]
    RIG["character"].location = (pose["characterX"], 0, pose["characterZ"])
    RIG["character"].rotation_euler.y = pose["characterYaw"]
    RIG["hips"].location.y = pose["hipHeight"] + math.sin(seconds * 1.8) * 0.006 + abs(step) * 0.035
    # Three.js XYZ는 intrinsic 순서이므로 Blender의 대응 순서 ZYX를 거쳐 회전행렬을 맞춘다.
    RIG["torso"].rotation_euler = Euler((pose["bodyPitch"] - pose["kneeBend"] * 0.16, pose["torsoYaw"], pose["bodyLean"]), 'ZYX').to_matrix().to_euler('XYZ')
    RIG["head"].rotation_euler = Euler((pose["headTilt"], pose["headYaw"], -pose["bodyLean"] * 0.2), 'ZXY').to_matrix().to_euler('XYZ')
    blink_distance = min(abs(seconds - instant) for instant in (0.55, 3.25, 4.23, 10.45))
    blink = math.cos(blink_distance / 0.095 * math.pi / 2) ** 2 if blink_distance < 0.095 else 0
    for suffix, direction in (("left", 1), ("right", -1)):
        RIG[f"eye_{suffix}"].scale.y = 1 - blink * 0.94
        RIG[f"pupil_{suffix}"].location.x = pose["eyeYaw"] * 0.018
        RIG[f"pupil_{suffix}"].location.y = -0.001 + pose["eyePitch"] * 0.012
        arm_key = "leftArm" if suffix == "left" else "rightArm"
        RIG[f"shoulder_{suffix}"].rotation_euler = Euler((pose["armReach"] + direction * step * 0.32, 0, pose[arm_key]), 'ZYX').to_matrix().to_euler('XYZ')
        RIG[f"elbow_{suffix}"].rotation_euler = (-pose["elbowBend"], 0, 0)
        RIG[f"thigh_{suffix}"].rotation_euler.x = -pose["kneeBend"] * 1.05 + step * 0.32 * direction
        RIG[f"knee_{suffix}"].rotation_euler.x = pose["kneeBend"] * 2.1 + max(0, -step * direction) * 0.2
        RIG[f"ankle_{suffix}"].rotation_euler.x = -pose["kneeBend"] * 1.05
    folder = RIG["folder"]
    folder.location = (pose["folderX"] - 1.44, pose["folderY"], 0)
    folder.rotation_euler.z = pose["folderTilt"]
    folder.scale = (pose["folderScale"],) * 3
    RIG["folder_front"].rotation_euler.x = 0.035 + pose["paperReveal"] * 0.48
    for index in range(4):
        paper = RIG[f"paper_{index}"]
        paper.location = ((index - 1.5) * 1.05 * pose["paperReveal"], 1.42 + pose["paperReveal"] * 1.32, 0.03 + index * 0.028)
        paper.rotation_euler.z = -(index - 1.5) * 0.11 * pose["paperReveal"]
    bpy.context.view_layer.update()
    if pose["grip"] > 0:
        tilt_amount = min(1, pose["folderTilt"] / 1.43)
        for index, suffix in enumerate(("left", "right")):
            target = folder.matrix_world @ Vector((0.2 + index * 0.45 + tilt_amount * 0.8, 0.8 - tilt_amount * 0.5, 0.28))
            align_arm(suffix, target, pose["grip"])
        bpy.context.view_layer.update()


def bake_preview_animation():
    """単一 시간표를 원본에 베이크하되 웹은 JS 시간표를 계속 사용한다."""
    motion = json.loads((SOURCE_DIRECTORY / "portfolio-poses.json").read_text(encoding="utf-8"))
    scene = bpy.context.scene
    scene.render.fps = motion["framesPerSecond"]
    scene.frame_end = motion["frames"][-1]["frame"]
    for sample in motion["frames"]:
        apply_pose(sample["pose"], sample["seconds"])
        for name, joint in RIG.items():
            if name == "portfolio_root":
                continue
            for attribute in ("location", "rotation_euler", "scale"):
                joint.keyframe_insert(data_path=attribute, frame=sample["frame"], group="포트폴리오 연출")
        for descendant in RIG["folder"].children_recursive:
            if descendant.type == 'MESH':
                descendant.hide_render = not sample["pose"]["folderVisible"]
                descendant.keyframe_insert(data_path="hide_render", frame=sample["frame"])
    for name, frame in (("얼굴 클로즈업", 1), ("뒤돌아 달리기", 43), ("폴더 낙하", 154), ("집기", 187), ("들어 올리기", 226), ("내려놓기", 298), ("종이 펼치기", 356)):
        scene.timeline_markers.new(name, frame=frame)


def aim_at(obj, point):
    """카메라와 면광원의 -Z 축을 장면 중심으로 향하게 한다."""
    obj.rotation_euler = (Vector(point) - obj.location).to_track_quat('-Z', 'Y').to_euler()


def setup_studio():
    """웹에 내보내지 않는 Z-up 스튜디오와 원본 편집용 카메라를 만든다."""
    scene = bpy.context.scene
    scene.render.engine = 'CYCLES'
    scene.cycles.samples = 24
    scene.cycles.use_denoising = True
    scene.render.resolution_x, scene.render.resolution_y = 1280, 800
    scene.render.resolution_percentage = 100
    scene.world.color = (0.35, 0.35, 0.35)
    scene.view_settings.view_transform = 'AgX'
    bpy.ops.mesh.primitive_plane_add(size=200)
    ground = bpy.context.object
    ground.name = "studio_ground"
    ground.location.z = -0.065
    ground.data.materials.append(MATERIALS["background"])
    for name, location, energy, size in (("key_softbox", (-3, -5, 7), 950, 5), ("fill_softbox", (4, -2, 5), 650, 4), ("rim_softbox", (2, 4, 6), 1100, 3)):
        light_data = bpy.data.lights.new(name, 'AREA')
        light_data.energy = energy
        light_data.shape = 'DISK'
        light_data.size = size
        light = bpy.data.objects.new(name, light_data)
        bpy.context.collection.objects.link(light)
        light.location = location
        aim_at(light, (0.5, 0, 1.5))
    camera_data = bpy.data.cameras.new("studio_camera")
    camera = bpy.data.objects.new("studio_camera", camera_data)
    bpy.context.collection.objects.link(camera)
    camera.location = (5.7, -12, 6.1)
    camera_data.type = 'ORTHO'
    camera_data.ortho_scale = 7.6
    aim_at(camera, (0.5, 0, 1.85))
    scene.camera = camera
    for screen in bpy.data.screens:
        for area in screen.areas:
            if area.type == 'VIEW_3D':
                area.spaces.active.region_3d.view_perspective = 'CAMERA'


def write_asset_manifest(root):
    """좌표계·관절 이름·메시 예산을 남겨 이후 리깅 수정의 기준으로 삼는다."""
    meshes = [obj for obj in root.children_recursive if obj.type == 'MESH']
    triangles = 0
    for mesh in meshes:
        mesh.data.calc_loop_triangles()
        triangles += len(mesh.data.loop_triangles)
    manifest = {
        "generator": f"Blender {bpy.app.version_string}",
        "webUpAxis": "+Y", "webForwardAxis": "+Z", "blenderUpAxis": "+Z",
        "rigType": "parented-object-pivots", "paperCount": 4,
        "meshCount": len(meshes), "triangleCount": triangles,
        "joints": [{"name": name, "parent": joint.parent.name if joint.parent else None, "localPosition": list(joint.location)} for name, joint in RIG.items()],
        "webAnimation": "frontend/portfolio/animation.js",
        "note": "GLB는 정적 관절과 재질을 담고 웹이 관절을 구동한다. .blend에는 30fps 편집용 키프레임이 포함된다.",
    }
    (SOURCE_DIRECTORY / "portfolio-manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"에셋 생성: {len(meshes)} meshes, {triangles} triangles, 4 papers")


def main():
    """새 프로세스의 빈 장면에서만 생성하고 원본과 배포 자산을 분리한다."""
    if not (SOURCE_DIRECTORY / "portfolio-poses.json").exists():
        raise RuntimeError("먼저 node scripts/export-portfolio-poses.mjs를 실행하세요.")
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.context.preferences.filepaths.save_version = 0
    SOURCE_DIRECTORY.mkdir(parents=True, exist_ok=True)
    MODEL_DIRECTORY.mkdir(parents=True, exist_ok=True)
    for name, color, roughness in (("jacket", "345edf", 0.65), ("jacket_light", "5375df", 0.7), ("shirt", "f9fafc", 0.83), ("trousers", "273750", 0.8), ("skin", "e8b49a", 0.72), ("skin_warm", "bd7f68", 0.8), ("hair", "1d2535", 0.68), ("sole", "dce5f1", 0.74), ("folder", "315ae0", 0.40), ("folder_back", "2443ae", 0.48), ("folder_detail", "6080ee", 0.52), ("paper", "f8faff", 0.76), ("background", "edf1f6", 0.9)):
        make_material(name, color, roughness)
    root = make_joint("portfolio_root")
    create_character(root)
    create_folder(root)
    bpy.context.view_layer.update()
    write_asset_manifest(root)
    bpy.ops.object.select_all(action='DESELECT')
    for obj in [root, *root.children_recursive]:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = root
    # 내부 좌표가 이미 Y-up이므로 내보내기에서 축을 다시 바꾸지 않는다.
    bpy.ops.export_scene.gltf(filepath=str(MODEL_DIRECTORY / f"{MODEL_NAME}.glb"), export_format='GLB', use_selection=True, export_yup=False, export_animations=False, export_cameras=False, export_lights=False, export_extras=True)
    bake_preview_animation()
    root.rotation_euler.x = math.pi / 2
    setup_studio()
    scene = bpy.context.scene
    scene.frame_set(356)
    bpy.ops.object.select_all(action='DESELECT')
    RIG["character"].select_set(True)
    bpy.context.view_layer.objects.active = RIG["character"]
    bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE_DIRECTORY / f"{MODEL_NAME}.blend"))
    scene.render.filepath = str(SOURCE_DIRECTORY / "portfolio-preview.png")
    bpy.ops.render.render(write_still=True)


if __name__ == "__main__":
    main()
