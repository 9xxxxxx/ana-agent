import json
import pandas as pd
import plotly.express as px
from langchain_core.tools import tool
from core.database import run_query_to_dataframe

@tool
def create_chart_tool(sql_query: str, chart_type: str, title: str, x_col: str, y_col: str) -> str:
    """执行 SQL 查询并生成交互式数据可视化图表。
    当用户需要观察趋势、分布、对比等可视化需求时调用此工具。
    
    参数:
        sql_query: 用于获取制图数据的 SQL 语句。返回的数据将被用于作图。
        chart_type: 图表类型，支持: 'bar' (柱状图), 'line' (折线图), 'pie' (饼图), 'scatter' (散点图)。
        title: 图表的标题。
        x_col: 数据中作为 X 轴（或者饼图中的 names）的列名。
        y_col: 数据中作为 Y 轴（或者饼图中的 values）的列名。
        
    返回:
        图表的 JSON 序列化字符串，前端将自动渲染该字符串为交互式图表。
    """
    if "DROP " in sql_query.upper() or "DELETE " in sql_query.upper() or "UPDATE " in sql_query.upper():
        return "Error: Read-only queries are allowed."
        
    try:
        # 获取数据
        df = run_query_to_dataframe(sql_query)
        if df.empty:
            return "Error: Query returned no data."
            
        # 确保选定的列存在
        if x_col not in df.columns or y_col not in df.columns:
            return f"Error: Columns '{x_col}' or '{y_col}' not found in query results. Available columns: {list(df.columns)}"

        # 限制数据量防止前端卡死 (如果数据量很大，建议使用 TOP N)
        if len(df) > 500:
            df = df.head(500)
            title += " (Top 500 records)"
            
        # 根据类型生成 Plotly 图表
        # 应用 "plotly_dark" 模板以匹配 Chainlit 默认的暗色 UI，并美化视觉效果
        template = "plotly_dark"
        
        if chart_type == 'bar':
            fig = px.bar(df, x=x_col, y=y_col, title=title, template=template)
        elif chart_type == 'line':
            fig = px.line(df, x=x_col, y=y_col, title=title, template=template)
        elif chart_type == 'pie':
            fig = px.pie(df, names=x_col, values=y_col, title=title, template=template)
        elif chart_type == 'scatter':
            fig = px.scatter(df, x=x_col, y=y_col, title=title, template=template)
        else:
            return f"Error: Unsupported chart type '{chart_type}'."
            
        # 美化图表布局
        fig.update_layout(
            margin=dict(l=40, r=40, t=60, b=40),
            title_x=0.5, # 标题居中
        )

        # 序列化为 JSON
        fig_json = fig.to_json()
        
        # 返回带有特殊标记的字符串，以便 app.py 拦截和渲染
        return f"[PLOTLY_CHART] {fig_json}"
        
    except Exception as e:
        return f"Chart generation error: {str(e)}"
