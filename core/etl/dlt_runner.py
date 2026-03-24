import dlt
import os
from typing import Any, Dict

# 默认导出库路径（如果是 DuckDB）
DB_PATH = os.path.join(os.getcwd(), "dbt_data.duckdb")

class DltRunner:
    """
    封装 dlt (Data Load Tool) 逻辑，实现自动化 Schema 探测与数据装载。
    """
    def __init__(self, destination: str = "duckdb", credentials: str = None):
        # 默认使用 duckdb，如果配置了 postgres 则优先使用
        self.destination = destination
        self.credentials = credentials or f"duckdb:///{DB_PATH}"

    def load_data(self, data: Any, table_name: str, dataset_name: str = "main") -> Dict[str, Any]:
        """
        将数据（List[Dict], DataFrame, 或文件迭代器）装载至目标数据库。
        """
        pipeline = dlt.pipeline(
            pipeline_name="duckdb_pipeline",
            destination=self.destination,
            dataset_name=dataset_name,
        )

        try:
            # 显式传递 credentials 给 run 方法
            info = pipeline.run(data, table_name=table_name, credentials=self.credentials)
            return {
                "success": True,
                "table": table_name,
                "dataset": dataset_name,
                "load_info": str(info)
            }
        except Exception as e:
            return {
                "success": False,
                "error": str(e)
            }

    @staticmethod
    def load_csv(file_path: str, table_name: str) -> Dict[str, Any]:
        """从 CSV 文件装载 (不依赖 Pandas/Pyarrow)"""
        import csv
        data = []
        try:
            with open(file_path, "r", encoding="utf-8") as f:
                reader = csv.DictReader(f)
                for row in reader:
                    # 尝试进行基础的数值转换，帮助 dlt 更好地推断类型
                    converted_row = {}
                    for k, v in row.items():
                        try:
                            if "." in v:
                                converted_row[k] = float(v)
                            else:
                                converted_row[k] = int(v)
                        except:
                            converted_row[k] = v
                    data.append(converted_row)
            
            runner = DltRunner()
            return runner.load_data(data, table_name)
        except Exception as e:
            return {"success": False, "error": str(e)}

# 导出单例
dlt_runner = DltRunner()
