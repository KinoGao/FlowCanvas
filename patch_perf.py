path = r"E:\dev_canavs_react\FlowCanvas\web\src\app\(user)\canvas\[id]\canvas-client-page.tsx"
with open(path, "r", encoding="utf-8") as f:
    s = f.read()

repls = []

# 1) buildRiggedCharacter: 加 isRig 标记 + 代理碰撞体；后面加 updateRiggedCharacter
old1 = (
    "    clone.rotation.y = THREE.MathUtils.degToRad(char.rotation || 0);\n"
    "    clone.scale.setScalar(cachedDirectorModelScale);\n"
    "    group.add(clone);\n"
    "    applyDirectorPose(clone, char.pose || DEFAULT_DIRECTOR_POSE);\n"
    "    if (selected) addDirectorPoseHandles(group, char);\n"
    "}"
)
new1 = (
    "    clone.rotation.y = THREE.MathUtils.degToRad(char.rotation || 0);\n"
    "    clone.scale.setScalar(cachedDirectorModelScale);\n"
    "    clone.userData.isRig = true;\n"
    "    group.add(clone);\n"
    "    applyDirectorPose(clone, char.pose || DEFAULT_DIRECTOR_POSE);\n"
    "    // \u4e0d\u53ef\u89c1\u4ee3\u7406\u78b0\u649e\u4f53\uff1aSkinnedMesh \u5c04\u7ebf\u68c0\u6d4b\u57fa\u4e8e T-pose \u51e0\u4f55\u4f53\uff0c\u6446\u59ff\u540e\u70b9\u4e0d\u4e2d\uff1b\u7528\u900f\u660e\u5706\u67f1\u8986\u76d6\u89d2\u8272\u4f53\u79ef\u4fdd\u8bc1\u62d6\u62fd\u53ef\u9760\n"
    "    const proxy = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 1.8, 8), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }));\n"
    "    proxy.position.set(0, 0.9, 0);\n"
    "    proxy.userData.dragType = \"character\";\n"
    "    proxy.userData.characterId = char.id;\n"
    "    group.add(proxy);\n"
    "    if (selected) addDirectorPoseHandles(group, char);\n"
    "}\n"
    "\n"
    "// \u590d\u7528\u5df2\u6709\u514b\u9686\uff1a\u53ea\u66f4\u65b0 pose/\u4f4d\u7f6e/\u989c\u8272/\u624b\u67c4\uff0c\u4e0d\u91cd\u65b0 SkeletonUtils.clone\uff08\u5927\u5e45\u51cf\u5c11\u5361\u987f\uff09\n"
    "function updateRiggedCharacter(group: THREE.Group, char: DirectorCharacterData, selected: boolean) {\n"
    "    const rig = group.children.find((c) => c.userData.isRig);\n"
    "    if (rig) {\n"
    "        rig.rotation.y = THREE.MathUtils.degToRad(char.rotation || 0);\n"
    "        applyDirectorPose(rig, char.pose || DEFAULT_DIRECTOR_POSE);\n"
    "        const targetColor = new THREE.Color(char.color || \"#4f8ef7\");\n"
    "        rig.traverse((o) => {\n"
    "            const m = o as THREE.Mesh;\n"
    "            if (m.isMesh && m.material) {\n"
    "                const mats = Array.isArray(m.material) ? m.material : [m.material];\n"
    "                mats.forEach((mat) => {\n"
    "                    if ((mat as THREE.MeshStandardMaterial).color !== undefined) {\n"
    "                        (mat as THREE.MeshStandardMaterial).color = targetColor;\n"
    "                        if (selected) { (mat as THREE.MeshStandardMaterial).emissive = targetColor; (mat as THREE.MeshStandardMaterial).emissiveIntensity = 0.2; }\n"
    "                        else { (mat as THREE.MeshStandardMaterial).emissiveIntensity = 0; }\n"
    "                    }\n"
    "                });\n"
    "            }\n"
    "        });\n"
    "    }\n"
    "    for (let i = group.children.length - 1; i >= 0; i--) {\n"
    "        if (group.children[i].userData.dragType === \"pose\") group.remove(group.children[i]);\n"
    "    }\n"
    "    if (selected) addDirectorPoseHandles(group, char);\n"
    "}"
)
assert s.count(old1) == 1, f"old1={s.count(old1)}"
repls.append((old1, new1))

