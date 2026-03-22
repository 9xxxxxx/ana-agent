"""
Python 安全沙盒执行器。
使用 subprocess 在隔离进程中运行用户生成的 Python 代码，
自带 AST 安全检查、超时保护和 matplotlib 图片自动捕获。
"""

import ast
import base64
import os
import subprocess
import sys
import tempfile
import uuid
from dataclasses import dataclass, field
from pathlib import Path


@dataclass
class ExecutionResult:
    """代码执行结果的结构化封装"""
    stdout: str = ""
    stderr: str = ""
    images: list[str] = field(default_factory=list)  # Base64 编码的图片列表
    success: bool = True
    error: str | None = None


# 允许导入的安全模块白名单
ALLOWED_MODULES = {
    # 数据处理
    "pandas", "numpy", "json", "csv", "collections", "itertools", "functools",
    # 数学与统计
    "math", "statistics", "decimal", "fractions", "random",
    # 科学计算
    "scipy", "sklearn", "scikit-learn",
    # 可视化
    "matplotlib", "matplotlib.pyplot", "matplotlib.figure",
    # 时间处理
    "datetime", "time", "calendar",
    # 字符串与正则
    "re", "string", "textwrap",
    # 类型与数据结构
    "dataclasses", "typing", "enum", "copy",
    # 编码
    "base64", "hashlib",
}

# 禁止调用的危险函数/属性
BLOCKED_CALLS = {
    "exec", "eval", "compile", "__import__",
    "globals", "locals", "vars",
    "getattr", "setattr", "delattr",
    "exit", "quit",
}

# 禁止导入的危险模块
BLOCKED_MODULES = {
    "os", "sys", "subprocess", "shutil", "pathlib",
    "socket", "http", "urllib", "requests",
    "ctypes", "multiprocessing", "threading",
    "signal", "pty", "fcntl",
    "importlib", "pkgutil",
    "code", "codeop", "compileall",
    "webbrowser", "antigravity",
}


class SecurityViolation(Exception):
    """安全策略违规异常"""
    pass


class _SafetyChecker(ast.NodeVisitor):
    """
    基于 AST 的静态安全扫描器。
    在代码执行前扫描抽象语法树，拒绝危险的导入和函数调用。
    """

    def __init__(self):
        self.violations: list[str] = []

    def visit_Import(self, node: ast.Import):
        for alias in node.names:
            top_module = alias.name.split(".")[0]
            if top_module in BLOCKED_MODULES:
                self.violations.append(
                    f"禁止导入模块: '{alias.name}' (安全策略限制)"
                )
            elif top_module not in {m.split(".")[0] for m in ALLOWED_MODULES}:
                self.violations.append(
                    f"不在白名单中的模块: '{alias.name}'，可用模块: pandas, numpy, matplotlib, scipy, sklearn 等"
                )
        self.generic_visit(node)

    def visit_ImportFrom(self, node: ast.ImportFrom):
        if node.module:
            top_module = node.module.split(".")[0]
            if top_module in BLOCKED_MODULES:
                self.violations.append(
                    f"禁止导入模块: '{node.module}' (安全策略限制)"
                )
            elif top_module not in {m.split(".")[0] for m in ALLOWED_MODULES}:
                self.violations.append(
                    f"不在白名单中的模块: '{node.module}'，可用模块: pandas, numpy, matplotlib, scipy, sklearn 等"
                )
        self.generic_visit(node)

    def visit_Call(self, node: ast.Call):
        # 检查直接调用危险函数：eval(), exec() 等
        if isinstance(node.func, ast.Name):
            if node.func.id in BLOCKED_CALLS:
                self.violations.append(
                    f"禁止调用函数: '{node.func.id}()' (安全策略限制)"
                )
        # 检查属性式调用：os.system() 等
        elif isinstance(node.func, ast.Attribute):
            if isinstance(node.func.value, ast.Name):
                full_call = f"{node.func.value.id}.{node.func.attr}"
                if node.func.value.id in BLOCKED_MODULES:
                    self.violations.append(
                        f"禁止调用: '{full_call}()' (安全策略限制)"
                    )
        self.generic_visit(node)

    def visit_Attribute(self, node: ast.Attribute):
        # 拦截 __builtins__、__class__ 等双下划线属性访问
        if node.attr.startswith("__") and node.attr.endswith("__"):
            if node.attr not in ("__init__", "__str__", "__repr__", "__len__",
                                  "__getitem__", "__setitem__", "__contains__",
                                  "__iter__", "__next__", "__enter__", "__exit__",
                                  "__name__", "__doc__"):
                self.violations.append(
                    f"禁止访问 dunder 属性: '{node.attr}' (安全策略限制)"
                )
        self.generic_visit(node)


def _check_code_safety(code: str) -> list[str]:
    """
    使用 AST 分析对代码进行静态安全检查。
    返回违规描述列表，空列表表示安全通过。
    """
    try:
        tree = ast.parse(code)
    except SyntaxError as e:
        return [f"Python 语法错误: {e}"]

    checker = _SafetyChecker()
    checker.visit(tree)
    return checker.violations


