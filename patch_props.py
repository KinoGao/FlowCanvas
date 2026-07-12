path = r"E:\dev_canavs_react\FlowCanvas\web\src\app\(user)\canvas\[id]\canvas-client-page.tsx"
with open(path, "r", encoding="utf-8") as f:
    s = f.read()

repls = []

# 1) selectedObject 类型加 "prop"
old1 = 'useState<"scene" | "camera" | "character">("scene")'
new1 = 'useState<"scene" | "camera" | "character" | "prop">("scene")'
assert s.count(old1) == 1, f"old1 count={s.count(old1)}"
repls.append((old1, new1))

# 2) 在 removeCharacter 后加道具状态与辅助函数
old2 = '''    const removeCharacter = (id: string) => {
        const nextCharacters = characters.filter((item) => item.id !== id);
        onChange({ directorCharacters: nextCharacters });
        if (selectedCharacterId === id) setSelectedCharacterId(nextCharacters[0]?.id || "");
    };'''
new2 = '''    const removeCharacter = (id: string) => {
        const nextCharacters = characters.filter((item) => item.id !== id);
        onChange({ directorCharacters: nextCharacters });
        if (selectedCharacterId === id) setSelectedCharacterId(nextCharacters[0]?.id || "");
    };
    const props = node.metadata?.directorPropItems || [];
    const [selectedPropId, setSelectedPropId] = useState<string>("");
    const selectedProp = props.find((item) => item.id === selectedPropId);
    const updateProp = (id: string, patch: Partial<NonNullable<CanvasNodeMetadata["directorPropItems"]>[number]>) => {
        onChange({ directorPropItems: props.map((item) => (item.id === id ? { ...item, ...patch } : item)) });
    };
    const addProp = (shape: "box" | "sphere" | "cylinder" | "cone" | "plane") => {
        const labels: Record<string, string> = { box: "立方体", sphere: "球体", cylinder: "圆柱", cone: "圆锥", plane: "平面" };
        const next = { id: `prop-${Date.now()}`, name: labels[shape], shape, position: { x: 0, y: 0.5, z: 0 }, rotation: 0, scale: 1, color: "#8a8a8a", visible: true };
        onChange({ directorPropItems: [...props, next] });
        setSelectedPropId(next.id);
        setSelectedObject("prop");
    };
    const removeProp = (id: string) => {
        onChange({ directorPropItems: props.filter((item) => item.id !== id) });
        if (selectedPropId === id) setSelectedPropId("");
    };
    const selectProp = (id: string) => {
        setSelectedPropId(id);
        setSelectedObject("prop");
    };'''
assert s.count(old2) == 1, f"old2 count={s.count(old2)}"
repls.append((old2, new2))

# 3) 左侧栏：添加角色按钮后加道具区
old3 = '''                        <button type="button" className="flex h-8 w-full items-center gap-1 rounded-md px-2 text-sm text-white/55 transition hover:bg-white/8 hover:text-white" onClick={addCharacter}>
                            <span className="grid size-3.5 place-items-center text-[14px] leading-none">+</span>
                            <span>添加角色</span>
                        </button>
                    </div>
                </aside>'''
