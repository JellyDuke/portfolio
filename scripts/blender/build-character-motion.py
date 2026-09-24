"""인물 스킨 리그에 웹 시간표의 접촉 동작을 굽고 웹용 GLB와 검토 원본을 저장한다."""
import gzip
import importlib.util
import json
import math
import sys
from pathlib import Path

import bpy
from mathutils import Matrix, Quaternion, Vector


ROOT_PATH = Path(__file__).resolve().parents[2]
SOURCE_PATH = ROOT_PATH / 'assets/source/blender'
MODEL_PATH = ROOT_PATH / 'assets/models'
FLOOR_HEIGHT = -0.065
REVIEW_TIMES = (0, 6.5, 7.6, 9.85, 11.65)


def flatten_mesh(obj):
    """피부 연결은 유지하고 마스크·표면 분할만 확정해 숨은 인체와 보조 면을 배포에서 제거한다."""
    armature = next(modifier for modifier in obj.modifiers if modifier.type == 'ARMATURE')
    armature.show_viewport = False
    armature.show_render = False
    if obj.name.startswith('portrait_hair'):
        for modifier in obj.modifiers:
            if modifier.type == 'SUBSURF':
                modifier.levels = 0
    if 'male_casualsuit' in obj.name or 'shoes01' in obj.name:
        modifier = obj.modifiers.new('web_surface_budget', 'DECIMATE')
        modifier.ratio = 0.60
    bpy.context.view_layer.update()
    evaluated = obj.evaluated_get(bpy.context.evaluated_depsgraph_get())
    mesh = bpy.data.meshes.new_from_object(evaluated, preserve_all_data_layers=True, depsgraph=bpy.context.evaluated_depsgraph_get())
    for modifier in list(obj.modifiers):
        if modifier != armature:
            obj.modifiers.remove(modifier)
    obj.data = mesh
    armature.show_viewport = True
    armature.show_render = True


def add_blink_and_flatten(body):
    """CC0 눈꺼풀 변형을 확대 얼굴에 맞추고 확정된 표면에도 같은 깜빡임을 보존한다."""
    body.shape_key_add(name='Basis')
    blink = body.shape_key_add(name='blink')
    target_root = SOURCE_PATH / 'vendor/mpfb2-2.0.17/src/mpfb/data/targets/expression/units'
    for family, weight in [('asian', 0.65), ('caucasian', 0.35)]:
        for side in ['left', 'right']:
            with gzip.open(target_root / family / f'eye-{side}-closure.target.gz', 'rt') as target_file:
                for line in target_file:
                    parts = line.split()
                    if len(parts) != 4 or parts[0].startswith('#'):
                        continue
                    index, x, y, z = int(parts[0]), float(parts[1]), float(parts[2]), float(parts[3])
                    blink.data[index].co += Vector((x * 0.142, -z * 0.134, y * 0.15)) * weight
    armature = next(modifier for modifier in body.modifiers if modifier.type == 'ARMATURE')
    armature.show_viewport = False
    blink.value = 1.0
    bpy.context.view_layer.update()
    closed_mesh = bpy.data.meshes.new_from_object(body.evaluated_get(bpy.context.evaluated_depsgraph_get()), depsgraph=bpy.context.evaluated_depsgraph_get())
    closed_coordinates = [vertex.co.copy() for vertex in closed_mesh.vertices]
    bpy.data.meshes.remove(closed_mesh)
    blink.value = 0.0
    flatten_mesh(body)
    body.shape_key_add(name='Basis')
    final_blink = body.shape_key_add(name='blink')
    if len(final_blink.data) != len(closed_coordinates):
        raise RuntimeError('눈꺼풀과 기본 얼굴의 정점 수가 다릅니다.')
    for point, coordinate in zip(final_blink.data, closed_coordinates):
        point.co = coordinate


