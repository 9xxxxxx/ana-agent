"""
报告导出 & 消息通知工具集。
支持将分析报告导出为 MD / CSV / XLSX 文件，并通过飞书 Webhook 或邮件发送。
"""

import os
import json
import urllib.request
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from datetime import datetime
from langchain_core.tools import tool
from core.config import settings


@tool
def export_report_tool(report_content: str, filename: str = None, export_format: str = "md") -> str:
    """导出分析报告为文件。
    当用户要求下载报告、保存分析结果时调用此工具。
    你必须将之前对话中已经生成的分析内容直接传入 report_content，禁止重新执行 SQL 查询。

    参数:
        report_content: 欲导出的报告内容（Markdown 格式的完整报告正文）。
        filename: （可选）导出的文件名（不含扩展名），默认按时间自动生成。
        export_format: 导出格式，支持 'md'（Markdown，默认）/ 'txt'（纯文本）。

    返回:
        导出结果和文件路径。
    """
    try:
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        if not filename:
            filename = f"report_{timestamp}"

        # 确定文件扩展名
        ext_map = {"md": ".md", "txt": ".txt"}
        ext = ext_map.get(export_format, ".md")
        full_filename = f"{filename}{ext}"

        reports_dir = os.path.join(os.getcwd(), "reports")
        os.makedirs(reports_dir, exist_ok=True)

        file_path = os.path.join(reports_dir, full_filename)
        with open(file_path, "w", encoding="utf-8") as f:
            f.write(report_content)

        # 通过 Chainlit 的文件元素发送给用户下载
        try:
            import chainlit as cl
            elements = [
                cl.File(name=full_filename, path=file_path, display="inline")
            ]
            # 使用异步方式发送文件消息
            import asyncio
            loop = asyncio.get_event_loop()
            if loop.is_running():
                asyncio.ensure_future(
                    cl.Message(
                        content=f"📄 报告已生成，点击下方文件即可下载：",
                        elements=elements
                    ).send()
                )
        except Exception:
            pass  # 非 Chainlit 环境下静默跳过

        return f"报告已成功导出至: {file_path}"
    except Exception as e:
        return f"导出报告失败: {str(e)}"


@tool
def export_data_tool(sql_query: str, filename: str = None, export_format: str = "csv") -> str:
    """将 SQL 查询结果直接导出为数据文件（CSV 或 Excel）。
    当用户要求"导出数据"、"下载查询结果"时调用此工具。
    与 export_report_tool 不同，此工具直接导出原始查询数据而非文字报告。

    参数:
        sql_query: 用于获取数据的 SQL 查询语句。
        filename: （可选）导出的文件名（不含扩展名），默认按时间自动生成。
        export_format: 导出格式，支持 'csv'（默认）/ 'xlsx'（Excel）。

    返回:
        导出结果和文件路径。
    """
    from core.database import run_query_to_dataframe

    # 安全检查
    query_upper = sql_query.upper()
    for kw in ["DROP ", "DELETE ", "UPDATE ", "INSERT ", "ALTER ", "TRUNCATE "]:
        if kw in query_upper:
            return f"错误: 禁止执行含有 {kw.strip()} 的语句。"

    try:
        df = run_query_to_dataframe(sql_query)
        if df.empty:
            return "查询未返回数据，无法导出。"

        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        if not filename:
            filename = f"data_export_{timestamp}"

        reports_dir = os.path.join(os.getcwd(), "reports")
        os.makedirs(reports_dir, exist_ok=True)

        if export_format == "xlsx":
            file_path = os.path.join(reports_dir, f"{filename}.xlsx")
            df.to_excel(file_path, index=False, engine="openpyxl")
        else:
            file_path = os.path.join(reports_dir, f"{filename}.csv")
            df.to_csv(file_path, index=False, encoding="utf-8-sig")

        # 通过 Chainlit 发送文件下载链接
        try:
            import chainlit as cl
            import asyncio
            actual_filename = os.path.basename(file_path)
            elements = [cl.File(name=actual_filename, path=file_path, display="inline")]
            loop = asyncio.get_event_loop()
            if loop.is_running():
                asyncio.ensure_future(
                    cl.Message(
                        content=f"📊 数据已导出（{len(df)} 行），点击下方文件即可下载：",
                        elements=elements
                    ).send()
                )
        except Exception:
            pass

        return f"数据已成功导出至: {file_path}（共 {len(df)} 行 x {len(df.columns)} 列）"
    except Exception as e:
        return f"导出数据失败: {str(e)}"


