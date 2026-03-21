import os
from langchain_core.tools import tool

# 项目根目录
BASE_DIR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SKILLS_DIR = os.path.join(BASE_DIR, "skills")
WORKFLOWS_DIR = os.path.join(BASE_DIR, "workflows")

def _ensure_dirs_exist():
    """确保目录存在"""
    os.makedirs(SKILLS_DIR, exist_ok=True)
    os.makedirs(WORKFLOWS_DIR, exist_ok=True)

def _get_markdown_files(directory: str) -> list[str]:
    """获取指定目录下所有 markdown 文件"""
    if not os.path.exists(directory):
        return []
    return [f for f in os.listdir(directory) if f.endswith('.md')]

def get_available_knowledge_str() -> str:
    """内部函数：用于在组装 Agent System Prompt 时动态获取文件列表"""
    _ensure_dirs_exist()
    skills = _get_markdown_files(SKILLS_DIR)
    workflows = _get_markdown_files(WORKFLOWS_DIR)
    
    knowledge_prompt = "## 专属知识库 (Skills & Workflows)\n"
    knowledge_prompt += "你被授权访问本地的 `skills` 和 `workflows` 目录来增强你的专业能力或遵循特定的业务流。\n"
    
    if skills:
        knowledge_prompt += f"\n- **可用 Skills (独立技能/经验准则)**: {', '.join(skills)}\n"
    else:
        knowledge_prompt += "\n- **可用 Skills**: (暂无)\n"
        
    if workflows:
        knowledge_prompt += f"- **可用 Workflows (SOP/业务标准指引)**: {', '.join(workflows)}\n"
    else:
        knowledge_prompt += "- **可用 Workflows**: (暂无)\n"
        
    knowledge_prompt += "\n**重要指示：**如果在对话中用户提及或你认为当前分析匹配到了上述某个 `.md` 知识库文件，你必须立刻调用 `read_knowledge_doc_tool` 工具并传入对应的文件名去阅读其内容，然后严格遵守该文件中定下的执行准则和要求。\n"
    
    return knowledge_prompt

@tool
def list_knowledge_base_tool() -> str:
    """列出当前项目目录中可用的所有 Skills 和 Workflows 文件。
    如果我不确定有哪些指导文档存在，可以使用此工具查看总体清单。
    返回将是一个包含两个列表的文本说明。
    """
    _ensure_dirs_exist()
    skills = _get_markdown_files(SKILLS_DIR)
    workflows = _get_markdown_files(WORKFLOWS_DIR)
    
    res = "可用知识库文件列表：\n\n"
    res += "【Skills 目录 (通常包含特定技能或规范)】\n"
    res += "\n".join([f"- {s}" for s in skills]) if skills else "- 无"
    
    res += "\n\n【Workflows 目录 (通常包含业务执行 SOP)】\n"
    res += "\n".join([f"- {w}" for w in workflows]) if workflows else "- 无"
    return res

@tool
def read_knowledge_doc_tool(doc_type: str, file_name: str) -> str:
    """读取特定的技能或工作流文件的内容。
    当你知道需要应用某个具体的 skill 或 workflow 时，必须先调用此工具获取文档的完整规范内容。
    注意：安全限制导致只能读取技能和工作流根目录下的文件。
    参数:
        doc_type (str): 文档分类，仅支持 "skills" 或 "workflows"（全小写）。
        file_name (str): 文档名称，例如 "data_analysis_workflow.md"。
    """
    if doc_type not in ["skills", "workflows"]:
        return "错误：doc_type 只能是 'skills' 或 'workflows'。"
        
    # 防止路径穿越安全问题
    safe_file_name = os.path.basename(file_name)
    
    if not safe_file_name.endswith('.md'):
        safe_file_name += '.md'
        
    target_dir = SKILLS_DIR if doc_type == "skills" else WORKFLOWS_DIR
    target_path = os.path.join(target_dir, safe_file_name)
    
    if not os.path.exists(target_path):
        return f"错误：在 {doc_type} 目录中未找到文件 '{safe_file_name}'。"
        
    try:
        with open(target_path, 'r', encoding='utf-8') as f:
            content = f.read()
            return f"成功读取 {doc_type}/{safe_file_name}，文档内容如下：\n\n{content}\n\n请熟读上述内容并在后续行为中严格遵守。"
    except Exception as e:
        return f"读取文件时发生错误：{str(e)}"


