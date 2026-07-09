import { useEffect, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { clone as cloneSkeleton } from "three/addons/utils/SkeletonUtils.js";
import type { GLTF } from "three/addons/loaders/GLTFLoader.js";

import type { CanvasNodeMetadata, DirectorAspectRatio } from "../types";
import { createDirectorModelLoader } from "./director-model";
import { createDirectorPropMesh } from "./director-props";
import { buildDirectorBoneIndex, findDirectorBone, type DirectorBoneIndex } from "./director-rig";
import { createDirectorStaticScene, syncDirectorWorld } from "./director-scene";
import { disposeObject3D, disposeTexture, removeAndDispose } from "./three-resource-disposal";

type DirectorCharacterData = NonNullable<CanvasNodeMetadata["directorCharacters"]>[number];
type DirectorPoseData = NonNullable<DirectorCharacterData["pose"]>;

const DEFAULT_DIRECTOR_POSE: DirectorPoseData = {
    headYaw: 0,
    headPitch: 0,
    headRoll: 0,
    torsoTwist: 0,
    torsoLean: 0,
    torsoBend: 0,
    leftArm: 0,
    leftArmFwd: 0,
    leftElbow: 0,
    rightArm: 0,
    rightArmFwd: 0,
    rightElbow: 0,
    leftLeg: 0,
    leftHipSpread: 0,
    leftKnee: 0,
    rightLeg: 0,
    rightHipSpread: 0,
    rightKnee: 0,
};

const ASPECT_PRESETS: Array<{ label: DirectorAspectRatio; value: number }> = [
    { label: "16:9", value: 16 / 9 },
    { label: "9:16", value: 9 / 16 },
    { label: "1:1", value: 1 },
    { label: "4:3", value: 4 / 3 },
    { label: "2.39:1", value: 2.39 },
];

type PendingDirectorStageChange =
    | { type: "character"; id: string; patch: Partial<DirectorCharacterData> }
    | { type: "prop"; id: string; patch: Partial<NonNullable<CanvasNodeMetadata["directorPropItems"]>[number]> }
    | { type: "camera"; patch: Partial<NonNullable<CanvasNodeMetadata["directorShots"]>[number]> };

export function DirectorThreeStage({
    scene,
    characters,
    selectedCharacterId,
    onCharacterChange,
    onSelectCharacterId,
    activeShot,
    selectedObject,
    viewMode,
    onSelectObject,
    onActiveShotChange,
    resetSignal,
    props,
    selectedPropId,
    onPropChange,
    onSelectPropId,
}: {
    scene: NonNullable<CanvasNodeMetadata["directorSceneSettings"]>;
    characters: DirectorCharacterData[];
    selectedCharacterId: string;
    onCharacterChange: (id: string, patch: Partial<DirectorCharacterData>) => void;
    onSelectCharacterId?: (id: string) => void;
    activeShot: NonNullable<CanvasNodeMetadata["directorShots"]>[number];
    selectedObject: "scene" | "camera" | "character" | "prop";
    viewMode: "director" | "camera";
    onSelectObject: (object: "scene" | "camera" | "character" | "prop") => void;
    onActiveShotChange: (patch: Partial<NonNullable<CanvasNodeMetadata["directorShots"]>[number]>) => void;
    resetSignal?: number;
    props?: NonNullable<CanvasNodeMetadata["directorPropItems"]>;
    selectedPropId?: string;
    onPropChange?: (id: string, patch: Partial<NonNullable<CanvasNodeMetadata["directorPropItems"]>[number]>) => void;
    onSelectPropId?: (id: string) => void;
}) {
    const mountRef = useRef<HTMLDivElement | null>(null);
    const rebuildRef = useRef<(() => void) | null>(null);
    const orbitRef = useRef<OrbitControls | null>(null);
    const scheduleRenderRef = useRef<(() => void) | null>(null);
    const propsRef = useRef({ scene, characters, selectedCharacterId, onCharacterChange, onSelectCharacterId, activeShot, selectedObject, viewMode, onSelectObject, onActiveShotChange, props, selectedPropId, onPropChange, onSelectPropId });
    propsRef.current = { scene, characters, selectedCharacterId, onCharacterChange, onSelectCharacterId, activeShot, selectedObject, viewMode, onSelectObject, onActiveShotChange, props, selectedPropId, onPropChange, onSelectPropId };

    useEffect(() => {
        const mount = mountRef.current;
        if (!mount) return;

        const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
        renderer.setClearColor(new THREE.Color(propsRef.current.scene.skyColor || "#060608"), 1);
        mount.appendChild(renderer.domElement);

        const threeScene = new THREE.Scene();
        const world = new THREE.Group();
        threeScene.add(world);
        const staticScene = createDirectorStaticScene();
        world.add(staticScene.group);
        const contentGroup = new THREE.Group();
        world.add(contentGroup);

        const directorCamera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
        directorCamera.position.set(6, 5.2, 8.5);
        directorCamera.lookAt(0, 1.05, 0);

        const orbit = new OrbitControls(directorCamera, renderer.domElement);
        orbit.target.set(0, 1.05, 0);
        orbit.enableDamping = true;
        orbit.dampingFactor = 0.08;
        orbit.rotateSpeed = 0.6;
        orbit.zoomSpeed = 1.2;
        orbit.panSpeed = 0.8;
        orbit.minDistance = 2;
        orbit.maxDistance = 40;
        orbit.maxPolarAngle = Math.PI * 0.485;
        orbit.enablePan = true;
        orbitRef.current = orbit;

        // 体型比例：uniform 缩放，避免非均匀缩放导致蒙皮网格剪切变形（不同比例角色同框=LibTV 卖点）
        const TYPE_FACTORS: Record<string, number> = {
            male: 1,
            female: 0.94,
            child: 0.62,
            tall: 1.12,
            short: 0.86,
            heavy: 1.08,
            slim: 0.92,
        };
        const aspectValueOf = () => ASPECT_PRESETS.find((p) => p.label === (propsRef.current.scene.aspectRatio || "16:9"))?.value ?? 16 / 9;
        const groups: { characterGroups: Record<string, THREE.Group>; shotCamera?: THREE.PerspectiveCamera } = { characterGroups: {} };
        const directorModelLoader = createDirectorModelLoader();
        let directorModel: GLTF | null = null;
        let directorModelScale = 1;

        const renderCamera = () => (propsRef.current.viewMode === "camera" ? groups.shotCamera : directorCamera);
        let needsRender = false;
        const renderNow = () => {
            const cam = renderCamera();
            if (cam) renderer.render(threeScene, cam);
        };
        const scheduleRender = () => {
            needsRender = true;
        };
        scheduleRenderRef.current = scheduleRender;
        const loop = () => {
            if (propsRef.current.viewMode === "director") {
                const moved = orbit.update();
                if (moved) needsRender = true;
            }
            if (needsRender) {
                needsRender = false;
                renderNow();
            }
            rafId = requestAnimationFrame(loop);
        };
        let rafId = requestAnimationFrame(loop);

        // 聚焦角色只在"切换选中"时才移动相机焦点，避免每次改姿势/位置都把画面拽过去导致乱跑
        let lastFocusId: string | null = null;
        // 全景贴图按 URL 缓存，避免每次 rebuild 都重建 GPU 纹理（改姿势时疯狂 churn 卡顿）
        let panoTex: THREE.Texture | null = null;
        let panoTexUrl: string | null = null;
        let disposed = false;
        const disposePanoramaTexture = () => {
            disposeTexture(panoTex);
            panoTex = null;
            panoTexUrl = null;
        };

        const rebuildScene = () => {
            const data = propsRef.current;
            const sc = data.scene;
            const presentCharIds = new Set(data.characters.map((c) => c.id));
            for (const id of Object.keys(groups.characterGroups)) {
                const g = groups.characterGroups[id];
                if (g.parent === contentGroup) contentGroup.remove(g);
                if (!presentCharIds.has(id)) {
                    disposeObject3D(g);
                    delete groups.characterGroups[id];
                }
            }
            while (contentGroup.children.length) {
                removeAndDispose(contentGroup, contentGroup.children[0]);
            }
            groups.shotCamera = undefined;

            syncDirectorWorld(threeScene, world, staticScene, sc);

            if (sc.panoramaVisible && sc.panoramaUrl) {
                if (panoTexUrl !== sc.panoramaUrl) {
                    disposePanoramaTexture();
                    const nextUrl = sc.panoramaUrl;
                    const nextTexture = new THREE.TextureLoader().load(nextUrl, () => {
                        if (disposed || panoTex !== nextTexture || panoTexUrl !== nextUrl) {
                            disposeTexture(nextTexture);
                            return;
                        }
                        scheduleRender();
                    });
                    nextTexture.colorSpace = THREE.SRGBColorSpace;
                    panoTex = nextTexture;
                    panoTexUrl = nextUrl;
                }
                const pano = new THREE.Mesh(new THREE.SphereGeometry(sc.panoramaRadius || 60, 64, 32), new THREE.MeshBasicMaterial({ map: panoTex, side: THREE.BackSide, fog: false }));
                pano.rotation.y = THREE.MathUtils.degToRad(sc.panoramaRotation || 0);
                contentGroup.add(pano);
            } else if (panoTex) {
                disposePanoramaTexture();
            }

            data.characters.forEach((char) => {
                const typeScale = TYPE_FACTORS[char.type || "male"] ?? 1;
                const s = char.scale ?? 1;
                const isSel = char.id === data.selectedCharacterId;
                let group = groups.characterGroups[char.id];
                if (group) {
                    group.scale.setScalar(s * typeScale);
                    group.position.set(char.position.x, char.position.y, char.position.z);
                    group.visible = char.visible !== false;
                    const hasRig = group.children.some((c) => c.userData.isRig);
                    if (directorModel && !hasRig) {
                        // 之前是占位人偶，模型现已加载 → 销毁人偶、重建骨骼模型
                        while (group.children.length) {
                            removeAndDispose(group, group.children[0]);
                        }
                        buildRiggedCharacter(group, directorModel, directorModelScale, char, isSel);
                    } else if (directorModel) {
                        updateRiggedCharacter(group, char, isSel);
                    }
                } else {
                    group = new THREE.Group();
                    group.scale.setScalar(s * typeScale);
                    group.position.set(char.position.x, char.position.y, char.position.z);
                    if (directorModel) {
                        buildRiggedCharacter(group, directorModel, directorModelScale, char, isSel);
                    } else {
                        const bodyMaterial = new THREE.MeshStandardMaterial({ color: new THREE.Color(char.color || "#4f8ef7"), roughness: 0.55, metalness: 0.08 });
                        addMannequin(group, bodyMaterial, bodyMaterial, char.pose || DEFAULT_DIRECTOR_POSE, isSel, char.id);
                    }
                    group.visible = char.visible !== false;
                    groups.characterGroups[char.id] = group;
                }
                contentGroup.add(group);
            });

            // 道具（几何体）
            (data.props || []).forEach((prop) => {
                if (prop.visible === false) return;
                contentGroup.add(createDirectorPropMesh(prop));
            });

            const selectedChar = data.characters.find((c) => c.id === data.selectedCharacterId);
            if (selectedChar && selectedChar.visible !== false && data.selectedObject === "character") {
                const selectedGroup = groups.characterGroups[selectedChar.id];
                if (selectedGroup) {
                    contentGroup.add(new THREE.BoxHelper(selectedGroup, 0x60a5fa));
                    const axes = new THREE.AxesHelper(1.25);
                    axes.position.copy(selectedGroup.position);
                    contentGroup.add(axes);
                }
            }

            const focusChar = data.characters.find((c) => c.id === data.selectedCharacterId) || data.characters[0];
            const shotPosition = data.activeShot.position || { x: 0, y: 2.2, z: 10 };
            const shotTarget = data.activeShot.targetMode === "character" ? { x: focusChar?.position.x || 0, y: (focusChar?.position.y || 0) + 1.2, z: focusChar?.position.z || 0 } : data.activeShot.target || { x: 0, y: 1.2, z: 0 };
            const shotCamera = new THREE.PerspectiveCamera(data.activeShot.fov || 50, 16 / 9, 0.1, 28);
            shotCamera.position.set(shotPosition.x, shotPosition.y, shotPosition.z);
            shotCamera.lookAt(shotTarget.x, shotTarget.y, shotTarget.z);
            shotCamera.updateProjectionMatrix();
            groups.shotCamera = shotCamera;
            contentGroup.add(shotCamera);

            if (data.activeShot.visible !== false) {
                const helper = new THREE.CameraHelper(shotCamera);
                helper.visible = data.viewMode !== "camera" || data.selectedObject === "camera";
                contentGroup.add(helper);
                const cameraBody = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.22, 0.28), new THREE.MeshStandardMaterial({ color: data.activeShot.locked ? 0xfbbf24 : 0x93c5fd }));
                cameraBody.userData.dragType = "camera";
                cameraBody.position.copy(shotCamera.position);
                contentGroup.add(cameraBody);
            }

            if (data.viewMode === "director") {
                const aspectValue = aspectValueOf();
                const frameDist = 6;
                const frameHeight = 2 * frameDist * Math.tan(THREE.MathUtils.degToRad((data.activeShot.fov || 50) / 2));
                const frameWidth = frameHeight * aspectValue;
                const pts = [
                    new THREE.Vector3(-frameWidth / 2, -frameHeight / 2, 0),
                    new THREE.Vector3(frameWidth / 2, -frameHeight / 2, 0),
                    new THREE.Vector3(frameWidth / 2, frameHeight / 2, 0),
                    new THREE.Vector3(-frameWidth / 2, frameHeight / 2, 0),
                    new THREE.Vector3(-frameWidth / 2, -frameHeight / 2, 0),
                ];
                const frame = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: 0x67e8f9, transparent: true, opacity: 0.55 }));
                frame.position.set(shotTarget.x, shotTarget.y, shotTarget.z);
                frame.lookAt(shotCamera.position);
                contentGroup.add(frame);
            }

            orbit.enabled = data.viewMode === "director" && !drag.type;
            // 仅在"聚焦角色切换"时才移动 orbit 焦点；改姿势/位置/缩放等不移动相机，避免画面乱跑
            if (data.viewMode === "director") {
                const focusChar = data.characters.find((c) => c.id === data.selectedCharacterId) || data.characters[0];
                const focusId = focusChar?.id ?? null;
                if (focusId !== lastFocusId) {
                    lastFocusId = focusId;
                    const targetPos = focusChar ? new THREE.Vector3(focusChar.position.x, (focusChar.position.y || 0) + 1.05, focusChar.position.z) : new THREE.Vector3(0, 1.05, 0);
                    orbit.target.copy(targetPos);
                    orbit.update();
                    scheduleRender();
                }
            }

            renderNow();
        };

        const resize = () => {
            const rect = mount.getBoundingClientRect();
            const width = Math.max(1, Math.floor(rect.width));
            const height = Math.max(1, Math.floor(rect.height));
            renderer.setSize(width, height);
            directorCamera.aspect = width / height;
            directorCamera.updateProjectionMatrix();
            if (groups.shotCamera) {
                groups.shotCamera.aspect = width / height;
                groups.shotCamera.updateProjectionMatrix();
            }
            renderNow();
        };

        const raycaster = new THREE.Raycaster();
        const pointer = new THREE.Vector2();
        const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -propsRef.current.scene.groundHeight);
        const groundPoint = new THREE.Vector3();
        const drag = { type: null as null | "character" | "camera" | "pose" | "prop", poseKey: "", characterId: "", startX: 0, startY: 0, characterOffset: new THREE.Vector3(), cameraOffset: new THREE.Vector3(), poseStart: 0 };

        const updatePointer = (event: PointerEvent) => {
            const rect = renderer.domElement.getBoundingClientRect();
            pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
            pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
            const cam = renderCamera();
            if (cam) raycaster.setFromCamera(pointer, cam);
        };
        const intersectGround = (event: PointerEvent) => {
            groundPlane.constant = -propsRef.current.scene.groundHeight;
            updatePointer(event);
            return raycaster.ray.intersectPlane(groundPlane, groundPoint);
        };
        const interactiveObjects = () => {
            const objects: THREE.Object3D[] = [];
            contentGroup.traverse((o) => {
                const ud = (o as THREE.Object3D).userData;
                if (ud && ud.dragType) objects.push(o);
            });
            return objects;
        };
        const onPointerDown = (event: PointerEvent) => {
            updatePointer(event);
            const hit = raycaster.intersectObjects(interactiveObjects(), false)[0];
            if (!hit) return;
            event.preventDefault();
            orbit.enabled = false;
            renderer.domElement.setPointerCapture(event.pointerId);
            const ud = hit.object.userData;
            drag.type = ud.dragType;
            drag.poseKey = ud.poseKey || "";
            drag.characterId = ud.characterId || "";
            drag.startX = event.clientX;
            drag.startY = event.clientY;
            const data = propsRef.current;
            if (drag.type === "character" && drag.characterId) {
                data.onSelectObject("character");
                data.onSelectCharacterId?.(drag.characterId);
                const grp = groups.characterGroups[drag.characterId];
                const charData = data.characters.find((c) => c.id === drag.characterId);
                if (!grp || !charData) return;
                if (charData.locked || !intersectGround(event)) return;
                drag.characterOffset.copy(grp.position).sub(groundPoint);
                renderer.domElement.style.cursor = "grabbing";
            }
            if (drag.type === "camera") {
                data.onSelectObject("camera");
                if (data.activeShot.locked || !intersectGround(event)) return;
                drag.cameraOffset.copy(groups.shotCamera!.position).sub(groundPoint);
                renderer.domElement.style.cursor = "grabbing";
            }
            if (drag.type === "prop" && ud.propId) {
                data.onSelectPropId?.(ud.propId);
                data.onSelectObject("prop");
                drag.characterId = ud.propId;
                if (!intersectGround(event)) return;
                const propMesh = contentGroup.children.find((c) => (c as THREE.Mesh).userData?.propId === ud.propId) as THREE.Mesh | undefined;
                if (propMesh) drag.characterOffset.copy(propMesh.position).sub(groundPoint);
                renderer.domElement.style.cursor = "grabbing";
            }
            if (drag.type === "pose" && drag.poseKey && drag.characterId) {
                data.onSelectObject("character");
                data.onSelectCharacterId?.(drag.characterId);
                const charData = data.characters.find((c) => c.id === drag.characterId);
                const p = charData?.pose || DEFAULT_DIRECTOR_POSE;
                drag.poseStart = (p as Record<string, number>)[drag.poseKey] || 0;
                renderer.domElement.style.cursor = "ns-resize";
            }
        };
        // rAF 节流：拖拽时 onPointerMove 高频触发 onChange→setNodes，可能导致 React Flow StoreUpdater
        // "Maximum update depth exceeded" 循环。用 rAF 每帧最多 flush 一次 onChange。
        let pendingChange: PendingDirectorStageChange | null = null;
        let changeRafId = 0;
        const flushScheduledChange = (change: PendingDirectorStageChange) => {
            const latest = propsRef.current;
            if (change.type === "character") latest.onCharacterChange(change.id, change.patch);
            if (change.type === "prop") latest.onPropChange?.(change.id, change.patch);
            if (change.type === "camera") latest.onActiveShotChange(change.patch);
        };
        const scheduleChange = (change: PendingDirectorStageChange) => {
            pendingChange = change;
            if (!changeRafId) {
                changeRafId = requestAnimationFrame(() => {
                    changeRafId = 0;
                    const nextChange = pendingChange;
                    pendingChange = null;
                    if (nextChange) flushScheduledChange(nextChange);
                });
            }
        };
        const onPointerMove = (event: PointerEvent) => {
            const data = propsRef.current;
            if (!drag.type) {
                updatePointer(event);
                const hit = raycaster.intersectObjects(interactiveObjects(), false)[0];
                renderer.domElement.style.cursor = hit ? (hit.object.userData.dragType === "pose" ? "ns-resize" : "grab") : "default";
                return;
            }
            if (drag.type === "character" && drag.characterId) {
                const charData = data.characters.find((c) => c.id === drag.characterId);
                if (!charData?.locked && intersectGround(event)) {
                    scheduleChange({ type: "character", id: drag.characterId, patch: { position: roundVector3(groundPoint.clone().add(drag.characterOffset)) } });
                }
            }
            if (drag.type === "prop" && drag.characterId) {
                if (intersectGround(event)) {
                    scheduleChange({ type: "prop", id: drag.characterId, patch: { position: roundVector3(groundPoint.clone().add(drag.characterOffset)) } });
                }
            }
            if (drag.type === "camera" && !data.activeShot.locked && intersectGround(event)) {
                const next = groundPoint.clone().add(drag.cameraOffset);
                scheduleChange({ type: "camera", patch: { position: roundVector3(new THREE.Vector3(next.x, Math.max(0.4, next.y || 0), next.z)) } });
            }
            if (drag.type === "pose" && drag.poseKey && drag.characterId) {
                const charData = data.characters.find((c) => c.id === drag.characterId);
                const p = charData?.pose || DEFAULT_DIRECTOR_POSE;
                const delta = (event.clientX - drag.startX) * 0.35 + (drag.startY - event.clientY) * 0.7;
                const key = drag.poseKey as keyof typeof DEFAULT_DIRECTOR_POSE;
                scheduleChange({ type: "character", id: drag.characterId, patch: { pose: { ...p, [key]: clampNumber((p[key] as number) + delta, -90, 90) } } });
            }
        };
        const onPointerUp = (event: PointerEvent) => {
            if (renderer.domElement.hasPointerCapture(event.pointerId)) renderer.domElement.releasePointerCapture(event.pointerId);
            drag.type = null;
            renderer.domElement.style.cursor = "default";
            if (propsRef.current.viewMode === "director") orbit.enabled = true;
        };

        const observer = new ResizeObserver(resize);
        observer.observe(mount);
        renderer.domElement.addEventListener("pointerdown", onPointerDown);
        renderer.domElement.addEventListener("pointermove", onPointerMove);
        renderer.domElement.addEventListener("pointerup", onPointerUp);
        renderer.domElement.addEventListener("pointercancel", onPointerUp);

        rebuildRef.current = rebuildScene;
        rebuildScene();
        resize();

        // 异步加载骨骼角色模型：就绪后重建场景（用真骨骼替换占位人偶）并刷新画面
        directorModelLoader
            .load()
            .then((asset) => {
                if (disposed) return;
                directorModel = asset.gltf;
                directorModelScale = asset.scale;
                rebuildRef.current?.();
                scheduleRender();
            })
            .catch((err) => {
                console.error("[DirectorThreeStage] 骨骼模型加载失败，回退到占位人偶：", err);
            });

        return () => {
            disposed = true;
            cancelAnimationFrame(rafId);
            if (changeRafId) cancelAnimationFrame(changeRafId);
            disposePanoramaTexture();
            orbit.dispose();
            observer.disconnect();
            renderer.domElement.removeEventListener("pointerdown", onPointerDown);
            renderer.domElement.removeEventListener("pointermove", onPointerMove);
            renderer.domElement.removeEventListener("pointerup", onPointerUp);
            renderer.domElement.removeEventListener("pointercancel", onPointerUp);
            renderer.dispose();
            disposeObject3D(threeScene);
            renderer.domElement.remove();
        };
    }, []);

    useEffect(() => {
        rebuildRef.current?.();
    }, [scene, characters, selectedCharacterId, activeShot, viewMode, selectedObject, props, selectedPropId]);

    useEffect(() => {
        const orbit = orbitRef.current;
        if (!orbit) return;
        orbit.object.position.set(6, 5.2, 8.5);
        orbit.target.set(0, 1.05, 0);
        orbit.update();
        scheduleRenderRef.current?.();
    }, [resetSignal]);

    return <div ref={mountRef} className="absolute inset-0" />;
}
function addMannequin(group: THREE.Group, bodyMaterial: THREE.Material, jointMaterial: THREE.Material, pose: DirectorCharacterData["pose"], selected: boolean, characterId: string) {
    const safePose: DirectorPoseData = { ...DEFAULT_DIRECTOR_POSE, ...(pose || {}) };
    const markCharacter = (mesh: THREE.Mesh) => {
        mesh.userData.dragType = "character";
        mesh.userData.characterId = characterId;
        return mesh;
    };
    const addSphere = (name: string, radius: number, position: [number, number, number], material = bodyMaterial) => {
        const mesh = markCharacter(new THREE.Mesh(new THREE.SphereGeometry(radius, 24, 16), material));
        mesh.name = name;
        mesh.position.set(...position);
        group.add(mesh);
        return mesh;
    };
    const addCapsule = (name: string, radius: number, length: number, position: [number, number, number], rotation: [number, number, number] = [0, 0, 0]) => {
        const mesh = markCharacter(new THREE.Mesh(new THREE.CapsuleGeometry(radius, length, 10, 18), bodyMaterial));
        mesh.name = name;
        mesh.position.set(...position);
        mesh.rotation.set(...rotation);
        group.add(mesh);
        return mesh;
    };
    const addLimb = (name: string, poseKey: keyof DirectorPoseData, pivot: [number, number, number], radius: number, length: number, localPosition: [number, number, number], baseRotation: [number, number, number]) => {
        const limbGroup = new THREE.Group();
        limbGroup.position.set(...pivot);
        limbGroup.rotation.z = THREE.MathUtils.degToRad(safePose[poseKey]);
        group.add(limbGroup);
        const mesh = markCharacter(new THREE.Mesh(new THREE.CapsuleGeometry(radius, length, 10, 18), bodyMaterial));
        mesh.name = name;
        mesh.position.set(...localPosition);
        mesh.rotation.set(...baseRotation);
        limbGroup.add(mesh);
        if (selected) {
            const handle = new THREE.Mesh(new THREE.SphereGeometry(radius * 1.45, 16, 12), new THREE.MeshBasicMaterial({ color: 0x22d3ee }));
            handle.name = `${name}-pose-handle`;
            handle.position.set(localPosition[0], localPosition[1] - length / 2 - radius * 2, localPosition[2]);
            handle.userData.dragType = "pose";
            handle.userData.poseKey = poseKey;
            handle.userData.characterId = characterId;
            limbGroup.add(handle);
        }
    };
    const head = addSphere("head", 0.28, [0, 1.92, 0], jointMaterial);
    head.rotation.set(THREE.MathUtils.degToRad(safePose.headPitch), THREE.MathUtils.degToRad(safePose.headYaw), 0);
    if (selected) {
        const headHandle = new THREE.Mesh(new THREE.SphereGeometry(0.08, 16, 12), new THREE.MeshBasicMaterial({ color: 0x22d3ee }));
        headHandle.position.set(0.34, 1.98, 0);
        headHandle.userData.dragType = "pose";
        headHandle.userData.poseKey = "headYaw";
        headHandle.userData.characterId = characterId;
        group.add(headHandle);
    }
    const torso = addCapsule("torso", 0.28, 0.7, [0, 1.25, 0]);
    torso.rotation.y = THREE.MathUtils.degToRad(safePose.torsoTwist);
    addLimb("left-arm", "leftArm", [-0.32, 1.58, 0], 0.08, 0.58, [-0.06, -0.34, 0], [0, 0, -0.12]);
    addLimb("right-arm", "rightArm", [0.32, 1.58, 0], 0.08, 0.58, [0.06, -0.34, 0], [0, 0, 0.12]);
    addLimb("left-leg", "leftLeg", [-0.14, 0.78, 0], 0.1, 0.72, [0, -0.42, 0], [0.08, 0, 0.02]);
    addLimb("right-leg", "rightLeg", [0.14, 0.78, 0], 0.1, 0.72, [0, -0.42, 0], [0.08, 0, -0.02]);
    addSphere("hip", 0.25, [0, 0.82, 0], jointMaterial);
}

