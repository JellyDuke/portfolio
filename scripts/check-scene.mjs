import assert from 'node:assert/strict';
import * as THREE from '../dist/vendor/three.module.js';
import { createAssembly, createStudioEnvironment } from '../dist/assembly.js';

// Geometry, animation and camera-space checks. This does not render GPU pixels.
const assembly=createAssembly(), environment=createStudioEnvironment();
const pivot=new THREE.Group(), group=new THREE.Group(); pivot.add(group); group.add(assembly.root);
const camera=new THREE.PerspectiveCamera(34,1,.1,50);
const vertex=new THREE.Vector3(), instance=new THREE.Matrix4(), model=new THREE.Matrix4();
let peak=0, triangles=0, meshes=0, glass=0;
for(let i=0;i<environment.image.data.length;i+=4) peak=Math.max(peak,THREE.DataUtils.fromHalfFloat(environment.image.data[i]));
assert.equal(environment.type,THREE.HalfFloatType);
assert.equal(environment.colorSpace,THREE.LinearSRGBColorSpace);
assert.ok(peak>5,'Studio highlights must retain HDR intensity');
assembly.root.traverse(object=>{
  if(!object.isMesh)return;
  meshes++;
  const geometry=object.geometry;
  triangles+=(geometry.index?geometry.index.count:geometry.attributes.position.count)/3*(object.isInstancedMesh?object.count:1);
  for(const attribute of ['position','normal']) assert.ok(geometry.attributes[attribute].array.every(Number.isFinite));
  if(object.material.transmission>.8) glass++;
});
assert.equal(glass,3,'Interface, AI cover and lens use physical transmission');
assert.ok(meshes<80 && triangles<80000,'Keep the detailed scene within its mobile geometry/draw-call budget');

for(let focus=0;focus<3;focus++) {
  assembly.animate(4,focus,1);
  assert.ok(assembly.parts[focus].scale.x>assembly.parts[(focus+1)%3].scale.x*1.5,'Focused objects must visibly grow');
}
const ribbon=assembly.root.getObjectByName('Continuous metal ribbon');
assembly.animate(0,1,1); const initial=ribbon.quaternion.clone();
assembly.animate(7,1,1); assert.ok(initial.angleTo(ribbon.quaternion)>.8,'The ribbon must have its own continuous 3D motion');
const normals=ribbon.geometry.attributes.normal, indices=ribbon.geometry.index;
const a=new THREE.Vector3(),b=new THREE.Vector3(),c=new THREE.Vector3(),face=new THREE.Vector3(),normal=new THREE.Vector3();
for(let i=0;i<indices.count;i+=3) {
  a.fromBufferAttribute(ribbon.geometry.attributes.position,indices.getX(i));
  b.fromBufferAttribute(ribbon.geometry.attributes.position,indices.getX(i+1));
  c.fromBufferAttribute(ribbon.geometry.attributes.position,indices.getX(i+2));
  face.crossVectors(b.sub(a),c.sub(a)); normal.fromBufferAttribute(normals,indices.getX(i));
  assert.ok(face.dot(normal)>0,'Ribbon normals must agree with the visible surface');
}

// Includes intermediate topic poses, full rotations, pointer-tilt extremes and
// narrow/tall scene slots. Project every vertex, including instanced hardware.
let edge=0;
for(const focus of [0,.5,1,1.5,2]) for(const time of [0,7,17]) for(const spin of [0,Math.PI/2,Math.PI,Math.PI*1.5]) for(const tilt of [-1,1]) {
  assembly.animate(time,focus,1); pivot.rotation.y=spin;
  group.rotation.set(.06+tilt*.075,-.06+tilt*.225,-.025); group.position.y=.045;
  pivot.updateMatrixWorld(true);
  for(const aspect of [.65,1,1.5,2]) {
    camera.aspect=aspect; camera.position.set(0,.12,Math.max(8.3,8.5/aspect)); camera.lookAt(0,0,0);
    camera.updateProjectionMatrix(); camera.updateMatrixWorld(true);
    assembly.root.traverse(object=>{
      if(!object.isMesh)return;
      const positions=object.geometry.attributes.position;
      for(let item=0;item<(object.isInstancedMesh?object.count:1);item++) {
        model.copy(object.matrixWorld);
        if(object.isInstancedMesh){object.getMatrixAt(item,instance);model.multiply(instance);}
        for(let i=0;i<positions.count;i++) {
          vertex.fromBufferAttribute(positions,i).applyMatrix4(model).project(camera);
          edge=Math.max(edge,Math.abs(vertex.x),Math.abs(vertex.y));
          assert.ok(vertex.z>-1 && vertex.z<1,'Geometry must be between the camera clip planes');
        }
      }
    });
  }
}
assert.ok(edge<.94,`Keep a framing margin while moving; projected edge was ${edge}`);
assembly.dispose(); environment.dispose();
console.log(`PASS: HDR lighting, physical glass, continuous ribbon normals/motion, distinct topic poses, ${triangles} triangles / ${meshes} meshes, instanced hardware, camera framing (edge ${edge.toFixed(3)}).`);
console.log('UNVERIFIED: shader compilation, GPU performance and final browser appearance.');