def bake_skin_material(body):
    """Blender 전용 색 혼합을 한 장의 로컬 텍스처로 굽고 브라우저와 같은 재질로 단순화한다."""
    material = body.data.materials[0]
    nodes = material.node_tree.nodes
    shader = nodes.get('Principled BSDF')
    image = bpy.data.images.new('portrait_skin_color', width=2048, height=2048, alpha=False)
    texture = nodes.new('ShaderNodeTexImage')
    texture.image = image
    nodes.active = texture
    bpy.ops.object.select_all(action='DESELECT')
    body.select_set(True)
    bpy.context.view_layer.objects.active = body
    scene = bpy.context.scene
    scene.render.engine = 'CYCLES'
    scene.cycles.samples = 1
    scene.render.bake.use_pass_direct = False
    scene.render.bake.use_pass_indirect = False
    scene.render.bake.use_pass_color = True
    scene.render.bake.margin = 8
    bpy.ops.object.bake(type='DIFFUSE')
    image.filepath_raw = str(SOURCE_PATH / 'portrait-skin-color.jpg')
    image.file_format = 'JPEG'
    image.save()
    material.node_tree.links.new(texture.outputs['Color'], shader.inputs['Base Color'])
    for node in list(nodes):
        if node not in [shader, texture] and node.type != 'OUTPUT_MATERIAL':
            nodes.remove(node)
    for attribute in list(body.data.color_attributes):
        body.data.color_attributes.remove(attribute)
    # 눈과 눈썹의 표준 이미지·알파 연결은 glTF가 직접 읽도록 한다.
    baked_materials = set()
    for obj in bpy.data.objects:
        if obj.type != 'MESH' or obj == body:
            continue
        for material in obj.data.materials:
            if not material or not material.use_nodes or material.name in baked_materials:
                continue
            baked_materials.add(material.name)
            texture = next((node for node in material.node_tree.nodes if node.type == 'TEX_IMAGE'), None)
            shader = next((node for node in material.node_tree.nodes if node.type == 'BSDF_PRINCIPLED'), None)
            if texture and shader:
                if obj.name.startswith('portrait_hair') or 'high-poly' in obj.name:
                    # 헤어 색조와 짙은 홍채를 굽는다. 흰자는 유지해 눈 전체가 검게 되지 않게 한다.
                    is_hair = obj.name.startswith('portrait_hair')
                    if not is_hair:
                        gamma = material.node_tree.nodes.new('ShaderNodeGamma')
                        gamma.inputs['Gamma'].default_value = 1.9
                        material.node_tree.links.new(texture.outputs['Color'], gamma.inputs['Color'])
                        material.node_tree.links.new(gamma.outputs[0], shader.inputs['Base Color'])
                        shader.inputs['Roughness'].default_value = 0.27
                    color_name = 'portrait_hair_color' if is_hair else 'portrait_eye_color'
                    resolution = 1024 if is_hair else 512
                    hair_color = bpy.data.images.new(color_name, width=resolution, height=resolution, alpha=False)
                    hair_texture = material.node_tree.nodes.new('ShaderNodeTexImage')
                    hair_texture.image = hair_color
                    material.node_tree.nodes.active = hair_texture
                    bpy.ops.object.select_all(action='DESELECT')
                    # 같은 재질을 쓰는 모발 면은 함께 구워 공유 UV의 색을 일치시킨다.
                    for shared in bpy.data.objects:
                        if shared.type == 'MESH' and material.name in shared.data.materials:
                            shared.select_set(True)
                    bpy.context.view_layer.objects.active = obj
                    bpy.ops.object.bake(type='DIFFUSE')
                    material.node_tree.links.new(hair_texture.outputs['Color'], shader.inputs['Base Color'])
                    hair_color.filepath_raw = str(SOURCE_PATH / f'{color_name}.png')
                    hair_color.file_format = 'PNG'
                    hair_color.save()
                    continue
                material.node_tree.links.new(texture.outputs['Color'], shader.inputs['Base Color'])
                if 'eyebrow' in obj.name:
                    material.node_tree.links.new(texture.outputs['Alpha'], shader.inputs['Alpha'])
                    material.surface_render_method = 'DITHERED'
                shader.inputs['Roughness'].default_value = 0.34 if 'high-poly' in obj.name else 0.8


