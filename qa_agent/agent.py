#!/usr/bin/env python3
"""
ZARAH - Expert Browser QA Testing Agent

Zarah is an intelligent QA testing agent equipped with MCP browser automation
capabilities for comprehensive web application testing.
"""

import asyncio
import json
import os
import re
import base64
from datetime import datetime
from typing import Any, Callable
from dataclasses import dataclass, field
from contextlib import asynccontextmanager

from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client

from .scenarios import TestScenario, TestStep, TestSuite, StepResult, TestResult
from .assertions import Assertions
from .reporter import TestReporter


@dataclass
class AgentConfig:
    """Configuration for the QA Testing Agent."""
    server_command: str = "/root/payverse/venv/bin/python"
    server_script: str = "/root/payverse/mcp_browser_server.py"
    screenshot_dir: str = "/root/payverse/qa_screenshots"
    report_dir: str = "/root/payverse/qa_reports"
    default_timeout: int = 30000
    retry_attempts: int = 3
    retry_delay: float = 1.0
    verbose: bool = True


class QATestingAgent:
    """
    ZARAH - Expert Browser QA Testing Agent.

    Zarah provides comprehensive browser testing capabilities through MCP,
    including navigation, interaction, validation, and reporting.

    Named after the meticulous attention to detail that defines expert QA work.
    """

    def __init__(self, config: AgentConfig | None = None):
        self.config = config or AgentConfig()
        self.assertions = Assertions()
        self.reporter = TestReporter(self.config.report_dir)
        self.current_url: str = ""
        self.test_results: list[TestResult] = []

        # Ensure directories exist
        os.makedirs(self.config.screenshot_dir, exist_ok=True)
        os.makedirs(self.config.report_dir, exist_ok=True)

    def log(self, message: str, level: str = "INFO"):
        """Log a message if verbose mode is enabled."""
        if self.config.verbose:
            timestamp = datetime.now().strftime("%H:%M:%S")
            print(f"[{timestamp}] [{level}] {message}")

    @asynccontextmanager
    async def _get_session(self):
        """Get an MCP session context."""
        server_params = StdioServerParameters(
            command=self.config.server_command,
            args=[self.config.server_script],
            env={"DISPLAY": ":0"}
        )

        async with stdio_client(server_params) as (read, write):
            async with ClientSession(read, write) as session:
                await session.initialize()
                yield session

    async def _call_tool_in_session(self, session: ClientSession, name: str, arguments: dict[str, Any]) -> dict[str, Any]:
        """Execute a tool call through an existing MCP session."""
        result = await session.call_tool(name, arguments)

        response = {"success": True, "content": []}
        for content in result.content:
            if hasattr(content, "text"):
                response["content"].append({"type": "text", "text": content.text})
                if "Error:" in content.text:
                    response["success"] = False
                    response["error"] = content.text
            elif hasattr(content, "data"):
                response["content"].append({
                    "type": "image",
                    "data": content.data,
                    "mimeType": getattr(content, "mimeType", "image/png")
                })

        return response

    def _save_screenshot(self, data: str, name: str) -> str:
        """Save screenshot data to file."""
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        filename = f"{name}_{timestamp}.png"
        filepath = os.path.join(self.config.screenshot_dir, filename)

        with open(filepath, "wb") as f:
            f.write(base64.b64decode(data))

        return filepath

    # ========== Test Execution ==========

    async def run_step_in_session(self, session: ClientSession, step: TestStep) -> StepResult:
        """Execute a single test step within an existing session."""
        start_time = datetime.now()
        result = StepResult(
            step=step,
            status="pending",
            start_time=start_time
        )

        try:
            self.log(f"Executing step: {step.name}", "STEP")

            if step.action == "navigate":
                action_result = await self._call_tool_in_session(
                    session, "browser_navigate", {"url": step.target}
                )
                if action_result["success"]:
                    self.current_url = step.target

            elif step.action == "click":
                action_result = await self._call_tool_in_session(
                    session, "browser_click", {"selector": step.target}
                )

            elif step.action == "type":
                action_result = await self._call_tool_in_session(
                    session, "browser_type", {"selector": step.target, "text": step.value or ""}
                )

            elif step.action == "wait":
                action_result = await self._call_tool_in_session(
                    session, "browser_wait", {"selector": step.target if step.target else None, "timeout": step.timeout or 1000}
                )

            elif step.action == "scroll":
                direction = step.value or "down"
                action_result = await self._call_tool_in_session(
                    session, "browser_scroll", {"direction": direction, "amount": step.timeout or 500}
                )

            elif step.action == "screenshot":
                action_result = await self._call_tool_in_session(
                    session, "browser_screenshot", {}
                )
                if action_result["success"]:
                    for content in action_result["content"]:
                        if content.get("type") == "image":
                            filepath = self._save_screenshot(content["data"], step.target or step.name)
                            self.log(f"Screenshot saved: {filepath}")
                            result.screenshot = filepath
                            break

            elif step.action == "assert_text":
                content_result = await self._call_tool_in_session(
                    session, "browser_get_content", {}
                )
                if content_result["success"] and content_result["content"]:
                    page_content = content_result["content"][0].get("text", "")
                    passed = step.target.lower() in page_content.lower()
                    self.log(f"Text assertion: '{step.target}' present = {passed}")
                    action_result = {"success": passed}
                else:
                    action_result = {"success": False, "error": "Could not get page content"}

            elif step.action == "assert_element":
                html_result = await self._call_tool_in_session(
                    session, "browser_get_html", {}
                )
                if html_result["success"] and html_result["content"]:
                    html = html_result["content"][0].get("text", "")
                    passed = self._selector_matches_html(step.target, html)
                    self.log(f"Element assertion: '{step.target}' exists = {passed}")
                    action_result = {"success": passed}
                else:
                    action_result = {"success": False, "error": "Could not get page HTML"}

            elif step.action == "assert_url":
                passed = step.target.lower() in self.current_url.lower()
                self.log(f"URL assertion: '{step.target}' in '{self.current_url}' = {passed}")
                action_result = {"success": passed}

            elif step.action == "assert_title":
                html_result = await self._call_tool_in_session(
                    session, "browser_get_html", {}
                )
                if html_result["success"] and html_result["content"]:
                    html = html_result["content"][0].get("text", "")
                    title_match = re.search(r"<title>(.*?)</title>", html, re.IGNORECASE)
                    if title_match:
                        title = title_match.group(1)
                        passed = step.target.lower() in title.lower()
                        self.log(f"Title assertion: '{step.target}' in '{title}' = {passed}")
                        action_result = {"success": passed}
                    else:
                        action_result = {"success": False, "error": "No title found"}
                else:
                    action_result = {"success": False, "error": "Could not get page HTML"}

            else:
                action_result = {"success": False, "error": f"Unknown action: {step.action}"}

            result.status = "passed" if action_result.get("success", False) else "failed"
            result.message = action_result.get("error", "")

            # Take screenshot on failure if configured
            if result.status == "failed" and step.screenshot_on_failure:
                screenshot_result = await self._call_tool_in_session(
                    session, "browser_screenshot", {}
                )
                if screenshot_result["success"]:
                    for content in screenshot_result["content"]:
                        if content.get("type") == "image":
                            filepath = self._save_screenshot(content["data"], f"failure_{step.name}")
                            self.log(f"Screenshot saved: {filepath}")
                            result.screenshot = filepath
                            break

        except Exception as e:
            result.status = "error"
            result.message = str(e)
            self.log(f"Step error: {e}", "ERROR")

        result.end_time = datetime.now()
        result.duration = (result.end_time - start_time).total_seconds()

        status_icon = "✓" if result.status == "passed" else "✗" if result.status == "failed" else "⚠"
        self.log(f"{status_icon} Step '{step.name}': {result.status} ({result.duration:.2f}s)")

        return result

    def _selector_matches_html(self, selector: str, html: str) -> bool:
        """Check if a CSS selector might match HTML content."""
        if selector.startswith("#"):
            return f'id="{selector[1:]}"' in html or f"id='{selector[1:]}'" in html
        if selector.startswith("."):
            return f'class="' in html and selector[1:] in html
        return f"<{selector}" in html.lower()

    async def run_scenario(self, scenario: TestScenario) -> TestResult:
        """Execute a complete test scenario."""
        self.log(f"\n{'='*60}")
        self.log(f"Running Scenario: {scenario.name}")
        self.log(f"Description: {scenario.description}")
        self.log(f"{'='*60}\n")

        start_time = datetime.now()
        step_results: list[StepResult] = []

        async with self._get_session() as session:
            try:
                # Setup
                if scenario.setup_steps:
                    self.log("Running setup steps...", "SETUP")
                    for step in scenario.setup_steps:
                        result = await self.run_step_in_session(session, step)
                        step_results.append(result)
                        if result.status != "passed" and step.critical:
                            raise Exception(f"Critical setup step failed: {step.name}")

                # Main test steps
                self.log("Running test steps...", "TEST")
                for step in scenario.steps:
                    result = await self.run_step_in_session(session, step)
                    step_results.append(result)

                    if result.status != "passed" and step.critical:
                        self.log(f"Critical step failed, stopping scenario", "ERROR")
                        break

                # Teardown
                if scenario.teardown_steps:
                    self.log("Running teardown steps...", "TEARDOWN")
                    for step in scenario.teardown_steps:
                        result = await self.run_step_in_session(session, step)
                        step_results.append(result)

            except Exception as e:
                self.log(f"Scenario error: {e}", "ERROR")

        end_time = datetime.now()

        failed_steps = [r for r in step_results if r.status == "failed"]
        error_steps = [r for r in step_results if r.status == "error"]

        if error_steps:
            status = "error"
        elif failed_steps:
            status = "failed"
        else:
            status = "passed"

        test_result = TestResult(
            scenario=scenario,
            status=status,
            step_results=step_results,
            start_time=start_time,
            end_time=end_time,
            duration=(end_time - start_time).total_seconds()
        )

        self.test_results.append(test_result)

        self.log(f"\n{'='*60}")
        self.log(f"Scenario Complete: {scenario.name}")
        self.log(f"Status: {status.upper()}")
        self.log(f"Duration: {test_result.duration:.2f}s")
        self.log(f"Steps: {len(step_results)} total, {len(failed_steps)} failed, {len(error_steps)} errors")
        self.log(f"{'='*60}\n")

        return test_result

    async def run_suite(self, suite: TestSuite) -> list[TestResult]:
        """Execute a complete test suite."""
        self.log(f"\n{'#'*60}")
        self.log(f"# TEST SUITE: {suite.name}")
        self.log(f"# Scenarios: {len(suite.scenarios)}")
        self.log(f"{'#'*60}\n")

        results = []
        for scenario in suite.scenarios:
            result = await self.run_scenario(scenario)
            results.append(result)

        report_path = self.reporter.generate_report(suite, results)
        self.log(f"\nTest report generated: {report_path}")

        return results

    async def close(self):
        """Cleanup method (browser closes automatically with session)."""
        self.log("Closing browser")

    # ========== Convenience Methods ==========

    async def navigate(self, url: str) -> dict[str, Any]:
        """Navigate to a URL (creates new session)."""
        self.log(f"Navigating to: {url}")
        async with self._get_session() as session:
            result = await self._call_tool_in_session(session, "browser_navigate", {"url": url})
            if result["success"]:
                self.current_url = url
            return result

    async def screenshot(self, name: str = None) -> str:
        """Take a screenshot (creates new session)."""
        async with self._get_session() as session:
            result = await self._call_tool_in_session(session, "browser_screenshot", {})
            if result["success"]:
                for content in result["content"]:
                    if content.get("type") == "image":
                        filepath = self._save_screenshot(content["data"], name or "screenshot")
                        self.log(f"Screenshot saved: {filepath}")
                        return filepath
        return ""

    async def get_content(self) -> str:
        """Get page content (creates new session)."""
        async with self._get_session() as session:
            result = await self._call_tool_in_session(session, "browser_get_content", {})
            if result["success"] and result["content"]:
                return result["content"][0].get("text", "")
        return ""

    async def click(self, selector: str) -> dict[str, Any]:
        """Click an element (creates new session)."""
        self.log(f"Clicking: {selector}")
        async with self._get_session() as session:
            return await self._call_tool_in_session(session, "browser_click", {"selector": selector})

    async def type_text(self, selector: str, text: str) -> dict[str, Any]:
        """Type text (creates new session)."""
        self.log(f"Typing into {selector}")
        async with self._get_session() as session:
            return await self._call_tool_in_session(session, "browser_type", {"selector": selector, "text": text})

    async def wait(self, selector: str = None, timeout: int = 1000) -> dict[str, Any]:
        """Wait (creates new session)."""
        async with self._get_session() as session:
            return await self._call_tool_in_session(session, "browser_wait", {"selector": selector, "timeout": timeout})

    async def scroll(self, direction: str = "down", amount: int = 500) -> dict[str, Any]:
        """Scroll (creates new session)."""
        async with self._get_session() as session:
            return await self._call_tool_in_session(session, "browser_scroll", {"direction": direction, "amount": amount})

    async def assert_text_present(self, text: str) -> bool:
        """Assert text is present."""
        content = await self.get_content()
        return text.lower() in content.lower()

    async def test_page_loads(self, url: str, expected_text: str = None) -> TestResult:
        """Quick test that a page loads successfully."""
        scenario = TestScenario(
            name=f"Page Load Test: {url}",
            description=f"Verify that {url} loads correctly",
            steps=[
                TestStep(name="Navigate", action="navigate", target=url, critical=True),
                TestStep(name="Screenshot", action="screenshot", target="page_load"),
            ]
        )

        if expected_text:
            scenario.steps.append(
                TestStep(name="Verify Text", action="assert_text", target=expected_text)
            )

        return await self.run_scenario(scenario)

    async def test_form_submission(
        self,
        url: str,
        form_data: dict[str, str],
        submit_selector: str,
        success_indicator: str
    ) -> TestResult:
        """Quick test for form submission."""
        steps = [
            TestStep(name="Navigate", action="navigate", target=url, critical=True),
        ]

        for selector, value in form_data.items():
            steps.append(
                TestStep(name=f"Fill {selector}", action="type", target=selector, value=value)
            )

        steps.extend([
            TestStep(name="Screenshot Before Submit", action="screenshot", target="before_submit"),
            TestStep(name="Submit Form", action="click", target=submit_selector, critical=True),
            TestStep(name="Wait for Response", action="wait", timeout=2000),
            TestStep(name="Screenshot After Submit", action="screenshot", target="after_submit"),
            TestStep(name="Verify Success", action="assert_text", target=success_indicator),
        ])

        scenario = TestScenario(
            name=f"Form Submission Test: {url}",
            description="Test form submission workflow",
            steps=steps
        )

        return await self.run_scenario(scenario)
