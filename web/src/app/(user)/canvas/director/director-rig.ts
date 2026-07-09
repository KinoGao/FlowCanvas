import * as THREE from "three";

export type DirectorBoneIndex = Map<string, THREE.Bone>;

export function buildDirectorBoneIndex(root: THREE.Object3D): DirectorBoneIndex {
    const index: DirectorBoneIndex = new Map();

    root.traverse((object) => {
        const bone = object as THREE.Bone;
        if (bone.isBone && bone.name) index.set(bone.name, bone);
    });

    return index;
}

export function findDirectorBone(index: DirectorBoneIndex, candidates: string[]) {
    for (const name of candidates) {
        const bone = index.get(name);
        if (bone) return bone;
    }
    return null;
}