new3 = '''                        <button type="button" className="flex h-8 w-full items-center gap-1 rounded-md px-2 text-sm text-white/55 transition hover:bg-white/8 hover:text-white" onClick={addCharacter}>
                            <span className="grid size-3.5 place-items-center text-[14px] leading-none">+</span>
                            <span>添加角色</span>
                        </button>
                        <div className="mt-2 text-[11px] uppercase tracking-wide text-white/35">道具</div>
                        {props.map((prop) => (
                            <div key={prop.id} className={`flex h-8 items-center gap-1 rounded-md px-2 text-sm ${selectedPropId === prop.id && selectedObject === "prop" ? "bg-white/12" : "text-white/72 hover:bg-white/8"}`}>
                                <span className="size-3 shrink-0 rounded" style={{ background: prop.color }} />
                                <button type="button" className="flex min-w-0 flex-1 text-left" onClick={() => selectProp(prop.id)}>
                                    <span className="truncate">{prop.name}</span>
                                </button>
                                <button type="button" className="grid size-5 place-items-center rounded text-[11px] text-white/50 hover:bg-white/10 hover:text-white" title="删除" onClick={() => removeProp(prop.id)}>×</button>
                            </div>
                        ))}
                        <div className="flex flex-wrap gap-1">
                            {[["box", "立方体"], ["sphere", "球体"], ["cylinder", "圆柱"], ["cone", "圆锥"], ["plane", "平面"]].map(([shape, label]) => (
                                <button key={shape} type="button" className="rounded bg-white/8 px-2 py-1 text-[11px] text-white/60 transition hover:bg-white/15" onClick={() => addProp(shape as "box" | "sphere" | "cylinder" | "cone" | "plane")}>{label}</button>
                            ))}
                        </div>
                    </div>
                </aside>'''
assert s.count(old3) == 1, f"old3 count={s.count(old3)}"
repls.append((old3, new3))

# 4) DirectorThreeStage 传 props
old4 = '''                        scene={sceneSettings}
                        characters={characters}
                        selectedCharacterId={selectedCharacterId}
                        onCharacterChange={updateCharacter}
                        onSelectCharacterId={selectCharacter}
                        activeShot={activeShot}
                        selectedObject={selectedObject}
                        viewMode={viewMode}
                        onSelectObject={setSelectedObject}
                        onActiveShotChange={updateActiveShot}
                    />'''
new4 = '''                        scene={sceneSettings}
                        characters={characters}
                        selectedCharacterId={selectedCharacterId}
                        onCharacterChange={updateCharacter}
                        onSelectCharacterId={selectCharacter}
                        activeShot={activeShot}
                        selectedObject={selectedObject}
                        viewMode={viewMode}
                        onSelectObject={setSelectedObject}
                        onActiveShotChange={updateActiveShot}
                        props={props}
                        selectedPropId={selectedPropId}
                        onPropChange={updateProp}
                        onSelectPropId={selectProp}
                    />'''
assert s.count(old4) == 1, f"old4 count={s.count(old4)}"
repls.append((old4, new4))

# 5) DirectorThreeStage 签名加 props
old5 = '''    resetSignal,
}: {
    scene: NonNullable<CanvasNodeMetadata["directorSceneSettings"]>;
    characters: DirectorCharacterData[];
    selectedCharacterId: string;
    onCharacterChange: (id: string, patch: Partial<DirectorCharacterData>) => void;
    onSelectCharacterId?: (id: string) => void;
    activeShot: NonNullable<CanvasNodeMetadata["directorShots"]>[number];
    selectedObject: "scene" | "camera" | "character";
    viewMode: "director" | "camera";
    onSelectObject: (object: "scene" | "camera" | "character") => void;
    onActiveShotChange: (patch: Partial<NonNullable<CanvasNodeMetadata["directorShots"]>[number]>) => void;
    resetSignal?: number;
}) {'''
new5 = '''    resetSignal,
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
}) {'''
assert s.count(old5) == 1, f"old5 count={s.count(old5)}"
repls.append((old5, new5))

# 6) propsRef 加 props/selectedPropId/onPropChange/onSelectPropId
old6 = '    const propsRef = useRef({ scene, characters, selectedCharacterId, onCharacterChange, onSelectCharacterId, activeShot, selectedObject, viewMode, onSelectObject, onActiveShotChange });\n    propsRef.current = { scene, characters, selectedCharacterId, onCharacterChange, onSelectCharacterId, activeShot, selectedObject, viewMode, onSelectObject, onActiveShotChange };'
new6 = '    const propsRef = useRef({ scene, characters, selectedCharacterId, onCharacterChange, onSelectCharacterId, activeShot, selectedObject, viewMode, onSelectObject, onActiveShotChange, props, selectedPropId, onPropChange, onSelectPropId });\n    propsRef.current = { scene, characters, selectedCharacterId, onCharacterChange, onSelectCharacterId, activeShot, selectedObject, viewMode, onSelectObject, onActiveShotChange, props, selectedPropId, onPropChange, onSelectPropId };'
assert s.count(old6) == 1, f"old6 count={s.count(old6)}"
repls.append((old6, new6))

