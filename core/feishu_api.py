"""
飞书 API 工具模块。
封装飞书 Open API 的认证、图片上传等核心能力，
为通知工具提供图表图片嵌入卡片的底层支持。
"""

import json
import io
import urllib.request
from datetime import datetime, timedelta
from core.config import settings


class FeishuClient:
    """飞书 API 客户端，负责 token 管理和图片上传"""

    # 飞书开放平台 API 基地址
    BASE_URL = "https://open.feishu.cn/open-apis"

    def __init__(self):
        self._token = None
        self._token_expires_at = None

    def _get_tenant_access_token(self) -> str:
        """
        获取 tenant_access_token（自动缓存，过期前自动刷新）。
        需要在 .env 中配置 FEISHU_APP_ID 和 FEISHU_APP_SECRET。
        """
        # 检查缓存的 token 是否仍然有效
        if self._token and self._token_expires_at and datetime.now() < self._token_expires_at:
            return self._token

        app_id = settings.FEISHU_APP_ID
        app_secret = settings.FEISHU_APP_SECRET
        if not app_id or not app_secret:
            raise ValueError(
                "未配置飞书应用凭证。请在 .env 中添加:\n"
                "  FEISHU_APP_ID=cli_xxxxxxx\n"
                "  FEISHU_APP_SECRET=xxxxxxx\n"
                "获取方式: https://open.feishu.cn → 创建企业自建应用 → 凭证与基础信息"
            )

        url = f"{self.BASE_URL}/auth/v3/tenant_access_token/internal"
        payload = json.dumps({
            "app_id": app_id,
            "app_secret": app_secret,
        }).encode("utf-8")

        req = urllib.request.Request(url, data=payload)
        req.add_header("Content-Type", "application/json; charset=utf-8")

        with urllib.request.urlopen(req) as response:
            result = json.loads(response.read().decode("utf-8"))

        if result.get("code") != 0:
            raise RuntimeError(f"获取飞书 token 失败: {result.get('msg', '未知错误')}")

        self._token = result["tenant_access_token"]
        # token 有效期一般为 2 小时，提前 5 分钟刷新
        expire_seconds = result.get("expire", 7200)
        self._token_expires_at = datetime.now() + timedelta(seconds=expire_seconds - 300)

        return self._token

    def upload_image(self, image_bytes: bytes) -> str:
        """
        上传图片到飞书，返回 image_key。
        图片将用于卡片消息中的 img 元素。

        参数:
            image_bytes: PNG 格式的图片二进制数据
        返回:
            飞书返回的 image_key 字符串
        """
        token = self._get_tenant_access_token()
        url = f"{self.BASE_URL}/im/v1/images"

        # 构建 multipart/form-data 请求体
        boundary = "----FeishuImageUploadBoundary"
        body = io.BytesIO()

        # image_type 字段
        body.write(f"--{boundary}\r\n".encode())
        body.write(b'Content-Disposition: form-data; name="image_type"\r\n\r\n')
        body.write(b"message\r\n")

        # image 文件字段
        body.write(f"--{boundary}\r\n".encode())
        body.write(b'Content-Disposition: form-data; name="image"; filename="chart.png"\r\n')
        body.write(b"Content-Type: image/png\r\n\r\n")
        body.write(image_bytes)
        body.write(b"\r\n")

        body.write(f"--{boundary}--\r\n".encode())

        req = urllib.request.Request(url, data=body.getvalue())
        req.add_header("Authorization", f"Bearer {token}")
        req.add_header("Content-Type", f"multipart/form-data; boundary={boundary}")

        with urllib.request.urlopen(req) as response:
            result = json.loads(response.read().decode("utf-8"))

        if result.get("code") != 0:
            raise RuntimeError(f"飞书图片上传失败: {result.get('msg', '未知错误')}")

        return result["data"]["image_key"]


def plotly_fig_to_png(fig_json_str: str) -> bytes:
    """
    将 Plotly 图表 JSON 转换为 PNG 图片字节。

    参数:
        fig_json_str: Plotly 图表的 JSON 字符串
    返回:
        PNG 格式的图片字节
    """
    import plotly.io as pio

    fig = pio.from_json(fig_json_str)

    # 调整图表尺寸以适配飞书卡片显示
    fig.update_layout(
        width=800,
        height=500,
        margin=dict(l=50, r=50, t=60, b=50),
        font=dict(size=14),
    )

    return fig.to_image(format="png", scale=2)


def build_feishu_card_with_charts(
    title: str,
    content: str,
    image_keys: list[str] = None,
) -> dict:
    """
    构建包含文本和图表图片的飞书交互式卡片。

    参数:
        title: 卡片标题
        content: 分析文本内容（支持飞书 Markdown 语法）
        image_keys: 飞书图片 key 列表（通过 upload_image 获得）
    返回:
        飞书卡片 JSON 结构
    """
    elements = []

    # 分析文本
    elements.append({
        "tag": "div",
        "text": {
            "tag": "lark_md",
            "content": content
        }
    })

    # 如果有图表图片，逐个嵌入
    if image_keys:
        elements.append({"tag": "hr"})
        elements.append({
            "tag": "div",
            "text": {
                "tag": "lark_md",
                "content": "📊 **数据可视化**"
            }
        })
        for i, key in enumerate(image_keys):
            elements.append({
                "tag": "img",
                "img_key": key,
                "alt": {
                    "tag": "plain_text",
                    "content": f"数据图表 {i + 1}"
                },
                "mode": "fit_horizontal",
            })

    # 底部时间戳
    elements.append({"tag": "hr"})
    elements.append({
        "tag": "note",
        "elements": [
            {
                "tag": "plain_text",
                "content": f"由 SQL Agent 自动生成 | {datetime.now().strftime('%Y-%m-%d %H:%M')}"
            }
        ]
    })

    return {
        "msg_type": "interactive",
        "card": {
            "header": {
                "title": {
                    "tag": "plain_text",
                    "content": title
                },
                "template": "blue"
            },
            "elements": elements
        }
    }


# 全局飞书客户端实例（复用 token 缓存）
feishu_client = FeishuClient()