def point_bone(rig, name, direction):
    """뼈의 꼬리 방향을 맞추되 기존 비틀림과 관절 연결은 보존한다."""
    bone = rig.pose.bones[name]
    matrix = bone.matrix.copy()
    current_direction = (matrix.to_3x3() @ Vector((0, 1, 0))).normalized()
    rotation = current_direction.rotation_difference(Vector(direction).normalized())
    adjusted = rotation.to_matrix().to_4x4() @ matrix
    adjusted.translation = matrix.translation
    bone.matrix = adjusted
    bpy.context.view_layer.update()


def rotate_bone(rig, name, rotation):
    """머리·상체 회전을 리그 좌표에서 더해 뼈별 로컬 축 차이에 의한 뒤틀림을 피한다."""
    bone = rig.pose.bones[name]
    matrix = rotation.to_matrix().to_4x4() @ bone.matrix
    matrix.translation = bone.matrix.translation
    bone.matrix = matrix
    bpy.context.view_layer.update()


def solve_limb(rig, upper_name, lower_name, target, pole):
    """원본 뼈 길이로 두 관절 IK를 계산하고 접촉점 도달 오차를 반환한다."""
    upper = rig.pose.bones[upper_name]
    lower = rig.pose.bones[lower_name]
    start = upper.head.copy()
    upper_length = rig.data.bones[upper_name].length
    lower_length = rig.data.bones[lower_name].length
    direction = target - start
    distance = max(0.001, min(direction.length, upper_length + lower_length - 0.0001))
    direction.normalize()
    bend = Vector(pole)
    bend -= direction * bend.dot(direction)
    bend.normalize()
    along = (upper_length ** 2 - lower_length ** 2 + distance ** 2) / (2 * distance)
    elbow = start + direction * along + bend * math.sqrt(max(0.0, upper_length ** 2 - along ** 2))
    point_bone(rig, upper_name, elbow - start)
    point_bone(rig, lower_name, target - elbow)
    return (lower.tail - target).length * rig.scale.x


def hand_orientation(rig, suffix, direction):
    """원본 손바닥의 방향을 읽어 손가락은 아래로, 손바닥은 폴더 뒷면으로 향하게 한다."""
    bones = rig.data.bones
    wrist = bones[f'hand_{suffix}'].head_local
    forward = (bones[f'middle_01_{suffix}'].head_local - wrist).normalized()
    normal = (bones[f'index_01_{suffix}'].head_local - wrist).cross(bones[f'pinky_01_{suffix}'].head_local - wrist).normalized() * -direction
    normal = (normal - forward * normal.dot(forward)).normalized()
    reference = Matrix((forward.cross(normal), forward, normal)).transposed()
    desired_forward = Vector((0, 0, -1))
    desired_normal = Vector((0, -1, 0))
    desired = Matrix((desired_forward.cross(desired_normal), desired_forward, desired_normal)).transposed()
    return (desired @ reference.inverted()).to_quaternion() @ bones[f'hand_{suffix}'].matrix_local.to_quaternion()


