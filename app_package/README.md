# Showroom Camera

A Babylon.js specialty camera targeted at ecommerce scenarios.

 - [Demo Page](https://syntheticmagus.github.io/showroom-camera/)
 - [Demo source](https://github.com/syntheticmagus/showroom-camera/blob/9cddba90afe84ce8a84c71b66cdeeead88644b26/app_package/src/showroomCamera.ts#L248-L310)

## Usage

The `ShowroomCamera` is specialized for ecommerce scenarios, specifically focusing
on two "showroom" behaviors common to 3D product viewer/configurators: "matchmoving"
and "arc-rotate inspection."

"Matchmoving" is a non-interactive behavior where the camera moves along a 
predetermined path, typically in order to showcase some aspect of a 3D model. For
example, if a 3D product viewer for a watch wanted to showcase the watch band's
clasp, this could be done by having the camera zoom in for a closeup of the clasp
and then "matchmove" on an artist-defined trajectory to show the clasp from 
different angles.

Contrastingly, "arc-rotate inspection" is an interactive behavior where the camera
focuses on a particular point in space, then gives the user (limited) control of 
the camera typically so that a 3D model can be inspected from different angles at
will. For example, if a 3D product configurator allowed users to customize 
certain aspects of a 3D model, the users might want to be able to manipulate the 
3D model interactively in order to view their changes. This behavior is classically
encapsulated by Babylon.js's built-in `ArcRotateCamera`.

The `ShowroomCamera` makes it easy and seamless to combine these two behavior
patterns in a single cohesive experience. This is done by specifying 
states -- `IShowroomCameraMatchmoveState` and 
`IShowroomCameraArcRotateState` -- representing the different behaviors a camera
should undertake in a given experience. For example, a 3D viewer/configurator
showcasing a watch might want to have multiple matchmoving states showcasing
various aspects of the watch (the face, the clasp, etc.) as well as an arc-rotate
state to be used during interactive configuration. To do this with a 
`ShowroomCamera`, all that's required is to create the appropriate 
`IShowroomCameraMatchmoveState` and `IShowroomCameraArcRotateState` objects and
provide them to the `ShowroomCamera` at the appropriate times.

```typescript
// From ShowroomCamera.Demo()
const matchmoveState: IShowroomCameraMatchmoveState = {
    matchmoveTarget: matchmove,
    focusDepth: 10
};

const arcRotateState: IShowroomCameraArcRotateState = {
    startingPosition: new Vector3(0, 5, -10),
    target: new Vector3(0, 1, 0)
};

const setStateFunction = async function() {
    while (true) {
        camera.setToArcRotateState(arcRotateState);
        await Tools.DelayAsync(7000);
        camera.setToMatchmoveState(matchmoveState);
        await Tools.DelayAsync(7000);
        await camera.animateToArcRotateState(arcRotateState);
        await Tools.DelayAsync(7000);
        await camera.animateToMatchmoveState(matchmoveState);
        await Tools.DelayAsync(7000);

        camera.animateToArcRotateState(arcRotateState, 4);
        await Tools.DelayAsync(3000);
        camera.animateToMatchmoveState(matchmoveState, 4);
        await Tools.DelayAsync(2000);
    }
}
setStateFunction();
```

## IShowroomCameraMatchmoveState

Showcasing a particular part of a 3D model by "dollying" the camera along a
predetermined path is a common objective, but defining that path and translating
it into a 3D experience is often a challenge. `ShowroomCamera`'s 
`IShowroomCameraMatchmoveState`s resolve this challenge by allowing 3D artists to
define the trajectory in their own familiar Digital Content Creation (DCC) tools 
(Blender, 3ds Max, etc.) as an animated named "null" (empty 3D transform) which 
can be then exported in a common 3D format (such as glTF).

Say, for example, that the 3D artist making a model of a watch wanted to showcase
the watch's clasp by having a camera "orbit" around the clasp in closeup. In the
artist's chosen DCC tool -- potentially even in the same 3D file as the watch 
itself -- the artist can create a "null" named something like "clasp_camera_orbit"
which is driven by an animation named "clasp_camera_animation" to follow the path
the artist wants the camera to follow. (If the DCC tool allows it, the artist may
even add a camera to this "null" to make it easy to see what a render from this 
animated orbit might look like.) This "null" and animation can then be exported
-- again, potentially alongside the watch itself -- to a glTF (or equivalent) 3D 
file that can be imported into a Babylon.js experience.

When this glTF is imported into Babylon.js, the "null" will be represented in the
Babylon scene by a `TransformNode` with the name specified in the DCC tool, in
this case "clasp_camera_orbit." Similarly, the animation that moves this 
`TransformNode` will be represented as a Babylon `AnimationGroup` with the 
specified name -- "clasp_camera_animation." Using these imported resources, the
artist's intended camera trajectory can be replicated in the Babylon experience
by simply playing the "clasp_camera_animation" `AnimationGroup`, referencing the 
"clasp_camera_orbit" `TransformNode` in an `IShowroomCameraMatchmoveState`, then
setting a showroom camera to use that `IShowroomCameraMatchmoveState` using 
`setToMatchmoveState` (which will teleport the camera instantly to the matchmove
trajectory) or `animateToMatchmoveState` (which will smoothly move the camera to
the matchmove directory using a procedural animation).

Using this approach, `IShowroomCameraMatchmoveState`s can give artists complete
control of camera behavior in the matchmoving state of the 3D experience using
only the DCC tools with which the artist is already comfortable. This is 
particularly powerful when it comes to updating the animation. Because the camera
motion itself was completely specified in the artist's tools, any updates to or 
enhancements of the camera motion can be done entirely in those same tools: as long
as the "null" and driving animation's names remain the same, any changes the artist
makes to the motion and exports into a new glTF will be imported into the experience
and hooked up by name automatically, without requiring any code changes at all.

## IShowroomCameraArcRotateState

Interactively inspecting a 3D model from different angles is another common 
objective, and it's one that is particularly well-served by Babylon.js's 
built-in `ArcRotateCamera`. Given that it already works extremely well, the 
`ShowroomCamera` does not seek to modify the `ArcRotateCamera`'s behavior at all;
instead, `ShowroomCamera` makes it easy to move into and out of arc-rotate states
by specifying `IShowroomCameraArcRotateState`s to represent them.

Unlike `IShowroomCameraMatchmoveState`s, which are intended to follow 
artist-defined trajectories described by animated `TransformNode`s, 
`IShowroomCameraArcRotateState`s specify starting positions and settings for
an interval of interaction during which the `ShowroomCamera` will enable an
`ArcRotateCamera`. Over the interactive period, `ArcRotateCamera` will control its 
own position and rotation (and only a limited range of rotations are allowable even
from the start) because it's interactive, so inherently less control can be given
to the artist's DCC tool. This is reflected in the fact that 
`IShowroomCameraArcRotateState`s take `Vector3`s for position and target instead
of a `TransformNode`: whereas a `TransformNode` specifies its own rotation,
the `ArcRotateCamera`'s rotation cannot be externally specified in this way and
will be deduced by the `ArcRotateCamera` itself from its position and target,
both of which are `Vector3` values in world space. Note that these `Vector3`s
can (and probably should) still be specified by the artist using "nulls" in the
DCC tool; the difference is that the rotations of the resulting `TransformNode`s
will be ignored and only the world space positions -- accessible using
`transformNode.absolutePosition` -- will be used to create an 
`IShowroomCameraArcRotateState`.

## Procedural Animations

Transitioning between various states can be either instantaneous (using
`setToMatchmoveState` or `setToArcRotateState`) or animated (using 
`animateToMatchmoveState` or `animateToArcRotateState`). Instantaneous transitions
are simple: the camera will just "teleport" to the new location immediately. (Note 
that the abruptness of such a transition can be mitigated by fade-in/fade-out 
techniques or other tricks that are not part of the `ShowroomCamera`.) The animated
transitions, however, require procedural animation.

Procedural animation, in this case, means using code and math to animate an
object instead of using predetermined motions created by an artist in a DCC tool.
Generally speaking, procedural animations are less desirable than artist-specified
animations because it's more difficult to control the procedural behavior 
precisely. In this case, however, procedural animation is unavoidable because of the
interactive nature of the experience. The motion of the `ArcRotateCamera` itself
is a form of procedural animation, and transitioning smoothly from such interactive
procedural animation to non-interactive artist-specified animation requires 
an interval of non-interactive procedural animation.

Generally speaking, users shouldn't have to worry about how this procedural 
animation works as it is an implementation detail of the `ShowroomCamera`. The
only place where this logic is somewhat exposed is in the `focusDepth` optional
parameter of the `IShowroomCameraMatchmoveState`, which (if provided) approximates
how far in front of the camera what the camera's "focused on" is. For example,
if the `IShowroomCameraMatchmoveState` in question is orbiting the clasp of a 
watch, the `focusDepth` might be specified to the approximate distance between the
camera and the clasp geometry it's orbiting.

This `focusDepth` parameter is not used at all *during* an 
`IShowroomCameraMatchmoveState` because, in that state, the motion of the camera
is completely controlled by the `TransformNode` specified as the `matchmoveTarget`.
`focusDepth` is *only* used during a procedural transition animation to control
the rotation of the camera during its procedural animation -- specifically the
direction it's looking. At a high level, every `ShowroomCamera` state has some 
notion of both where it is and what it's looking at, and the goal of the procedural
transition animations is to derive a sequence of intermediate positions and 
look-at targets to allow the camera to smoothly move from one state to the next.
In the case of `IShowroomCameraArcRotateState`, the look-at target is specified
by the `ArcRotateCamera` itself: `target`. In the case of 
`IShowroomCameraMatchmoveState`, the look-at target is derived from the 
`focusDepth` of the state combined with the position and forward direction of the 
matchmoving camera at the start of the transition.

## Questions? Comments? Concerns?

For help understanding, using, or fixing issues with the `ShowroomCamera`, please
ping **syntheticmagus** on a question in the [Questions section of the Babylon.js 
Community Forum](https://forum.babylonjs.com/c/questions). Thanks!