# 2) 清理阶段：先摘出角色组（不销毁），再清理其余
old2 = (
    "            while (contentGroup.children.length) {\n"
    "                const child = contentGroup.children[0];\n"
    "                contentGroup.remove(child);\n"
    "                child.traverse((o: THREE.Object3D) => {\n"
    "                    const geom = (o as THREE.Mesh).geometry;\n"
    "                    if (geom) geom.dispose();\n"
    "                    const mat = (o as THREE.Mesh).material;\n"
    "                    if (Array.isArray(mat)) mat.forEach((m) => (m as THREE.Material).dispose());\n"
    "                    else if (mat) (m as THREE.Material).dispose();\n"
    "                });\n"
    "            }\n"
    "            groups.characterGroups = {};\n"
    "            groups.shotCamera = undefined;"
)
new2 = (
    "            // \u5148\u628a\u89d2\u8272\u7ec4\u4ece contentGroup \u6458\u51fa\uff08\u4e0d\u53c2\u4e0e\u9500\u6bc1 \u2192 \u514b\u9686\u590d\u7528\uff0c\u6539\u59ff\u52bf\u4e0d\u5361\u987f\uff09\n"
    "            const presentCharIds = new Set(data.characters.map((c) => c.id));\n"
    "            for (const id of Object.keys(groups.characterGroups)) {\n"
    "                const g = groups.characterGroups[id];\n"
    "                if (g.parent === contentGroup) contentGroup.remove(g);\n"
    "                if (!presentCharIds.has(id)) {\n"
    "                    g.traverse((o) => { const gm = (o as THREE.Mesh).geometry; if (gm) gm.dispose(); const mt = (o as THREE.Mesh).material; if (Array.isArray(mt)) mt.forEach((m) => (m as THREE.Material).dispose()); else if (mt) (mt as THREE.Material).dispose(); });\n"
    "                    delete groups.characterGroups[id];\n"
    "                }\n"
    "            }\n"
    "            while (contentGroup.children.length) {\n"
    "                const child = contentGroup.children[0];\n"
    "                contentGroup.remove(child);\n"
    "                child.traverse((o: THREE.Object3D) => {\n"
    "                    const geom = (o as THREE.Mesh).geometry;\n"
    "                    if (geom) geom.dispose();\n"
    "                    const mat = (o as THREE.Mesh).material;\n"
    "                    if (Array.isArray(mat)) mat.forEach((m) => (m as THREE.Material).dispose());\n"
    "                    else if (mat) (mat as THREE.Material).dispose();\n"
    "                });\n"
    "            }\n"
    "            groups.shotCamera = undefined;"
)
assert s.count(old2) == 1, f"old2={s.count(old2)}"
repls.append((old2, new2))

# 3) 角色循环：复用已有克隆，只对新增角色克隆
old3 = (
    "            data.characters.forEach((char) => {\n"
    "                const group = new THREE.Group();\n"
    "                const typeScale = TYPE_FACTORS[char.type || \"male\"] ?? 1;\n"
    "                const s = char.scale ?? 1;\n"
    "                group.scale.setScalar(s * typeScale);\n"
    "                group.position.set(char.position.x, char.position.y, char.position.z);\n"
    "                const isSel = char.id === data.selectedCharacterId;\n"
    "                if (cachedDirectorModel) {\n"
    "                    buildRiggedCharacter(group, cachedDirectorModel, char, isSel);\n"
    "                } else {\n"
    "                    const bodyMaterial = new THREE.MeshStandardMaterial({ color: new THREE.Color(char.color || \"#4f8ef7\"), roughness: 0.55, metalness: 0.08 });\n"
    "                    addMannequin(group, bodyMaterial, bodyMaterial, char.pose || DEFAULT_DIRECTOR_POSE, isSel, char.id);\n"
    "                }\n"
    "                group.visible = char.visible !== false;\n"
    "                contentGroup.add(group);\n"
    "                groups.characterGroups[char.id] = group;\n"
    "            });"
)
new3 = (
    "            data.characters.forEach((char) => {\n"
    "                const typeScale = TYPE_FACTORS[char.type || \"male\"] ?? 1;\n"
    "                const s = char.scale ?? 1;\n"
    "                const isSel = char.id === data.selectedCharacterId;\n"
    "                let group = groups.characterGroups[char.id];\n"
    "                if (group) {\n"
    "                    // \u590d\u7528\u5df2\u6709\u514b\u9686\uff1a\u53ea\u66f4\u65b0 transform + pose + \u989c\u8272 + \u624b\u67c4\uff08\u4e0d\u91cd\u65b0\u514b\u9686\uff09\n"
    "                    group.scale.setScalar(s * typeScale);\n"
    "                    group.position.set(char.position.x, char.position.y, char.position.z);\n"
    "                    group.visible = char.visible !== false;\n"
    "                    if (cachedDirectorModel) updateRiggedCharacter(group, char, isSel);\n"
    "                } else {\n"
    "                    // \u65b0\u89d2\u8272\uff1a\u514b\u9686 + \u6784\u5efa\n"
    "                    group = new THREE.Group();\n"
    "                    group.scale.setScalar(s * typeScale);\n"
    "                    group.position.set(char.position.x, char.position.y, char.position.z);\n"
    "                    if (cachedDirectorModel) {\n"
    "                        buildRiggedCharacter(group, cachedDirectorModel, char, isSel);\n"
    "                    } else {\n"
    "                        const bodyMaterial = new THREE.MeshStandardMaterial({ color: new THREE.Color(char.color || \"#4f8ef7\"), roughness: 0.55, metalness: 0.08 });\n"
    "                        addMannequin(group, bodyMaterial, bodyMaterial, char.pose || DEFAULT_DIRECTOR_POSE, isSel, char.id);\n"
    "                    }\n"
    "                    group.visible = char.visible !== false;\n"
    "                    groups.characterGroups[char.id] = group;\n"
    "                }\n"
    "                contentGroup.add(group);\n"
    "            });"
)
assert s.count(old3) == 1, f"old3={s.count(old3)}"
repls.append((old3, new3))

for old, new in repls:
    s = s.replace(old, new)

with open(path, "w", encoding="utf-8") as f:
    f.write(s)

print(f"OK: applied {len(repls)} replacements (clone reuse + proxy mesh)")
