# Junli Studio API 文档

来源：[https://img.junliai.org/docs](https://img.junliai.org/docs)

完全兼容 OpenAI 接口规范。修改 `base_url` 和 `api_key` 即可调用，支持图像、视频和图生图。

## 基础信息

| 项目 | 内容 |
|---|---|
| Base URL | `https://img.junliai.org/v1` |
| 鉴权 | `Authorization: Bearer <key>` |
| API Key | `YOUR_API_KEY` |

没有 Key 时，可前往[设置 → API Key](https://img.junliai.org/settings)生成。

相关教程：[sub2api 接入教程](https://d97gsmt10d.feishu.cn/wiki/GxTfwtDkHiIkInkgOQEcA1wknxb?from=from_copylink)

## 端点

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/v1/models` | 模型列表 |
| POST | `/v1/images/generations` | 文生图 |
| POST | `/v1/images/edits` | 图生图（multipart） |
| POST | `/v1/responses` | 异步生图 |
| GET | `/v1/responses/{id}` | 查询异步结果 |
| POST | `/v1/responses/{id}/cancel` | 取消任务 |
| POST | `/v1/videos` | 创建视频任务 |
| GET | `/v1/videos/{id}` | 查询视频状态 |
| GET | `/v1/videos/{id}/content` | 下载 MP4 |

## 可用模型

| model | 类型 | 分辨率 / 时长 | 价格 |
|---|---|---|---|
| `gpt-image-2-high` | 图像 | 1K · 2K · 4K | 8 积分 |
| `veo-3.1` | 视频 | 4s · 6s · 8s | 40 积分/秒 |
| `runway-gen4.5` | 视频 | 5s · 8s · 10s | 15 积分/秒 |
| `gemini-omni` | 视频 | 3s–10s | 60 积分/秒 |
| `kling-o3` | 视频 | 3s–15s | 8–15 积分/秒 |
| `seedance-2.0` | 视频 | 4s–15s | 30 积分/秒 |
| `seedance-2.5` | 视频 | 4s–30s | 50 积分/秒 |
| `minimax-h3` | 视频 | 5s–15s | 15 积分/秒 |
| `nano-banana-pro` | 图像 | 1K · 2K · 4K | 10 积分 |
| `gpt-image-2` | 图像 | 1K | 1 积分 |
| `flux-klein-2` | 图像 | 1K · 2K | 2–5 积分 |
| `flux-kontext-max` | 图像 | 1K | 3 积分 |
| `imagine-1.5pro` | 图像 | 4K | 10 积分 |
| `nano-banana-2` | 图像 | 1K · 2K · 4K | 6–12 积分 |
| `firefly-video` | 视频 | 5s | 8 积分/秒 |
| `firefly-image-5` | 图像 | 1K · 2K | 2 积分 |
| `firefly-gpt-image-2` | 图像 | 1K · 2K · 4K | 2–6 积分 |

> `gemini-omni` 支持 3–10 秒；`kling-o3` 支持 3–15 秒；`seedance-2.0` 支持 4–15 秒；`seedance-2.5` 支持 4–30 秒；`minimax-h3` 支持 5–15 秒。

## 文生图

端点：`POST /v1/images/generations`

| 参数 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `model` | string | 是 | 模型名，优先使用别名；见上方图像模型 |
| `prompt` | string | 是 | 文字描述 |
| `size` | string | 否 | 宽×高，如 `1500x1000`；映射为最接近的比例和分辨率档。留空为 1:1 · 2K |
| `quality` | string | 否 | Adobe GPT Image 忽略；`firefly-gpt-image-2` 固定中等；`gpt-image-2-high` 固定高质量 |
| `response_format` | string | 否 | `url` 或 `b64_json`；省略时使用后台默认值。URL 无需 Key，最长 24 小时有效 |

## 图生图

端点：`POST /v1/images/edits`，使用 `multipart/form-data`。

| 参数 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `image` | file | 是 | 输入图；多张参考图重复 `image[]` 字段 |
| `prompt` | string | 是 | 编辑或参考描述 |
| `model` | string | 是 | 支持图生图的模型名 |
| `size` | string | 否 | 同图像生成接口，映射为比例和分辨率档 |
| `quality` | string | 否 | 同图像生成接口 |
| `response_format` | string | 否 | `url` 或 `b64_json`；URL 无需 Key，最长 24 小时有效 |

## 视频生成

端点：`POST /v1/videos`，异步执行。

| 参数 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `model` | string | 是 | 视频模型名 |
| `prompt` | string | 是 | 文字描述 |
| `seconds` | string \| int | 是 | 时长秒数，如 `5`、`8`，取决于模型支持 |
| `size` | string | 否 | 如 `1280x720` / `720x1280`，决定比例和分辨率 |
| `reference_mode` | string | 否 | `asset` 普通参考图；`frame` 首尾帧 |
| `reference_images` | string[] \| file[] | 否 | 普通参考图；JSON 支持公网 URL、Data URI、原始 Base64；multipart 重复 `reference_images[]`。兼容 `images` / `element_references` |
| `start_frame` / `end_frame` | string \| file | 否 | JSON 支持公网 URL、Data URI、原始 Base64；末帧必须搭配首帧，且不能与普通参考图或参考视频混用。兼容 `input_reference[]` |
| `video_references` | string[] \| file[] | 否 | Seedance 2.5 最多 10 个、Seedance 2.0 最多 3 个、Kling O3 最多 1 个；支持 URL 或 Data URI |
| `audio_reference(s)` | string \| string[] \| file[] | 否 | MiniMax H3 最多 3 个、Seedance 2.5 最多 10 个、Seedance 2.0 最多 1 个；必须搭配普通图像或视频参考 |
| `audio` | boolean | 否 | 控制输出音轨；Seedance、Kling、Sora、Veo 支持开关，MiniMax H3 固定为 `true` |
| `response_format` | string | 否 | 显式传 `url` 时，完成态返回无需 Key 的临时 URL，有效 24 小时；省略则沿用 `/content` |

## 异步生图

端点：`POST /v1/responses`

| 参数 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `model` | string | 是 | 图像模型 ID |
| `background` | boolean | 是 | 固定为 `true` |
| `input` | string \| array | 是 | 提示词字符串，或含 `input_text` / `input_image` 的消息数组 |
| `input_image.image_url` | string | 否 | 公网 HTTP(S) URL 或 `data:image/...;base64,...`；数量按模型配置，全局上限 15 |
| `size` | string | 否 | 显式指定比例和分辨率 |
| `quality` | string | 否 | Adobe GPT Image 的固定档规则同上 |
| `response_format` | string | 否 | `url` 或 `b64_json`；省略时沿用同步接口默认值 |

状态查询：`GET /v1/responses/{id}`

取消任务：`POST /v1/responses/{id}/cancel`

## 图像分辨率对照表

图像按 `size` 的**长边**判断分辨率档位；自定义 `WxH` 只参与比例和档位映射，不保证最终画布严格匹配。

| 比例 | 1K | 2K | 4K |
|---|---:|---:|---:|
| 1:1 · 方 | `1024x1024` | `2048x2048` | `4096x4096` |
| 5:4 · 横 | `1280x1024` | `2560x2048` | `3840x3072` |
| 4:3 · 横 | `1024x768` | `2048x1536` | `4096x3072` |
| 3:2 · 横 | `1200x800` | `2400x1600` | `3600x2400` |
| 16:9 · 横 | `1280x720` | `2048x1152` | `4096x2304` |
| 2:1 · 横 | `1440x720` | `2880x1440` | `4096x2048` |
| 21:9 · 超宽 | `1680x720` | `2520x1080` | `5040x2160` |
| 3:1 · 超宽 | `1536x512` | `2304x768` | `3840x1280` |
| 4:1 · 超宽 | `1728x432` | `2880x720` | `4096x1024` |
| 8:1 · 超宽 | `1728x216` | `2880x360` | `4096x512` |
| 4:5 · 竖 | `1024x1280` | `2048x2560` | `3072x3840` |
| 3:4 · 竖 | `768x1024` | `1536x2048` | `3072x4096` |
| 2:3 · 竖 | `800x1200` | `1600x2400` | `2400x3600` |
| 9:16 · 竖 | `720x1280` | `1152x2048` | `2304x4096` |
| 1:3 · 竖 | `512x1536` | `768x2304` | `1280x3840` |
| 1:4 · 竖 | `432x1728` | `720x2880` | `1024x4096` |
| 1:8 · 竖 | `216x1728` | `360x2880` | `512x4096` |

例如，2K 的 16:9 横图传：`"size": "2048x1152"`。留空为 1:1 · 2K。

## 视频分辨率对照表

视频按 `size` 的**短边**映射为 720p / 1080p / 1440p / 2160p。档位必须是模型支持的分辨率，不支持时会被拒绝。

| 比例 | 720p | 1080p | 1440p | 2160p |
|---|---:|---:|---:|---:|
| 21:9 · 超宽 | `1680x720` | `2520x1080` | `3360x1440` | `5040x2160` |
| 16:9 · 横 | `1280x720` | `1920x1080` | `2560x1440` | `3840x2160` |
| 9:16 · 竖 | `720x1280` | `1080x1920` | `1440x2560` | `2160x3840` |
| 1:1 · 方 | `720x720` | `1080x1080` | `1440x1440` | `2160x2160` |
| 4:3 · 横 | `960x720` | `1440x1080` | `1920x1440` | `2880x2160` |
| 3:4 · 竖 | `720x960` | `1080x1440` | `1440x1920` | `2160x2880` |

例如，720p 的 16:9 横版视频传 `"size": "1280x720"`；竖版 9:16 传 `"720x1280"`。

## 调用示例

### 文生图：curl

```bash
curl https://img.junliai.org/v1/images/generations \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-image-2-high",
    "prompt": "a corgi running in a golden wheat field, cinematic",
    "size": "2048x2048"
  }'
```

### 文生图：Python（OpenAI SDK）

```python
from openai import OpenAI

client = OpenAI(
    api_key="YOUR_API_KEY",
    base_url="https://img.junliai.org/v1",
)
resp = client.images.generate(
    model="gpt-image-2-high",
    prompt="a corgi running in a golden wheat field, cinematic",
    size="2048x2048",
    response_format="url",
)
print(resp.data[0].url)  # 公开 URL，无需 Key，最长 24 小时有效
# 需要内联图片时显式传 response_format="b64_json"
```

### 图生图：curl（multipart）

```bash
curl https://img.junliai.org/v1/images/edits \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -F model="gpt-image-2-high" \
  -F prompt="把这张图改成赛博朋克风格" \
  -F size="2048x2048" \
  -F image=@input.png

# 多张参考图：重复 -F image
# -F image=@a.png -F image=@b.png
```

### 图生图：Python（OpenAI SDK）

```python
import base64
from openai import OpenAI

client = OpenAI(
    api_key="YOUR_API_KEY",
    base_url="https://img.junliai.org/v1",
)
resp = client.images.edit(
    model="gpt-image-2-high",
    image=open("input.png", "rb"),
    # 多张：image=[open("a.png", "rb"), open("b.png", "rb")]
    prompt="把这张图改成赛博朋克风格",
    response_format="b64_json",
)
with open("out.png", "wb") as f:
    f.write(base64.b64decode(resp.data[0].b64_json))
```

### 异步生图：URL / Base64 参考图

```bash
# 提交后立即返回 resp_...；image_url 可传公网 URL 或 data:image/...;base64,...
RESPONSE_ID=$(curl -s https://img.junliai.org/v1/responses \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Idempotency-Key: customer-order-123" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-image-2-high",
    "background": true,
    "quality": "auto",
    "response_format": "url",
    "input": [{
      "role": "user",
      "content": [
        {"type":"input_text","text":"保持主体，改成电影光影"},
        {"type":"input_image","image_url":"https://example.com/reference.png"}
      ]
    }]
  }' | jq -r .id)

# 轮询 queued / in_progress，直到 completed；output[0].result 是 URL
curl https://img.junliai.org/v1/responses/$RESPONSE_ID \
  -H "Authorization: Bearer YOUR_API_KEY"

# 不再需要时可取消尚未完成的任务
curl -X POST https://img.junliai.org/v1/responses/$RESPONSE_ID/cancel \
  -H "Authorization: Bearer YOUR_API_KEY"
```

### 视频：curl（创建 → 轮询 → 下载）

```bash
# 1) 创建任务，立即返回 {"id":"...","status":"queued"}
curl https://img.junliai.org/v1/videos \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "veo-3.1",
    "prompt": "a paper boat sailing down a rainy street, cinematic",
    "seconds": "4",
    "size": "1280x720",
    "response_format": "url"
  }'

# 2) 轮询状态，直到 status=completed；完成响应包含 url
curl https://img.junliai.org/v1/videos/<VIDEO_ID> \
  -H "Authorization: Bearer YOUR_API_KEY"

# 3) 直接下载返回的本站 URL，无需 Authorization
curl '<RETURNED_URL>' -o out.mp4
```

### 视频：Python（requests，轮询）

```python
import time
import requests

base = "https://img.junliai.org/v1"
h = {"Authorization": "Bearer YOUR_API_KEY"}

job = requests.post(
    f"{base}/videos",
    headers=h,
    json={
        "model": "veo-3.1",
        "prompt": "a paper boat sailing down a rainy street",
        "seconds": "4",
        "size": "1280x720",
        "response_format": "url",
    },
).json()
vid = job["id"]

while True:
    status = requests.get(f"{base}/videos/{vid}", headers=h).json()
    if status["status"] in ("completed", "failed"):
        break
    time.sleep(5)

if status["status"] == "completed":
    mp4 = requests.get(status["url"]).content
    open("out.mp4", "wb").write(mp4)
```

### 列出模型：curl

```bash
curl https://img.junliai.org/v1/models \
  -H "Authorization: Bearer YOUR_API_KEY"
```

## 响应与计费

### 图像

`generations` / `edits` 遵循 `response_format`：

- `url`：返回公开临时 URL。
- `b64_json`：返回内联 Base64。
- 未传时使用后台默认值。
- 启用 Bunny 时 URL 指向 Bunny CDN，否则指向本站。
- 两种 URL 都无需 API Key，最长保留 24 小时。

### 异步图像

`POST /v1/responses` 返回 `queued`，轮询后状态可能为 `completed`、`failed` 或 `cancelled`。完成结果在 `output[0].result`，其 URL/Base64 格式遵循 `response_format`。

参考图只能通过 `input_image.image_url` 传入，支持公网 HTTP(S) URL 或 `data:image/...;base64,...`。不提供 Files API 或 `file_id`。参考图数量受模型的 `max_reference_images` 限制，全局上限 15 张。任一 URL 超时、超限或内容不完整都会导致整单失败。任务、结果和引用快照最长保留 24 小时。

### 视频

视频采用异步、Sora 风格三步流程：

1. `POST /v1/videos` 立即返回任务对象：`{"id":"...","object":"video","status":"queued",...}`。
2. 轮询 `GET /v1/videos/{id}`，状态从 `queued` → `in_progress` → `completed`，也可能为 `failed`。
3. 完成后 `GET /v1/videos/{id}/content` 返回 MP4 原始二进制，不是 Base64 或 URL。

创建时显式传 `response_format="url"`，任务仍异步执行；完成后响应增加无需 Key 的公开 `url` 和 `expires_at`，24 小时后删除。省略该参数时使用 `/content` 流程。

### 计费

生成前按模型价格预扣积分。图像或视频上游失败会自动退回，失败不扣费。

图像 `size` 映射为比例和分辨率档：

- 长边 `< 1800`：1K
- 长边 `1800–3499`：2K
- 长边 `>= 3500`：4K

不保证最终画布精确匹配。`firefly-gpt-image-2` 固定中等质量，`gpt-image-2-high` 固定高质量，传入的 `quality` 会被忽略；两者均按分辨率价格计费。

视频按所选分辨率的每秒单价 × `seconds` 计费。参数不在模型定价表内返回 400，余额不足返回 402。

## 错误码

| HTTP 状态码 | 含义 |
|---:|---|
| 400 | 参数缺失、不支持或未定价 |
| 401 | Key 无效或上游需要重新授权 |
| 402 | 积分不足 |
| 404 | 未知 model 或视频任务不存在 |
| 409 | 视频尚未完成，content 尚未就绪 |
| 429 | 账号并发已满，请重试 |
| 503 | 上游繁忙，请重试 |
