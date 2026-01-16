#!/usr/bin/env python3
"""
ZARAH - Assertion and Validation Utilities

Provides comprehensive assertion methods for test validation.
"""

import re
from typing import Any, Callable
from dataclasses import dataclass


@dataclass
class AssertionResult:
    """Result of an assertion check."""
    passed: bool
    expected: Any
    actual: Any
    message: str
    assertion_type: str


class Assertions:
    """
    Comprehensive assertion library for Zarah QA Agent.

    Provides fluent assertion methods for validating test conditions.
    """

    def __init__(self):
        self.soft_mode = False
        self.failures: list[AssertionResult] = []

    def soft_assert(self, enabled: bool = True) -> "Assertions":
        """Enable soft assertions (collect all failures instead of stopping)."""
        self.soft_mode = enabled
        return self

    def clear_failures(self):
        """Clear collected soft assertion failures."""
        self.failures.clear()

    def get_failures(self) -> list[AssertionResult]:
        """Get all soft assertion failures."""
        return self.failures.copy()

    def _handle_result(self, result: AssertionResult) -> bool:
        """Handle assertion result based on mode."""
        if not result.passed:
            if self.soft_mode:
                self.failures.append(result)
            # In hard mode, just return False (caller handles it)
        return result.passed

    # ========== Equality Assertions ==========

    def equals(self, actual: Any, expected: Any, message: str = "") -> bool:
        """Assert that actual equals expected."""
        passed = actual == expected
        result = AssertionResult(
            passed=passed,
            expected=expected,
            actual=actual,
            message=message or f"Expected {expected}, got {actual}",
            assertion_type="equals"
        )
        return self._handle_result(result)

    def not_equals(self, actual: Any, expected: Any, message: str = "") -> bool:
        """Assert that actual does not equal expected."""
        passed = actual != expected
        result = AssertionResult(
            passed=passed,
            expected=f"not {expected}",
            actual=actual,
            message=message or f"Expected not {expected}, got {actual}",
            assertion_type="not_equals"
        )
        return self._handle_result(result)

    def is_true(self, value: Any, message: str = "") -> bool:
        """Assert that value is truthy."""
        passed = bool(value)
        result = AssertionResult(
            passed=passed,
            expected=True,
            actual=value,
            message=message or f"Expected truthy value, got {value}",
            assertion_type="is_true"
        )
        return self._handle_result(result)

    def is_false(self, value: Any, message: str = "") -> bool:
        """Assert that value is falsy."""
        passed = not bool(value)
        result = AssertionResult(
            passed=passed,
            expected=False,
            actual=value,
            message=message or f"Expected falsy value, got {value}",
            assertion_type="is_false"
        )
        return self._handle_result(result)

    def is_none(self, value: Any, message: str = "") -> bool:
        """Assert that value is None."""
        passed = value is None
        result = AssertionResult(
            passed=passed,
            expected=None,
            actual=value,
            message=message or f"Expected None, got {value}",
            assertion_type="is_none"
        )
        return self._handle_result(result)

    def is_not_none(self, value: Any, message: str = "") -> bool:
        """Assert that value is not None."""
        passed = value is not None
        result = AssertionResult(
            passed=passed,
            expected="not None",
            actual=value,
            message=message or f"Expected not None, got None",
            assertion_type="is_not_none"
        )
        return self._handle_result(result)

    # ========== String Assertions ==========

    def contains(self, haystack: str, needle: str, message: str = "") -> bool:
        """Assert that haystack contains needle."""
        passed = needle in str(haystack)
        result = AssertionResult(
            passed=passed,
            expected=f"contains '{needle}'",
            actual=haystack[:100] if len(str(haystack)) > 100 else haystack,
            message=message or f"Expected '{needle}' to be in string",
            assertion_type="contains"
        )
        return self._handle_result(result)

    def not_contains(self, haystack: str, needle: str, message: str = "") -> bool:
        """Assert that haystack does not contain needle."""
        passed = needle not in str(haystack)
        result = AssertionResult(
            passed=passed,
            expected=f"not contains '{needle}'",
            actual=haystack[:100] if len(str(haystack)) > 100 else haystack,
            message=message or f"Expected '{needle}' to not be in string",
            assertion_type="not_contains"
        )
        return self._handle_result(result)

    def starts_with(self, string: str, prefix: str, message: str = "") -> bool:
        """Assert that string starts with prefix."""
        passed = str(string).startswith(prefix)
        result = AssertionResult(
            passed=passed,
            expected=f"starts with '{prefix}'",
            actual=string[:len(prefix) + 20] if len(str(string)) > len(prefix) + 20 else string,
            message=message or f"Expected string to start with '{prefix}'",
            assertion_type="starts_with"
        )
        return self._handle_result(result)

    def ends_with(self, string: str, suffix: str, message: str = "") -> bool:
        """Assert that string ends with suffix."""
        passed = str(string).endswith(suffix)
        result = AssertionResult(
            passed=passed,
            expected=f"ends with '{suffix}'",
            actual=string[-len(suffix) - 20:] if len(str(string)) > len(suffix) + 20 else string,
            message=message or f"Expected string to end with '{suffix}'",
            assertion_type="ends_with"
        )
        return self._handle_result(result)

    def matches_regex(self, string: str, pattern: str, message: str = "") -> bool:
        """Assert that string matches regex pattern."""
        passed = bool(re.search(pattern, str(string)))
        result = AssertionResult(
            passed=passed,
            expected=f"matches /{pattern}/",
            actual=string[:100] if len(str(string)) > 100 else string,
            message=message or f"Expected string to match pattern '{pattern}'",
            assertion_type="matches_regex"
        )
        return self._handle_result(result)

    def is_empty(self, value: str, message: str = "") -> bool:
        """Assert that string is empty."""
        passed = len(str(value)) == 0
        result = AssertionResult(
            passed=passed,
            expected="empty string",
            actual=value,
            message=message or f"Expected empty string, got '{value}'",
            assertion_type="is_empty"
        )
        return self._handle_result(result)

    def is_not_empty(self, value: str, message: str = "") -> bool:
        """Assert that string is not empty."""
        passed = len(str(value)) > 0
        result = AssertionResult(
            passed=passed,
            expected="non-empty string",
            actual=value,
            message=message or "Expected non-empty string, got empty",
            assertion_type="is_not_empty"
        )
        return self._handle_result(result)

    # ========== Numeric Assertions ==========

    def greater_than(self, actual: float, expected: float, message: str = "") -> bool:
        """Assert that actual is greater than expected."""
        passed = actual > expected
        result = AssertionResult(
            passed=passed,
            expected=f"> {expected}",
            actual=actual,
            message=message or f"Expected {actual} > {expected}",
            assertion_type="greater_than"
        )
        return self._handle_result(result)

    def greater_than_or_equal(self, actual: float, expected: float, message: str = "") -> bool:
        """Assert that actual is greater than or equal to expected."""
        passed = actual >= expected
        result = AssertionResult(
            passed=passed,
            expected=f">= {expected}",
            actual=actual,
            message=message or f"Expected {actual} >= {expected}",
            assertion_type="greater_than_or_equal"
        )
        return self._handle_result(result)

    def less_than(self, actual: float, expected: float, message: str = "") -> bool:
        """Assert that actual is less than expected."""
        passed = actual < expected
        result = AssertionResult(
            passed=passed,
            expected=f"< {expected}",
            actual=actual,
            message=message or f"Expected {actual} < {expected}",
            assertion_type="less_than"
        )
        return self._handle_result(result)

    def less_than_or_equal(self, actual: float, expected: float, message: str = "") -> bool:
        """Assert that actual is less than or equal to expected."""
        passed = actual <= expected
        result = AssertionResult(
            passed=passed,
            expected=f"<= {expected}",
            actual=actual,
            message=message or f"Expected {actual} <= {expected}",
            assertion_type="less_than_or_equal"
        )
        return self._handle_result(result)

    def between(self, actual: float, min_val: float, max_val: float, message: str = "") -> bool:
        """Assert that actual is between min and max (inclusive)."""
        passed = min_val <= actual <= max_val
        result = AssertionResult(
            passed=passed,
            expected=f"between {min_val} and {max_val}",
            actual=actual,
            message=message or f"Expected {actual} to be between {min_val} and {max_val}",
            assertion_type="between"
        )
        return self._handle_result(result)

    # ========== Collection Assertions ==========

    def has_length(self, collection: Any, expected_length: int, message: str = "") -> bool:
        """Assert that collection has expected length."""
        actual_length = len(collection)
        passed = actual_length == expected_length
        result = AssertionResult(
            passed=passed,
            expected=f"length {expected_length}",
            actual=f"length {actual_length}",
            message=message or f"Expected length {expected_length}, got {actual_length}",
            assertion_type="has_length"
        )
        return self._handle_result(result)

    def contains_item(self, collection: list, item: Any, message: str = "") -> bool:
        """Assert that collection contains item."""
        passed = item in collection
        result = AssertionResult(
            passed=passed,
            expected=f"contains {item}",
            actual=collection[:5] if len(collection) > 5 else collection,
            message=message or f"Expected collection to contain {item}",
            assertion_type="contains_item"
        )
        return self._handle_result(result)

    def all_match(self, collection: list, predicate: Callable[[Any], bool], message: str = "") -> bool:
        """Assert that all items in collection match predicate."""
        passed = all(predicate(item) for item in collection)
        result = AssertionResult(
            passed=passed,
            expected="all items match predicate",
            actual=f"{sum(1 for i in collection if predicate(i))}/{len(collection)} matched",
            message=message or "Not all items matched the predicate",
            assertion_type="all_match"
        )
        return self._handle_result(result)

    def any_match(self, collection: list, predicate: Callable[[Any], bool], message: str = "") -> bool:
        """Assert that at least one item in collection matches predicate."""
        passed = any(predicate(item) for item in collection)
        result = AssertionResult(
            passed=passed,
            expected="at least one item matches predicate",
            actual=f"{sum(1 for i in collection if predicate(i))}/{len(collection)} matched",
            message=message or "No items matched the predicate",
            assertion_type="any_match"
        )
        return self._handle_result(result)

    # ========== Type Assertions ==========

    def is_type(self, value: Any, expected_type: type, message: str = "") -> bool:
        """Assert that value is of expected type."""
        passed = isinstance(value, expected_type)
        result = AssertionResult(
            passed=passed,
            expected=expected_type.__name__,
            actual=type(value).__name__,
            message=message or f"Expected type {expected_type.__name__}, got {type(value).__name__}",
            assertion_type="is_type"
        )
        return self._handle_result(result)

    # ========== URL Assertions ==========

    def is_valid_url(self, url: str, message: str = "") -> bool:
        """Assert that string is a valid URL."""
        url_pattern = re.compile(
            r'^https?://'
            r'(?:(?:[A-Z0-9](?:[A-Z0-9-]{0,61}[A-Z0-9])?\.)+[A-Z]{2,6}\.?|'
            r'localhost|'
            r'\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})'
            r'(?::\d+)?'
            r'(?:/?|[/?]\S+)$', re.IGNORECASE
        )
        passed = bool(url_pattern.match(url))
        result = AssertionResult(
            passed=passed,
            expected="valid URL",
            actual=url,
            message=message or f"'{url}' is not a valid URL",
            assertion_type="is_valid_url"
        )
        return self._handle_result(result)

    def url_contains_path(self, url: str, path: str, message: str = "") -> bool:
        """Assert that URL contains specified path."""
        passed = path in url
        result = AssertionResult(
            passed=passed,
            expected=f"URL contains path '{path}'",
            actual=url,
            message=message or f"URL does not contain path '{path}'",
            assertion_type="url_contains_path"
        )
        return self._handle_result(result)

    # ========== HTML/DOM Assertions ==========

    def html_contains_tag(self, html: str, tag: str, message: str = "") -> bool:
        """Assert that HTML contains specified tag."""
        pattern = f"<{tag}[^>]*>"
        passed = bool(re.search(pattern, html, re.IGNORECASE))
        result = AssertionResult(
            passed=passed,
            expected=f"contains <{tag}> tag",
            actual=f"HTML ({len(html)} chars)",
            message=message or f"HTML does not contain <{tag}> tag",
            assertion_type="html_contains_tag"
        )
        return self._handle_result(result)

    def html_contains_text(self, html: str, text: str, message: str = "") -> bool:
        """Assert that HTML contains specified text."""
        # Remove HTML tags for text comparison
        clean_text = re.sub(r'<[^>]+>', '', html)
        passed = text in clean_text
        result = AssertionResult(
            passed=passed,
            expected=f"contains text '{text}'",
            actual=f"HTML content",
            message=message or f"HTML does not contain text '{text}'",
            assertion_type="html_contains_text"
        )
        return self._handle_result(result)

    def has_attribute(self, html: str, tag: str, attribute: str, value: str = None, message: str = "") -> bool:
        """Assert that HTML tag has specified attribute."""
        if value:
            pattern = f'<{tag}[^>]*{attribute}=["\']?{re.escape(value)}["\']?[^>]*>'
        else:
            pattern = f'<{tag}[^>]*{attribute}[^>]*>'

        passed = bool(re.search(pattern, html, re.IGNORECASE))
        expected = f"<{tag}> with {attribute}" + (f"='{value}'" if value else "")
        result = AssertionResult(
            passed=passed,
            expected=expected,
            actual=f"HTML ({len(html)} chars)",
            message=message or f"HTML does not have {expected}",
            assertion_type="has_attribute"
        )
        return self._handle_result(result)


# ========== Fluent Assertion Builder ==========

class ExpectChain:
    """Fluent assertion chain for more readable tests."""

    def __init__(self, value: Any, assertions: Assertions = None):
        self.value = value
        self.assertions = assertions or Assertions()

    def to_equal(self, expected: Any) -> "ExpectChain":
        """Assert equality."""
        self.assertions.equals(self.value, expected)
        return self

    def to_contain(self, expected: str) -> "ExpectChain":
        """Assert contains."""
        self.assertions.contains(self.value, expected)
        return self

    def to_be_true(self) -> "ExpectChain":
        """Assert truthy."""
        self.assertions.is_true(self.value)
        return self

    def to_be_false(self) -> "ExpectChain":
        """Assert falsy."""
        self.assertions.is_false(self.value)
        return self

    def to_match(self, pattern: str) -> "ExpectChain":
        """Assert regex match."""
        self.assertions.matches_regex(self.value, pattern)
        return self

    def to_have_length(self, length: int) -> "ExpectChain":
        """Assert length."""
        self.assertions.has_length(self.value, length)
        return self


def expect(value: Any) -> ExpectChain:
    """Start a fluent assertion chain."""
    return ExpectChain(value)
