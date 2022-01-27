import { ArcRotateCamera, BabylonFileLoaderConfiguration, Engine, FreeCamera, Matrix, MeshBuilder, Observable, Scene, TransformNode, Vector3 } from "@babylonjs/core";

interface IShowroomCameraMatchmoveState {
    matchmoveTarget: TransformNode;
    focusDepth?: number;
}

interface IShowroomCameraArcRotateState {
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

    private _currentFocusDepth: number = 0;

    public constructor (scene: Scene) {
        this._scene = scene;
        this._transform = new TransformNode("showroomRoot", this._scene);

        this._camera = new FreeCamera("showroomCamera", Vector3.Zero(), this._scene, true);
        this._camera.parent = this._transform;

        this._arcRotateCamera = new ArcRotateCamera("showroomArcRotateCamera", 0, 0, 0, Vector3.Zero(), this._scene, false);

        this._perFrameObservable = new Observable<void>();
        this._scene.onBeforeRenderObservable.add(() => {
            this._perFrameObservable.notifyObservers();
        });
    }

    private *_followTransformNodeCoroutine(transformNode: TransformNode) {
        while (true) {
            this._transform.position.copyFrom(transformNode.absolutePosition);
            this._transform.rotationQuaternion!.copyFrom(transformNode.absoluteRotationQuaternion);
            yield;
        }
    }

    private _poseArcRotateCamera(state: IShowroomCameraArcRotateState) {
        this._arcRotateCamera.target = state.startingPosition;
        this._arcRotateCamera.lowerRadiusLimit = 0;
        this._arcRotateCamera.radius = 0;
        this._arcRotateCamera.upperRadiusLimit = 2 * Vector3.Distance(state.startingPosition, state.target);
        this._arcRotateCamera.setTarget(state.target);
    }

    public setToMatchmoveState(state: IShowroomCameraMatchmoveState): void {
        this._arcRotateCamera.detachControl();
        this._scene.setActiveCameraByName("showroomCamera");

        this._transform.position.copyFrom(state.matchmoveTarget.absolutePosition);
        this._transform.rotationQuaternion!.copyFrom(state.matchmoveTarget.absoluteRotationQuaternion);

        this._perFrameObservable.cancelAllCoroutines();
        this._perFrameObservable.runCoroutineAsync(this._followTransformNodeCoroutine(state.matchmoveTarget));

        this._currentFocusDepth = state.focusDepth ?? 1;
    }

    public setToArcRotateState(state: IShowroomCameraArcRotateState): void {
        this._scene.setActiveCameraByName("showroomArcRotateCamera");
        this._poseArcRotateCamera(state);
        this._arcRotateCamera.attachControl();

        // THIS IS NOT CORRECT. We need to recover this at the moment we start a transition,
        // from distance between camera and target if in an arc rotate state and from the 
        // provided information if in a matchmoving state.
        this._currentFocusDepth = Vector3.Distance(state.startingPosition, state.target);
    }

    // STRATEGY FOR TRANSITIONING TO ARC ROTATE STATE: Set the position of the arc rotate camera
    // without activating it so that we can get its exact work matrix, then animate to that before
    // activating it. It's the only way to be sure we can keep ArcRotateCamera's established behavior
    // and still transition to it seamlessly.

    public static Demo(canvas: HTMLCanvasElement): void {
        const engine = new Engine(canvas);
        const scene = new Scene(engine);

        const sphere = MeshBuilder.CreateSphere("sphere", { diameter: 2 }, scene);
        sphere.position.y = 1;
        MeshBuilder.CreateGround("ground", { width: 6, height: 6 }, scene);

        scene.createDefaultLight();
        scene.createDefaultCamera(true, true,true);

        engine.runRenderLoop(() => {
            scene.render();
        });
    }
}
