import * as THREE from './vendor/three.module.js';

// Locally modelled optical instruments, glass interfaces and a continuous metal
// ribbon. Each subject has its own composition, not just a different camera yaw.
export function createAssembly() {
  const root = new THREE.Group();
  root.name = 'Web / AI / CCTV';
  const geometries = new Set(), materials = new Set(), pickable = [];
  const geometry = value => { geometries.add(value); return value; };
  const material = (color, options = {}) => {
    const value = new THREE.MeshPhysicalMaterial({ color, metalness: .75, roughness: .22, clearcoat: .8, clearcoatRoughness: .13, ...options });
    materials.add(value); return value;
  };
  const titanium = material(0xc2cad8, { metalness: 1, roughness: .19 });
  const polished = material(0xdbe5f2, { metalness: 1, roughness: .095 });
  const graphite = material(0x17243b, { metalness: .85, roughness: .29 });
  const cobalt = material(0x194dd6, { metalness: .72, roughness: .17 });
  const porcelain = material(0xf2f5fb, { metalness: .18, roughness: .26 });
  const dark = material(0x071427, { metalness: .35, roughness: .38 });
  const light = material(0x88c6ff, { metalness: .35, roughness: .17, emissive: 0x2d70dd, emissiveIntensity: .9 });
  const glass = material(0xd7e8ff, { metalness: 0, roughness: .08, transmission: .94, thickness: .18, ior: 1.46, attenuationColor: new THREE.Color(0x8aafff), attenuationDistance: 2.8, envMapIntensity: 1.2 });
  const sapphire = material(0x75a9fb, { metalness: 0, roughness: .055, transmission: .91, thickness: .38, ior: 1.55, attenuationColor: new THREE.Color(0x173baf), attenuationDistance: 1.9, iridescence: .28, iridescenceIOR: 1.3 });

  function mesh(parent, shape, mat, position = [0, 0, 0]) {
    const item = new THREE.Mesh(geometry(shape), mat);
    item.position.set(...position); item.castShadow = true; item.receiveShadow = true;
    parent.add(item); return item;
  }
  function outline(w, h, radius, Shape = THREE.Shape) {
    const path = new Shape(), r = Math.min(radius, w / 2, h / 2), x = -w / 2, y = -h / 2;
    path.moveTo(x+r,y); path.lineTo(x+w-r,y); path.quadraticCurveTo(x+w,y,x+w,y+r);
    path.lineTo(x+w,y+h-r); path.quadraticCurveTo(x+w,y+h,x+w-r,y+h);
    path.lineTo(x+r,y+h); path.quadraticCurveTo(x,y+h,x,y+h-r);
    path.lineTo(x,y+r); path.quadraticCurveTo(x,y,x+r,y);
    return path;
  }
  function slab(parent, w, h, d, mat, position = [0,0,0], radius = .1, border = 0) {
    const shape = outline(w,h,radius);
    if (border) shape.holes.push(outline(w-border*2,h-border*2,Math.max(.015,radius-border),THREE.Path));
    const bevel = Math.min(.022,d*.22,border ? border*.22 : .022);
    const geo = new THREE.ExtrudeGeometry(shape,{depth:d,bevelEnabled:true,bevelSize:bevel,bevelThickness:bevel,bevelSegments:3,steps:1,curveSegments:10});
    geo.translate(0,0,-d/2); return mesh(parent,geo,mat,position);
  }
  function ring(parent, radius, tube, mat, z = 0) {
    return mesh(parent,new THREE.TorusGeometry(radius,tube,12,96),mat,[0,0,z]);
  }
  function sphere(parent, radius, mat, position = [0,0,0]) {
    return mesh(parent,new THREE.SphereGeometry(radius,32,20),mat,position);
  }
  function tube(parent, points, radius, mat) {
    const curve = new THREE.CatmullRomCurve3(points.map(point=>new THREE.Vector3(...point)));
    return mesh(parent,new THREE.TubeGeometry(curve,40,radius,8,false),mat);
  }
  function part(name,index) {
    const group = new THREE.Group(); group.name=name; group.userData.sceneIndex=index; root.add(group); return group;
  }
  function pick(object,index) { object.userData.sceneIndex=index; pickable.push(object); return object; }
  function barrel(parent, outer, inner, depth, mat, z = 0) {
    const edge = .025;
    const points = [[inner,-depth/2],[outer-edge,-depth/2],[outer,-depth/2+edge],[outer,depth/2-edge],[outer-edge,depth/2],[inner,depth/2],[inner,-depth/2]].map(point=>new THREE.Vector2(...point));
    const item=mesh(parent,new THREE.LatheGeometry(points,96),mat,[0,0,z]); item.rotation.x=Math.PI/2; return item;
  }

  // An open titanium frame holds a glass pane. Supporting panes slide apart.
  const web = part('Web interface',0);
  pick(slab(web,2.3,1.65,.12,titanium,[0,0,0],.16,.065),0);
  const screen=pick(slab(web,2.16,1.51,.034,glass,[0,0,.014],.105),0); screen.castShadow=false;
  slab(web,2.14,.19,.025,graphite,[0,.653,.055],.07);
  for(let i=0;i<3;i++) sphere(web,.021,i===0?light:titanium,[-.89+i*.077,.653,.077]);
  const screenContent = new THREE.Group(); web.add(screenContent);
  slab(screenContent,.27,.51,.025,cobalt,[-.85,-.07,.067],.048);
  for(let i=0;i<3;i++) slab(screenContent,.14,.025,.012,porcelain,[-.85,.058-i*.128,.088],.008);
  tube(screenContent,[[-.32,.25,.125],[-.58,0,.125],[-.32,-.25,.125]],.028,polished);
  tube(screenContent,[[.47,.25,.125],[.73,0,.125],[.47,-.25,.125]],.028,polished);
  tube(screenContent,[[.05,-.3,.125],[.25,.3,.125]],.026,cobalt);
  slab(screenContent,1.45,.025,.015,titanium,[.15,-.48,.082],.01);
  slab(screenContent,.43,.025,.018,light,[-.36,-.48,.097],.01);
  const floatingPane = new THREE.Group(); web.add(floatingPane);
  slab(floatingPane,.87,.68,.085,cobalt,[0,0,0],.105);
  slab(floatingPane,.73,.54,.02,graphite,[0,0,.058],.07);
  const wave = [];
  for(let i=0;i<20;i++) { const x=-.27+i*.028; wave.push([x,Math.sin(i*.48)*.1,.09]); }
  tube(floatingPane,wave,.013,light);
  const rearPane = new THREE.Group(); web.add(rearPane);
  slab(rearPane,1.62,1.15,.055,cobalt,[0,0,0],.14,.038);
  slab(rearPane,1.5,1.03,.018,porcelain,[0,0,-.01],.1);

  // Closed ribbon with a rounded rectangular cross-section. Frenet frames and
  // joined seam normals keep long, polished studio highlights continuous.
  class RibbonCurve extends THREE.Curve {
    getPoint(t,target=new THREE.Vector3()) {
      const angle=t*Math.PI*2, radius=.48+.155*Math.cos(3*angle);
      return target.set(radius*Math.cos(2*angle),radius*Math.sin(2*angle),.24*Math.sin(3*angle));
    }
  }
  function ribbonGeometry() {
    const curve=new RibbonCurve(), segments=240, sides=16, frames=curve.computeFrenetFrames(segments,true);
    const positions=[], indices=[];
    for(let i=0;i<=segments;i++) {
      const center=curve.getPoint(i/segments), twist=i/segments*Math.PI*2;
      const normal=frames.normals[i].clone().multiplyScalar(Math.cos(twist)).addScaledVector(frames.binormals[i],Math.sin(twist));
      const binormal=frames.binormals[i].clone().multiplyScalar(Math.cos(twist)).addScaledVector(frames.normals[i],-Math.sin(twist));
      for(let j=0;j<=sides;j++) {
        const angle=j/sides*Math.PI*2, a=Math.cos(angle), b=Math.sin(angle);
        const u=Math.sign(a)*Math.pow(Math.abs(a),.45)*.117, v=Math.sign(b)*Math.pow(Math.abs(b),.45)*.038;
        const point=center.clone().addScaledVector(normal,u).addScaledVector(binormal,v); positions.push(point.x,point.y,point.z);
        if(i<segments && j<sides) { const k=i*(sides+1)+j; indices.push(k,k+1,k+sides+1,k+1,k+sides+2,k+sides+1); }
      }
    }
    const geo=new THREE.BufferGeometry(); geo.setAttribute('position',new THREE.Float32BufferAttribute(positions,3)); geo.setIndex(indices); geo.computeVertexNormals();
    const normals=geo.attributes.normal;
    const join=(a,b)=> { const n=new THREE.Vector3().fromBufferAttribute(normals,a).add(new THREE.Vector3().fromBufferAttribute(normals,b)).normalize(); normals.setXYZ(a,n.x,n.y,n.z); normals.setXYZ(b,n.x,n.y,n.z); };
    for(let i=0;i<=segments;i++) join(i*(sides+1),i*(sides+1)+sides);
    for(let j=0;j<=sides;j++) join(j,segments*(sides+1)+j);
    return geo;
  }
  const core = part('AI core',1);
  pick(slab(core,1.48,1.48,.18,graphite,[0,0,-.15],.2),1);
  slab(core,1.34,1.34,.08,polished,[0,0,-.01],.16,.06);
  slab(core,1.16,1.16,.06,cobalt,[0,0,.025],.12);
  const ribbon=pick(mesh(core,ribbonGeometry(),polished,[0,0,.47]),1); ribbon.name='Continuous metal ribbon';
  ring(core,.45,.012,light,.09);
  const pinGeometry=geometry(new THREE.BoxGeometry(.05,.16,.06));
  const pins=new THREE.InstancedMesh(pinGeometry,titanium,32), helper=new THREE.Object3D();
  for(let side=0;side<4;side++) for(let i=0;i<8;i++) {
    const angle=side*Math.PI/2; helper.position.set(-.53+i*.15,.79,-.15).applyAxisAngle(new THREE.Vector3(0,0,1),angle); helper.rotation.set(0,0,angle); helper.updateMatrix(); pins.setMatrixAt(side*8+i,helper.matrix);
  }
  core.add(pins); pins.castShadow=true;
  const coreCover=new THREE.Group(); core.add(coreCover);
  slab(coreCover,1.45,1.45,.038,titanium,[0,0,0],.19,.028);
  const cover=slab(coreCover,1.38,1.38,.024,glass,[0,0,0],.16); cover.castShadow=false;

  // Hollow barrel, knurled focus ring, six moving iris blades and a curved lens.
  const cctv = part('CCTV lens',2);
  pick(barrel(cctv,.69,.51,.64,porcelain,-.18),2);
  barrel(cctv,.7,.5,.14,titanium,.08);
  barrel(cctv,.647,.49,.18,graphite,.23);
  ring(cctv,.654,.022,polished,.175); ring(cctv,.646,.018,polished,.31);
  barrel(cctv,.6,.465,.075,cobalt,.335);
  const knurls=new THREE.InstancedMesh(geometry(new THREE.BoxGeometry(.014,.038,.12)),titanium,80);
  for(let i=0;i<80;i++) { const angle=i/80*Math.PI*2; helper.position.set(Math.cos(angle)*.652,Math.sin(angle)*.652,.238); helper.rotation.set(0,0,angle-Math.PI/2); helper.updateMatrix(); knurls.setMatrixAt(i,helper.matrix); }
  cctv.add(knurls);
  const backLens=sphere(cctv,.43,dark,[0,0,.245]); backLens.scale.z=.18;
  const iris=new THREE.Group(); iris.position.z=.33; cctv.add(iris);
  const bladeShape=new THREE.Shape(); bladeShape.moveTo(.12,-.045); bladeShape.quadraticCurveTo(.24,-.27,.44,-.24); bladeShape.lineTo(.46,.16); bladeShape.quadraticCurveTo(.24,.14,.12,-.045);
  const bladeGeometry=geometry(new THREE.ShapeGeometry(bladeShape,16));
  const bladeMaterial=material(0x52617b,{metalness:1,roughness:.26,side:THREE.DoubleSide}), blades=[];
  for(let i=0;i<6;i++) { const blade=new THREE.Mesh(bladeGeometry,bladeMaterial); blade.position.z=i*.001; iris.add(blade); blades.push(blade); }
  const lensFront=new THREE.Group(); cctv.add(lensFront);
  ring(lensFront,.47,.026,polished,0);
  const lens=pick(sphere(lensFront,.457,sapphire,[0,0,-.01]),2); lens.scale.z=.24; lens.castShadow=false;
  slab(cctv,.23,.4,.2,titanium,[0,-.79,-.31],.06);
  slab(cctv,.64,.09,.37,graphite,[0,-1.0,-.29],.055);

  // A compact router and orbital signal paths tie the subjects together.
  const network=part('Network switch',2); network.position.set(-.65,-1.47,-.25); network.rotation.set(.22,.12,-.1);
  pick(slab(network,1.3,.32,.52,graphite,[0,0,0],.11),2);
  slab(network,1.17,.21,.02,titanium,[0,0,.28],.035);
  for(let i=0;i<4;i++) { slab(network,.18,.115,.02,dark,[-.39+i*.26,0,.3],.015); slab(network,.08,.009,.012,light,[-.39+i*.26,.081,.307],.003); }
  const orbit=new THREE.Group(); root.add(orbit); orbit.name='Signal orbits'; orbit.position.z=-.5;
  const packets=[];
  class OrbitCurve extends THREE.Curve {
    constructor(radius,depth) { super(); this.radius=radius; this.depth=depth; }
    getPoint(t,target=new THREE.Vector3()) { const a=t*Math.PI*2; return target.set(Math.cos(a)*this.radius,Math.sin(a)*this.radius*.76,Math.sin(a)*this.depth); }
  }
  for(let i=0;i<2;i++) {
    const curve=new OrbitCurve(2.05-i*.18,.38), track=new THREE.Group(); track.rotation.set(.15+i*.52,.15,-.32+i*1.32); orbit.add(track);
    const path=mesh(track,new THREE.TubeGeometry(curve,128,i?.007:.009,6,true),i?cobalt:titanium); path.castShadow=false;
    const packet=sphere(track,i?.035:.044,light); packets.push({curve,packet,offset:i*.46,speed:i?.037:.048});
  }

  const parts=[web,core,cctv];
  // Per-focus [position, rotation, scale] poses. The selected subject grows and
  // moves forward while its supporting modules rearrange around it.
  const poses=[
    [[[-.3,.3,.28],[-.08,-.21,-.1],1],[[.8,-.86,.38],[.16,-.25,.19],.59],[[1.18,.96,-.48],[-.05,-.26,.12],.57]],
    [[[-1,.95,-.55],[.12,.28,-.18],.58],[[.08,.08,.4],[.13,-.25,-.13],1.08],[[1.31,-.8,-.35],[.05,-.32,.12],.54]],
    [[[-1,.94,-.54],[.1,.32,-.16],.56],[[1.02,-.78,-.28],[.16,-.24,.2],.59],[[.17,.22,.36],[-.1,-.3,-.08],1.18]],
  ];
  const poseData=poses.map(set=>set.map(([p,r,s])=>({position:new THREE.Vector3(...p),quaternion:new THREE.Quaternion().setFromEuler(new THREE.Euler(...r)),scale:s})));
  const entryOffset=new THREE.Vector3();
  return {
    root,pickable,parts,
    animate(time,focus,entrance) {
      const position=THREE.MathUtils.clamp(focus,0,2), from=Math.floor(position), to=Math.min(2,from+1), blend=position-from;
      parts.forEach((part,i)=>{
        const a=poseData[from][i], b=poseData[to][i], weight=Math.max(0,1-Math.abs(position-i));
        part.position.lerpVectors(a.position,b.position,blend);
        entryOffset.set((i-1)*.22,-.2-i*.13,-.3).multiplyScalar(1-entrance); part.position.add(entryOffset);
        part.position.y+=Math.sin(time*.72+i*1.4)*.035;
        part.quaternion.slerpQuaternions(a.quaternion,b.quaternion,blend);
        part.rotateY(Math.sin(time*.48+i)*.055); part.rotateX(Math.sin(time*.35+i)*.025);
        part.scale.setScalar(THREE.MathUtils.lerp(a.scale,b.scale,blend)); part.userData.focusWeight=weight;
      });
      const webFocus=parts[0].userData.focusWeight, aiFocus=parts[1].userData.focusWeight, lensFocus=parts[2].userData.focusWeight;
      floatingPane.position.set(.73,-.38,.22+webFocus*.2+Math.sin(time*.75)*.04); floatingPane.rotation.set(-.04,.03,-.05+Math.sin(time*.5)*.025);
      rearPane.position.set(-.14,.18,-.17-webFocus*.18); rearPane.rotation.z=.055+webFocus*.045;
      screenContent.position.z=.025+webFocus*.035;
      ribbon.rotation.set(time*.12,.25+time*.18,Math.sin(time*.31)*.12); ribbon.position.z=.48+aiFocus*.06+Math.sin(time*.8)*.035;
      coreCover.position.z=1.2+aiFocus*.16+Math.sin(time*.68)*.025; coreCover.rotation.z=Math.sin(time*.35)*.018;
      lensFront.position.z=.42+lensFocus*.15+Math.sin(time*.65)*.016;
      const aperture=.045+Math.sin(time*.65)*.033;
      blades.forEach((blade,i)=>{
        const angle=i*Math.PI/3;
        blade.position.set(Math.cos(angle)*aperture,Math.sin(angle)*aperture,i*.001);
        blade.rotation.z=angle+.18+Math.sin(time*.65)*.12;
      });
      orbit.rotation.y=Math.sin(time*.2)*.11; orbit.rotation.z=Math.sin(time*.16)*.08;
      packets.forEach(({curve,packet,offset,speed})=>packet.position.copy(curve.getPoint((time*speed+offset)%1)));
      network.position.y=-1.47+Math.sin(time*.6)*.025;
    },
    dispose() { pins.dispose(); knurls.dispose(); geometries.forEach(value=>value.dispose()); materials.forEach(value=>value.dispose()); },
  };
}

