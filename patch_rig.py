import sys

path = r"E:\dev_canavs_react\FlowCanvas\web\src\app\(user)\canvas\[id]\canvas-client-page.tsx"
with open(path, "r", encoding="utf-8") as f:
    s = f.read()

repls = []

# 1) 增加模型缩放常量（Xbot 以厘米为单位，需缩到米制场景）
old1 = 'const DEFAULT_DIRECTOR_MODEL_URL = "/models/Xbot.glb";\n'
new1 = (
    'const DEFAULT_DIRECTOR_MODEL_URL = "/models/Xbot.glb";\n'
    '// Xbot.glb 以厘米为单位存储（包围盒高约 177 three单位），缩放到米制场景（约 1.78 单位高）\n'
    "const DIRECTOR_MODEL_SCALE = 0.01;\n"
)
assert s.count(old1) == 1, f"old1 count={s.count(old1)}"
repls.append((old1, new1))

# 2) 修正 applyDirectorPose：骨骼名补冒号 + 手臂基准角 ±90（静止为 T-pose）
old2 = """// 将导演台姿势参数映射到真实骨骼（Xbot 为 Mixamo 骨骼命名）
function applyDirectorPose(root: THREE.Object3D, pose: DirectorCharacterData["pose"]) {
    const deg = THREE.MathUtils.degToRad;
    const head = findBone(root, ["mixamorigHead", "Head"]);
    if (head) head.rotation.set(deg(pose.headPitch), deg(pose.headYaw), 0);
    const neck = findBone(root, ["mixamorigNeck", "Neck"]);
    if (neck && !head) neck.rotation.set(deg(pose.headPitch), deg(pose.headYaw), 0);
    const spine = findBone(root, ["mixamorigSpine", "Spine", "mixamorigSpine1", "Spine1"]);
    if (spine) spine.rotation.y = deg(pose.torsoTwist);
    const lArm = findBone(root, ["mixamorigLeftArm", "LeftArm", "mixamorigLeftShoulder"]);
    if (lArm) lArm.rotation.set(0, 0, deg(-75) + deg(pose.leftArm));
    const rArm = findBone(root, ["mixamorigRightArm", "RightArm", "mixamorigRightShoulder"]);
    if (rArm) rArm.rotation.set(0, 0, deg(75) - deg(pose.rightArm));
    const lLeg = findBone(root, ["mixamorigLeftUpLeg", "LeftUpLeg", "LeftLeg"]);
    if (lLeg) lLeg.rotation.x = deg(pose.leftLeg);
    const rLeg = findBone(root, ["mixamorigRightUpLeg", "RightUpLeg", "RightLeg"]);
    if (rLeg) rLeg.rotation.x = deg(pose.rightLeg);
}"""
new2 = """// 将导演台姿势参数映射到真实骨骼（Xbot 为 Mixamo 骨骼命名，注意带冒号）
function applyDirectorPose(root: THREE.Object3D, pose: DirectorCharacterData["pose"]) {
    const deg = THREE.MathUtils.degToRad;
    const head = findBone(root, ["mixamorig:Head", "Head"]);
    if (head) head.rotation.set(deg(pose.headPitch), deg(pose.headYaw), 0);
    const neck = findBone(root, ["mixamorig:Neck", "Neck"]);
    if (neck && !head) neck.rotation.set(deg(pose.headPitch), deg(pose.headYaw), 0);
    const spine = findBone(root, ["mixamorig:Spine", "mixamorig:Spine1", "mixamorig:Spine2", "Spine"]);
    if (spine) spine.rotation.y = deg(pose.torsoTwist);
    // Xbot 静止为 T-pose（手臂水平），基准 ±90° 把双臂落到身体两侧，pose 值在其上微调
    const lArm = findBone(root, ["mixamorig:LeftArm", "mixamorig:LeftShoulder", "LeftArm"]);
    if (lArm) lArm.rotation.set(0, 0, deg(-90) + deg(pose.leftArm));
    const rArm = findBone(root, ["mixamorig:RightArm", "mixamorig:RightShoulder", "RightArm"]);
    if (rArm) rArm.rotation.set(0, 0, deg(90) - deg(pose.rightArm));
    const lLeg = findBone(root, ["mixamorig:LeftUpLeg", "mixamorig:LeftLeg", "LeftUpLeg"]);
    if (lLeg) lLeg.rotation.x = deg(pose.leftLeg);
    const rLeg = findBone(root, ["mixamorig:RightUpLeg", "mixamorig:RightLeg", "RightUpLeg"]);
    if (rLeg) rLeg.rotation.x = deg(pose.rightLeg);
}"""
assert s.count(old2) == 1, f"old2 count={s.count(old2)}"
repls.append((old2, new2))

# 3) buildRiggedCharacter 中克隆后缩放到米制场景
old3 = '    clone.rotation.y = THREE.MathUtils.degToRad(char.rotation || 0);\n    group.add(clone);\n'
new3 = '    clone.rotation.y = THREE.MathUtils.degToRad(char.rotation || 0);\n    clone.scale.setScalar(DIRECTOR_MODEL_SCALE);\n    group.add(clone);\n'
assert s.count(old3) == 1, f"old3 count={s.count(old3)}"
repls.append((old3, new3))

for old, new in repls:
    s = s.replace(old, new)

with open(path, "w", encoding="utf-8") as f:
    f.write(s)

print("OK: 已应用", len(repls), "处修改")
