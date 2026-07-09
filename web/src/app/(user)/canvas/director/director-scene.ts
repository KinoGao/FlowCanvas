import * as THREE from "three";

import type { CanvasNodeMetadata } from "../types";

type DirectorSceneSettings = NonNullable<CanvasNodeMetadata["directorSceneSettings"]>;

export type DirectorStaticScene = {
    group: THREE.Group;
    groundMaterial: THREE.MeshStandardMaterial;
    ground: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshStandardMaterial>;
    looseGrid: THREE.GridHelper;
    snapGrid: THREE.GridHelper;
};

export function createDirectorStaticScene(): DirectorStaticScene {
    const group = new THREE.Group();

    const ambient = new THREE.AmbientLight(0xffffff, 0.55);
    group.add(ambient);

    const keyLight = new THREE.DirectionalLight(0x9ecbff, 1.4);
    keyLight.position.set(5, 8, 5);
    group.add(keyLight);

    const rimLight = new THREE.DirectionalLight(0x67e8f9, 0.9);
    rimLight.position.set(-5, 4, -4);
    group.add(rimLight);

    const groundMaterial = new THREE.MeshStandardMaterial({
        color: 0x11161c,
        transparent: true,
        opacity: 0.4,
        roughness: 0.92,
        metalness: 0.05,
    });
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), groundMaterial);
    ground.rotation.x = -Math.PI / 2;
    group.add(ground);

    const looseGrid = new THREE.GridHelper(34, 17, 0x24515f, 0x24515f);
    const snapGrid = new THREE.GridHelper(34, 34, 0x67e8f9, 0x67e8f9);
    (looseGrid.material as THREE.Material).transparent = true;
    (looseGrid.material as THREE.Material).opacity = 0.34;
    (snapGrid.material as THREE.Material).transparent = true;
    (snapGrid.material as THREE.Material).opacity = 0.62;
    group.add(looseGrid);
    group.add(snapGrid);

    return { group, groundMaterial, ground, looseGrid, snapGrid };
}

export function syncDirectorWorld(scene: THREE.Scene, world: THREE.Group, staticScene: DirectorStaticScene, settings: DirectorSceneSettings) {
    scene.background = new THREE.Color(settings.skyColor || "#060608");
    scene.fog = new THREE.Fog(new THREE.Color(settings.skyColor || "#060608"), 18, 42);
    world.position.set(settings.translate.x, settings.translate.y, settings.translate.z);
    world.rotation.set(THREE.MathUtils.degToRad(settings.rotate.x), THREE.MathUtils.degToRad(settings.rotate.y), THREE.MathUtils.degToRad(settings.rotate.z));
    world.scale.setScalar(settings.scale / 300);

    staticScene.ground.visible = settings.groundVisible;
    staticScene.ground.position.y = settings.groundHeight;
    staticScene.groundMaterial.opacity = settings.groundOpacity;
    staticScene.looseGrid.visible = !settings.gridSnap;
    staticScene.snapGrid.visible = settings.gridSnap;
    staticScene.looseGrid.position.y = settings.groundHeight + 0.012;
    staticScene.snapGrid.position.y = settings.groundHeight + 0.012;
}
