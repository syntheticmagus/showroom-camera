import { Engine, Scene, MeshBuilder, TransformNode, Quaternion, Vector3, Space, Tools } from "@babylonjs/core";
import { ShowroomCamera, IShowroomCameraMatchmoveState, IShowroomCameraArcRotateState } from "./showroomCamera";

export class ShowroomCameraDemo {
    public static Run(canvas: HTMLCanvasElement): void {
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
