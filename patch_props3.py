import sys
path = r"E:\dev_canavs_react\FlowCanvas\web\src\app\(user)\canvas\[id]\canvas-client-page.tsx"
with open(path, "r", encoding="utf-8") as f:
    s = f.read()

repls = []

old1 = 'useState<"scene" | "camera" | "character">("scene")'
new1 = 'useState<"scene" | "camera" | "character" | "prop">("scene")'
assert s.count(old1) == 1, f"old1 count={s.count(old1)}"
repls.append((old1, new1))

old2 = (
    '    const removeCharacter = (id: string) => {\n'
    '        const nextCharacters = characters.filter((item) => item.id !== id);\n'
    '        onChange({ directorCharacters: nextCharacters });\n'
    '        if (selectedCharacterId === id) setSelectedCharacterId(nextCharacters[0]?.id || "");\n'
    '    };'
)
new2 = old2 + (
    '\n    const props = node.metadata?.directorPropItems || [];\n'
    '    const [selectedPropId, setSelectedPropId] = useState<string>("");\n'
    '    const selectedProp = props.find((item) => item.id === selectedPropId);\n'
    '    const updateProp = (id: string, patch: Partial<NonNullable<CanvasNodeMetadata["directorPropItems"]>[number]>) => {\n'
    '        onChange({ directorPropItems: props.map((item) => (item.id === id ? { ...item, ...patch } : item)) });\n'
    '    };\n'
    '    const addProp = (shape: "box" | "sphere" | "cylinder" | "cone" | "plane") => {\n'
    '        const labels: Record<string, string> = { box: "\u7acb\u65b9\u4f53", sphere: "\u7403\u4f53", cylinder: "\u5706\u67f1", cone: "\u5706\u9525", plane: "\u5e73\u9762" };\n'
    '        const next = { id: `prop-${Date.now()}`, name: labels[shape], shape, position: { x: 0, y: 0.5, z: 0 }, rotation: 0, scale: 1, color: "#8a8a8a", visible: true };\n'
    '        onChange({ directorPropItems: [...props, next] });\n'
    '        setSelectedPropId(next.id);\n'
    '        setSelectedObject("prop");\n'
    '    };\n'
    '    const removeProp = (id: string) => {\n'
    '        onChange({ directorPropItems: props.filter((item) => item.id !== id) });\n'
    '        if (selectedPropId === id) setSelectedPropId("");\n'
    '    };\n'
    '    const selectProp = (id: string) => {\n'
    '        setSelectedPropId(id);\n'
    '        setSelectedObject("prop");\n'
    '    };'
)
assert s.count(old2) == 1, f"old2 count={s.count(old2)}"
repls.append((old2, new2))

old3 = (
    '                        <button type="button" className="flex h-8 w-full items-center gap-1 rounded-md px-2 text-sm text-white/55 transition hover:bg-white/8 hover:text-white" onClick={addCharacter}>\n'
    '                            <span className="grid size-3.5 place-items-center text-[14px] leading-none">+</span>\n'
    '                            <span>\u6dfb\u52a0\u89d2\u8272</span>\n'
    '                        </button>\n'
    '                    </div>\n'
    '                </aside>'
)
new3 = (
    '                        <button type="button" className="flex h-8 w-full items-center gap-1 rounded-md px-2 text-sm text-white/55 transition hover:bg-white/8 hover:text-white" onClick={addCharacter}>\n'
    '                            <span className="grid size-3.5 place-items-center text-[14px] leading-none">+</span>\n'
    '                            <span>\u6dfb\u52a0\u89d2\u8272</span>\n'
    '                        </button>\n'
    '                        <div className="mt-2 text-[11px] uppercase tracking-wide text-white/35">\u9053\u5177</div>\n'
    '                        {props.map((prop) => (\n'
    '                            <div key={prop.id} className={`flex h-8 items-center gap-1 rounded-md px-2 text-sm ${selectedPropId === prop.id && selectedObject === "prop" ? "bg-white/12" : "text-white/72 hover:bg-white/8"}`}>\n'
    '                                <span className="size-3 shrink-0 rounded" style={{ background: prop.color }} />\n'
    '                                <button type="button" className="flex min-w-0 flex-1 text-left" onClick={() => selectProp(prop.id)}>\n'
    '                                    <span className="truncate">{prop.name}</span>\n'
    '                                </button>\n'
    '                                <button type="button" className="grid size-5 place-items-center rounded text-[11px] text-white/50 hover:bg-white/10 hover:text-white" title="\u5220\u9664" onClick={() => removeProp(prop.id)}>\u00d7</button>\n'
    '                            </div>\n'
    '                        ))}\n'
    '                        <div className="flex flex-wrap gap-1">\n'
    '                            {[["box", "\u7acb\u65b9\u4f53"], ["sphere", "\u7403\u4f53"], ["cylinder", "\u5706\u67f1"], ["cone", "\u5706\u9525"], ["plane", "\u5e73\u9762"]].map(([shape, label]) => (\n'
    '                                <button key={shape} type="button" className="rounded bg-white/8 px-2 py-1 text-[11px] text-white/60 transition hover:bg-white/15" onClick={() => addProp(shape as "box" | "sphere" | "cylinder" | "cone" | "plane")}>{label}</button>\n'
    '                            ))}\n'
    '                        </div>\n'
    '                    </div>\n'
    '                </aside>'
)
assert s.count(old3) == 1, f"old3 count={s.count(old3)}"
repls.append((old3, new3))