def animate_character(rig, body, samples, scale, floor_offset):
    """발 디딤과 폴더 접점을 고정한 채 시간표를 실제 스킨 뼈의 키프레임으로 변환한다."""
    rest_rotations = {bone.name: bone.matrix_local.to_quaternion() for bone in rig.data.bones}
    wrist_rotations = {suffix: hand_orientation(rig, suffix, direction) for suffix, direction in [('l', 1), ('r', -1)]}
    previous_quaternions = {}
    previous_root_rotation = None
    observations = []
    shoe = next(obj for obj in rig.children if obj.type == 'MESH' and 'shoes01' in obj.name)
    shoe_vertices = {suffix: [vertex.index for vertex in shoe.data.vertices if vertex.co.x * direction > 0]
                     for suffix, direction in [('l', 1), ('r', -1)]}
    rig.rotation_mode = 'QUATERNION'
    for sample in samples:
        frame, seconds, pose = sample['frame'], sample['seconds'], sample['pose']
        rig.location = (pose['characterX'], -pose['characterZ'], floor_offset)
        rig.rotation_quaternion = Quaternion((0, 0, 1), pose['characterYaw'])
        if previous_root_rotation and previous_root_rotation.dot(rig.rotation_quaternion) < 0:
            rig.rotation_quaternion.negate()
        previous_root_rotation = rig.rotation_quaternion.copy()
        for bone in rig.pose.bones:
            bone.rotation_mode = 'QUATERNION'
            bone.matrix_basis = Matrix.Identity(4)
        bpy.context.view_layer.update()
        pelvis = rig.pose.bones['pelvis']
        matrix = pelvis.matrix.copy()
        crouch = pose['grip'] * max(0.0, 1 - pose['folderY'] / 0.58)
        matrix.translation += Vector((0, (-pose['hipDepth'] - crouch * 0.075) / scale, (pose['hipHeight'] - 0.98 - crouch * 0.16) / scale))
        stride_phase = (seconds - 1.4) / 1.6 * math.pi * 6 if 1.4 <= seconds <= 3 else seconds * 10
        matrix.translation.x += math.sin(stride_phase) * min(1, pose['stride']) * 0.018 / scale
        pelvis.matrix = matrix
        bpy.context.view_layer.update()
        inverse_world = rig.matrix_world.inverted()
        foot_targets = {}
        for index, suffix in enumerate(['r', 'l']):
            foot = sample['feet'][index]
            ankle_height = rig.data.bones[f'foot_{suffix}'].head_local.z * scale + floor_offset
            foot_targets[suffix] = inverse_world @ Vector((foot['x'], -foot['z'], ankle_height + foot['y'] - 0.042))
        lower_by = 0
        for suffix, target in foot_targets.items():
            start = rig.pose.bones[f'thigh_{suffix}'].head
            reach = rig.data.bones[f'thigh_{suffix}'].length + rig.data.bones[f'calf_{suffix}'].length - 0.002
            horizontal_squared = (start.x - target.x) ** 2 + (start.y - target.y) ** 2
            lower_by = max(lower_by, start.z - target.z - math.sqrt(max(0.005, reach * reach - horizontal_squared)))
        matrix = pelvis.matrix.copy()
        matrix.translation.z -= lower_by
        pelvis.matrix = matrix
        bpy.context.view_layer.update()
        for name in ['spine_01', 'spine_02', 'spine_03']:
            rotate_bone(rig, name, Quaternion((0, 0, 1), pose['torsoYaw'] / 3) @ Quaternion((1, 0, 0), pose['bodyPitch'] / 3) @ Quaternion((0, 1, 0), -pose['bodyLean'] / 3))
        rotate_bone(rig, 'head', Quaternion((0, 0, 1), pose['headYaw']) @ Quaternion((1, 0, 0), pose['headTilt']))
        for suffix in ['l', 'r']:
            rotate_bone(rig, f'eye_{suffix}', Quaternion((0, 0, 1), pose['eyeYaw'] * 0.22) @ Quaternion((1, 0, 0), pose['eyePitch'] * 0.12))
        for index, suffix in enumerate(['r', 'l']):
            solve_limb(rig, f'thigh_{suffix}', f'calf_{suffix}', foot_targets[suffix], (0, -1, 0))
            foot = rig.pose.bones[f'foot_{suffix}']
            foot_rotation = (Quaternion((0, 0, 1), sample['feet'][index]['yaw'] - pose['characterYaw'])
                             @ Quaternion((1, 0, 0), sample['feet'][index].get('pitch', 0)) @ rest_rotations[foot.name])
            foot.matrix = Matrix.LocRotScale(foot.head, foot_rotation, Vector((1, 1, 1)))
            bpy.context.view_layer.update()
        # 쪼그릴 때 종아리의 스킨 가중치가 신발을 조금 누른다. 실제 밑창을 읽어 접지 중인 발만 보정한다.
        for _ in range(2):
            evaluated_shoe = shoe.evaluated_get(bpy.context.evaluated_depsgraph_get())
            corrections = {}
            for index, suffix in enumerate(['r', 'l']):
                if sample['feet'][index]['y'] > 0.0421:
                    continue
                lowest = min((evaluated_shoe.matrix_world @ evaluated_shoe.data.vertices[index].co).z for index in shoe_vertices[suffix])
                corrections[suffix] = max(0, FLOOR_HEIGHT + 0.0005 - lowest)
            for suffix, correction in corrections.items():
                if correction < 0.0001:
                    continue
                foot = rig.pose.bones[f'foot_{suffix}']
                rotation = foot.matrix.to_quaternion()
                foot_targets[suffix].z += correction / scale
                solve_limb(rig, f'thigh_{suffix}', f'calf_{suffix}', foot_targets[suffix], (0, -1, 0))
                foot.matrix = Matrix.LocRotScale(foot.head, rotation, Vector((1, 1, 1)))
                bpy.context.view_layer.update()
        contacts = []
        for suffix, direction in [('l', 1), ('r', -1)]:
            swing = math.sin(stride_phase) * pose['stride'] * direction * 0.32
            running = min(1, pose['stride'] / 1.4) if 1.08 <= seconds <= 3 else 0
            shoulder_angle = pose['armReach'] + swing
            elbow_angle = shoulder_angle - (0.25 + running * 1.20)
            point_bone(rig, f'upperarm_{suffix}', (direction * 0.10, math.sin(shoulder_angle), -math.cos(shoulder_angle)))
            point_bone(rig, f'lowerarm_{suffix}', (direction * 0.06, math.sin(elbow_angle), -math.cos(elbow_angle)))
            hand = rig.pose.bones[f'hand_{suffix}']
            if pose['grip'] > 0:
                # 손목이 아니라 손바닥이 표지 뒤에 닿도록 손 길이만큼 위쪽에 손목 목표를 둔다.
                target_world = Vector((pose['folderX'] + direction * 0.715, 0.125, pose['folderY'] + 1.19))
                target = inverse_world @ target_world
                blended_target = hand.head.lerp(target, pose['grip'])
                error = solve_limb(rig, f'upperarm_{suffix}', f'lowerarm_{suffix}', blended_target, (direction * 0.65, 0.25, -0.65))
                rotation = hand.matrix.to_quaternion().slerp(wrist_rotations[suffix], pose['grip'])
                hand.matrix = Matrix.LocRotScale(hand.head, rotation, Vector((1, 1, 1)))
                bpy.context.view_layer.update()
                contacts.append({'side': suffix, 'wristErrorMeters': round(error, 5), 'wristWorld': list(rig.matrix_world @ hand.head), 'targetWorld': list(target_world)})
            for finger in ['index', 'middle', 'ring', 'pinky']:
                for segment in range(1, 4):
                    bone = rig.pose.bones[f'{finger}_{segment:02d}_{suffix}']
                    relaxed_curl = (0.25 if segment == 1 else 0.38) + running * 0.38
                    grip_curl = 0.30 if segment == 1 else 0.37
                    bone.rotation_quaternion = Quaternion((1, 0, 0), relaxed_curl * (1 - pose['grip']) + grip_curl * pose['grip'])
            rig.pose.bones[f'thumb_02_{suffix}'].rotation_quaternion = Quaternion((1, 0, 0), 0.18 + running * 0.20 + pose['grip'] * 0.06)
        rig.keyframe_insert(data_path='location', frame=frame)
        rig.keyframe_insert(data_path='rotation_quaternion', frame=frame)
        for bone in rig.pose.bones:
            if bone.name != 'pelvis' and bone.location.length < 0.0001:
                bone.location = (0, 0, 0)
            bone.scale = (1, 1, 1)
            previous = previous_quaternions.get(bone.name)
            if previous and previous.dot(bone.rotation_quaternion) < 0:
                bone.rotation_quaternion.negate()
            previous_quaternions[bone.name] = bone.rotation_quaternion.copy()
            bone.keyframe_insert(data_path='location', frame=frame)
            bone.keyframe_insert(data_path='rotation_quaternion', frame=frame)
        blink_distance = min(abs(seconds - time) for time in [0.55, 3.25, 4.23, 10.45])
        body.data.shape_keys.key_blocks['blink'].value = math.cos(blink_distance / 0.095 * math.pi / 2) ** 2 if blink_distance < 0.095 else 0
        body.data.shape_keys.key_blocks['blink'].keyframe_insert(data_path='value', frame=frame)
        bpy.context.view_layer.update()
        feet = [list(rig.matrix_world @ rig.pose.bones[f'foot_{suffix}'].head) for suffix in ['r', 'l']]
        observations.append({'frame': frame, 'seconds': seconds, 'grip': pose['grip'], 'contacts': contacts,
                             'feet': feet, 'ankleSpanX': feet[1][0] - feet[0][0], 'pelvisLowering': lower_by * scale})
    report = {'summary': {
        'minimumCarryAnkleSpanMeters': min(row['ankleSpanX'] for row in observations if 8 <= row['seconds'] <= 9.2),
        'maximumRunPelvisLoweringMeters': max(row['pelvisLowering'] for row in observations if 1.4 <= row['seconds'] <= 3),
        'maximumGripErrorMeters': max(contact['wristErrorMeters'] for row in observations if row['grip'] >= 0.999 for contact in row['contacts']),
    }, 'frames': observations}
    (SOURCE_PATH / 'character-v3-motion-inspection.json').write_text(json.dumps(report, indent=2), encoding='utf-8')


