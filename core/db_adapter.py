"""
数据库适配器抽象层。
不同数据库（PostgreSQL / MySQL / SQLite / DuckDB）的 schema 和元数据探索策略各有差异，
本模块通过适配器模式将这些差异封装起来，为上层工具提供统一接口。
"""

from abc import ABC, abstractmethod
from typing import Optional
import pandas as pd
from sqlalchemy import text, inspect


class DatabaseAdapter(ABC):
    """数据库适配器基类，定义统一的元数据探索接口"""

    def __init__(self, engine):
        self.engine = engine
        self.inspector = inspect(engine)

    @property
    @abstractmethod
    def db_type(self) -> str:
        """返回数据库类型标识，如 'postgresql', 'mysql', 'sqlite', 'duckdb'"""
        ...

    @abstractmethod
    def list_schemas(self) -> list[str]:
        """列出所有可用的 schema（或等价概念）"""
        ...

    @abstractmethod
    def list_tables(self, schema: Optional[str] = None) -> list[dict]:
        """
        列出指定 schema 下的所有表。
        返回格式: [{"schema": "xxx", "table": "yyy"}, ...]
        如果 schema 为 None，则列出所有 schema 下的所有表。
        """
        ...

    def describe_table(self, table_name: str, schema: Optional[str] = None) -> dict:
        """
        获取表的列信息。
        返回格式: {"schema": "xxx", "table": "yyy", "columns": [...]}
        """
        columns = self.inspector.get_columns(table_name, schema=schema)
        pk = self.inspector.get_pk_constraint(table_name, schema=schema)
        indexes = self.inspector.get_indexes(table_name, schema=schema)

        return {
            "schema": schema,
            "table": table_name,
            "columns": [
                {
                    "name": col["name"],
                    "type": str(col["type"]),
                    "nullable": col.get("nullable", True),
                    "default": str(col.get("default", "")) if col.get("default") else None,
                }
                for col in columns
            ],
            "primary_key": pk.get("constrained_columns", []) if pk else [],
            "indexes": [
                {"name": idx["name"], "columns": idx["column_names"], "unique": idx.get("unique", False)}
                for idx in indexes
            ],
        }

    def get_sample_data(self, table_name: str, schema: Optional[str] = None, limit: int = 3) -> pd.DataFrame:
        """获取表的采样数据"""
        # 构建带 schema 的全限定表名
        qualified = f'"{schema}"."{table_name}"' if schema else f'"{table_name}"'
        query = f"SELECT * FROM {qualified} LIMIT {limit}"
        try:
            return pd.read_sql_query(query, con=self.engine)
        except Exception:
            # 某些数据库不支持 LIMIT，尝试其他语法
            try:
                query = f"SELECT TOP {limit} * FROM {qualified}"
                return pd.read_sql_query(query, con=self.engine)
            except Exception as e:
                return pd.DataFrame()

    def has_table(self, table_name: str, schema: Optional[str] = None) -> bool:
        """检查表是否存在"""
        return self.inspector.has_table(table_name, schema=schema)


class PostgreSQLAdapter(DatabaseAdapter):
    """PostgreSQL 适配器：支持多 schema"""

    @property
    def db_type(self) -> str:
        return "postgresql"

    def list_schemas(self) -> list[str]:
        """列出所有用户创建的 schema（排除系统 schema）"""
        query = text("""
            SELECT schema_name 
            FROM information_schema.schemata 
            WHERE schema_name NOT IN ('pg_catalog', 'pg_toast', 'information_schema')
            ORDER BY schema_name
        """)
        with self.engine.connect() as conn:
            result = conn.execute(query)
            return [row[0] for row in result]

    def list_tables(self, schema: Optional[str] = None) -> list[dict]:
        """列出指定 schema 或所有 schema 下的表"""
        if schema:
            tables = self.inspector.get_table_names(schema=schema)
            views = self.inspector.get_view_names(schema=schema)
            result = [{"schema": schema, "table": t, "type": "TABLE"} for t in tables]
            result += [{"schema": schema, "table": v, "type": "VIEW"} for v in views]
            return result

        # 不指定 schema 时，遍历所有 schema
        all_tables = []
        for s in self.list_schemas():
            tables = self.inspector.get_table_names(schema=s)
            views = self.inspector.get_view_names(schema=s)
            all_tables += [{"schema": s, "table": t, "type": "TABLE"} for t in tables]
            all_tables += [{"schema": s, "table": v, "type": "VIEW"} for v in views]
        return all_tables