# 7) rebuildScene: 在角色循环后加道具渲染
old7 = '''            });

            const selectedChar = data.characters.find((c) => c.id === data.selectedCharacterId);'''
new7 = '''            });

            // 道具（几何体）
            (data.props || []).forEach((prop) => {
                if (prop.visible === false) return;
                const geoms: Record<string, THREE.BufferGeometry> = {
                    box: new THREE.BoxGeometry(1, 1, 1),
                    sphere: new THREE.SphereGeometry(0.5, 24, 16),
                    cylinder: new THREE.CylinderGeometry(0.5, 0.5, 1, 24),
                    cone: new THREE.ConeGeometry(0.5, 1, 24),
                    plane: new THREE.PlaneGeometry(2, 2),
                };
                const mesh = new THREE.Mesh(geoms[prop.shape] || geoms.box, new THREE.MeshStandardMaterial({ color: new THREE.Color(prop.color || "#8a8a8a"), roughness: 0.6, metalness: 0.1 }));
                mesh.position.set(prop.position.x, prop.position.y, prop.position.z);
                mesh.rotation.y = THREE.MathUtils.degToRad(prop.rotation || 0);
                mesh.scale.setScalar(prop.scale ?? 1);
                mesh.userData.dragType = "prop";
                mesh.userData.propId = prop.id;
                contentGroup.add(mesh);
            });

            const selectedChar = data.characters.find((c) => c.id === data.selectedCharacterId);'''
assert s.count(old7) == 1, f"old7 count={s.count(old7)}"
repls.append((old7, new7))

# 8) drag 类型加 "prop"
old8 = 'const drag = { type: null as null | "character" | "camera" | "pose",'
new8 = 'const drag = { type: null as null | "character" | "camera" | "pose" | "prop",'
assert s.count(old8) == 1, f"old8 count={s.count(old8)}"
repls.append((old8, new8))

# 9) onPointerDown: 加 prop 选中与拖拽
old9 = '''            if (drag.type === "pose" && drag.poseKey && drag.characterId) {'''
new9 = '''            if (drag.type === "prop" && ud.propId) {
                data.onSelectPropId?.(ud.propId);
                data.onSelectObject("prop");
                if (!intersectGround(event)) return;
                const propMesh = contentGroup.children.find((c) => (c as THREE.Mesh).userData?.propId === ud.propId) as THREE.Mesh | undefined;
                if (propMesh) drag.characterOffset.copy(propMesh.position).sub(groundPoint);
                renderer.domElement.style.cursor = "grabbing";
            }
            if (drag.type === "pose" && drag.poseKey && drag.characterId) {'''
assert s.count(old9) == 1, f"old9 count={s.count(old9)}"
repls.append((old9, new9))

# 10) onPointerMove: 加 prop 拖拽更新位置
old10 = '''            if (drag.type === "pose" && drag.poseKey && drag.characterId) {'''
new10 = '''            if (drag.type === "prop" && ud_propId) {
                if (intersectGround(event)) {
                    data.onPropChange?.(ud_propId, { position: roundVector3(groundPoint.clone().add(drag.characterOffset)) });
                }
            }
            if (drag.type === "pose" && drag.poseKey && drag.characterId) {'''
# Wait, ud_propId isn't defined in onPointerMove scope. Let me use drag data instead.
# Actually, in onPointerMove, we have drag.characterId for characters. For props, I need to store propId in drag.
# Let me revise: store propId in drag in onPointerDown, then use it in onPointerMove.

