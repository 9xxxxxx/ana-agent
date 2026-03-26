"""
飞书 API 工具模块。
封装飞书卡片构建能力，使用飞书原生 VChart 图表组件（非图片方式），
直接在卡片中嵌入交互式图表。
"""

import json
import urllib.request
import urllib.error
import io
import socket
import time
from datetime import datetime, timedelta
from core.config import settings


DEFAULT_REQUEST_TIMEOUT_SECONDS = 10
DEFAULT_MAX_RETRIES = 2
RETRYABLE_HTTP_STATUS = {429, 500, 502, 503, 504}


def _request_json_with_retry(
    req: urllib.request.Request,
    *,
    timeout: int = DEFAULT_REQUEST_TIMEOUT_SECONDS,
    max_retries: int = DEFAULT_MAX_RETRIES,
) -> dict:
    """发送 HTTP 请求并解析 JSON，遇到可恢复错误时自动重试。"""
    for attempt in range(max_retries + 1):
        try:
            with urllib.request.urlopen(req, timeout=timeout) as response:
                return json.loads(response.read().decode("utf-8"))
        except urllib.error.HTTPError as exc:
            is_retryable = exc.code in RETRYABLE_HTTP_STATUS
            if attempt >= max_retries or not is_retryable:
                raise
        except (urllib.error.URLError, TimeoutError, socket.timeout):
            if attempt >= max_retries:
                raise
        time.sleep(0.5 * (2 ** attempt))


class FeishuClient:
    """飞书 API 客户端，负责 token 管理和图片上传"""
    BASE_URL = "https://open.feishu.cn/open-apis"

    def __init__(self):
        self._token = None
        self._token_expires_at = None

    def _get_tenant_access_token(self) -> str:
        if self._token and self._token_expires_at and datetime.now() < self._token_expires_at:
            return self._token

        app_id = settings.FEISHU_APP_ID
        app_secret = settings.FEISHU_APP_SECRET
        if not app_id or not app_secret:
            raise ValueError("未配置飞书应用凭证(FEISHU_APP_ID/FEISHU_APP_SECRET)，无法上传图片。")

        url = f"{self.BASE_URL}/auth/v3/tenant_access_token/internal"
        payload = json.dumps({"app_id": app_id, "app_secret": app_secret}).encode("utf-8")
        req = urllib.request.Request(url, data=payload)
        req.add_header("Content-Type", "application/json; charset=utf-8")

        result = _request_json_with_retry(req)

        if result.get("code") != 0:
            raise RuntimeError(f"获取飞书 token 失败: {result.get('msg', '未知错误')}")

        self._token = result["tenant_access_token"]
        expire_seconds = result.get("expire", 7200)
        self._token_expires_at = datetime.now() + timedelta(seconds=expire_seconds - 300)
        return self._token

    def upload_image(self, image_data: bytes) -> str:
        """上传图片到飞书，返回 image_key。"""
        token = self._get_tenant_access_token()
        url = f"{self.BASE_URL}/im/v1/images"
        boundary = "----FeishuImageUploadBoundary"
        body = io.BytesIO()

        # image_type
        body.write(f"--{boundary}\r\n".encode())
        body.write(b'Content-Disposition: form-data; name="image_type"\r\n\r\n')
        body.write(b"message\r\n")

        # image
        body.write(f"--{boundary}\r\n".encode())
        body.write(b'Content-Disposition: form-data; name="image"; filename="upload.png"\r\n')
        body.write(b"Content-Type: application/octet-stream\r\n\r\n")
        body.write(image_data)
        body.write(b"\r\n")
        body.write(f"--{boundary}--\r\n".encode())

        req = urllib.request.Request(url, data=body.getvalue())
        req.add_header("Authorization", f"Bearer {token}")
        req.add_header("Content-Type", f"multipart/form-data; boundary={boundary}")

        result = _request_json_with_retry(req)

        if result.get("code") != 0:
            raise RuntimeError(f"图片上传失败: {result.get('msg', '未知错误')}")
        return result["data"]["image_key"]

feishu_client = FeishuClient()


