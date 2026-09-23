# Portrait and interactive 3D revision

Requested: reduce the portrait slightly and replace the basic-looking 3D with a
more detailed, dynamic composition while retaining the portfolio's identity.

## Changes

- Desktop portrait maximum width 248 → 224 px; shorter desktop viewports use a
  208 px maximum height instead of 230 px. Keep the original photograph/aspect.
- Replace the old assembly with an open titanium web frame and layered glass,
  a continuous swept metal ribbon above a circuit core, and a hollow CCTV lens
  with instanced knurling, a moving iris and a separate curved glass element.
- Each topic has distinct poses: the chosen subject moves forward and grows;
  supporting objects move around it. Glass layers, the ribbon, iris and orbital
  signals also animate independently. Preserve pointer parallax and 360° control.
- Replace clipped 8-bit reflections with a local half-float linear HDR studio
  environment. Use three physical transmission surfaces, contrasting roughness,
  clearcoat and sapphire lens iridescence; add rim lighting and a quiet studio
  background. No external models, remote textures or new runtime dependencies.
- Stop the animation clock while hidden; repeated spin clicks no longer restart
  an in-flight rotation. Retain first-notch section paging and the hero clock.
- Cap pixel ratio at 1.5 and transmission resolution at 75%; use instancing for
  112 small hardware details. These are bounded costs, not measured FPS claims.

## Verification

`npm run check`, `npm test`, and `git diff --check`.

The new geometry test covers finite vertices/normals, continuous ribbon normals,
HDR intensities, physical glass, different topic poses, procedural motion and
projection of every vertex (including instances) across topic transitions,
quarter-turn rotations, pointer tilt extremes and scene aspect ratios .65–2.
The observed projected edge is .879 (canvas edge is 1). The scene has 60 meshes
and 60,978 triangles, including instances.

The existing regression suite covers section navigation, GSAP transitions,
the single hero progress clock, reader layout contract, touch/keyboard input,
hidden-scene pauses, and WebGL-unavailable fallback. Its layout dimensions are
fixtures; this does not prove browser layout.

## Remaining verification limit

The managed preview service remains unavailable (`/tmp/sites-previewd/requests`
missing), as recorded in the preceding revision. No substitute public-site QA
or alternate app server was used. Actual shader compilation, browser pixels at
1920×1080, material appearance, shadows and GPU performance are unverified.
Numerical framing checks do not substitute for rendered visual inspection.