# matplotlib 图片捕获脚本模板
# 注入到用户代码末尾，拦截 plt.show() 并保存为文件
_MATPLOTLIB_CAPTURE_TEMPLATE = """
# === 沙盒自动注入：matplotlib 图片捕获 ===
import sys as _sys
try:
    import matplotlib
    matplotlib.use('Agg')  # 强制使用非交互后端
    import matplotlib.pyplot as _plt
    
    # 替换 plt.show() 为保存图片的逻辑
    _original_show = _plt.show
    _sandbox_img_dir = r'{img_dir}'
    _sandbox_img_counter = [0]
    
    def _sandbox_show(*args, **kwargs):
        _sandbox_img_counter[0] += 1
        _img_path = _sandbox_img_dir + f'/figure_{{_sandbox_img_counter[0]}}.png'
        _plt.savefig(_img_path, dpi=150, bbox_inches='tight', facecolor='white')
        print(f'[SANDBOX_IMAGE] {{_img_path}}')
        _plt.close('all')
    
    _plt.show = _sandbox_show
except ImportError:
    pass
# === 沙盒注入结束 ===

"""


class PythonSandbox:
    """
    安全的 Python 代码沙盒执行器。
    
    特性：
    - AST 静态安全分析
    - subprocess 进程隔离
    - 超时保护（默认 30s）
    - matplotlib 图片自动捕获
    - 白名单导入控制
    """

    def __init__(self, timeout: int = 30):
        self.timeout = timeout

    def execute(self, code: str) -> ExecutionResult:
        """
        在隔离沙盒中执行 Python 代码。
        
        Args:
            code: 要执行的 Python 代码字符串
            
        Returns:
            ExecutionResult: 包含 stdout、stderr、图片和状态的结构化结果
        """
        # 第一步：AST 静态安全检查
        violations = _check_code_safety(code)
        if violations:
            return ExecutionResult(
                success=False,
                error="⛔ 代码安全检查未通过:\n" + "\n".join(f"  • {v}" for v in violations)
            )

        # 准备临时目录用于图片输出
        tmp_dir = tempfile.mkdtemp(prefix="sandbox_")
        img_dir = os.path.join(tmp_dir, "images")
        os.makedirs(img_dir, exist_ok=True)
        script_path = os.path.join(tmp_dir, f"sandbox_{uuid.uuid4().hex[:8]}.py")

        try:
            # 第二步：构建最终执行脚本（注入 matplotlib 捕获逻辑 + 用户代码）
            capture_prefix = _MATPLOTLIB_CAPTURE_TEMPLATE.format(img_dir=img_dir.replace("\\", "/"))
            full_code = capture_prefix + code

            with open(script_path, "w", encoding="utf-8") as f:
                f.write(full_code)

            # 第三步：在子进程中执行
            result = subprocess.run(
                [sys.executable, script_path],
                capture_output=True,
                text=True,
                timeout=self.timeout,
                cwd=tmp_dir,
                env={
                    **os.environ,
                    "PYTHONDONTWRITEBYTECODE": "1",
                    "PYTHONIOENCODING": "utf-8",
                },
            )

            # 第四步：收集 stdout 和 stderr
            stdout = result.stdout or ""
            stderr = result.stderr or ""

            # 第五步：收集 matplotlib 输出的图片 → Base64
            images: list[str] = []

            # 从 stdout 中提取 [SANDBOX_IMAGE] 标记指向的图片路径
            clean_stdout_lines = []
            for line in stdout.split("\n"):
                if line.strip().startswith("[SANDBOX_IMAGE]"):
                    img_path = line.strip().replace("[SANDBOX_IMAGE]", "").strip()
                    if os.path.exists(img_path):
                        with open(img_path, "rb") as img_f:
                            b64 = base64.b64encode(img_f.read()).decode("utf-8")
                            images.append(b64)
                else:
                    clean_stdout_lines.append(line)

            clean_stdout = "\n".join(clean_stdout_lines).strip()

            # 也扫描图片目录中的所有 PNG（兼容其他保存方式）
            for fname in sorted(os.listdir(img_dir)):
                if fname.endswith(".png"):
                    img_path = os.path.join(img_dir, fname)
                    # 避免重复添加已通过标记捕获的图片
                    with open(img_path, "rb") as img_f:
                        b64 = base64.b64encode(img_f.read()).decode("utf-8")
                        if b64 not in images:
                            images.append(b64)

            # 判断执行是否成功
            success = result.returncode == 0
            error_msg = None
            if not success:
                # 清理 stderr 中的沙盒内部路径信息
                error_msg = stderr.strip() if stderr.strip() else f"进程退出码: {result.returncode}"

            return ExecutionResult(
                stdout=clean_stdout,
                stderr=stderr.strip(),
                images=images,
                success=success,
                error=error_msg,
            )

        except subprocess.TimeoutExpired:
            return ExecutionResult(
                success=False,
                error=f"⏱️ 代码执行超时 (超过 {self.timeout} 秒限制)。请优化代码或减少计算量。"
            )
        except Exception as e:
            return ExecutionResult(
                success=False,
                error=f"沙盒执行异常: {str(e)}"
            )
        finally:
            # 清理临时文件
            try:
                import shutil
                shutil.rmtree(tmp_dir, ignore_errors=True)
            except Exception:
                pass