@tool
def send_feishu_notification_tool(content: str, chart_configs_json: str = None, table_configs_json: str = None) -> str:
    """向飞书群组发送带原生图表和表格的业务分析卡片（基于飞书 JSON 2.0 规范）。
    当用户说"发给飞书"、"通知团队"、"推送到群"时调用。
    你必须使用之前对话中已有的分析结论，提炼核心要点后发送，禁止重新执行 SQL 查询。

    飞书卡片支持原生 VChart 图表组件和原生 Table 组件（非图片）。
    如果分析中生成了图表或你想展示明细数据，可以传入配置：

    参数:
        content: 要发送的核心分析结论（飞书 Markdown 格式）。需精练概括，避免过长。
        chart_configs_json: （可选）图表配置的 JSON 字符串。格式为数组，每个元素包含:
            - sql_query: 获取数据的 SQL
            - chart_type: 图表类型 (bar/line/pie/scatter/area/horizontal_bar)
            - title: 图表标题
            - x_col: X 轴列名（饼图中为分类列）
            - y_col: Y 轴列名（饼图中为数值列）
            - color_col: (可选) 分组/着色列名
        table_configs_json: （可选）表格配置的 JSON 字符串。格式为数组，每个元素包含:
            - sql_query: 获取数据的 SQL
            - title: 表格标题
    """
    webhook_url = settings.FEISHU_WEBHOOK_URL
    if not webhook_url:
        return (
            "发送失败: 未配置飞书 Webhook。\n"
            "请在 .env 文件中添加: FEISHU_WEBHOOK_URL=https://open.feishu.cn/open-apis/bot/v2/hook/xxxxx\n"
            "获取方式: 飞书群 → 设置 → 群机器人 → 添加自定义机器人 → 复制 Webhook 地址"
        )

    card_elements = []
    generation_notes = []

    # 1. 主体 Markdown 文本内容
    card_elements.append({
        "tag": "markdown",
        "content": content
    })

    # 2. 如果有图表配置，构建 VChart 组件
    if chart_configs_json:
        try:
            chart_configs = json.loads(chart_configs_json)
        except json.JSONDecodeError:
            chart_configs = []
            generation_notes.append("⚠️ 图表配置 JSON 解析失败。")

        if chart_configs:
            from core.feishu_api import _build_vchart_spec
            from core.database import run_query_to_dataframe

            card_elements.append({"tag": "hr"})
            card_elements.append({
                "tag": "markdown",
                "content": "📊 **数据可视化**"
            })

            for i, cfg in enumerate(chart_configs):
                try:
                    sql = cfg.get("sql_query", "")
                    chart_type = cfg.get("chart_type", "bar")
                    title = cfg.get("title", f"图表 {i+1}")
                    x_col = cfg.get("x_col", "")
                    y_col = cfg.get("y_col", "")
                    color_col = cfg.get("color_col")

                    df = run_query_to_dataframe(sql)
                    if df.empty:
                        generation_notes.append(f"图表 '{title}' 查询无数据，已跳过。")
                        continue

                    if len(df) > 200:
                        df = df.head(200)

                    data_records = df.to_dict(orient="records")
                    vchart_spec = _build_vchart_spec(
                        chart_type=chart_type,
                        data_records=data_records,
                        x_col=x_col,
                        y_col=y_col,
                        title=title,
                        color_col=color_col,
                    )

                    card_elements.append({
                        "tag": "chart",
                        "chart_spec": vchart_spec,
                        "aspect_ratio": "16:9"
                    })

                except Exception as e:
                    generation_notes.append(f"图表 '{cfg.get('title', i)}' 构建失败: {str(e)}")

    # 3. 如果有表格配置，构建原生 Table 组件
    if table_configs_json:
        try:
            table_configs = json.loads(table_configs_json)
        except json.JSONDecodeError:
            table_configs = []
            generation_notes.append("⚠️ 表格配置 JSON 解析失败。")

        if table_configs:
            from core.database import run_query_to_dataframe
            
            card_elements.append({"tag": "hr"})
            card_elements.append({
                "tag": "markdown",
                "content": "📋 **数据明细**"
            })

            for i, cfg in enumerate(table_configs):
                try:
                    sql = cfg.get("sql_query", "")
                    title = cfg.get("title", f"表格 {i+1}")

                    df = run_query_to_dataframe(sql)
                    if df.empty:
                        generation_notes.append(f"表格 '{title}' 查询无数据，已跳过。")
                        continue

                    # 限制表格数据量，避免卡片过大
                    if len(df) > 50:
                        df = df.head(50)
                        generation_notes.append(f"表格 '{title}' 数据量过大，仅截取前 50 行展示。")

                    # 构建 v2 table 结构
                    columns = []
                    for col in df.columns:
                        columns.append({
                            "name": str(col),
                            "display_name": str(col),
                            "data_type": "text"
                        })
                    
                    # 将 DataFrame 每列转换为 string 保证兼容性
                    df_str = df.astype(str)
                    rows = df_str.to_dict(orient="records")

                    if title:
                        card_elements.append({
                            "tag": "markdown",
                            "content": f"**{title}**"
                        })
                        
                    card_elements.append({
                        "tag": "table",
                        "page_size": 10,  # 飞书原生表格支持翻页
                        "row_height": "low",
                        "header_style": {
                            "text_size": "normal",
                            "background_style": "grey",
                            "text_color": "default",
                            "bold": True
                        },
                        "columns": columns,
                        "rows": rows
                    })

                except Exception as e:
                    generation_notes.append(f"表格 '{cfg.get('title', i)}' 构建失败: {str(e)}")

    # 追加报错/警告提示
    if generation_notes:
        card_elements.append({"tag": "hr"})
        card_elements.append({
            "tag": "markdown",
            "content": "\n".join(generation_notes)
        })

    try:
        from core.feishu_api import build_feishu_card_v2

        payload = build_feishu_card_v2(
            title="📊 SQL Agent 数据通报",
            elements=card_elements
        )

        data = json.dumps(payload, ensure_ascii=False, default=str).encode("utf-8")
        req = urllib.request.Request(webhook_url, data=data)
        req.add_header("Content-Type", "application/json")

        with urllib.request.urlopen(req) as response:
            resp_body = json.loads(response.read().decode("utf-8"))
            if response.status == 200 and resp_body.get("code", -1) == 0:
                visual_info = []
                if chart_configs_json: visual_info.append("图表")
                if table_configs_json: visual_info.append("表格")
                visual_desc = f"（含 {'/'.join(visual_info)}）" if visual_info else "（纯文本）"
                return f"✅ 已成功推送到飞书群组！{visual_desc}"
            else:
                return f"推送可能失败，飞书返回: {resp_body}"
    except Exception as e:
        return f"发送飞书通知异常: {str(e)}"