@tool
def save_knowledge_tool(title: str, content: str, category: str = "skills") -> str:
    """将企业术语、字段释义、业务规则或经验总结持久化保存到知识库中。
    保存后的知识在后续所有对话中都会自动注入到 Agent 的上下文中。
    
    参数:
        title (str): 知识条目的标题，将作为文件名（如 "GMV定义"、"业务术语表"）
        content (str): 知识条目的完整内容，支持 Markdown 格式
        category (str): 知识分类，仅支持 "skills"（技能/定义/规则）或 "workflows"（SOP/流程）。默认为 "skills"
    """
    if category not in ["skills", "workflows"]:
        return "错误：category 参数只支持 'skills' 或 'workflows'。"

    _ensure_dirs_exist()

    # 安全处理文件名
    safe_title = "".join(c if c.isalnum() or c in ("_", "-", " ") else "_" for c in title)
    safe_title = safe_title.strip().replace(" ", "_")
    if not safe_title:
        return "错误：标题不能为空或全为特殊字符。"

    filename = f"{safe_title}.md"
    target_dir = SKILLS_DIR if category == "skills" else WORKFLOWS_DIR
    target_path = os.path.join(target_dir, filename)

    try:
        # 构建知识文档内容
        from datetime import datetime
        now = datetime.now().strftime("%Y-%m-%d %H:%M")
        
        doc_content = f"# {title}\n\n"
        doc_content += f"> 创建时间: {now}\n\n"
        doc_content += content + "\n"

        # 如果已存在同名文件，追加更新标记
        if os.path.exists(target_path):
            with open(target_path, 'r', encoding='utf-8') as f:
                existing = f.read()
            doc_content = existing + f"\n\n---\n\n## 更新 ({now})\n\n{content}\n"

        with open(target_path, 'w', encoding='utf-8') as f:
            f.write(doc_content)

        return f"✅ 知识已成功保存到 {category}/{filename}。该知识将在后续所有对话中自动可用。"

    except Exception as e:
        return f"❌ 保存知识时发生错误: {str(e)}"


@tool
def search_knowledge_tool(keyword: str) -> str:
    """在知识库（skills 和 workflows 目录）中搜索包含指定关键词的知识条目。
    当不确定某个业务术语的含义或需要查找特定规则时使用此工具。
    
    参数:
        keyword (str): 要搜索的关键词（不区分大小写）
    """
    _ensure_dirs_exist()
    keyword_lower = keyword.lower()
    results = []

    for doc_type, directory in [("skills", SKILLS_DIR), ("workflows", WORKFLOWS_DIR)]:
        if not os.path.exists(directory):
            continue
        for filename in os.listdir(directory):
            if not filename.endswith('.md'):
                continue
            filepath = os.path.join(directory, filename)
            try:
                with open(filepath, 'r', encoding='utf-8') as f:
                    content = f.read()
                if keyword_lower in content.lower() or keyword_lower in filename.lower():
                    # 提取匹配行的上下文
                    matching_lines = []
                    for i, line in enumerate(content.split('\n')):
                        if keyword_lower in line.lower():
                            matching_lines.append(f"  L{i+1}: {line.strip()}")
                    
                    results.append({
                        "file": f"{doc_type}/{filename}",
                        "matches": matching_lines[:5]  # 最多显示 5 行
                    })
            except Exception:
                continue

    if not results:
        return f"未在知识库中找到与 '{keyword}' 相关的内容。"

    output = f"在知识库中找到 {len(results)} 个匹配文件：\n\n"
    for r in results:
        output += f"📄 **{r['file']}**\n"
        for line in r['matches']:
            output += f"{line}\n"
        output += "\n"

    output += "💡 使用 `read_knowledge_doc_tool` 可以阅读完整内容。"
    return output

