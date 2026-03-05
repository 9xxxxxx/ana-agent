"""
飞书 API 工具模块。
封装飞书卡片构建能力，使用飞书原生 VChart 图表组件（非图片方式），
直接在卡片中嵌入交互式图表。
"""

import json
from datetime import datetime
from core.config import settings


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


def build_feishu_card_with_charts(
    title: str,
    content: str,
    chart_elements: list[dict] = None,
) -> dict:
    """
    构建包含文本和原生 VChart 图表的飞书交互式卡片。

    参数:
        title: 卡片标题
        content: 分析文本内容（支持飞书 lark_md 语法）
        chart_elements: VChart 图表元素列表，每个元素为 {"chart_spec": {...}, "aspect_ratio": "16:9"} 格式
    返回:
        飞书卡片 JSON 结构（可直接作为 Webhook 的 payload）
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

    # 如果有图表，逐个嵌入为原生 chart 组件
    if chart_elements:
        elements.append({"tag": "hr"})
        elements.append({
            "tag": "div",
            "text": {
                "tag": "lark_md",
                "content": "📊 **数据可视化**"
            }
        })
        for chart_el in chart_elements:
            elements.append({
                "tag": "chart",
                "chart_spec": chart_el["chart_spec"],
                "aspect_ratio": chart_el.get("aspect_ratio", "16:9"),
                "color_theme": chart_el.get("color_theme", "brand"),
                "height": "auto",
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
