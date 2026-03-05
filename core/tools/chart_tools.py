"""
数据可视化图表工具。
支持多种图表类型，通过 Plotly 生成交互式图表并返回 JSON 供前端渲染。
"""

import json
import pandas as pd
import plotly.express as px
import plotly.graph_objects as go
from langchain_core.tools import tool
from core.database import run_query_to_dataframe

# 支持的图表类型说明
CHART_TYPES = {
    "bar": "柱状图 - 适合对比分类数据",
    "line": "折线图 - 适合展示趋势变化",
    "pie": "饼图 - 适合展示比例分布",
    "scatter": "散点图 - 适合展示两变量相关性",
    "area": "面积图 - 适合展示累计趋势",
    "histogram": "直方图 - 适合展示数值分布频率",
    "box": "箱线图 - 适合展示数据分布和异常值",
    "heatmap": "热力图 - 适合展示矩阵型数据的密度",
    "treemap": "矩形树图 - 适合展示层级占比",
    "funnel": "漏斗图 - 适合展示转化率/流程衰减",
    "horizontal_bar": "水平柱状图 - 适合标签过长的分类对比",
}


@tool
def create_chart_tool(
    sql_query: str,
    chart_type: str,
    title: str,
    x_col: str,
    y_col: str,
    color_col: str = None,
    size_col: str = None,
) -> str:
    """执行 SQL 查询并生成交互式数据可视化图表。
    当用户需要观察趋势、分布、对比等可视化需求时调用此工具。

    参数:
        sql_query: 用于获取制图数据的 SQL 语句。
        chart_type: 图表类型，支持: 'bar'(柱状图), 'line'(折线图), 'pie'(饼图),
                    'scatter'(散点图), 'area'(面积图), 'histogram'(直方图),
                    'box'(箱线图), 'heatmap'(热力图), 'treemap'(矩形树图),
                    'funnel'(漏斗图), 'horizontal_bar'(水平柱状图)。
        title: 图表的标题（中文）。
        x_col: 数据中作为 X 轴（或饼图的 names / treemap 的 path）的列名。
        y_col: 数据中作为 Y 轴（或饼图的 values / treemap 的 values）的列名。
        color_col: （可选）用于分组/着色的列名，实现多系列图表。
        size_col: （可选）用于散点图气泡大小的列名。

    返回:
        图表的 JSON 序列化字符串，前端将自动渲染该字符串为交互式图表。
    """
    # 安全检查
    query_upper = sql_query.upper()
    for kw in ["DROP ", "DELETE ", "UPDATE ", "INSERT ", "ALTER ", "TRUNCATE "]:
        if kw in query_upper:
            return f"错误: 禁止执行含有 {kw.strip()} 的语句。"

    if chart_type not in CHART_TYPES:
        supported = "\n".join([f"  - {k}: {v}" for k, v in CHART_TYPES.items()])
        return f"错误: 不支持的图表类型 '{chart_type}'。支持的类型有:\n{supported}"

    try:
        # 获取数据
        df = run_query_to_dataframe(sql_query)
        if df.empty:
            return "错误: 查询未返回任何数据，无法生成图表。"

        # 列名模糊匹配（忽略大小写）
        actual_cols = list(df.columns)
        actual_cols_lower = [c.lower() for c in actual_cols]

        def _fix_col(col_name):
            """修正列名大小写"""
            if col_name in actual_cols:
                return col_name
            if col_name.lower() in actual_cols_lower:
                return actual_cols[actual_cols_lower.index(col_name.lower())]
            return None

        x_col_fixed = _fix_col(x_col)
        if not x_col_fixed:
            return f"错误: X 轴列 '{x_col}' 在查询结果中不存在。可用列: {actual_cols}。请在 SQL 中使用 AS 别名。"
        x_col = x_col_fixed

        y_col_fixed = _fix_col(y_col)
        if not y_col_fixed:
            return f"错误: Y 轴列 '{y_col}' 在查询结果中不存在。可用列: {actual_cols}。请在 SQL 中使用 AS 别名。"
        y_col = y_col_fixed

        if color_col:
            color_col = _fix_col(color_col) or color_col
        if size_col:
            size_col = _fix_col(size_col) or size_col

        # 限制数据量防止前端卡死
        if len(df) > 500:
            df = df.head(500)
            title += " (前 500 条)"

        # 通用参数
        template = "plotly_dark"
        color_args = {"color": color_col} if color_col and color_col in df.columns else {}

        # 根据类型生成 Plotly 图表
        if chart_type == "bar":
            fig = px.bar(df, x=x_col, y=y_col, title=title, template=template, **color_args)
        elif chart_type == "horizontal_bar":
            fig = px.bar(df, x=y_col, y=x_col, title=title, template=template, orientation="h", **color_args)
        elif chart_type == "line":
            fig = px.line(df, x=x_col, y=y_col, title=title, template=template, markers=True, **color_args)
        elif chart_type == "area":
            fig = px.area(df, x=x_col, y=y_col, title=title, template=template, **color_args)
        elif chart_type == "pie":
            fig = px.pie(df, names=x_col, values=y_col, title=title, template=template)
        elif chart_type == "scatter":
            scatter_args = {}
            if size_col and size_col in df.columns:
                scatter_args["size"] = size_col
            fig = px.scatter(df, x=x_col, y=y_col, title=title, template=template, **color_args, **scatter_args)
        elif chart_type == "histogram":
            fig = px.histogram(df, x=x_col, title=title, template=template, **color_args)
        elif chart_type == "box":
            fig = px.box(df, x=x_col, y=y_col, title=title, template=template, **color_args)
        elif chart_type == "treemap":
            fig = px.treemap(df, path=[x_col], values=y_col, title=title, template=template)
        elif chart_type == "funnel":
            fig = px.funnel(df, x=y_col, y=x_col, title=title, template=template)
        elif chart_type == "heatmap":
            # 热力图需要 pivot 处理
            try:
                if color_col and color_col in df.columns:
                    pivot_df = df.pivot_table(index=x_col, columns=color_col, values=y_col, aggfunc="sum").fillna(0)
                else:
                    pivot_df = df.set_index(x_col)[[y_col]]
                fig = go.Figure(data=go.Heatmap(
                    z=pivot_df.values,
                    x=list(pivot_df.columns),
                    y=list(pivot_df.index),
                    colorscale="Viridis"
                ))
                fig.update_layout(title=title, template=template)
            except Exception as e:
                return f"热力图生成失败 (数据可能不适合热力图格式): {str(e)}"
        else:
            return f"错误: 不支持的图表类型 '{chart_type}'。"

        # 美化图表布局
        fig.update_layout(
            margin=dict(l=40, r=40, t=60, b=40),
            title_x=0.5,
            font=dict(size=12),
        )

        # 序列化为 JSON
        fig_json = fig.to_json()

        # 返回带有特殊标记的字符串，以便 app.py 拦截和渲染
        return f"[PLOTLY_CHART] {fig_json}"

    except Exception as e:
        return f"图表生成错误: {str(e)}"
