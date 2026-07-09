import * as THREE from "three";

import type { DirectorProp } from "../types";

export function createDirectorPropGeometry(shape: DirectorProp["shape"]): THREE.BufferGeometry {
    switch (shape) {
        case "sphere":
            return new THREE.SphereGeometry(0.5, 24, 16);
        case "cylinder":
            return new THREE.CylinderGeometry(0.5, 0.5, 1, 24);
        case "cone":
            return new THREE.ConeGeometry(0.5, 1, 24);
        case "plane":
            return new THREE.PlaneGeometry(2, 2);
        case "box":
        default:
            return new THREE.BoxGeometry(1, 1, 1);
    }
}

export function createDirectorPropMesh(prop: DirectorProp) {
    const mesh = new THREE.Mesh(
        createDirectorPropGeometry(prop.shape),
        new THREE.MeshStandardMaterial({
            color: new THREE.Color(prop.color || "#8a8a8a"),
            roughness: 0.6,
            metalness: 0.1,
        }),
    );

    mesh.position.set(prop.position.x, prop.position.y, prop.position.z);
    mesh.rotation.y = THREE.MathUtils.degToRad(prop.rotation || 0);
    mesh.scale.setScalar(prop.scale ?? 1);
    mesh.userData.dragType = "prop";
    mesh.userData.propId = prop.id;
    mesh.userData.propShape = prop.shape;

    return mesh;
}
