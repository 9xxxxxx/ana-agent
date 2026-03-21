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