old4 = (
    '                        onActiveShotChange={updateActiveShot}\n'
    '                        resetSignal={resetSignal}\n'
    '                    />'
)
new4 = (
    '                        onActiveShotChange={updateActiveShot}\n'
    '                        resetSignal={resetSignal}\n'
    '                        props={props}\n'
    '                        selectedPropId={selectedPropId}\n'
    '                        onPropChange={updateProp}\n'
    '                        onSelectPropId={selectProp}\n'
    '                    />'
)
assert s.count(old4) == 1, f"old4 count={s.count(old4)}"
repls.append((old4, new4))

old5 = (
    '    resetSignal,\n'
    '}: {\n'
    '    scene: NonNullable<CanvasNodeMetadata["directorSceneSettings"]>;\n'
    '    characters: DirectorCharacterData[];\n'
    '    selectedCharacterId: string;\n'
    '    onCharacterChange: (id: string, patch: Partial<DirectorCharacterData>) => void;\n'
    '    onSelectCharacterId?: (id: string) => void;\n'
    '    activeShot: NonNullable<CanvasNodeMetadata["directorShots"]>[number];\n'
    '    selectedObject: "scene" | "camera" | "character";\n'
    '    viewMode: "director" | "camera";\n'
    '    onSelectObject: (object: "scene" | "camera" | "character") => void;\n'
    '    onActiveShotChange: (patch: Partial<NonNullable<CanvasNodeMetadata["directorShots"]>[number]>) => void;\n'
    '    resetSignal?: number;\n'
    '}) {'
)
new5 = (
    '    resetSignal,\n'
    '    props,\n'
    '    selectedPropId,\n'
    '    onPropChange,\n'
    '    onSelectPropId,\n'
    '}: {\n'
    '    scene: NonNullable<CanvasNodeMetadata["directorSceneSettings"]>;\n'
    '    characters: DirectorCharacterData[];\n'
    '    selectedCharacterId: string;\n'
    '    onCharacterChange: (id: string, patch: Partial<DirectorCharacterData>) => void;\n'
    '    onSelectCharacterId?: (id: string) => void;\n'
    '    activeShot: NonNullable<CanvasNodeMetadata["directorShots"]>[number];\n'
    '    selectedObject: "scene" | "camera" | "character" | "prop";\n'
    '    viewMode: "director" | "camera";\n'
    '    onSelectObject: (object: "scene" | "camera" | "character" | "prop") => void;\n'
    '    onActiveShotChange: (patch: Partial<NonNullable<CanvasNodeMetadata["directorShots"]>[number]>) => void;\n'
    '    resetSignal?: number;\n'
    '    props?: NonNullable<CanvasNodeMetadata["directorPropItems"]>;\n'
    '    selectedPropId?: string;\n'
    '    onPropChange?: (id: string, patch: Partial<NonNullable<CanvasNodeMetadata["directorPropItems"]>[number]>) => void;\n'
    '    onSelectPropId?: (id: string) => void;\n'
    '}) {'
)
assert s.count(old5) == 1, f"old5 count={s.count(old5)}"
repls.append((old5, new5))

