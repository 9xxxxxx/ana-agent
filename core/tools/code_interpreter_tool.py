"""
Python Code Interpreter 工具。
让 Agent 能在安全沙盒中执行 Python 代码，完成超越 SQL 范畴的计算任务。
"""

import json
from langchain_core.tools import tool
from core.sandbox.executor import PythonSandbox


@tool
def run_python_code_tool(code: str) -> str:
    """
    在安全的 Python 沙盒中执行代码。适用于以下场景：
    - 统计建模与回归分析
    - 复杂数据变换与清洗（超出 SQL 能力范围）
    - 使用 matplotlib 生成自定义可视化图表
    - 蒙特卡洛模拟等数值计算
    - 数据格式转换与文本处理

    可用的库：pandas, numpy, matplotlib, scipy, sklearn, statistics, math, datetime, json, re, collections
    使用 print() 输出文本结果，使用 matplotlib 的 plt.show() 生成图表。

    Args:
        code: 要执行的 Python 代码字符串
    """
    sandbox = PythonSandbox(timeout=30)
    result = sandbox.execute(code)

    if not result.success:
        return f"❌ 代码执行失败:\n{result.error}"

    # 构建返回内容
    parts = []

    # 标准输出
    if result.stdout:
        parts.append(result.stdout)

    # 如果有图片，使用 [CODE_OUTPUT] 标记协议返回，便于前端解析
    if result.images:
        output_data = {
            "stdout": result.stdout,
            "images": result.images,
        }
        return f"[CODE_OUTPUT]{json.dumps(output_data, ensure_ascii=False)}"

    # 纯文本结果
    if parts:
        return "\n".join(parts)

    return "✅ 代码执行成功（无输出）"
