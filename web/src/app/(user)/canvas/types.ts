export type Position = {
    x: number;
    y: number;
};

export type ViewportTransform = {
    x: number;
    y: number;
    k: number;
};

export enum CanvasNodeType {
    Image = "image",
    Text = "text",
    Config = "config",
    Video = "video",
    Audio = "audio",
}

export type CanvasNodeStatus = "idle" | "success" | "loading" | "error";
export type CanvasGenerationMode = "text" | "image" | "video" | "audio" | "comfyui";
export type CanvasImageGenerationType = "generation" | "edit";
export type DirectorVector3 = { x: number; y: number; z: number };

export type DirectorAspectRatio = "16:9" | "9:16" | "1:1" | "4:3" | "2.39:1";

export type DirectorCharacter = {
    id: string;
    name: string;
    color: string;
    type?: "male" | "female" | "child" | "tall" | "short" | "heavy" | "slim";
    position: DirectorVector3;
    rotation?: number;
    scale?: number;
    pose?: {
        headYaw: number;
        headPitch: number;
        headRoll: number;
        torsoTwist: number;
        torsoLean: number;
        torsoBend: number;
        leftArm: number;
        leftArmFwd: number;
        leftElbow: number;
        rightArm: number;
        rightArmFwd: number;
        rightElbow: number;
        leftLeg: number;
        leftHipSpread: number;
        leftKnee: number;
        rightLeg: number;
        rightHipSpread: number;
        rightKnee: number;
    };
    visible: boolean;
    locked: boolean;
};

export type DirectorPropShape = "box" | "sphere" | "cylinder" | "cone" | "plane";
export type DirectorProp = {
    id: string;
    name: string;
    shape: DirectorPropShape;
    position: DirectorVector3;
    rotation: number;
    scale: number;
    color: string;
    visible: boolean;
};

export type CanvasBaseMetadata = {
    content?: string;
    composerContent?: string;
    canvasTool?: "script" | "videoComposition" | "director" | "panorama360";
    prompt?: string;
    requestPrompt?: string;
    status?: CanvasNodeStatus;
    errorDetails?: string;
    fontSize?: number;
};

export type CanvasScriptMetadata = {
    scriptTitle?: string;
    scriptLogline?: string;
    scriptBody?: string;
    scriptBeats?: Array<{ id: string; title: string; content: string; prompt: string }>;
    scriptOutputIds?: string[];
};

export type CanvasDirectorSceneSettings = {
    scale: number;
    translate: DirectorVector3;
    rotate: DirectorVector3;
    skyColor: string;
    panoramaRotation: number;
    panoramaRadius: number;
    panoramaUrl?: string;
    panoramaVisible?: boolean;
    aspectRatio?: DirectorAspectRatio;
    characterLabels: boolean;
    gridSnap: boolean;
    groundVisible: boolean;
    groundOpacity: number;
    groundHeight: number;
};

export type CanvasDirectorShot = {
    id: string;
    name: string;
    camera: string;
    prompt: string;
    fov?: number;
    position?: DirectorVector3;
    target?: DirectorVector3;
    targetMode?: "manual" | "character";
    visible?: boolean;
    locked?: boolean;
};

export type CanvasDirectorMetadata = {
    directorScene?: string;
    directorStyle?: string;
    directorCast?: string;
    directorProps?: string;
    directorSceneSettings?: CanvasDirectorSceneSettings;
    directorCharacters?: DirectorCharacter[];
    directorPropItems?: DirectorProp[];
    directorShots?: CanvasDirectorShot[];
    directorCaptures?: Array<{ id: string; cameraId: string; name: string; dataUrl: string; createdAt: string }>;
    directorOutputIds?: string[];
};

export type CanvasGenerationMetadata = {
    generationMode?: CanvasGenerationMode;
    generationType?: CanvasImageGenerationType;
    model?: string;
    size?: string;
    quality?: string;
    count?: number;
    seconds?: string;
    vquality?: string;
    generateAudio?: string;
    watermark?: string;
    audioVoice?: string;
    audioFormat?: string;
    audioSpeed?: string;
    audioInstructions?: string;
    comfyWorkflowId?: string;
    comfyFieldValues?: Record<string, unknown>;
    references?: string[];
};

export type CanvasBatchMetadata = {
    freeResize?: boolean;
    isBatchRoot?: boolean;
    batchRootId?: string;
    batchChildIds?: string[];
    batchUsesReferenceImages?: boolean;
    primaryImageId?: string;
    imageBatchExpanded?: boolean;
};

export type CanvasMediaMetadata = {
    naturalWidth?: number;
    naturalHeight?: number;
    storageKey?: string;
    mimeType?: string;
    bytes?: number;
    durationMs?: number;
};

export type CanvasNodeMetadata = CanvasBaseMetadata & CanvasScriptMetadata & CanvasDirectorMetadata & CanvasGenerationMetadata & CanvasBatchMetadata & CanvasMediaMetadata;

export type CanvasNodeData = {
    id: string;
    type: CanvasNodeType;
    title: string;
    position: Position;
    width: number;
    height: number;
    metadata?: CanvasNodeMetadata;
};

export type CanvasConnection = {
    id: string;
    fromNodeId: string;
    toNodeId: string;
};

export type CanvasAssistantReference = {
    id: string;
    type: CanvasNodeType;
    title: string;
    dataUrl?: string;
    storageKey?: string;
    text?: string;
};

export type CanvasAssistantImage = {
    id: string;
    dataUrl: string;
    storageKey?: string;
    prompt: string;
};

export type CanvasAssistantMessage = {
    id: string;
    role: "user" | "assistant" | "system" | "tool" | "error";
    title?: string;
    text: string;
    meta?: string;
    detail?: unknown;
    references?: CanvasAssistantReference[];
};

export type CanvasAssistantSession = {
    id: string;
    title: string;
    messages: CanvasAssistantMessage[];
    createdAt: string;
    updatedAt: string;
};

export type ConnectionHandle = {
    nodeId: string;
    handleType: "source" | "target";
};

export type ContextMenuState =
    | {
          type: "node";
          x: number;
          y: number;
          nodeId: string;
      }
    | {
          type: "connection";
          x: number;
          y: number;
          connectionId: string;
      }
    | {
          type: "canvas";
          x: number;
          y: number;
      };