old6 = '    const propsRef = useRef({ scene, characters, selectedCharacterId, onCharacterChange, onSelectCharacterId, activeShot, selectedObject, viewMode, onSelectObject, onActiveShotChange });\n    propsRef.current = { scene, characters, selectedCharacterId, onCharacterChange, onSelectCharacterId, activeShot, selectedObject, viewMode, onSelectObject, onActiveShotChange };'
new6 = '    const propsRef = useRef({ scene, characters, selectedCharacterId, onCharacterChange, onSelectCharacterId, activeShot, selectedObject, viewMode, onSelectObject, onActiveShotChange, props, selectedPropId, onPropChange, onSelectPropId });\n    propsRef.current = { scene, characters, selectedCharacterId, onCharacterChange, onSelectCharacterId, activeShot, selectedObject, viewMode, onSelectObject, onActiveShotChange, props, selectedPropId, onPropChange, onSelectPropId };'
assert s.count(old6) == 1, f"old6 count={s.count(old6)}"
repls.append((old6, new6))

old7 = '            });\n\n            const selectedChar = data.characters.find((c) => c.id === data.selectedCharacterId);'
new7 = (
    '            });\n\n'
    '            // \u9053\u5177\uff08\u51e0\u4f55\u4f53\uff09\n'
    '            (data.props || []).forEach((prop) => {\n'
    '                if (prop.visible === false) return;\n'
    '                const geoms: Record<string, THREE.BufferGeometry> = {\n'
    '                    box: new THREE.BoxGeometry(1, 1, 1),\n'
    '                    sphere: new THREE.SphereGeometry(0.5, 24, 16),\n'
    '                    cylinder: new THREE.CylinderGeometry(0.5, 0.5, 1, 24),\n'
    '                    cone: new THREE.ConeGeometry(0.5, 1, 24),\n'
    '                    plane: new THREE.PlaneGeometry(2, 2),\n'
    '                };\n'
    '                const mesh = new THREE.Mesh(geoms[prop.shape] || geoms.box, new THREE.MeshStandardMaterial({ color: new THREE.Color(prop.color || "#8a8a8a"), roughness: 0.6, metalness: 0.1 }));\n'
    '                mesh.position.set(prop.position.x, prop.position.y, prop.position.z);\n'
    '                mesh.rotation.y = THREE.MathUtils.degToRad(prop.rotation || 0);\n'
    '                mesh.scale.setScalar(prop.scale ?? 1);\n'
    '                mesh.userData.dragType = "prop";\n'
    '                mesh.userData.propId = prop.id;\n'
    '                contentGroup.add(mesh);\n'
    '            });\n\n'
    '            const selectedChar = data.characters.find((c) => c.id === data.selectedCharacterId);'
)
assert s.count(old7) == 1, f"old7 count={s.count(old7)}"
repls.append((old7, new7))

old8 = 'const drag = { type: null as null | "character" | "camera" | "pose",'
new8 = 'const drag = { type: null as null | "character" | "camera" | "pose" | "prop",'
assert s.count(old8) == 1, f"old8 count={s.count(old8)}"
repls.append((old8, new8))

old9 = '            if (drag.type === "pose" && drag.poseKey && drag.characterId) {\n                data.onSelectObject("character");'
new9 = (
    '            if (drag.type === "prop" && ud.propId) {\n'
    '                data.onSelectPropId?.(ud.propId);\n'
    '                data.onSelectObject("prop");\n'
    '                drag.characterId = ud.propId;\n'
    '                if (!intersectGround(event)) return;\n'
    '                const propMesh = contentGroup.children.find((c) => (c as THREE.Mesh).userData?.propId === ud.propId) as THREE.Mesh | undefined;\n'
    '                if (propMesh) drag.characterOffset.copy(propMesh.position).sub(groundPoint);\n'
    '                renderer.domElement.style.cursor = "grabbing";\n'
    '            }\n'
    '            if (drag.type === "pose" && drag.poseKey && drag.characterId) {\n'
    '                data.onSelectObject("character");'
)
assert s.count(old9) == 1, f"old9 count={s.count(old9)}"
repls.append((old9, new9))

