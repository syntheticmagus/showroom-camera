import { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera";
import { FreeCamera } from "@babylonjs/core/Cameras/freeCamera";
import { Quaternion, TmpVectors, Vector3 } from "@babylonjs/core/Maths/math";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { Observable } from "@babylonjs/core/Misc/observable";
import "@babylonjs/core/Misc/observableCoroutine";
import { Scene } from "@babylonjs/core/scene";

enum ShowroomCameraState {
    Matchmove,
    ArcRotate
}

/**
 * Data representing a state where the camera is following the motion of a
 * TransformNode in the scene.
 */
export interface IShowroomCameraMatchmoveState {
    /**
     * The TransformNode the camera should follow in this state.
     */
    matchmoveTarget: TransformNode;

    /**
     * Approximately how far in front of the camera the objects 
     * being viewed are; this is used to influence the procedural
     * animations. If not provided, focus depth of 1 is used.
     */
    focusDepth?: number;
}

/**
 * Data representing a state where the camera is behaving as an ArcRotateCamera.
 */
export interface IShowroomCameraArcRotateState {
    /**
     * The position the camera should be in when it initiates arc-rotate 
     * behavior.
     */

    startingPosition: Vector3;
    /**
     * The target position the arc-rotate behavior should be focused on.
     */
    target: Vector3;

    /**
     * Optional parameter controlling how close the camera is allowed to get to 
     * its target. Defaults to one tenth of the upper radius limit.
     */
    lowerRadiusLimit?: number;

    /**
     * Optional parameter controlling how far the camera is allowed to get from 
     * its target. Defaults to twice the distance between the target and the 
     * starting position.
     */
    upperRadiusLimit?: number;

    /**
     * Optional parameter controlling how quickly the scroll wheel moves the
     * camera forward and backward. Defaults to 0.01.
     */
    wheelDeltaPercentage?: number;
}

/**
 * Camera system designed to provide both matchmoving and arc-rotate behavior,
 * as well as transitions between, in a simple combined abstraction. Note that
 * this is not a single Camera in the Babylon.js sense, but a mechanism to 
 * provide sophisticated camera behavior via a minimal, easy-to-use API.
 */
export class ShowroomCamera {
    private _scene: Scene;
    private _transform: TransformNode;
    private _camera: FreeCamera;
    private _arcRotateCamera: ArcRotateCamera;
    private _enableMouseWheel: boolean;
    private _perFrameObservable: Observable<void>;

    private _currentFocusPosition: Vector3;
    private _currentState: ShowroomCameraState;

    /**
     * Sets camera FOV.
     */
    public set fov(value: number) {
        this._camera.fov = value;
        this._arcRotateCamera.fov = value;
    }

    /**
     * Sets the camera's near clip plane.
     */
    public set minZ(value: number) {
        this._camera.minZ = value;
        this._arcRotateCamera.minZ = value;
    }

    /**
     * Sets the camera's far clip plane.
     */
    public set maxZ(value: number) {
        this._camera.maxZ = value;
        this._arcRotateCamera.maxZ = value;
    }

    /**
     * Sets whether or not the camera will respond to mouse
     * wheel movement when in an arc-rotate state. This defaults
     * to true, but disabling this is useful if/when the scroll
     * wheel is needed for something else in the experience.
     */
    public set enableMouseWheel(value: boolean) {
        this._enableMouseWheel = value;
        if (this._arcRotateCamera.inputs) {
            this._arcRotateCamera.inputs.remove(this._arcRotateCamera.inputs.attached.mousewheel);
        }
    }

    /**
     * Utility method providing an alternative to scroll wheel
     * "zooming." Setting this value will cause the camera in an
     * arc-rotate state to procedurally animate to a certain distance
     * from the target determined by a "percentage" of the way from
     * the lower radius limit to the upper radius limit.
     */
    public set arcRotateZoomPercent(value: number) {
        if (this._currentState === ShowroomCameraState.ArcRotate) {
            const targetRadius = value * (this._arcRotateCamera.upperRadiusLimit! - this._arcRotateCamera.lowerRadiusLimit!) + this._arcRotateCamera.lowerRadiusLimit!;
            const arcRotateCamera = this._arcRotateCamera;

            this._perFrameObservable.cancelAllCoroutines();
            this._perFrameObservable.runCoroutineAsync(function* () {
                while (Math.abs(targetRadius - arcRotateCamera.radius) > 0.001) {
                    arcRotateCamera.radius = 0.05 * targetRadius + 0.95 * arcRotateCamera.radius;
                    yield;
                }
            }());
        }
    }

    public constructor (scene: Scene) {
        this._scene = scene;
        this._transform = new TransformNode("showroomRoot", this._scene);
        this._transform.rotationQuaternion = Quaternion.Identity();

        this._camera = new FreeCamera("showroomCamera", Vector3.Zero(), this._scene, true);
        this._camera.parent = this._transform;

        this._arcRotateCamera = new ArcRotateCamera("showroomArcRotateCamera", 0, 0, 0, Vector3.Zero(), this._scene, false);
        this._enableMouseWheel = true;

        this._perFrameObservable = new Observable<void>();
        this._scene.onBeforeRenderObservable.add(() => {
            this._perFrameObservable.notifyObservers();
        });

        this._currentFocusPosition = Vector3.Zero();
        this._currentState = ShowroomCameraState.Matchmove;
    }

    private _matchmove(state: IShowroomCameraMatchmoveState): void {
        this._transform.position.copyFrom(state.matchmoveTarget.absolutePosition);
        this._transform.rotationQuaternion!.copyFrom(state.matchmoveTarget.absoluteRotationQuaternion);
        
        this._currentFocusPosition.copyFrom(state.matchmoveTarget.absolutePosition);
        state.matchmoveTarget.forward.scaleAndAddToRef(state.focusDepth ?? 1, this._currentFocusPosition);
    }

    private *_matchmoveCoroutine(state: IShowroomCameraMatchmoveState) {
        while (true) {
            this._matchmove(state);
            yield;
        }
    }

    private _poseArcRotateCamera(state: IShowroomCameraArcRotateState): void {
        this._arcRotateCamera.target = state.startingPosition;
        this._arcRotateCamera.lowerRadiusLimit = 0;
        this._arcRotateCamera.upperRadiusLimit = 0;
        this._arcRotateCamera.radius = 0;
        this._arcRotateCamera.position.copyFrom(state.startingPosition);
        this._arcRotateCamera.upperRadiusLimit = state.upperRadiusLimit ?? 2 * Vector3.Distance(state.startingPosition, state.target);
        this._arcRotateCamera.lowerRadiusLimit = state.lowerRadiusLimit ?? 0.1 * this._arcRotateCamera.upperRadiusLimit;
        this._arcRotateCamera.wheelDeltaPercentage = state.wheelDeltaPercentage ?? 0.01;
        this._arcRotateCamera.setTarget(state.target);
    }

    private _getArcRotateCameraPoseComponentsToRef(position: Vector3, forward: Vector3, up: Vector3, focusPoint: Vector3): void {
        // Though tricky and hard to read, the simplest way to directly align the transform with
        // the ArcRotateCamera is to use the world matrix.
        const mat = this._arcRotateCamera.getWorldMatrix();

        position.copyFromFloats(mat.m[12], mat.m[13], mat.m[14]);

        forward.copyFromFloats(mat.m[8], mat.m[9], mat.m[10]);
        up.copyFromFloats(mat.m[4], mat.m[5], mat.m[6]);

        focusPoint.copyFrom(this._arcRotateCamera.target);
    }

    private _alignTransformToArcRotateCamera() {
        const forward = TmpVectors.Vector3[0];
        const up = TmpVectors.Vector3[1];
        const focusPoint = TmpVectors.Vector3[2];
        this._getArcRotateCameraPoseComponentsToRef(this._transform.position, forward, up, focusPoint);
        Quaternion.FromLookDirectionRHToRef(forward, up, this._transform.rotationQuaternion!);
    }

    /**
     * Immediately sets the camera into a matchmoving state, with no transition.
     * @param state the target matchmoving state
     */
    public setToMatchmoveState(state: IShowroomCameraMatchmoveState): void {
        this._arcRotateCamera.detachControl();
        this._scene.setActiveCameraByName("showroomCamera");

        this._matchmove(state);

        this._perFrameObservable.cancelAllCoroutines();
        this._perFrameObservable.runCoroutineAsync(this._matchmoveCoroutine(state));

        this._currentState = ShowroomCameraState.Matchmove;
    }

    /**
     * Immediately sets the camera into an arc-rotate state, with no transition.
     * @param state the target arc-rotate state
     */
    public setToArcRotateState(state: IShowroomCameraArcRotateState): void {
        this._perFrameObservable.cancelAllCoroutines();

        this._scene.setActiveCameraByName("showroomArcRotateCamera");
        this._poseArcRotateCamera(state);
        
        this._arcRotateCamera.attachControl();
        if (!this._enableMouseWheel) {
            this._arcRotateCamera.inputs.remove(this._arcRotateCamera.inputs.attached.mousewheel);
        }

        this._currentFocusPosition.copyFrom(state.target);

        this._currentState = ShowroomCameraState.ArcRotate;
    }
    
    private *_animateToMatchmoveStateCoroutine(state: IShowroomCameraMatchmoveState, seconds: number) {
        if (this._currentState === ShowroomCameraState.ArcRotate) {
            this._alignTransformToArcRotateCamera();

            this._scene.setActiveCameraByName("showroomCamera");
            this._arcRotateCamera.detachControl();

            this._currentState = ShowroomCameraState.Matchmove;
        }

        const startingPosition = this._transform.position.clone();
        const startingFocus = this._currentFocusPosition.clone();
        const startingUp = this._transform.up.clone();

        const ANIMATION_FRAMES = Math.round(seconds * 60 / Math.max(this._scene.getAnimationRatio(), 1));
        for (let frame = 0; frame <= ANIMATION_FRAMES; ++frame) {
            let t = frame / ANIMATION_FRAMES;

            Vector3.LerpToRef(startingPosition, state.matchmoveTarget.absolutePosition, t, this._transform.position);

            const targetFocus = TmpVectors.Vector3[0];
            targetFocus.copyFrom(state.matchmoveTarget.absolutePosition);
            state.matchmoveTarget.forward.scaleAndAddToRef(state.focusDepth ?? 1, targetFocus);

            const focusT = TmpVectors.Vector3[1];
            Vector3.LerpToRef(startingFocus, targetFocus, t, focusT);
            this._currentFocusPosition.copyFrom(focusT);

            // We reuse temp vector 0 for this because we no longer need targetFocus.
            const forwardT = TmpVectors.Vector3[0];
            focusT.subtractToRef(this._transform.position, forwardT);
            forwardT.normalize();

            // Likewise, we reuse temp vector 1 because focusT is not needed after calculating forwardT.
            const upT = TmpVectors.Vector3[1];
            Vector3.LerpToRef(startingUp, state.matchmoveTarget.up, t, upT);

            const rightT = TmpVectors.Vector3[2];
            Vector3.CrossToRef(forwardT, upT, rightT);
            Vector3.CrossToRef(rightT, forwardT, upT);
            upT.normalize();

            Quaternion.FromLookDirectionRHToRef(forwardT, upT, this._transform.rotationQuaternion!);

            yield;
        }

        this.setToMatchmoveState(state);
    }

    /**
     * Begins transitioning the camera to a matchmoving state using a procedural animation. Setting
     * to another state can smoothly interrupt this process.
     * @param state the target matchmoving state
     * @param seconds optional parameter specifying how long the procedural animation should take
     * @returns a promise which resolves when the procedural animation completes
     */
    public async animateToMatchmoveState(state: IShowroomCameraMatchmoveState, seconds: number = 1): Promise<void> {
        this._perFrameObservable.cancelAllCoroutines();
        return this._perFrameObservable.runCoroutineAsync(this._animateToMatchmoveStateCoroutine(state, seconds));
    }

    private *_animateToArcRotateStateCoroutine(state: IShowroomCameraArcRotateState, seconds: number) {
        if (this._currentState === ShowroomCameraState.ArcRotate) {
            this._alignTransformToArcRotateCamera();

            this._scene.setActiveCameraByName("showroomCamera");
            this._arcRotateCamera.detachControl();

            this._currentState = ShowroomCameraState.Matchmove;
        }

        this._transform.computeWorldMatrix(true);
        const startingPosition = this._transform.position.clone();
        const startingUp = this._transform.up.clone();
        const startingFocus = this._currentFocusPosition.clone();

        this._poseArcRotateCamera(state);
        const destinationPosition = new Vector3();
        const destinationUp = new Vector3();
        const destinationFocus = new Vector3();
        this._getArcRotateCameraPoseComponentsToRef(destinationPosition, TmpVectors.Vector3[0], destinationUp, destinationFocus);

        const ANIMATION_FRAMES = Math.round(seconds * 60 / Math.max(this._scene.getAnimationRatio(), 1));
        for (let frame = 0; frame <= ANIMATION_FRAMES; ++frame) {
            let t = frame / ANIMATION_FRAMES;

            Vector3.LerpToRef(startingPosition, destinationPosition, t, this._transform.position);

            const focusT = TmpVectors.Vector3[1];
            Vector3.LerpToRef(startingFocus, destinationFocus, t, focusT);
            this._currentFocusPosition.copyFrom(focusT);

            const forwardT = TmpVectors.Vector3[0];
            focusT.subtractToRef(this._transform.position, forwardT);
            forwardT.normalize();

            // Likewise, we reuse temp vector 1 because focusT is not needed after calculating forwardT.
            const upT = TmpVectors.Vector3[1];
            Vector3.LerpToRef(startingUp, destinationUp, t, upT);

            const rightT = TmpVectors.Vector3[2];
            Vector3.CrossToRef(forwardT, upT, rightT);
            Vector3.CrossToRef(rightT, forwardT, upT);
            upT.normalize();

            Quaternion.FromLookDirectionRHToRef(forwardT, upT, this._transform.rotationQuaternion!);

            yield;
        }

        this.setToArcRotateState(state);
    }

    /**
     * Begins transitioning the camera to an arc-rotate state using a procedural animation. Setting
     * to another state can smoothly interrupt this process.
     * @param state the target arc-rotate state
     * @param seconds optional parameter specifying how long the procedural animation should take
     * @returns a promise which resolves when the procedural animation completes
     */
    public async animateToArcRotateState(state: IShowroomCameraArcRotateState, seconds: number = 1): Promise<void> {
        this._perFrameObservable.cancelAllCoroutines();
        return this._perFrameObservable.runCoroutineAsync(this._animateToArcRotateStateCoroutine(state, seconds));
    }
}
