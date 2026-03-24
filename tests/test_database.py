import unittest
from unittest.mock import patch

from core.database import _engine_cache, format_database_error, get_engine_by_url, normalize_database_url


class DatabaseUrlNormalizationTests(unittest.TestCase):
    def setUp(self):
        _engine_cache.clear()

    def test_keeps_utf8_percent_encoded_url_unchanged(self):
        url = "postgresql+psycopg2://user:%E4%B8%AD%E6%96%87@localhost:5432/demo"

        normalized = normalize_database_url(url)

        self.assertEqual(normalized, url)

    def test_normalizes_gbk_percent_encoded_password(self):
        url = "postgresql+psycopg2://user:%D6%D0%CE%C4@localhost:5432/demo"

        normalized = normalize_database_url(url)

        self.assertEqual(
            normalized,
            "postgresql+psycopg2://user:%E4%B8%AD%E6%96%87@localhost:5432/demo",
        )

    def test_normalizes_gbk_percent_encoded_database_name(self):
        url = "postgresql+psycopg2://user:pass@localhost:5432/%D1%DD%CA%BE"

        normalized = normalize_database_url(url)

        self.assertEqual(
            normalized,
            "postgresql+psycopg2://user:pass@localhost:5432/%E6%BC%94%E7%A4%BA",
        )

    def test_decodes_windows_localized_postgres_error_message(self):
        raw = b'connection to server at "localhost" (::1), port 5432 failed: \xd6\xc2\xc3\xfc\xb4\xed\xce\xf3:  \xd3\xc3\xbb\xa7 "postgres" Password \xc8\xcf\xd6\xa4\xca\xa7\xb0\xdc\n'
        exc = UnicodeDecodeError("utf-8", raw, 61, 62, "invalid continuation byte")

        message = format_database_error(exc)

        self.assertIn('用户 "postgres" Password 认证失败', message)

    def test_engine_uses_real_password_instead_of_masked_string(self):
        with patch("core.database.create_engine") as create_engine_mock:
            create_engine_mock.return_value = object()

            get_engine_by_url("postgresql+psycopg2://postgres:postgres@localhost:5432/demo")

        engine_url = create_engine_mock.call_args.args[0]
        self.assertEqual(
            engine_url,
            "postgresql+psycopg2://postgres:postgres@localhost:5432/demo",
        )


if __name__ == "__main__":
    unittest.main()