# Revise #9 to store propId in drag
new9v2 = '''            if (drag.type === "prop" && ud.propId) {
                data.onSelectPropId?.(ud.propId);
                data.onSelectObject("prop");
                drag.characterId = ud.propId;
                if (!intersectGround(event)) return;
                const propMesh = contentGroup.children.find((c) => (c as THREE.Mesh).userData?.propId === ud.propId) as THREE.Mesh | undefined;
                if (propMesh) drag.characterOffset.copy(propMesh.position).sub(groundPoint);
                renderer.domElement.style.cursor = "grabbing";
            }
            if (drag.type === "pose" && drag.poseKey && drag.characterId) {'''
repls[-1] = (old9, new9v2)  # replace last replacement

# Revise #10 to use drag.characterId (reused as propId for props)
new10v2 = '''            if (drag.type === "prop" && drag.characterId) {
                if (intersectGround(event)) {
                    data.onPropChange?.(drag.characterId, { position: roundVector3(groundPoint.clone().add(drag.characterOffset)) });
                }
            }
            if (drag.type === "pose" && drag.poseKey && drag.characterId) {'''
repls.append((old10, new10v2))

# 11) 右侧面板加 prop 编辑器
old11 = '''                        ) : selectedObject === "character" ? ('''
new11 = '''                        ) : selectedObject === "prop" ? (
                            selectedProp ? (
                                <div className="space-y-4 p-4">
                                    <DirectorInput label="名称" value={selectedProp.name} placeholder="道具名称" onChange={(name) => updateProp(selectedProp.id, { name })} style={fieldStyle} />
                                    <DirectorPanelBlock title="位置">
                                        <DirectorVectorEditor value={selectedProp.position} onChange={(position) => updateProp(selectedProp.id, { position })} />
                                    </DirectorPanelBlock>
                                    <DirectorPanelBlock title="形状">
                                        <select value={selectedProp.shape} onChange={(event) => updateProp(selectedProp.id, { shape: event.target.value as "box" | "sphere" | "cylinder" | "cone" | "plane" })} className="w-full rounded bg-white/10 px-3 py-2 text-sm text-white/80 outline-none">
                                            {(["box", "sphere", "cylinder", "cone", "plane"] as const).map((sh) => (
                                                <option key={sh} value={sh}>{{ box: "立方体", sphere: "球体", cylinder: "圆柱", cone: "圆锥", plane: "平面" }[sh]}</option>
                                            ))}
                                        </select>
                                    </DirectorPanelBlock>
                                    <div className="flex items-center gap-3">
                                        <input type="color" value={selectedProp.color} className="size-7 border-0 bg-transparent p-0" onChange={(event) => updateProp(selectedProp.id, { color: event.target.value })} />
                                        <DirectorRange label="缩放" value={selectedProp.scale} min={0.2} max={5} step={0.1} digits={1} onChange={(scale) => updateProp(selectedProp.id, { scale })} />
                                    </div>
                                    <DirectorRange label="旋转" value={selectedProp.rotation} min={-180} max={180} digits={0} onChange={(rotation) => updateProp(selectedProp.id, { rotation })} />
                                    <DirectorSwitchRow label="显示" checked={selectedProp.visible} onChange={(visible) => updateProp(selectedProp.id, { visible })} />
                                </div>
                            ) : (
                                <div className="p-5 text-sm text-white/50">先添加道具，再编辑其属性</div>
                            )
                        ) : selectedObject === "character" ? ('''
assert s.count(old11) == 1, f"old11 count={s.count(old11)}"
repls.append((old11, new11))

for old, new in repls:
    s = s.replace(old, new)

with open(path, "w", encoding="utf-8") as f:
    f.write(s)

print(f"OK: 道具系统已实现（{len(repls)} 处修改）")