def append_props():
    """기존 원본의 폴더·종이·제어 피벗만 복사하고 오래된 캐릭터 메시를 제외한다."""
    with bpy.data.libraries.load(str(SOURCE_PATH / 'portfolio-scene-v2.blend'), link=False) as (available, loaded):
        loaded.objects = [name for name in available.objects if not name.startswith('studio_') and name not in ['key_light', 'fill_light']]
    for obj in loaded.objects:
        if obj:
            bpy.context.collection.objects.link(obj)
    root = bpy.data.objects['portfolio_root']
    character = bpy.data.objects['character']
    for obj in list(character.children_recursive):
        if obj.type == 'MESH':
            bpy.data.objects.remove(obj, do_unlink=True)
    return root


def synchronize_props_motion(root, samples):
    """비교용 원본의 오래된 시간표를 현재 웹 제어값으로 바꿔 렌더에서도 손과 폴더가 함께 움직이게 한다."""
    objects = {obj.name: obj for obj in root.children_recursive}
    for obj in objects.values():
        obj.animation_data_clear()
    paper_keys = [objects[f'paper_surface_{index}'].data.shape_keys.key_blocks['꺼낼 때 휘어짐'] for index in range(4)]
    previous_rotations = {}
    for sample in samples:
        frame = sample['frame']
        for name, transform in sample['joints'].items():
            obj = objects.get(name)
            if obj is None:
                continue
            obj.location = transform['position']
            x, y, z, w = transform['quaternion']
            rotation = Quaternion((w, x, y, z))
            if name in previous_rotations and previous_rotations[name].dot(rotation) < 0:
                rotation.negate()
            previous_rotations[name] = rotation.copy()
            obj.rotation_mode = 'QUATERNION'
            obj.rotation_quaternion = rotation
            obj.scale = transform['scale']
            for channel in ['location', 'rotation_quaternion', 'scale']:
                obj.keyframe_insert(data_path=channel, frame=frame)
        for obj in objects['folder'].children_recursive:
            if obj.type != 'MESH':
                continue
            hidden = not sample['pose']['folderVisible']
            if obj.parent.name.startswith('paper_'):
                hidden = hidden or not sample['joints'][obj.parent.name]['visible']
            obj.hide_render = obj.hide_viewport = hidden
            obj.keyframe_insert(data_path='hide_render', frame=frame)
            obj.keyframe_insert(data_path='hide_viewport', frame=frame)
        for index, curl in enumerate(paper_keys):
            curl.value = sample['paperBends'][index]
            curl.keyframe_insert(data_path='value', frame=frame)


