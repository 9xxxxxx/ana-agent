"""
通用工具集 - 提供Agent常用的辅助功能
包括：文件操作、数据转换、网络请求、代码执行等

挂载状态说明：
- 已挂载到主 Agent：calculate_tool, data_stats_tool
- 未挂载（保留备用）：format_number_tool, date_time_tool, text_analysis_tool,
  json_formatter_tool, hash_tool, base64_tool, regex_tool, generate_id_tool
"""

import os
import json
import base64
import hashlib
import re
from datetime import datetime, timedelta
from typing import Any, List, Dict, Optional
from langchain_core.tools import tool
import pandas as pd


@tool
def calculate_tool(expression: str) -> str:
    """执行数学计算表达式。
    支持基本数学运算、统计函数等。

    参数:
        expression: 数学表达式，例如 "(100 + 200) * 3" 或 "sum([1,2,3,4,5])"

    返回:
        计算结果
    """
    try:
        # 安全限制：只允许数学相关操作
        allowed_names = {
            'abs': abs, 'round': round, 'max': max, 'min': min,
            'sum': sum, 'len': len, 'pow': pow,
            'int': int, 'float': float,
        }

        # 清理表达式
        expression = expression.strip()

        # 编译并执行
        code = compile(expression, '<string>', 'eval')
        result = eval(code, {"__builtins__": {}}, allowed_names)

        return f"计算结果: {result}"
    except Exception as e:
        return f"计算错误: {str(e)}"


@tool
def format_number_tool(number: float, format_type: str = "auto", decimals: int = 2) -> str:
    """格式化数字显示。

    参数:
        number: 要格式化的数字
        format_type: 格式类型 - "auto"(自动), "percent"(百分比), "currency"(货币), "scientific"(科学计数)
        decimals: 小数位数

    返回:
        格式化后的字符串
    """
    try:
        if format_type == "percent":
            return f"{number * 100:.{decimals}f}%"
        elif format_type == "currency":
            return f"¥{number:,.{decimals}f}"
        elif format_type == "scientific":
            return f"{number:.{decimals}e}"
        else:  # auto
            if abs(number) >= 1_000_000_000:
                return f"{number/1_000_000_000:.{decimals}f}B"
            elif abs(number) >= 1_000_000:
                return f"{number/1_000_000:.{decimals}f}M"
            elif abs(number) >= 1_000:
                return f"{number/1_000:.{decimals}f}K"
            else:
                return f"{number:.{decimals}f}"
    except Exception as e:
        return f"格式化错误: {str(e)}"


@tool
def date_time_tool(action: str = "now", format_str: str = "%Y-%m-%d %H:%M:%S", **kwargs) -> str:
    """日期时间工具 - 获取当前时间、格式化、计算等。

    参数:
        action: 操作类型 - "now"(当前时间), "format"(格式化), "add"(加减时间), "diff"(计算差值)
        format_str: 日期格式字符串
        **kwargs: 额外参数
            - for "add": days, hours, minutes (要加减的时间)
            - for "diff": date1, date2 (要比较的两个日期字符串)
            - for "format": date (要格式化的日期字符串)

    返回:
        处理后的日期时间字符串
    """
    try:
        if action == "now":
            return datetime.now().strftime(format_str)

        elif action == "format":
            date_str = kwargs.get("date", "")
            for fmt in ["%Y-%m-%d %H:%M:%S", "%Y-%m-%d", "%d/%m/%Y", "%m/%d/%Y"]:
                try:
                    dt = datetime.strptime(date_str, fmt)
                    return dt.strftime(format_str)
                except:
                    continue
            return f"无法解析日期: {date_str}"

        elif action == "add":
            days = kwargs.get("days", 0)
            hours = kwargs.get("hours", 0)
            minutes = kwargs.get("minutes", 0)
            dt = datetime.now() + timedelta(days=days, hours=hours, minutes=minutes)
            return dt.strftime(format_str)

        elif action == "diff":
            date1_str = kwargs.get("date1", "")
            date2_str = kwargs.get("date2", "")
            dt1 = datetime.strptime(date1_str, "%Y-%m-%d %H:%M:%S")
            dt2 = datetime.strptime(date2_str, "%Y-%m-%d %H:%M:%S")
            diff = dt2 - dt1
            return f"时间差: {diff.days} 天, {diff.seconds // 3600} 小时, {(diff.seconds % 3600) // 60} 分钟"

        else:
            return f"未知的操作: {action}"

    except Exception as e:
        return f"日期处理错误: {str(e)}"


@tool
def data_stats_tool(data_json: str) -> str:
    """对JSON格式的数据进行统计分析。

    参数:
        data_json: JSON格式的数据数组，例如 '[{"value": 10}, {"value": 20}]'

    返回:
        统计结果摘要
    """
    try:
        data = json.loads(data_json)
        if not isinstance(data, list) or len(data) == 0:
            return "数据为空或格式不正确"

        df = pd.DataFrame(data)
        numeric_cols = df.select_dtypes(include=['number']).columns.tolist()

        if not numeric_cols:
            return "未找到数值列"

        result = []
        result.append(f"数据行数: {len(df)}")
        result.append(f"数值列: {', '.join(numeric_cols)}")
        result.append("")

        for col in numeric_cols:
            stats = df[col].describe()
            result.append(f"【{col}】")
            result.append(f"  平均值: {stats['mean']:.2f}")
            result.append(f"  中位数: {stats['50%']:.2f}")
            result.append(f"  最小值: {stats['min']:.2f}")
            result.append(f"  最大值: {stats['max']:.2f}")
            result.append(f"  标准差: {stats['std']:.2f}")
            result.append("")

        return "\n".join(result)

    except Exception as e:
        return f"统计分析错误: {str(e)}"


