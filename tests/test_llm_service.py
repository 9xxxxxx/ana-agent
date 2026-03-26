import unittest
from unittest.mock import patch

from core.services import llm_service


class ResolveModelConfigurationTests(unittest.TestCase):
    def test_deepseek_model_overrides_mismatched_openai_base_url(self):
        with patch.object(llm_service.settings, "OPENAI_API_KEY", "sk-real"), patch.object(
            llm_service.settings, "OPENAI_API_BASE", "https://api.openai.com/v1"
        ):
            resolved = llm_service.resolve_model_configuration("deepseek-chat")

        self.assertEqual(resolved.provider, "deepseek")
        self.assertEqual(resolved.base_url, "https://api.deepseek.com/v1")

    def test_placeholder_api_key_is_rejected(self):
        with patch.object(llm_service.settings, "OPENAI_API_KEY", "sk-xxxxxxx"), patch.object(
            llm_service.settings, "OPENAI_API_BASE", ""
        ):
            with self.assertRaises(ValueError):
                llm_service.resolve_model_configuration("gpt-4o")

    def test_unsupported_model_is_rejected(self):
        with patch.object(llm_service.settings, "OPENAI_API_KEY", "sk-real"), patch.object(
            llm_service.settings, "OPENAI_API_BASE", ""
        ):
            with self.assertRaises(ValueError):
                llm_service.resolve_model_configuration("claude-3-5-sonnet")

    def test_unknown_model_allowed_with_explicit_base_url(self):
        with patch.object(llm_service.settings, "OPENAI_API_KEY", "sk-real"), patch.object(
            llm_service.settings, "OPENAI_API_BASE", ""
        ):
            resolved = llm_service.resolve_model_configuration(
                "claude-3-5-sonnet",
                base_url="https://example-openai-compatible/v1",
            )

        self.assertEqual(resolved.provider, "openai")
        self.assertEqual(resolved.base_url, "https://example-openai-compatible/v1")


if __name__ == "__main__":
    unittest.main()