// 将导演台姿势参数映射到真实骨骼（Xbot 为 Mixamo 骨骼命名，注意带冒号）
function applyDirectorPose(root: THREE.Object3D, pose: DirectorCharacterData["pose"], boneIndex?: DirectorBoneIndex) {
    const safePose: DirectorPoseData = { ...DEFAULT_DIRECTOR_POSE, ...(pose || {}) };
    const deg = THREE.MathUtils.degToRad;
    const index = boneIndex || buildDirectorBoneIndex(root);
    // 头部：Pitch(X) Yaw(Y) Roll(Z)
    const head = findDirectorBone(index, ["mixamorigHead", "Head"]);
    if (head) head.rotation.set(deg(safePose.headPitch), deg(safePose.headYaw), deg(safePose.headRoll));
    const neck = findDirectorBone(index, ["mixamorigNeck", "Neck"]);
    if (neck && !head) neck.rotation.set(deg(safePose.headPitch), deg(safePose.headYaw), deg(safePose.headRoll));
    // 躯干：Lean(X) Twist(Y) Bend(Z)
    const spine = findDirectorBone(index, ["mixamorigSpine", "mixamorigSpine1", "mixamorigSpine2", "Spine"]);
    if (spine) spine.rotation.set(deg(safePose.torsoLean), deg(safePose.torsoTwist), deg(safePose.torsoBend));
    // 手臂：base ±90° 从 T-pose 落到体侧，Arm 控制外展，ArmFwd 控制前举
    const lArm = findDirectorBone(index, ["mixamorigLeftArm", "mixamorigLeftShoulder", "LeftArm"]);
    if (lArm) lArm.rotation.set(deg(safePose.leftArmFwd), 0, deg(-90) + deg(safePose.leftArm));
    const rArm = findDirectorBone(index, ["mixamorigRightArm", "mixamorigRightShoulder", "RightArm"]);
    if (rArm) rArm.rotation.set(deg(safePose.rightArmFwd), 0, deg(90) - deg(safePose.rightArm));
    // 肘部
    const lFore = findDirectorBone(index, ["mixamorigLeftForeArm", "LeftForeArm"]);
    if (lFore) lFore.rotation.z = deg(safePose.leftElbow);
    const rFore = findDirectorBone(index, ["mixamorigRightForeArm", "RightForeArm"]);
    if (rFore) rFore.rotation.z = -deg(safePose.rightElbow);
    // 髋部：Leg 控制前抬/后伸(X)，HipSpread 控制外展(Z)
    const lUpLeg = findDirectorBone(index, ["mixamorigLeftUpLeg", "LeftUpLeg"]);
    if (lUpLeg) lUpLeg.rotation.set(deg(safePose.leftLeg), 0, deg(safePose.leftHipSpread));
    const rUpLeg = findDirectorBone(index, ["mixamorigRightUpLeg", "RightUpLeg"]);
    if (rUpLeg) rUpLeg.rotation.set(deg(safePose.rightLeg), 0, deg(safePose.rightHipSpread));
    // 膝部
    const lKnee = findDirectorBone(index, ["mixamorigLeftLeg", "LeftLeg"]);
    if (lKnee) lKnee.rotation.x = deg(safePose.leftKnee);
    const rKnee = findDirectorBone(index, ["mixamorigRightLeg", "RightLeg"]);
    if (rKnee) rKnee.rotation.x = deg(safePose.rightKnee);
}