def export_props(root):
    """숨김 키프레임이 GLB 형상 자체를 제외하지 않도록 내보내는 동안만 소품 동작을 분리한다."""
    objects = [root, *root.children_recursive]
    actions = []
    studio_transform = root.matrix_basis.copy()
    bpy.ops.object.select_all(action='DESELECT')
    for obj in objects:
        if obj.animation_data and obj.animation_data.action:
            actions.append((obj, obj.animation_data.action, obj.animation_data.action_slot))
            obj.animation_data_clear()
        obj.hide_render = False
        obj.hide_viewport = False
        obj.hide_set(False)
        obj.select_set(True)
    bpy.context.view_layer.objects.active = root
    # 소품 피벗·형상은 처음부터 웹 Y-up이다. 스튜디오용 90도 회전과 자동 축 변환을 함께 제외한다.
    root.matrix_basis = Matrix.Identity(4)
    bpy.context.view_layer.update()
    destination = MODEL_PATH / 'portfolio-props-v3.glb'
    bpy.ops.export_scene.gltf(filepath=str(destination), export_format='GLB', use_selection=True,
                              export_yup=False, export_animations=False, export_cameras=False, export_lights=False)
    root.matrix_basis = studio_transform
    for obj, action, slot in actions:
        obj.animation_data_create()
        obj.animation_data.action = action
        obj.animation_data.action_slot = slot
    binary = destination.read_bytes()
    header_length = int.from_bytes(binary[12:16], 'little')
    metadata = json.loads(binary[20:20 + header_length])
    if len(metadata.get('meshes', [])) < 6:
        raise RuntimeError('내보낸 소품 GLB에 폴더·종이 형상이 누락되었습니다.')
    exported_root = next(node for node in metadata['nodes'] if node.get('name') == 'portfolio_root')
    if any(abs(component) > 0.00001 for component in exported_root.get('rotation', [0, 0, 0, 1])[:3]):
        raise RuntimeError('웹 소품 피벗에 스튜디오 좌표 회전이 남아 있습니다.')


