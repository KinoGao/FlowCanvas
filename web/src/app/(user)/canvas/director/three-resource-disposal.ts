import * as THREE from "three";

const MATERIAL_TEXTURE_KEYS = ["map", "alphaMap", "aoMap", "bumpMap", "displacementMap", "emissiveMap", "envMap", "lightMap", "metalnessMap", "normalMap", "roughnessMap", "specularMap"] as const;

type DisposableMaterial = THREE.Material & Partial<Record<(typeof MATERIAL_TEXTURE_KEYS)[number], THREE.Texture | null>>;

type DisposeOptions = {
    disposeTextures?: boolean;
};

export function disposeTexture(texture: THREE.Texture | null | undefined) {
    texture?.dispose();
}

export function disposeMaterial(material: THREE.Material | THREE.Material[] | null | undefined, options: DisposeOptions = {}) {
    if (!material) return;
    const materials = Array.isArray(material) ? material : [material];
    materials.forEach((item) => {
        if (options.disposeTextures) {
            const textured = item as DisposableMaterial;
            MATERIAL_TEXTURE_KEYS.forEach((key) => disposeTexture(textured[key]));
        }
        item.dispose();
    });
}

export function disposeObject3D(object: THREE.Object3D, options: DisposeOptions = {}) {
    object.traverse((child) => {
        const mesh = child as THREE.Mesh;
        mesh.geometry?.dispose();
        disposeMaterial(mesh.material, options);
    });
}

export function removeAndDispose(parent: THREE.Object3D, child: THREE.Object3D, options: DisposeOptions = {}) {
    parent.remove(child);
    disposeObject3D(child, options);
}

export function clearGroup(group: THREE.Group, options: DisposeOptions = {}) {
    while (group.children.length) {
        removeAndDispose(group, group.children[0], options);
    }
}
