import { ArcRotateCamera, Engine, FreeCamera, MeshBuilder, Observable, Quaternion, Scene, Space, TmpVectors, Tools, TransformNode, Vector3 } from "@babylonjs/core";

enum ShowroomCameraState {
    Matchmove,
    ArcRotate
}

export interface IShowroomCameraMatchmoveState {
    matchmoveTarget: TransformNode;
    focusDepth?: number;
}

export interface IShowroomCameraArcRotateState {
    startingPosition: Vector3;
    target: Vector3;
}

export class ShowroomCamera
{
    private _scene: Scene;
    private _transform: TransformNode;
    private _camera: FreeCamera;
    private _arcRotateCamera: ArcRotateCamera;
    private _perFrameObservable: Observable<void>;

    private _currentFocusPosition: Vector3;
    private _currentState: ShowroomCameraState;

    public constructor (scene: Scene) {
        this._scene = scene;
        this._transform = new TransformNode("showroomRoot", this._scene);
        this._transform.rotationQuaternion = Quaternion.Identity();

        this._camera = new FreeCamera("showroomCamera", Vector3.Zero(), this._scene, true);
        this._camera.parent = this._transform;

        this._arcRotateCamera = new ArcRotateCamera("showroomArcRotateCamera", 0, 0, 0, Vector3.Zero(), this._scene, false);

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
        this._arcRotateCamera.upperRadiusLimit = 2 * Vector3.Distance(state.startingPosition, state.target);
        this._arcRotateCamera.lowerRadiusLimit = 0.1 * this._arcRotateCamera.upperRadiusLimit;
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

    public setToMatchmoveState(state: IShowroomCameraMatchmoveState): void {
        this._arcRotateCamera.detachControl();
        this._scene.setActiveCameraByName("showroomCamera");

        this._matchmove(state);

        this._perFrameObservable.cancelAllCoroutines();
        this._perFrameObservable.runCoroutineAsync(this._matchmoveCoroutine(state));

        this._currentState = ShowroomCameraState.Matchmove;
    }

    public setToArcRotateState(state: IShowroomCameraArcRotateState): void {
        this._perFrameObservable.cancelAllCoroutines();

        this._scene.setActiveCameraByName("showroomArcRotateCamera");
        this._poseArcRotateCamera(state);
        this._arcRotateCamera.attachControl();

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

        const ANIMATION_FRAMES = Math.round(seconds * 60 / this._scene.getAnimationRatio());
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

        const ANIMATION_FRAMES = Math.round(seconds * 60 / this._scene.getAnimationRatio());
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

    public async animateToArcRotateState(state: IShowroomCameraArcRotateState, seconds: number = 1): Promise<void> {
        this._perFrameObservable.cancelAllCoroutines();
        return this._perFrameObservable.runCoroutineAsync(this._animateToArcRotateStateCoroutine(state, seconds));
    }

    public static Demo(canvas: HTMLCanvasElement): void {
        const engine = new Engine(canvas);
        const scene = new Scene(engine);

        const sphere = MeshBuilder.CreateSphere("sphere", { diameter: 2 }, scene);
        sphere.position.y = 1;
        const cube = MeshBuilder.CreateBox("cube", { size: 0.5 }, scene);
        cube.position.y = 0.25;
        cube.position.z = -2;
        MeshBuilder.CreateGround("ground", { width: 6, height: 6 }, scene);

        scene.createDefaultLight();
        
        const camera = new ShowroomCamera(scene);
        
        const pylon = new TransformNode("pylon", scene);
        pylon.rotationQuaternion = Quaternion.Identity();
        const matchmove = new TransformNode("matchmove", scene);
        matchmove.rotationQuaternion = Quaternion.Identity();

        matchmove.parent = pylon;
        matchmove.position.z = -10;
        pylon.rotate(Vector3.RightReadOnly, 0.1);
        scene.onBeforeRenderObservable.runCoroutineAsync(function* () {
            while (true) {
                pylon.rotate(Vector3.UpReadOnly, 0.01, Space.WORLD);
                yield;
            }
        }());

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

        engine.runRenderLoop(() => {
            scene.render();
        });
    }
}
