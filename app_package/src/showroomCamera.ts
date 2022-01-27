import { ArcRotateCamera, BabylonFileLoaderConfiguration, Engine, FreeCamera, Matrix, MeshBuilder, Observable, Quaternion, Scene, Space, Tools, TransformNode, Vector3 } from "@babylonjs/core";

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

    private _currentFocusPosition: Vector3;

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
    }

    private _matchmove(state: IShowroomCameraMatchmoveState) {
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

    public setToMatchmoveState(state: IShowroomCameraMatchmoveState): void {
        this._arcRotateCamera.detachControl();
        this._scene.setActiveCameraByName("showroomCamera");

        this._matchmove(state);

        this._perFrameObservable.cancelAllCoroutines();
        this._perFrameObservable.runCoroutineAsync(this._matchmoveCoroutine(state));
    }

    private _poseArcRotateCamera(state: IShowroomCameraArcRotateState) {
        this._arcRotateCamera.target = state.startingPosition;
        this._arcRotateCamera.lowerRadiusLimit = 0;
        this._arcRotateCamera.upperRadiusLimit = 0;
        this._arcRotateCamera.radius = 0;
        this._arcRotateCamera.position.copyFrom(state.startingPosition);
        this._arcRotateCamera.upperRadiusLimit = 2 * Vector3.Distance(state.startingPosition, state.target);
        this._arcRotateCamera.lowerRadiusLimit = 0.1 * this._arcRotateCamera.upperRadiusLimit;
        this._arcRotateCamera.setTarget(state.target);
    }

    public setToArcRotateState(state: IShowroomCameraArcRotateState): void {
        this._scene.setActiveCameraByName("showroomArcRotateCamera");
        this._poseArcRotateCamera(state);
        this._arcRotateCamera.attachControl();

        this._currentFocusPosition.copyFrom(state.target);
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
                camera.setToMatchmoveState(matchmoveState);
                await Tools.DelayAsync(5000);
                camera.setToArcRotateState(arcRotateState);
                await Tools.DelayAsync(5000);
            }
        }
        setStateFunction();

        engine.runRenderLoop(() => {
            scene.render();
        });
    }
}