// 选中角色时，在头部/双手位置放可拖拽姿势手柄（沿用现有 pose 拖拽逻辑）
function addDirectorPoseHandles(group: THREE.Group, char: DirectorCharacterData) {
    const mk = (poseKey: keyof DirectorPoseData, local: [number, number, number]) => {
        const handle = new THREE.Mesh(new THREE.SphereGeometry(0.09, 16, 12), new THREE.MeshBasicMaterial({ color: 0x22d3ee }));
        handle.position.set(...local);
        handle.userData.dragType = "pose";
        handle.userData.poseKey = poseKey;
        handle.userData.characterId = char.id;
        group.add(handle);
    };
    mk("headYaw", [0, 1.78, 0.18]);
    mk("leftArm", [-0.42, 1.02, 0]);
    mk("rightArm", [0.42, 1.02, 0]);
}

// 用真实骨骼模型构建导演台角色：每个角色独立克隆骨骼（必须用 SkeletonUtils.clone），按颜色着色，按姿势驱动骨骼
function buildRiggedCharacter(group: THREE.Group, model: GLTF, modelScale: number, char: DirectorCharacterData, selected: boolean) {
    const clone = cloneSkeleton(model.scene) as THREE.Object3D;
    const targetColor = new THREE.Color(char.color || "#4f8ef7");
    clone.traverse((o) => {
        const m = o as THREE.Mesh;
        // SkinnedMesh 也是 Mesh，isMesh 为 true；但需单独处理材质数组
        if (m.isMesh && m.material) {
            m.frustumCulled = false; // 缩放后 bounding box 过期，强制不裁切（否则模型消失）
            const mats = Array.isArray(m.material) ? (m.material as THREE.Material[]).map((x) => x.clone()) : [(m.material as THREE.Material).clone()];
            mats.forEach((mat) => {
                if ((mat as THREE.MeshStandardMaterial).color !== undefined) {
                    (mat as THREE.MeshStandardMaterial).color = targetColor;
                    if (selected) {
                        (mat as THREE.MeshStandardMaterial).emissive = targetColor;
                        (mat as THREE.MeshStandardMaterial).emissiveIntensity = 0.2;
                    }
                }
            });
            m.material = Array.isArray(m.material) ? mats : mats[0];
            m.castShadow = false;
            m.receiveShadow = false;
            m.userData.dragType = "character";
            m.userData.characterId = char.id;
        }
    });
    clone.rotation.y = THREE.MathUtils.degToRad(char.rotation || 0);
    clone.scale.setScalar(modelScale);
    clone.userData.isRig = true;
    const boneIndex = buildDirectorBoneIndex(clone);
    clone.userData.boneIndex = boneIndex;
    group.add(clone);
    applyDirectorPose(clone, char.pose || DEFAULT_DIRECTOR_POSE, boneIndex);
    const proxy = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 1.8, 8), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }));
    proxy.position.set(0, 0.9, 0);
    proxy.userData.dragType = "character";
    proxy.userData.characterId = char.id;
    group.add(proxy);
    if (selected) addDirectorPoseHandles(group, char);
}