@tool
def text_analysis_tool(text: str, analysis_type: str = "basic") -> str:
    """文本分析工具。

    参数:
        text: 要分析的文本
        analysis_type: 分析类型 - "basic"(基础统计), "keywords"(关键词提取)

    返回:
        分析结果
    """
    try:
        if analysis_type == "basic":
            char_count = len(text)
            word_count = len(text.split())
            line_count = len(text.split('\n'))

            # 中文字符统计
            chinese_chars = len(re.findall(r'[\u4e00-\u9fff]', text))

            return f"""文本统计:
- 总字符数: {char_count}
- 词数(空格分隔): {word_count}
- 行数: {line_count}
- 中文字符: {chinese_chars}
- 英文单词: {word_count - chinese_chars}"""

        elif analysis_type == "keywords":
            # 简单的词频统计
            words = re.findall(r'\b\w+\b', text.lower())
            word_freq = {}
            for word in words:
                if len(word) > 2:  # 忽略短词
                    word_freq[word] = word_freq.get(word, 0) + 1

            # 排序取前10
            top_words = sorted(word_freq.items(), key=lambda x: x[1], reverse=True)[:10]

            result = ["高频词汇:"]
            for word, count in top_words:
                result.append(f"  {word}: {count}次")

            return "\n".join(result)

        else:
            return f"未知的分析类型: {analysis_type}"

    except Exception as e:
        return f"文本分析错误: {str(e)}"


@tool
def json_formatter_tool(json_str: str, sort_keys: bool = False) -> str:
    """JSON格式化工具 - 美化JSON字符串。

    参数:
        json_str: JSON字符串
        sort_keys: 是否按键排序

    返回:
        格式化后的JSON
    """
    try:
        data = json.loads(json_str)
        formatted = json.dumps(data, indent=2, ensure_ascii=False, sort_keys=sort_keys)
        return formatted
    except Exception as e:
        return f"JSON格式化错误: {str(e)}"


@tool
def hash_tool(data: str, algorithm: str = "md5") -> str:
    """计算数据的哈希值。

    参数:
        data: 要计算哈希的数据
        algorithm: 哈希算法 - "md5", "sha1", "sha256"

    返回:
        哈希值
    """
    try:
        data_bytes = data.encode('utf-8')

        if algorithm == "md5":
            return hashlib.md5(data_bytes).hexdigest()
        elif algorithm == "sha1":
            return hashlib.sha1(data_bytes).hexdigest()
        elif algorithm == "sha256":
            return hashlib.sha256(data_bytes).hexdigest()
        else:
            return f"不支持的算法: {algorithm}"
    except Exception as e:
        return f"哈希计算错误: {str(e)}"


@tool
def base64_tool(data: str, action: str = "encode") -> str:
    """Base64编码/解码工具。

    参数:
        data: 要处理的数据
        action: "encode" 或 "decode"

    返回:
        处理结果
    """
    try:
        if action == "encode":
            return base64.b64encode(data.encode('utf-8')).decode('utf-8')
        elif action == "decode":
            return base64.b64decode(data).decode('utf-8')
        else:
            return f"未知的操作: {action}"
    except Exception as e:
        return f"Base64处理错误: {str(e)}"


@tool
def regex_tool(pattern: str, text: str, action: str = "findall") -> str:
    """正则表达式工具。

    参数:
        pattern: 正则表达式模式
        text: 要匹配的文本
        action: 操作类型 - "findall"(查找所有), "match"(匹配开头), "replace"(替换)

    返回:
        匹配结果
    """
    try:
        if action == "findall":
            matches = re.findall(pattern, text)
            return f"找到 {len(matches)} 个匹配:\n" + "\n".join([str(m) for m in matches[:20]])

        elif action == "match":
            match = re.match(pattern, text)
            if match:
                return f"匹配成功: {match.group()}"
            return "未匹配"

        elif action == "replace":
            # 需要额外参数 replacement
            return "replace 操作需要额外的 replacement 参数"

        else:
            return f"未知的操作: {action}"

    except Exception as e:
        return f"正则表达式错误: {str(e)}"


@tool
def generate_id_tool(prefix: str = "", length: int = 8) -> str:
    """生成唯一ID。

    参数:
        prefix: ID前缀
        length: 随机部分长度

    返回:
        生成的ID
    """
    import random
    import string

    random_part = ''.join(random.choices(string.ascii_lowercase + string.digits, k=length))
    timestamp = datetime.now().strftime("%Y%m%d%H%M%S")

    if prefix:
        return f"{prefix}_{timestamp}_{random_part}"
    return f"{timestamp}_{random_part}"