// Linear HDR preserves bright softboxes instead of clipping them to white.
// Half-float storage needs no external HDR download.
export function createStudioEnvironment() {
  const width=512,height=256,data=new Uint16Array(width*height*4);
  for(let y=0;y<height;y++) for(let x=0;x<width;x++) {
    const u=x/width,v=y/height;
    const softbox=(cx,cy,sx,sy)=>Math.exp(-(((u-cx)/sx)**6)-(((v-cy)/sy)**6));
    const key=softbox(.18,.36,.047,.22)*9, fill=softbox(.74,.4,.08,.2)*3.6, rim=softbox(.49,.21,.23,.021)*6.5;
    const cool=softbox(.96,.48,.026,.21)*3.5, base=.055+.12*(1-v), i=(y*width+x)*4;
    data[i]=THREE.DataUtils.toHalfFloat(base+key+fill*.82+rim+cool*.32);
    data[i+1]=THREE.DataUtils.toHalfFloat(base+key*.98+fill*.91+rim+cool*.58);
    data[i+2]=THREE.DataUtils.toHalfFloat(base+key*.95+fill+rim+cool);
    data[i+3]=THREE.DataUtils.toHalfFloat(1);
  }
  const texture=new THREE.DataTexture(data,width,height,THREE.RGBAFormat,THREE.HalfFloatType);
  texture.colorSpace=THREE.LinearSRGBColorSpace; texture.mapping=THREE.EquirectangularReflectionMapping; texture.needsUpdate=true;
  return texture;
}