def render_reviews(rig, props_root):
    """서 있는 모습뿐 아니라 집기·들기·내려놓기와 종이 노출도 같은 원본에서 검토한다."""
    spec = importlib.util.spec_from_file_location('character_studio', Path(__file__).with_name('build-character.py'))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    module.build_studio()
    scene = bpy.context.scene
    bpy.data.objects['studio_ground'].location.z = FLOOR_HEIGHT
    scene.render.resolution_x = 1200
    scene.render.resolution_y = 900
    scene.cycles.samples = 24
    observations = []
    selected_times = next((argument.split('=', 1)[1] for argument in sys.argv if argument.startswith('--review=')), None)
    for seconds in ([float(value) for value in selected_times.split(',')] if selected_times else REVIEW_TIMES):
        scene.frame_set(round(seconds * 30) + 1)
        bpy.context.view_layer.update()
        shoe = next(obj for obj in rig.children if obj.type == 'MESH' and 'shoes01' in obj.name)
        evaluated_shoe = shoe.evaluated_get(bpy.context.evaluated_depsgraph_get())
        shoe_heights = [(evaluated_shoe.matrix_world @ vertex.co).z for vertex in evaluated_shoe.data.vertices]
        observations.append({'seconds': seconds, 'lowestShoeMeters': min(shoe_heights),
                             'floorClearanceMeters': min(shoe_heights) - FLOOR_HEIGHT})
        center = Vector((rig.location.x + (0.4 if seconds > 5 else 0), rig.location.y - 0.2, 1.3))
        camera = scene.camera
        camera.location = center + Vector((3.0, -7.0, 1.7))
        camera.rotation_euler = (center - camera.location).to_track_quat('-Z', 'Y').to_euler()
        camera.data.ortho_scale = 4.2
        scene.render.filepath = str(SOURCE_PATH / f'character-v3-motion-{seconds:.2f}.png')
        bpy.ops.render.render(write_still=True)
    (SOURCE_PATH / 'character-v3-render-inspection.json').write_text(json.dumps(observations, indent=2), encoding='utf-8')


