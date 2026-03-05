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
def send_feishu_notification_tool(content: str) -> str:
    """向飞书群组发送业务分析报告或通知。
    当用户说"发给飞书"、"通知团队"、"推送到群"时调用。
    你必须使用之前对话中已有的分析结论，提炼核心要点后发送，禁止重新执行 SQL 查询。

    参数:
        content: 要发送的核心分析结论。需精练概括，避免过长。
    """
    webhook_url = settings.FEISHU_WEBHOOK_URL
    if not webhook_url:
        return (
            "发送失败: 未配置飞书 Webhook。\n"
            "请在 .env 文件中添加: FEISHU_WEBHOOK_URL=https://open.feishu.cn/open-apis/bot/v2/hook/xxxxx\n"
            "获取方式: 飞书群 → 设置 → 群机器人 → 添加自定义机器人 → 复制 Webhook 地址"
        )

    try:
        # 使用飞书交互式卡片消息，比纯文本更美观
        payload = {
            "msg_type": "interactive",
            "card": {
                "header": {
                    "title": {
                        "tag": "plain_text",
                        "content": "📊 SQL Agent 数据分析通报"
                    },
                    "template": "blue"
                },
                "elements": [
                    {
                        "tag": "div",
                        "text": {
                            "tag": "lark_md",
                            "content": content
                        }
                    },
                    {
                        "tag": "hr"
                    },
                    {
                        "tag": "note",
                        "elements": [
                            {
                                "tag": "plain_text",
                                "content": f"由 SQL Agent 自动生成 | {datetime.now().strftime('%Y-%m-%d %H:%M')}"
                            }
                        ]
                    }
                ]
            }
        }

        data = json.dumps(payload).encode("utf-8")
        req = urllib.request.Request(webhook_url, data=data)
        req.add_header("Content-Type", "application/json")

        with urllib.request.urlopen(req) as response:
            resp_body = json.loads(response.read().decode("utf-8"))
            if response.status == 200 and resp_body.get("code", -1) == 0:
                return "✅ 已成功推送到飞书群组！"
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
