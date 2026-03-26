import json
import unittest
from unittest.mock import MagicMock, patch
import urllib.error

from core.feishu_api import build_feishu_card_v2, send_feishu_card
from core.tools.notification_tools import send_feishu_notification_tool


class FeishuApiTests(unittest.TestCase):
    def test_build_feishu_card_v2_does_not_mutate_input_elements(self):
        elements = [{"tag": "markdown", "content": "hello"}]

        card = build_feishu_card_v2("test", elements)

        self.assertEqual(len(elements), 1)
        self.assertEqual(elements[0]["content"], "hello")
        self.assertEqual(card["card"]["body"]["elements"][0]["content"], "hello")
        self.assertEqual(len(card["card"]["body"]["elements"]), 3)

    def test_send_feishu_card_retries_on_transient_error(self):
        ok_response = MagicMock()
        ok_response.read.return_value = b'{"code": 0, "msg": "ok"}'

        ok_context = MagicMock()
        ok_context.__enter__.return_value = ok_response
        ok_context.__exit__.return_value = None

        with patch(
            "core.feishu_api.urllib.request.urlopen",
            side_effect=[urllib.error.URLError("temporary"), ok_context],
        ) as mocked_urlopen, patch("core.feishu_api.time.sleep"):
            result = send_feishu_card(
                "https://open.feishu.cn/open-apis/bot/v2/hook/test",
                {"msg_type": "interactive", "card": {"schema": "2.0", "header": {}, "body": {"elements": []}}},
            )

        self.assertTrue(result["ok"])
        self.assertEqual(mocked_urlopen.call_count, 2)


class FeishuNotificationToolTests(unittest.TestCase):
    def test_rejects_non_readonly_chart_sql(self):
        chart_configs = json.dumps(
            [{"sql_query": "DELETE FROM orders", "chart_type": "bar", "title": "危险图", "x_col": "x", "y_col": "y"}],
            ensure_ascii=False,
        )

        with patch("core.tools.notification_tools.settings.FEISHU_WEBHOOK_URL", "https://open.feishu.cn/open-apis/bot/v2/hook/test"), \
             patch("core.database.run_query_to_dataframe") as mocked_query, \
             patch("core.feishu_api.send_feishu_card", return_value={"ok": True, "msg": "success"}):
            result = send_feishu_notification_tool.invoke(
                {
                    "content": "test content",
                    "chart_configs_json": chart_configs,
                }
            )

        self.assertIn("已成功推送到飞书群组", result)
        mocked_query.assert_not_called()


if __name__ == "__main__":
    unittest.main()
