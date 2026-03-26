import unittest
from unittest.mock import patch

from langchain_core.messages import HumanMessage

from core.agent import (
    _analysis_worker_node,
    _context_injector_node,
    _delivery_worker_node,
    _route_request,
    _supervisor_node,
    agent_state_modifier,
)


class AgentRoutesIntegrationTests(unittest.TestCase):
    def _route_for(self, message: str, profile: str = "database") -> str:
        state = {"messages": [HumanMessage(content=message)]}
        routed = _route_request(
            state,
            config={"configurable": {"agent_profile": profile}},
        )
        return routed["route"]

    def test_routes_direct_sql(self):
        self.assertEqual(self._route_for("SELECT * FROM movies LIMIT 5"), "direct_sql")

    def test_routes_direct_db(self):
        self.assertEqual(self._route_for("当前数据库有哪些表"), "direct_db")

    def test_routes_multi_table(self):
        self.assertEqual(self._route_for("关联 public.movies 和 public.ratings"), "autonomous")

    def test_routes_nl_query(self):
        self.assertEqual(self._route_for("public.movies 表有多少行"), "autonomous")

    def test_routes_analysis(self):
        self.assertEqual(self._route_for("请分析这个数据库适合做什么业务"), "autonomous")

    def test_routes_analysis_worker_for_visualization_request(self):
        self.assertEqual(self._route_for("请给我做一个可视化图表并多角度分析"), "analysis_worker")

    def test_routes_delivery_worker_for_push_request(self):
        self.assertEqual(self._route_for("把结果导出并发送飞书通知"), "delivery_worker")

    def test_routes_composite_analysis_and_delivery_to_analysis_first(self):
        self.assertEqual(self._route_for("请先做图表分析，然后导出并发送飞书"), "analysis_worker")

    def test_route_request_uses_context_task_flags(self):
        state = {
            "messages": [HumanMessage(content="普通描述，不含明显关键词")],
            "context_data": {"requires_analysis": True, "requires_delivery": True},
        }
        routed = _route_request(
            state,
            config={"configurable": {"agent_profile": "database"}},
        )
        self.assertEqual(routed["route"], "analysis_worker")

    def test_routes_general_chat(self):
        self.assertEqual(self._route_for("你好"), "general")

    def test_routes_general_profile(self):
        self.assertEqual(self._route_for("帮我分析一下销售趋势并给出建议", profile="general"), "general")

    def test_supervisor_sets_next_agent(self):
        state = {"messages": [HumanMessage(content="当前数据库有哪些表")]}
        supervised = _supervisor_node(
            state,
            config={"configurable": {"agent_profile": "database"}},
        )
        self.assertEqual(supervised["next_agent"], "direct_db")

    def test_supervisor_llm_off_does_not_call_model(self):
        state = {"messages": [HumanMessage(content="SELECT 1")]}
        with patch("core.agent.create_chat_model") as mocked_create:
            supervised = _supervisor_node(
                state,
                config={"configurable": {"agent_profile": "database", "supervisor_llm": "off"}},
            )
        self.assertEqual(supervised["next_agent"], "direct_sql")
        mocked_create.assert_not_called()

    def test_supervisor_llm_auto_skips_model_for_direct_route(self):
        state = {"messages": [HumanMessage(content="当前数据库有哪些表")]}
        with patch("core.agent.create_chat_model") as mocked_create:
            supervised = _supervisor_node(
                state,
                config={"configurable": {"agent_profile": "database", "supervisor_llm": "auto"}},
            )
        self.assertEqual(supervised["next_agent"], "direct_db")
        mocked_create.assert_not_called()

    def test_context_injector_uses_precomputed_rag_docs(self):
        state = {"messages": [HumanMessage(content="订单分析")]}
        injected = _context_injector_node(
            state,
            config={
                "configurable": {
                    "rag_precomputed_docs": [
                        {"page_content": "table: orders(id, amount)", "metadata": {"source": "test"}},
                    ]
                }
            },
        )
        self.assertIn("context_data", injected)
        self.assertIn("rag_docs", injected["context_data"])
        self.assertEqual(len(injected["context_data"]["rag_docs"]), 1)

    def test_context_injector_carries_tool_scope(self):
        state = {"messages": [HumanMessage(content="请导出报告")]}
        injected = _context_injector_node(
            state,
            config={"configurable": {"tool_scope": ["sql_core", "delivery"]}},
        )
        self.assertEqual(injected["context_data"]["tool_scope"], ["sql_core", "delivery"])
        self.assertEqual(injected["context_data"]["route_history"], ["context_injector"])

    def test_context_injector_infers_tool_scope_from_message(self):
        state = {"messages": [HumanMessage(content="请导出并发送飞书通知")]}
        injected = _context_injector_node(
            state,
            config={"configurable": {}},
        )
        scopes = injected["context_data"].get("tool_scope", [])
        self.assertIn("sql_core", scopes)
        self.assertIn("delivery", scopes)
        self.assertTrue(injected["context_data"]["requires_delivery"])

    def test_supervisor_llm_structured_decision(self):
        class _FakeStructuredRouter:
            def invoke(self, _messages):
                return {"next_agent": "direct_sql"}

        class _FakeLlm:
            def with_structured_output(self, _schema):
                return _FakeStructuredRouter()

        state = {"messages": [HumanMessage(content="SELECT 1")]}
        with patch("core.agent.create_chat_model", return_value=_FakeLlm()):
            supervised = _supervisor_node(
                state,
                config={"configurable": {"agent_profile": "database", "supervisor_llm": "auto"}},
            )
        self.assertEqual(supervised["next_agent"], "direct_sql")

    def test_supervisor_llm_fallbacks_when_invalid_output(self):
        class _BrokenRouter:
            def invoke(self, _messages):
                return {"next_agent": "invalid"}

        class _FakeLlm:
            def with_structured_output(self, _schema):
                return _BrokenRouter()

        state = {"messages": [HumanMessage(content="当前数据库有哪些表")]}
        with patch("core.agent.create_chat_model", return_value=_FakeLlm()):
            supervised = _supervisor_node(
                state,
                config={"configurable": {"agent_profile": "database", "supervisor_llm": True}},
            )
        self.assertEqual(supervised["next_agent"], "direct_db")

    def test_supervisor_finishes_after_worker_when_llm_off(self):
        state = {
            "messages": [HumanMessage(content="请导出并发送报告")],
            "final_answer": "已生成报告",
            "context_data": {"last_worker": "delivery_worker", "worker_round": 1},
        }
        supervised = _supervisor_node(
            state,
            config={"configurable": {"agent_profile": "database", "supervisor_llm": "off", "max_worker_loops": 2}},
        )
        self.assertEqual(supervised["next_agent"], "finish")
        self.assertEqual(supervised["context_data"]["finish_reason"], "delivery_completed")

    def test_supervisor_finishes_when_reaching_max_loops(self):
        state = {
            "messages": [HumanMessage(content="做深度分析并给建议")],
            "final_answer": "阶段性结果",
            "context_data": {"last_worker": "analysis_worker", "worker_round": 3},
        }
        supervised = _supervisor_node(
            state,
            config={"configurable": {"agent_profile": "database", "supervisor_llm": "auto", "max_worker_loops": 2}},
        )
        self.assertEqual(supervised["next_agent"], "finish")
        self.assertEqual(supervised["context_data"]["finish_reason"], "max_worker_loops")

    def test_supervisor_switches_analysis_to_delivery_when_required(self):
        state = {
            "messages": [HumanMessage(content="请先分析再发送")],
            "final_answer": "分析结果已完成",
            "context_data": {
                "last_worker": "analysis_worker",
                "worker_round": 1,
                "requires_delivery": True,
                "delivery_done": False,
            },
        }
        supervised = _supervisor_node(
            state,
            config={"configurable": {"agent_profile": "database", "supervisor_llm": "auto", "max_worker_loops": 3}},
        )
        self.assertEqual(supervised["next_agent"], "delivery_worker")

    def test_supervisor_handles_invalid_max_worker_loops(self):
        state = {
            "messages": [HumanMessage(content="继续分析")],
            "final_answer": "阶段性结果",
            "context_data": {"last_worker": "analysis_worker", "worker_round": 3},
        }
        supervised = _supervisor_node(
            state,
            config={"configurable": {"agent_profile": "database", "supervisor_llm": "off", "max_worker_loops": "bad"}},
        )
        self.assertEqual(supervised["next_agent"], "finish")

    def test_supervisor_finishes_when_no_progress(self):
        state = {
            "messages": [HumanMessage(content="继续执行")],
            "final_answer": "阶段性结果",
            "context_data": {
                "last_worker": "analysis_worker",
                "worker_round": 2,
                "consecutive_idle_rounds": 2,
            },
        }
        supervised = _supervisor_node(
            state,
            config={"configurable": {"agent_profile": "database", "supervisor_llm": "auto", "max_worker_loops": 4}},
        )
        self.assertEqual(supervised["next_agent"], "finish")
        self.assertEqual(supervised["context_data"]["finish_reason"], "no_progress")

    def test_supervisor_finishes_when_no_progress_reaches_custom_threshold(self):
        state = {
            "messages": [HumanMessage(content="继续执行")],
            "final_answer": "阶段性结果",
            "context_data": {
                "last_worker": "analysis_worker",
                "worker_round": 1,
                "consecutive_idle_rounds": 1,
            },
        }
        supervised = _supervisor_node(
            state,
            config={
                "configurable": {
                    "agent_profile": "database",
                    "supervisor_llm": "auto",
                    "max_worker_loops": 4,
                    "max_idle_rounds": 1,
                }
            },
        )
        self.assertEqual(supervised["next_agent"], "finish")
        self.assertEqual(supervised["context_data"]["finish_reason"], "no_progress")

    def test_supervisor_max_loops_cannot_be_overridden_by_llm(self):
        class _FakeStructuredRouter:
            def invoke(self, _messages):
                return {"next_agent": "analysis_worker"}

        class _FakeLlm:
            def with_structured_output(self, _schema):
                return _FakeStructuredRouter()

        state = {
            "messages": [HumanMessage(content="继续分析")],
            "final_answer": "已有结论",
            "context_data": {"last_worker": "analysis_worker", "worker_round": 3},
        }
        with patch("core.agent.create_chat_model", return_value=_FakeLlm()):
            supervised = _supervisor_node(
                state,
                config={"configurable": {"agent_profile": "database", "supervisor_llm": "auto", "max_worker_loops": 2}},
            )
        self.assertEqual(supervised["next_agent"], "finish")

    def test_supervisor_records_route_history(self):
        state = {
            "messages": [HumanMessage(content="当前数据库有哪些表")],
            "context_data": {"route_history": ["context_injector"]},
        }
        supervised = _supervisor_node(
            state,
            config={"configurable": {"agent_profile": "database", "supervisor_llm": "off"}},
        )
        self.assertIn("context_data", supervised)
        self.assertEqual(supervised["context_data"]["route_history"][-1], supervised["next_agent"])
        self.assertIn("supervisor_trace", supervised["context_data"])
        self.assertEqual(supervised["context_data"]["supervisor_trace"][-1]["next_agent"], supervised["next_agent"])
        self.assertIn("at", supervised["context_data"]["supervisor_trace"][-1])

    def test_analysis_worker_prompt_selected(self):
        prompt = agent_state_modifier(
            {"messages": [HumanMessage(content="画图分析")], "context_data": {}},
            config={"configurable": {"agent_profile": "analysis_worker"}},
        )
        self.assertIn("Analysis Worker", prompt)

    def test_delivery_worker_prompt_selected(self):
        prompt = agent_state_modifier(
            {"messages": [HumanMessage(content="导出发送")], "context_data": {}},
            config={"configurable": {"agent_profile": "delivery_worker"}},
        )
        self.assertIn("Delivery Worker", prompt)