old10 = '            if (drag.type === "camera" && !data.activeShot.locked && intersectGround(event)) {'
new10 = (
    '            if (drag.type === "prop" && drag.characterId) {\n'
    '                if (intersectGround(event)) {\n'
    '                    data.onPropChange?.(drag.characterId, { position: roundVector3(groundPoint.clone().add(drag.characterOffset)) });\n'
    '                }\n'
    '            }\n'
    '            if (drag.type === "camera" && !data.activeShot.locked && intersectGround(event)) {'
)
assert s.count(old10) == 1, f"old10 count={s.count(old10)}"
repls.append((old10, new10))

old11 = '                        ) : selectedObject === "character" ? ('
new11 = (
    '                        ) : selectedObject === "prop" ? (\n'
    '                            selectedProp ? (\n'
    '                                <div className="space-y-4 p-4">\n'
    '                                    <DirectorInput label="\u540d\u79f0" value={selectedProp.name} placeholder="\u9053\u5177\u540d\u79f0" onChange={(name) => updateProp(selectedProp.id, { name })} style={fieldStyle} />\n'
    '                                    <DirectorPanelBlock title="\u4f4d\u7f6e">\n'
    '                                        <DirectorVectorEditor value={selectedProp.position} onChange={(position) => updateProp(selectedProp.id, { position })} />\n'
    '                                    </DirectorPanelBlock>\n'
    '                                    <DirectorPanelBlock title="\u5f62\u72b6">\n'
    '                                        <select value={selectedProp.shape} onChange={(event) => updateProp(selectedProp.id, { shape: event.target.value as "box" | "sphere" | "cylinder" | "cone" | "plane" })} className="w-full rounded bg-white/10 px-3 py-2 text-sm text-white/80 outline-none">\n'
    '                                            {(["box", "sphere", "cylinder", "cone", "plane"] as const).map((sh) => (\n'
    '                                                <option key={sh} value={sh}>{{ box: "\u7acb\u65b9\u4f53", sphere: "\u7403\u4f53", cylinder: "\u5706\u67f1", cone: "\u5706\u9525", plane: "\u5e73\u9762" }[sh]}</option>\n'
    '                                            ))}\n'
    '                                        </select>\n'
    '                                    </DirectorPanelBlock>\n'
    '                                    <div className="flex items-center gap-3">\n'
    '                                        <input type="color" value={selectedProp.color} className="size-7 border-0 bg-transparent p-0" onChange={(event) => updateProp(selectedProp.id, { color: event.target.value })} />\n'
    '                                        <DirectorRange label="\u7f29\u653e" value={selectedProp.scale} min={0.2} max={5} step={0.1} digits={1} onChange={(scale) => updateProp(selectedProp.id, { scale })} />\n'
    '                                    </div>\n'
    '                                    <DirectorRange label="\u65cb\u8f6c" value={selectedProp.rotation} min={-180} max={180} digits={0} onChange={(rotation) => updateProp(selectedProp.id, { rotation })} />\n'
    '                                    <DirectorSwitchRow label="\u663e\u793a" checked={selectedProp.visible} onChange={(visible) => updateProp(selectedProp.id, { visible })} />\n'
    '                                </div>\n'
    '                            ) : (\n'
    '                                <div className="p-5 text-sm text-white/50">\u5148\u6dfb\u52a0\u9053\u5177\uff0c\u518d\u7f16\u8f91\u5176\u5c5e\u6027</div>\n'
    '                            )\n'
    '                        ) : selectedObject === "character" ? ('
)
assert s.count(old11) == 1, f"old11 count={s.count(old11)}"
repls.append((old11, new11))

for old, new in repls:
    s = s.replace(old, new)

with open(path, "w", encoding="utf-8") as f:
    f.write(s)

print(f"OK: props implemented ({len(repls)} replacements)")
