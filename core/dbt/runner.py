"""
兼容层：保留原有导入路径，内部转发到新的 dbt 服务层。
"""

from core.services.dbt_service import DbtService

runner = DbtService()
