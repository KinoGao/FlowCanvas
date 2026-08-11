#!/usr/bin/env node
/**
 * 调用智谱 GLM-4V-Flash 视觉模型识别本地图片，给 Agent 提供"看图"能力。
 *
 * 用法:
 *   node scripts/vision.mjs <图片路径> [问题...]
 *
 * 环境变量:
 *   ZHIPU_API_KEY  智谱开放平台（https://open.bigmodel.cn）申请的 API Key
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const args = process.argv.slice(2);
if (args.length < 1) {
  console.error('用法: node scripts/vision.mjs <图片路径> [问题...]');
  process.exit(1);
}

const apiKey = process.env.ZHIPU_API_KEY;
if (!apiKey) {
  console.error('未设置环境变量 ZHIPU_API_KEY（智谱开放平台 https://open.bigmodel.cn 申请）');
  process.exit(1);
}

const [imagePath, ...questionWords] = args;
const question = questionWords.join(' ') || '请详细描述这张图片的内容。';

const b64 = readFileSync(resolve(imagePath)).toString('base64');
// GLM-4V-Flash 限制图片 base64 编码后不超过 5MB
if (b64.length > 5 * 1024 * 1024) {
  console.error('图片 base64 后超过 5MB，GLM-4V-Flash 会拒绝，请先压缩图片再试');
  process.exit(1);
}

const ext = imagePath.split('.').pop().toLowerCase();
const mime = ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg';

const res = await fetch('https://open.bigmodel.cn/api/paas/v4/chat/completions', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${apiKey}`,
  },
  body: JSON.stringify({
    model: 'glm-4v-flash',
    messages: [
      {
        role: 'user',
        content: [
          { type: 'image_url', image_url: { url: `data:${mime};base64,${b64}` } },
          { type: 'text', text: question },
        ],
      },
    ],
  }),
});

if (!res.ok) {
  const text = await res.text();
  console.error(`API 请求失败 (${res.status}): ${text}`);
  process.exit(1);
}

const data = await res.json();
console.log(data.choices?.[0]?.message?.content ?? JSON.stringify(data, null, 2));
