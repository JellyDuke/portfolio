"""캐릭터 원본의 변형값·재질·연결 성분을 읽어 시각 검토와 비교할 근거를 남긴다."""
import json
from pathlib import Path

import bpy


def inspect_character():
    """열린 원본의 구조를 변경하지 않고 JSON으로 기록한다."""
    report = {}
    for obj in bpy.data.objects:
        if obj.type != 'MESH':
            continue
        neighbors = [[] for _ in obj.data.vertices]
        for edge in obj.data.edges:
            a, b = edge.vertices
            neighbors[a].append(b)
            neighbors[b].append(a)
        unseen = set(range(len(neighbors)))
        components = []
        while unseen:
            pending = [unseen.pop()]
            members = []
            while pending:
                index = pending.pop()
                members.append(index)
                for other in neighbors[index]:
                    if other in unseen:
                        unseen.remove(other)
                        pending.append(other)
            components.append({'count': len(members), 'first': members[0],
                               'bounds': [[min(obj.data.vertices[i].co[axis] for i in members),
                                           max(obj.data.vertices[i].co[axis] for i in members)] for axis in range(3)]})
        report[obj.name] = {
            'matrix': [list(row) for row in obj.matrix_world],
            'groups': [group.name for group in obj.vertex_groups],
            'shape_keys': {key.name: key.value for key in obj.data.shape_keys.key_blocks} if obj.data.shape_keys else {},
            'materials': {mat.name: [{'type': node.type, 'name': node.name, 'image': node.image.filepath if node.type == 'TEX_IMAGE' and node.image else None} for node in mat.node_tree.nodes] for mat in obj.data.materials if mat},
            'components': sorted(components, key=lambda component: -component['count']),
            'masks': [{'name': modifier.name, 'group': modifier.vertex_group, 'invert': modifier.invert_vertex_group} for modifier in obj.modifiers if modifier.type == 'MASK'],
        }
        if obj.name == 'character_skin':
            report[obj.name]['landmarks'] = {}
            for name in ['scalp', 'lips', 'joint-head', 'joint-neck', 'joint-l-eye', 'joint-r-eye']:
                group_index = obj.vertex_groups[name].index
                points = [vertex.co for vertex in obj.data.vertices if any(group.group == group_index for group in vertex.groups)]
                report[obj.name]['landmarks'][name] = {'center': [sum(point[axis] for point in points) / len(points) for axis in range(3)],
                                                      'bounds': [[min(point[axis] for point in points), max(point[axis] for point in points)] for axis in range(3)]}
    destination = Path(__file__).resolve().parents[2] / 'assets/source/blender/character-mesh-inspection.json'
    destination.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
    print('CHARACTER_INSPECTION', str(destination))


inspect_character()