@tool
def send_email_notification_tool(to_email: str, subject: str, body: str) -> str:
    """通过邮件发送详细业务报告。
    当用户要求"把结果发邮件给 xxx"或"发邮件"时调用。

    参数:
        to_email: 收件人的电子邮件地址。
        subject: 邮件的主题。
        body: 邮件正文内容。
    """
    if not settings.SMTP_SERVER or not settings.SMTP_USERNAME or not settings.SMTP_PASSWORD:
        return (
            "发送失败: 未配置 SMTP 邮件服务。\n"
            "请在 .env 文件中添加:\n"
            "  SMTP_SERVER=smtp.qq.com\n"
            "  SMTP_PORT=465\n"
            "  SMTP_USERNAME=your_email@qq.com\n"
            "  SMTP_PASSWORD=your_smtp_auth_code\n"
            "注意: QQ/网易邮箱需使用授权码而非登录密码。"
        )

    try:
        msg = MIMEMultipart()
        msg['From'] = settings.SMTP_USERNAME
        msg['To'] = to_email
        msg['Subject'] = "[SQL Agent] " + subject

        msg.attach(MIMEText(body, 'plain', 'utf-8'))

        server = smtplib.SMTP_SSL(settings.SMTP_SERVER, settings.SMTP_PORT)
        server.login(settings.SMTP_USERNAME, settings.SMTP_PASSWORD)
        server.send_message(msg)
        server.quit()

        return f"✅ 已成功发送邮件至 {to_email}"
    except Exception as e:
        return f"发送邮件失败: {str(e)}"
