import fs from "node:fs";
import path from "node:path";

export const AGENT_MODES = ["default", "script", "production"] as const;
export type AgentMode = (typeof AGENT_MODES)[number];

export const STORY_SKILLS = [
  "Comedy_humor", "Coming_of_age", "Family_warmth", "Historical_epic",
  "Horror_supernatural", "Hot_blooded_action", "Mystery_thriller",
  "Psychological_drama", "Scifi_post_apocalypse", "Sweet_romance_novel",
  "Urban_workplace_drama", "Xianxia_fantasy",
] as const;
export type StorySkill = (typeof STORY_SKILLS)[number];

export const ART_SKILLS = [
  "2D_90s_japanese_anime", "2D_chinese_guofeng", "2D_flat_design",
  "2D_mature_urban_romance", "3D_anime_render", "3D_chinese_traditional",
  "3D_clay_stopmotion", "3D_guofeng_cyber", "realpeople_ancient_chinese",
  "realpeople_modern_city", "realpeople_urban_modern",
] as const;
export type ArtSkill = (typeof ART_SKILLS)[number];

export const DIRECTOR_SKILLS = [
  "spielberg", "kubrick", "wong_kar_wai", "nolan", "zhang_yimou",
  "hou_hsiao_hsien", "wes_anderson", "villeneuve",
] as const;
export type DirectorSkill = (typeof DIRECTOR_SKILLS)[number];

export type PromptBuildOptions = {
  storySkill?: StorySkill;
  artSkill?: ArtSkill;
  directorSkill?: DirectorSkill;
};

const BASE_PROMPT = [
  "你正在帮助用户操作 Infinite Canvas 网页画布。",
  "需要改动画布时优先使用已配置的 infinite-canvas MCP 工具：",
  "先 canvas_get_state 读取当前画布，再根据任务使用 canvas_create_node、canvas_create_text_node、",
  "canvas_generate_text、canvas_generate_image、canvas_generate_video、canvas_generate_audio、",
  "canvas_create_generation_flow、canvas_run_generation、canvas_update_node、canvas_connect_nodes 等通用工具；",
  "复杂批量改动再用 canvas_apply_ops，删除连线可用 delete_connections。",
  "生成流程会创建提示词文本节点和对应的文本、图片、视频或音频目标节点，并直接在目标节点运行生成；",
  "ComfyUI 使用 canvas_create_node 的 comfyui 类型创建。",
  "用户需要剧本/脚本/分镜/故事板时，用 canvas_create_node 创建 canvasTool='script' 的脚本节点（metadata.scriptBody 填剧本正文），不要用 canvas_create_text_node 代替。",
  "影视制作规范（涉及脚本/分镜/图片/视频生成时必须遵守）：生成分镜时按「资产（角色/道具/场景）→ 连续分镜」组织；画面描述写可拍的具体画面（\"人怎么干\"而非\"人干什么\"），景别用 大远景/远景/全景/中景/近景/特写，运镜写具体运动方式（推近/拉远/横移/跟拍/环绕/升降/固定），情绪高点用近景/特写；同一场戏角色位置、服装、道具与场景细节前后连贯，不跳戏。图片/视频提示词是格式转换不是创意写作，画面主体、动作、空间关系必须完整保留，不添加分镜未提及的装饰性元素；风格词、画质词是辅助修饰，冲突时以画面内容为准。有参考图或已生成节点时，角色/场景外观必须沿用既有设定，不得自行换装、改场景。",
  "不要模拟鼠标点击，不要要求用户手动复制 JSON。",
].join("\n");

export class AgentPromptBuilder {
  private cache = new Map<string, string>();
  private skillsDir: string;

  static SKILL_LABELS: Record<StorySkill | ArtSkill | DirectorSkill, string> = {
    Comedy_humor: "喜剧幽默", Coming_of_age: "成长青春", Family_warmth: "家庭温情",
    Historical_epic: "历史史诗", Horror_supernatural: "恐怖灵异", Hot_blooded_action: "热血动作",
    Mystery_thriller: "悬疑惊悚", Psychological_drama: "心理剧情", Scifi_post_apocalypse: "科幻末世",
    Sweet_romance_novel: "甜宠言情", Urban_workplace_drama: "都市职场", Xianxia_fantasy: "古风仙侠",
    "2D_90s_japanese_anime": "2D 日式动画", "2D_chinese_guofeng": "2D 中式古风",
    "2D_flat_design": "2D 扁平设计", "2D_mature_urban_romance": "2D 都市恋爱",
    "3D_anime_render": "3D 动画渲染", "3D_chinese_traditional": "3D 国风传统",
    "3D_clay_stopmotion": "3D 黏土定格", "3D_guofeng_cyber": "3D 国风赛博",
    realpeople_ancient_chinese: "真人古装", realpeople_modern_city: "真人现代都市",
    realpeople_urban_modern: "真人都市现代",
    spielberg: "斯皮尔伯格 · 好莱坞叙事", kubrick: "库布里克 · 对称冷峻",
    wong_kar_wai: "王家卫 · 东方文艺", nolan: "诺兰 · 冷峻科幻",
    zhang_yimou: "张艺谋 · 东方色彩", hou_hsiao_hsien: "侯孝贤 · 长镜头写实",
    wes_anderson: "韦斯·安德森 · 对称童话", villeneuve: "维伦纽瓦 · 宏大静谧",
  };