def main():
    """모델·동작·표준 재질을 준비한 뒤 외부 네트워크 없이 두 GLB와 편집용 원본을 저장한다."""
    if '--props-only' in sys.argv:
        bpy.ops.wm.open_mainfile(filepath=str(SOURCE_PATH / 'portfolio-character-motion-v3.blend'))
        export_props(bpy.data.objects['portfolio_root'])
        return
    use_cached_mesh = '--reuse-mesh' in sys.argv
    bpy.ops.wm.open_mainfile(filepath=str(SOURCE_PATH / ('character-web-base-v3.blend' if use_cached_mesh else 'portfolio-character-v3.blend')))
    bpy.context.preferences.filepaths.save_version = 0
    rig = bpy.data.objects['character_skeleton']
    body = bpy.data.objects['character_skin']
    if not use_cached_mesh:
        add_blink_and_flatten(body)
        for obj in list(rig.children):
            if obj.type == 'MESH' and obj != body:
                flatten_mesh(obj)
        bake_skin_material(body)
        bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE_PATH / 'character-web-base-v3.blend'))
    meshes = [obj for obj in rig.children if obj.type == 'MESH']
    upper = max(vertex.co.z for obj in meshes for vertex in obj.data.vertices)
    lower = min(vertex.co.z for obj in meshes for vertex in obj.data.vertices)
    scale = 2.65 / (upper - lower)
    floor_offset = FLOOR_HEIGHT - lower * scale
    rig.scale = (scale, scale, scale)
    samples = json.loads((SOURCE_PATH / 'portfolio-poses.json').read_text(encoding='utf-8'))['frames']
    scene = bpy.context.scene
    scene.render.fps = 30
    scene.frame_start = 1
    scene.frame_end = samples[-1]['frame']
    animate_character(rig, body, samples, scale, floor_offset)
    scene.frame_set(1)
    bpy.ops.object.select_all(action='DESELECT')
    for obj in [rig, *rig.children_recursive]:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = rig
    MODEL_PATH.mkdir(parents=True, exist_ok=True)
    bpy.ops.export_scene.gltf(filepath=str(MODEL_PATH / 'portfolio-character-v3.glb'), export_format='GLB', use_selection=True, export_yup=True, export_animations=True, export_animation_mode='SCENE', export_force_sampling=True, export_frame_range=True, export_cameras=False, export_lights=False, export_extras=False, export_image_format='AUTO')
    props = append_props()
    synchronize_props_motion(props, samples)
    scene.frame_set(1)
    export_props(props)
    bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE_PATH / 'portfolio-character-motion-v3.blend'))
    render_reviews(rig, props)
    scene.frame_set(229)
    bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE_PATH / 'portfolio-character-motion-v3.blend'))


if __name__ == '__main__':
    main()