def _build_vchart_spec(chart_type: str, data_records: list[dict], x_col: str, y_col: str,
                       title: str = "", color_col: str = None) -> dict:
    """
    将 SQL 查询结果和图表配置转换为 VChart spec（飞书卡片原生图表规范）。

    参数:
        chart_type: 图表类型 (bar/line/pie/scatter/area/horizontal_bar)
        data_records: 数据记录列表，每个元素为一行数据的字典
        x_col: X 轴字段名
        y_col: Y 轴字段名
        title: 图表标题
        color_col: (可选) 分组/分色字段名
    返回:
        VChart spec 字典
    """
    base_data = {"values": data_records}

    # 通用标题配置
    title_config = {"text": title, "visible": bool(title)}

    # 通用图例配置
    legends_config = {"visible": bool(color_col), "orient": "bottom"}

    if chart_type == "pie":
        # 饼图使用 valueField + categoryField
        spec = {
            "type": "pie",
            "data": [base_data],
            "valueField": y_col,
            "categoryField": x_col,
            "outerRadius": 0.8,
            "innerRadius": 0.5,  # 环形图更美观
            "label": {
                "visible": True,
                "position": "outside",
            },
            "title": title_config,
            "legends": {"visible": True, "orient": "bottom"},
        }
    elif chart_type == "line":
        spec = {
            "type": "line",
            "data": [base_data],
            "xField": x_col,
            "yField": y_col,
            "point": {"visible": True},
            "title": title_config,
            "legends": legends_config,
        }
        if color_col:
            spec["seriesField"] = color_col
    elif chart_type == "area":
        spec = {
            "type": "area",
            "data": [base_data],
            "xField": x_col,
            "yField": y_col,
            "point": {"visible": True},
            "title": title_config,
            "legends": legends_config,
        }
        if color_col:
            spec["seriesField"] = color_col
    elif chart_type == "scatter":
        spec = {
            "type": "scatter",
            "data": [base_data],
            "xField": x_col,
            "yField": y_col,
            "title": title_config,
            "legends": legends_config,
        }
        if color_col:
            spec["seriesField"] = color_col
    elif chart_type == "horizontal_bar":
        # 水平柱状图：交换 x/y 并设置 direction
        spec = {
            "type": "bar",
            "data": [base_data],
            "xField": y_col,
            "yField": x_col,
            "direction": "horizontal",
            "title": title_config,
            "legends": legends_config,
        }
        if color_col:
            spec["seriesField"] = color_col
    else:
        # 默认柱状图 (bar)
        spec = {
            "type": "bar",
            "data": [base_data],
            "xField": x_col,
            "yField": y_col,
            "title": title_config,
            "legends": legends_config,
        }
        if color_col:
            spec["seriesField"] = color_col
            spec["xField"] = [x_col, color_col]

    return spec


def build_feishu_card_v2(
    title: str,
    elements: list[dict],
) -> dict:
    """
    构建符合飞书卡片 JSON 2.0 规范的交互式卡片。

    参数:
        title: 卡片标题
        elements: 卡片 V2 组件列表（如 markdown, chart, table, note 等）
    返回:
        飞书卡片 JSON 结构（可直接作为 Webhook 的 payload）
    """
    # 复制一份，避免修改调用方传入的组件列表
    body_elements = list(elements or [])

    # 底部时间戳
    body_elements.append({"tag": "hr"})
    body_elements.append({
        "tag": "markdown",
        "content": f"<font color='grey'>由 SQL Agent 自动生成 | {datetime.now().strftime('%Y-%m-%d %H:%M')}</font>"
    })

    return {
        "msg_type": "interactive",
        "card": {
            "schema": "2.0",
            "header": {
                "title": {
                    "tag": "plain_text",
                    "content": title
                },
                "template": "blue"
            },
            "body": {
                "elements": body_elements
            }
        }
    }

def send_feishu_card(webhook_url: str, card_payload: dict) -> dict:
    """通过 Webhook 发送飞书卡片"""
    if not webhook_url:
        message = "未配置 FEISHU_WEBHOOK_URL，跳过通知。"
        print(message)
        return {"ok": False, "msg": message}
    
    # 飞书官方 V2 卡片要求最外层是 msg_type: "interactive" 且包含 "card"
    payload = json.dumps(card_payload).encode("utf-8")
    req = urllib.request.Request(webhook_url, data=payload)
    req.add_header("Content-Type", "application/json; charset=utf-8")

    try:
        result = _request_json_with_retry(req)
        if result.get("code") != 0:
            message = f"发送飞书卡片失败: {result.get('msg', '未知错误')}"
            print(message)
            return {"ok": False, "msg": message, "response": result}
        print("飞书卡片发送成功")
        return {"ok": True, "msg": "success", "response": result}
    except Exception as e:
        message = f"发送飞书卡片遇到网络异常: {e}"
        print(message)
        return {"ok": False, "msg": message}
