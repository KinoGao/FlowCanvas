import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { clone as cloneSkeleton } from "three/addons/utils/SkeletonUtils.js";
import type { GLTF } from "three/addons/loaders/GLTFLoader.js";

// 导演台默认骨骼角色模型（Three.js 官方 Xbot.glb，CC0，自带完整骨骼与 idle 动画）。
export const DEFAULT_DIRECTOR_MODEL_URL = "/models/Xbot.glb";

export type DirectorModelAsset = {
    gltf: GLTF;
    scale: number;
};

// 用 SkinnedMesh.computeBoundingBox（会套用蒙皮）测真实高度，避免硬编码单位导致模型缩成不可见。
export function computeDirectorModelScale(gltf: GLTF): number {
    const probe = cloneSkeleton(gltf.scene);
    probe.updateMatrixWorld(true);
    const box = new THREE.Box3();
    let any = false;

    probe.traverse((object) => {
        const mesh = object as THREE.SkinnedMesh;
        if (mesh.isSkinnedMesh) {
            mesh.computeBoundingBox();
            if (mesh.boundingBox) {
                box.union(mesh.boundingBox.clone().applyMatrix4(mesh.matrixWorld));
                any = true;
            }
        }
    });

    if (!any) box.setFromObject(probe);
    const height = box.max.y - box.min.y;
    return height > 0.001 ? 1.8 / height : 1;
}

export function createDirectorModelLoader(modelUrl = DEFAULT_DIRECTOR_MODEL_URL) {
    let asset: DirectorModelAsset | null = null;
    let promise: Promise<DirectorModelAsset> | null = null;

    return {
        load() {
            if (asset) return Promise.resolve(asset);
            if (promise) return promise;

            promise = new Promise<DirectorModelAsset>((resolve, reject) => {
                new GLTFLoader().load(
                    modelUrl,
                    (gltf) => {
                        asset = { gltf, scale: computeDirectorModelScale(gltf) };
                        resolve(asset);
                    },
                    undefined,
                    (error) => {
                        promise = null;
                        reject(error);
                    },
                );
            });

            return promise;
        },
    };
}