class MySQLAdapter(DatabaseAdapter):
    """MySQL 适配器：schema 等价于 database"""

    @property
    def db_type(self) -> str:
        return "mysql"

    def list_schemas(self) -> list[str]:
        """MySQL 中 schema = database，列出所有非系统数据库"""
        system_dbs = {"information_schema", "mysql", "performance_schema", "sys"}
        query = text("SHOW DATABASES")
        with self.engine.connect() as conn:
            result = conn.execute(query)
            return [row[0] for row in result if row[0] not in system_dbs]

    def list_tables(self, schema: Optional[str] = None) -> list[dict]:
        if schema:
            tables = self.inspector.get_table_names(schema=schema)
            views = self.inspector.get_view_names(schema=schema)
            result = [{"schema": schema, "table": t, "type": "TABLE"} for t in tables]
            result += [{"schema": schema, "table": v, "type": "VIEW"} for v in views]
            return result

        all_tables = []
        for s in self.list_schemas():
            try:
                tables = self.inspector.get_table_names(schema=s)
                views = self.inspector.get_view_names(schema=s)
                all_tables += [{"schema": s, "table": t, "type": "TABLE"} for t in tables]
                all_tables += [{"schema": s, "table": v, "type": "VIEW"} for v in views]
            except Exception:
                continue
        return all_tables


class SQLiteAdapter(DatabaseAdapter):
    """SQLite 适配器：无 schema 概念，使用 'main' 作为默认"""

    @property
    def db_type(self) -> str:
        return "sqlite"

    def list_schemas(self) -> list[str]:
        """SQLite 没有 schema 概念，返回 ['main']"""
        return ["main"]

    def list_tables(self, schema: Optional[str] = None) -> list[dict]:
        tables = self.inspector.get_table_names()
        views = self.inspector.get_view_names()
        result = [{"schema": "main", "table": t, "type": "TABLE"} for t in tables]
        result += [{"schema": "main", "table": v, "type": "VIEW"} for v in views]
        return result

    def has_table(self, table_name: str, schema: Optional[str] = None) -> bool:
        """SQLite 忽略 schema 参数"""
        return self.inspector.has_table(table_name)

    def describe_table(self, table_name: str, schema: Optional[str] = None) -> dict:
        """SQLite 不支持 schema 参数"""
        return super().describe_table(table_name, schema=None)

    def get_sample_data(self, table_name: str, schema: Optional[str] = None, limit: int = 3) -> pd.DataFrame:
        """SQLite 不需要 schema 前缀"""
        query = f'SELECT * FROM "{table_name}" LIMIT {limit}'
        try:
            return pd.read_sql_query(query, con=self.engine)
        except Exception:
            return pd.DataFrame()


class DuckDBAdapter(DatabaseAdapter):
    """DuckDB 适配器：类似 PostgreSQL，支持 schema"""

    @property
    def db_type(self) -> str:
        return "duckdb"

    def list_schemas(self) -> list[str]:
        query = text("""
            SELECT schema_name 
            FROM information_schema.schemata 
            WHERE schema_name NOT IN ('pg_catalog', 'information_schema')
            ORDER BY schema_name
        """)
        with self.engine.connect() as conn:
            result = conn.execute(query)
            return [row[0] for row in result]

    def list_tables(self, schema: Optional[str] = None) -> list[dict]:
        if schema:
            tables = self.inspector.get_table_names(schema=schema)
            views = self.inspector.get_view_names(schema=schema)
            result = [{"schema": schema, "table": t, "type": "TABLE"} for t in tables]
            result += [{"schema": schema, "table": v, "type": "VIEW"} for v in views]
            return result

        all_tables = []
        for s in self.list_schemas():
            tables = self.inspector.get_table_names(schema=s)
            views = self.inspector.get_view_names(schema=s)
            all_tables += [{"schema": s, "table": t, "type": "TABLE"} for t in tables]
            all_tables += [{"schema": s, "table": v, "type": "VIEW"} for v in views]
        return all_tables


# ===== 适配器工厂 =====

# 数据库 dialect 名称到适配器类的映射
_ADAPTER_MAP = {
    "postgresql": PostgreSQLAdapter,
    "mysql": MySQLAdapter,
    "mariadb": MySQLAdapter,
    "sqlite": SQLiteAdapter,
    "duckdb": DuckDBAdapter,
}


def get_adapter(engine) -> DatabaseAdapter:
    """
    工厂函数：根据 SQLAlchemy engine 的 dialect 自动选择合适的适配器。
    如果 dialect 不在已知列表中，则回退到 PostgreSQL 适配器（最通用的 schema 支持）。
    """
    dialect_name = engine.dialect.name
    adapter_cls = _ADAPTER_MAP.get(dialect_name, PostgreSQLAdapter)
    return adapter_cls(engine)