function updateRiggedCharacter(group: THREE.Group, char: DirectorCharacterData, selected: boolean) {
    const rig = group.children.find((c) => c.userData.isRig);
    if (rig) {
        rig.rotation.y = THREE.MathUtils.degToRad(char.rotation || 0);
        const boneIndex = (rig.userData.boneIndex as DirectorBoneIndex | undefined) || buildDirectorBoneIndex(rig);
        rig.userData.boneIndex = boneIndex;
        applyDirectorPose(rig, char.pose || DEFAULT_DIRECTOR_POSE, boneIndex);
        const targetColor = new THREE.Color(char.color || "#4f8ef7");
        rig.traverse((o) => {
            const m = o as THREE.Mesh;
            if (m.isMesh && m.material) {
                const mats = Array.isArray(m.material) ? m.material : [m.material];
                mats.forEach((mat) => {
                    if ((mat as THREE.MeshStandardMaterial).color !== undefined) {
                        (mat as THREE.MeshStandardMaterial).color = targetColor;
                        if (selected) {
                            (mat as THREE.MeshStandardMaterial).emissive = targetColor;
                            (mat as THREE.MeshStandardMaterial).emissiveIntensity = 0.2;
                        } else {
                            (mat as THREE.MeshStandardMaterial).emissiveIntensity = 0;
                        }
                    }
                });
            }
        });
    }
    for (let i = group.children.length - 1; i >= 0; i--) {
        if (group.children[i].userData.dragType === "pose") removeAndDispose(group, group.children[i]);
    }
    if (selected) addDirectorPoseHandles(group, char);
}

function roundVector3(vector: THREE.Vector3) {
    return { x: roundDirectorNumber(vector.x), y: roundDirectorNumber(vector.y), z: roundDirectorNumber(vector.z) };
}

function roundDirectorNumber(value: number) {
    return Math.round(value * 100) / 100;
}

function clampNumber(value: number, min: number, max: number) {
    return Math.max(min, Math.min(max, Math.round(value * 10) / 10));
}
