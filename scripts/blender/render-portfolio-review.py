"""접촉·들기·종이 노출의 대표 프레임을 같은 카메라로 렌더해 비교한다."""
from pathlib import Path

import bpy
from mathutils import Vector


def main():
    """저장된 원본은 변경하지 않고 검토용 렌더만 원본 폴더에 저장한다."""
    output_path = Path(__file__).resolve().parents[2] / 'assets/source/blender'
    scene = bpy.context.scene
    scene.render.resolution_x = 900
    scene.render.resolution_y = 700
    scene.cycles.samples = 12
    scene.cycles.use_denoising = True
    camera = scene.camera
    for name, frame, target_x in [('pickup', 196, 0.8), ('lift', 229, 0.8), ('paper-hidden', 331, 1.2), ('paper-exit', 343, 1.2)]:
        scene.frame_set(frame)
        camera.location = (target_x + 3.7, -10, 4.8)
        camera.data.ortho_scale = 4.4
        camera.rotation_euler = (Vector((target_x, 0.2, 1.2)) - camera.location).to_track_quat('-Z', 'Y').to_euler()
        scene.render.filepath = str(output_path / f'review-{name}.png')
        bpy.ops.render.render(write_still=True)


if __name__ == '__main__':
    main()
