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
def export_report_tool(report_content: str, filename: str = None) -> str:
    """导出当前生成的分析报告。
    当用户要求下载报告或保存分析结果时，将大模型根据上下文总结的 Markdown 内容通过此工具导出为本地文件。
    参数:
        report_content: 欲导出的报告内容（Markdown 格式）。
        filename: （可选）导出的文件名，需以 .md 结尾，默认自动生成。
    """
    try:
        if not filename:
            filename = f"report_{datetime.now().strftime('%Y%md_%H%M%S')}.md"
            
        reports_dir = os.path.join(os.getcwd(), "reports")
        os.makedirs(reports_dir, exist_ok=True)
        
        file_path = os.path.join(reports_dir, filename)
        with open(file_path, "w", encoding="utf-8") as f:
            f.write(report_content)
            
        # 提示用户文件已经保存在后端目录，可以进一步在 UI 层提供下载，这里暂时存放在 reports 文件夹
        return f"报告已成功导出至: {file_path}"
    except Exception as e:
        return f"导出报告失败: {str(e)}"

@tool
def send_feishu_notification_tool(content: str) -> str:
    """向飞书群组发送业务分析报告或通知。
    当用户说“发给飞书”、“通知团队”、“推送到群”时调用。
    参数:
        content: 要发送的 Markdown 内容。如果太长请提取核心结论后发送。
    """
    webhook_url = settings.FEISHU_WEBHOOK_URL
    if not webhook_url:
        return "发送失败: 未在 .env 中配置 FEISHU_WEBHOOK_URL。"
        
    try:
        # 飞书机器人要求将 JSON 荷载转换为 bytes
        payload = {
            "msg_type": "text",
            "content": {
                "text": "【SQL Agent 数据通报】\n" + content
            }
        }
        data = json.dumps(payload).encode("utf-8")
        req = urllib.request.Request(webhook_url, data=data)
        req.add_header("Content-Type", "application/json")
        
        with urllib.request.urlopen(req) as response:
            if response.status == 200:
                return "已成功推送到飞书群组！"
            else:
                return f"推送可能失败，HTTP 状态码: {response.status}"
    except Exception as e:
        return f"发送飞书通知异常: {str(e)}"

@tool
def send_email_notification_tool(to_email: str, subject: str, body: str) -> str:
    """通过邮件发送详细业务报告。
    当用户要求“把结果发邮件给 xxx”或“发邮件”时调用。
    参数:
        to_email: 收件人的电子邮件地址。
        subject: 邮件的主题。
        body: 邮件正文内容。
    """
    if not settings.SMTP_SERVER or not settings.SMTP_USERNAME or not settings.SMTP_PASSWORD:
        return "发送失败: 未在 .env 配置 SMTP 服务器或账号凭证。"
        
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
        
        return f"已成功发送邮件至 {to_email}"
    except Exception as e:
        return f"发送邮件失败: {str(e)}"