class WorkerProfilePropagationTests(unittest.IsolatedAsyncioTestCase):
    async def test_analysis_worker_sets_agent_profile_for_react(self):
        captured = {}

        class _FakeReactGraph:
            async def ainvoke(self, _inputs, config=None):
                captured["config"] = config
                return {"messages": []}

        with patch("core.agent._create_autonomous_react_graph", return_value=_FakeReactGraph()):
            await _analysis_worker_node(
                {"messages": [HumanMessage(content="请做图表分析")], "context_data": {}},
                config={"configurable": {"model_name": "deepseek-chat"}},
            )

        self.assertEqual(captured["config"]["configurable"]["agent_profile"], "analysis_worker")

    async def test_delivery_worker_sets_agent_profile_for_react(self):
        captured = {}

        class _FakeReactGraph:
            async def ainvoke(self, _inputs, config=None):
                captured["config"] = config
                return {"messages": []}

        with patch("core.agent._create_autonomous_react_graph", return_value=_FakeReactGraph()):
            await _delivery_worker_node(
                {"messages": [HumanMessage(content="导出并发送")], "context_data": {}},
                config={"configurable": {"model_name": "deepseek-chat"}},
            )

        self.assertEqual(captured["config"]["configurable"]["agent_profile"], "delivery_worker")


if __name__ == "__main__":
    unittest.main()
