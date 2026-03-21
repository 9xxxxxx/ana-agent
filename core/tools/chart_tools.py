"""
数据可视化图表工具。
支持多种图表类型，返回原始数据供前端 ECharts 渲染。
"""

import json
import pandas as pd
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
    "radar": "雷达图 - 适合多维度对比",
    "gauge": "仪表盘 - 适合展示单指标进度",
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
    """执行 SQL 查询并返回原始数据供前端可视化渲染。
    当用户需要观察趋势、分布、对比等可视化需求时调用此工具。

    参数:
        sql_query: 用于获取制图数据的 SQL 语句。
        chart_type: 图表类型，支持: 'bar'(柱状图), 'line'(折线图), 'pie'(饼图),
                    'scatter'(散点图), 'area'(面积图), 'histogram'(直方图),
                    'box'(箱线图), 'heatmap'(热力图), 'treemap'(矩形树图),
                    'funnel'(漏斗图), 'horizontal_bar'(水平柱状图),
                    'radar'(雷达图), 'gauge'(仪表盘)。
        title: 图表的标题（中文）。
        x_col: 数据中作为 X 轴（或饼图的 names）的列名。
        y_col: 数据中作为 Y 轴（或饼图的 values）的列名。
        color_col: （可选）用于分组/着色的列名，实现多系列图表。
        size_col: （可选）用于散点图气泡大小的列名。

    返回:
        包含原始数据的 JSON 字符串，前端将使用 ECharts 进行渲染。
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
        if len(df) > 1000:
            df = df.head(1000)
            title += " (前 1000 条)"

        # 构建返回数据结构
        result = {
            "type": "chart_data",
            "chartType": chart_type,
            "title": title,
            "xCol": x_col,
            "yCol": y_col,
            "colorCol": color_col,
            "sizeCol": size_col,
            "columns": list(df.columns),
            "data": df.to_dict(orient="records"),
            "summary": {
                "rowCount": len(df),
                "columns": len(df.columns),
            },
        }

        # 添加统计信息
        if y_col in df.columns:
            try:
                numeric_values = pd.to_numeric(df[y_col], errors="coerce")
                result["statistics"] = {
                    "min": float(numeric_values.min()) if not numeric_values.isna().all() else None,
                    "max": float(numeric_values.max()) if not numeric_values.isna().all() else None,
                    "mean": float(numeric_values.mean()) if not numeric_values.isna().all() else None,
                    "sum": float(numeric_values.sum()) if not numeric_values.isna().all() else None,
                }
            except Exception:
                pass

        # 序列化为 JSON
        # 使用更严格的 JSON 序列化，确保所有数据类型都能正确处理
        result_json = json.dumps(result, ensure_ascii=False, default=str, separators=(',', ':'))
        
        # 验证 JSON 格式是否正确
        try:
            json.loads(result_json)
        except json.JSONDecodeError as e:
            return f"图表数据生成错误: JSON 序列化失败 - {str(e)}"

        # 返回带有特殊标记的字符串，以便前端拦截和渲染
        return f"[CHART_DATA] {result_json}"

    except Exception as e:
        return f"图表数据获取错误: {str(e)}"


@tool
def get_raw_data(
    sql_query: str,
    limit: int = 100,
) -> str:
    """执行 SQL 查询并返回原始数据表格。
    当用户只需要查看数据而不需要可视化时使用。

    参数:
        sql_query: SQL 查询语句。
        limit: 返回的最大行数，默认 100。

    返回:
        包含原始数据的 JSON 字符串。
    """
    # 安全检查
    query_upper = sql_query.upper()
    for kw in ["DROP ", "DELETE ", "UPDATE ", "INSERT ", "ALTER ", "TRUNCATE "]:
        if kw in query_upper:
            return f"错误: 禁止执行含有 {kw.strip()} 的语句。"

    try:
        df = run_query_to_dataframe(sql_query)
        if df.empty:
            return "查询未返回任何数据。"

        # 限制数据量
        if len(df) > limit:
            df = df.head(limit)

        result = {
            "type": "raw_data",
            "columns": list(df.columns),
            "data": df.to_dict(orient="records"),
            "rowCount": len(df),
        }

        return json.dumps(result, ensure_ascii=False, default=str, separators=(',', ':'))

    except Exception as e:
        return f"数据获取错误: {str(e)}"