  constructor(skillsDir: string) {
    this.skillsDir = skillsDir;
  }

  build(mode: AgentMode, options: PromptBuildOptions = {}): string {
    const parts: string[] = [BASE_PROMPT];
    if (mode === "script") parts.push(this.load("script_pipeline.md"));
    if (mode === "production") parts.push(this.load("production_pipeline.md"));
    if (options.storySkill) parts.push(this.storySkillSection(options.storySkill));
    if (options.artSkill) parts.push(this.artSkillSection(options.artSkill));
    if (options.directorSkill) parts.push(this.directorSkillSection(options.directorSkill));
    return parts.filter(Boolean).join("\n\n---\n\n");
  }

  availableSkills(): { story: { id: StorySkill; label: string }[]; art: { id: ArtSkill; label: string }[]; director: { id: DirectorSkill; label: string }[] } {
    return {
      story: STORY_SKILLS.map((id) => ({ id, label: AgentPromptBuilder.SKILL_LABELS[id] })),
      art: ART_SKILLS.map((id) => ({ id, label: AgentPromptBuilder.SKILL_LABELS[id] })),
      director: DIRECTOR_SKILLS.map((id) => ({ id, label: AgentPromptBuilder.SKILL_LABELS[id] })),
    };
  }

  private directorSkillSection(skill: DirectorSkill): string {
    const readme = this.load(`director_skills/${skill}/README.md`);
    if (!readme) return "";
    return [
      `## 导演风格：${AgentPromptBuilder.SKILL_LABELS[skill]}`,
      "",
      readme,
      "生成分镜画面描述、图片或视频提示词时，必须严格按上述导演风格的镜头语言、光线色彩、运镜构图与提示词约束组织措辞，不得偏离。",
    ].filter(Boolean).join("\n\n");
  }

  private storySkillSection(skill: StorySkill): string {
    const readme = this.load(`story_skills/${skill}/README.md`);
    if (!readme) return "";
    // 尝试加载导演手法
    const planningNarrative = this.loadOptional(`story_skills/${skill}/driector_skills/director_planning_narrative.md`);
    const storyboardNarrative = this.loadOptional(`story_skills/${skill}/driector_skills/director_storyboard_table_narrative.md`);
    return [
      `## 故事风格：${AgentPromptBuilder.SKILL_LABELS[skill]}`,
      "",
      readme,
      planningNarrative ? `### 叙事规划手法\n\n${planningNarrative}` : "",
      storyboardNarrative ? `### 分镜表叙事手法\n\n${storyboardNarrative}` : "",
    ].filter(Boolean).join("\n\n");
  }

  private artSkillSection(skill: ArtSkill): string {
    const readme = this.load(`art_skills/${skill}/README.md`);
    if (!readme) return "";
    const promptFile = this.loadOptional(`art_skills/${skill}/art_prompt`);
    const prefix = this.loadOptional(`art_skills/${skill}/prefix.md`);
    const planningStyle = this.loadOptional(`art_skills/${skill}/driector_skills/director_planning_style.md`);
    const storyboard = this.loadOptional(`art_skills/${skill}/driector_skills/director_storyboard.md`);
    const storyboardTable = this.loadOptional(`art_skills/${skill}/driector_skills/director_storyboard_table_style.md`);
    const directorAll = [planningStyle, storyboard, storyboardTable].filter(Boolean).join("\n\n");
    return [
      `## 美术风格：${AgentPromptBuilder.SKILL_LABELS[skill]}`,
      "",
      readme,
      prefix ? `### 提示词前缀\n\n${prefix}` : "",
      promptFile ? `### 美术提示词\n\n${promptFile}` : "",
      directorAll ? `### 导演技法\n\n${directorAll}` : "",
    ].filter(Boolean).join("\n\n");
  }

  private load(relativePath: string): string {
    const cached = this.cache.get(relativePath);
    if (cached !== undefined) return cached;
    const fullPath = path.join(this.skillsDir, relativePath);
    try {
      const content = fs.readFileSync(fullPath, "utf8").trim();
      // 去掉 YAML front matter
      const cleaned = content.replace(/^---[\s\S]*?---\n*/m, "").trim();
      this.cache.set(relativePath, cleaned);
      return cleaned;
    } catch {
      this.cache.set(relativePath, "");
      return "";
    }
  }

  private loadOptional(relativePath: string): string {
    const content = this.load(relativePath);
    return content || "";
  }
}
