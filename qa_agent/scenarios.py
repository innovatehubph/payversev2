#!/usr/bin/env python3
"""
ZARAH - Test Scenarios and Data Structures

Defines the test scenario structure for Zarah QA Agent.
"""

from dataclasses import dataclass, field
from datetime import datetime
from typing import Any
from enum import Enum


class ActionType(str, Enum):
    """Available test actions."""
    NAVIGATE = "navigate"
    CLICK = "click"
    TYPE = "type"
    WAIT = "wait"
    SCROLL = "scroll"
    SCREENSHOT = "screenshot"
    ASSERT_TEXT = "assert_text"
    ASSERT_ELEMENT = "assert_element"
    ASSERT_URL = "assert_url"
    ASSERT_TITLE = "assert_title"
    ASSERT_VALUE = "assert_value"
    HOVER = "hover"
    SELECT = "select"
    CLEAR = "clear"
    PRESS_KEY = "press_key"
    EXECUTE_JS = "execute_js"


class StepStatus(str, Enum):
    """Test step execution status."""
    PENDING = "pending"
    RUNNING = "running"
    PASSED = "passed"
    FAILED = "failed"
    SKIPPED = "skipped"
    ERROR = "error"


@dataclass
class TestStep:
    """
    A single test step within a scenario.

    Attributes:
        name: Human-readable step name
        action: The action to perform
        target: CSS selector, URL, or text target
        value: Value for input actions
        timeout: Timeout in milliseconds
        critical: If True, scenario stops on failure
        screenshot_on_failure: Take screenshot if step fails
        retry_count: Number of retries for this step
        description: Optional detailed description
        expected: Expected result for assertions
    """
    name: str
    action: str
    target: str = ""
    value: str | None = None
    timeout: int | None = None
    critical: bool = False
    screenshot_on_failure: bool = True
    retry_count: int = 0
    description: str = ""
    expected: Any = None

    def to_dict(self) -> dict:
        """Convert step to dictionary."""
        return {
            "name": self.name,
            "action": self.action,
            "target": self.target,
            "value": self.value,
            "timeout": self.timeout,
            "critical": self.critical,
            "description": self.description,
        }

    @classmethod
    def from_dict(cls, data: dict) -> "TestStep":
        """Create step from dictionary."""
        return cls(**data)


@dataclass
class StepResult:
    """Result of executing a test step."""
    step: TestStep
    status: str = "pending"
    message: str = ""
    screenshot: str = ""
    start_time: datetime = None
    end_time: datetime = None
    duration: float = 0.0
    actual_value: Any = None
    error_trace: str = ""

    def to_dict(self) -> dict:
        """Convert result to dictionary."""
        return {
            "step": self.step.to_dict(),
            "status": self.status,
            "message": self.message,
            "screenshot": self.screenshot,
            "start_time": self.start_time.isoformat() if self.start_time else None,
            "end_time": self.end_time.isoformat() if self.end_time else None,
            "duration": self.duration,
        }


@dataclass
class TestScenario:
    """
    A complete test scenario containing multiple steps.

    Attributes:
        name: Scenario name
        description: What this scenario tests
        steps: List of test steps to execute
        setup_steps: Steps to run before main tests
        teardown_steps: Steps to run after main tests (always runs)
        tags: Tags for filtering/categorization
        priority: Execution priority (lower = higher priority)
        timeout: Overall scenario timeout
        data: Test data for data-driven tests
    """
    name: str
    description: str = ""
    steps: list[TestStep] = field(default_factory=list)
    setup_steps: list[TestStep] = field(default_factory=list)
    teardown_steps: list[TestStep] = field(default_factory=list)
    tags: list[str] = field(default_factory=list)
    priority: int = 5
    timeout: int = 300000  # 5 minutes default
    data: dict = field(default_factory=dict)

    def add_step(self, step: TestStep) -> "TestScenario":
        """Add a step to the scenario (fluent interface)."""
        self.steps.append(step)
        return self

    def add_setup(self, step: TestStep) -> "TestScenario":
        """Add a setup step."""
        self.setup_steps.append(step)
        return self

    def add_teardown(self, step: TestStep) -> "TestScenario":
        """Add a teardown step."""
        self.teardown_steps.append(step)
        return self

    def to_dict(self) -> dict:
        """Convert scenario to dictionary."""
        return {
            "name": self.name,
            "description": self.description,
            "steps": [s.to_dict() for s in self.steps],
            "setup_steps": [s.to_dict() for s in self.setup_steps],
            "teardown_steps": [s.to_dict() for s in self.teardown_steps],
            "tags": self.tags,
            "priority": self.priority,
        }

    @classmethod
    def from_dict(cls, data: dict) -> "TestScenario":
        """Create scenario from dictionary."""
        return cls(
            name=data["name"],
            description=data.get("description", ""),
            steps=[TestStep.from_dict(s) for s in data.get("steps", [])],
            setup_steps=[TestStep.from_dict(s) for s in data.get("setup_steps", [])],
            teardown_steps=[TestStep.from_dict(s) for s in data.get("teardown_steps", [])],
            tags=data.get("tags", []),
            priority=data.get("priority", 5),
        )


@dataclass
class TestResult:
    """Result of executing a complete test scenario."""
    scenario: TestScenario
    status: str = "pending"
    step_results: list[StepResult] = field(default_factory=list)
    start_time: datetime = None
    end_time: datetime = None
    duration: float = 0.0
    error_message: str = ""

    @property
    def passed_steps(self) -> int:
        """Count of passed steps."""
        return len([r for r in self.step_results if r.status == "passed"])

    @property
    def failed_steps(self) -> int:
        """Count of failed steps."""
        return len([r for r in self.step_results if r.status == "failed"])

    @property
    def total_steps(self) -> int:
        """Total number of steps."""
        return len(self.step_results)

    def to_dict(self) -> dict:
        """Convert result to dictionary."""
        return {
            "scenario": self.scenario.to_dict(),
            "status": self.status,
            "step_results": [r.to_dict() for r in self.step_results],
            "start_time": self.start_time.isoformat() if self.start_time else None,
            "end_time": self.end_time.isoformat() if self.end_time else None,
            "duration": self.duration,
            "passed_steps": self.passed_steps,
            "failed_steps": self.failed_steps,
            "total_steps": self.total_steps,
        }


@dataclass
class TestSuite:
    """
    A collection of test scenarios.

    Attributes:
        name: Suite name
        description: What this suite tests
        scenarios: List of scenarios to execute
        parallel: Run scenarios in parallel if True
        stop_on_failure: Stop suite execution on first failure
        tags: Tags for filtering
    """
    name: str
    description: str = ""
    scenarios: list[TestScenario] = field(default_factory=list)
    parallel: bool = False
    stop_on_failure: bool = False
    tags: list[str] = field(default_factory=list)

    def add_scenario(self, scenario: TestScenario) -> "TestSuite":
        """Add a scenario to the suite."""
        self.scenarios.append(scenario)
        return self

    def filter_by_tag(self, tag: str) -> list[TestScenario]:
        """Get scenarios matching a tag."""
        return [s for s in self.scenarios if tag in s.tags]

    def to_dict(self) -> dict:
        """Convert suite to dictionary."""
        return {
            "name": self.name,
            "description": self.description,
            "scenarios": [s.to_dict() for s in self.scenarios],
            "tags": self.tags,
        }


# ========== Pre-built Scenario Templates ==========

class ScenarioTemplates:
    """Pre-built scenario templates for common test patterns."""

    @staticmethod
    def login_test(
        url: str,
        username_selector: str,
        password_selector: str,
        submit_selector: str,
        username: str,
        password: str,
        success_indicator: str
    ) -> TestScenario:
        """Create a login test scenario."""
        return TestScenario(
            name="Login Test",
            description=f"Test login functionality at {url}",
            tags=["login", "auth", "smoke"],
            steps=[
                TestStep(name="Navigate to Login", action="navigate", target=url, critical=True),
                TestStep(name="Enter Username", action="type", target=username_selector, value=username),
                TestStep(name="Enter Password", action="type", target=password_selector, value=password),
                TestStep(name="Screenshot Before Submit", action="screenshot", target="login_form"),
                TestStep(name="Submit Login", action="click", target=submit_selector, critical=True),
                TestStep(name="Wait for Response", action="wait", timeout=3000),
                TestStep(name="Verify Login Success", action="assert_text", target=success_indicator),
                TestStep(name="Screenshot After Login", action="screenshot", target="login_success"),
            ]
        )

    @staticmethod
    def page_load_test(url: str, expected_elements: list[str] = None) -> TestScenario:
        """Create a page load test scenario."""
        steps = [
            TestStep(name="Navigate", action="navigate", target=url, critical=True),
            TestStep(name="Wait for Load", action="wait", timeout=2000),
            TestStep(name="Screenshot", action="screenshot", target="page_load"),
        ]

        if expected_elements:
            for i, element in enumerate(expected_elements):
                steps.append(
                    TestStep(name=f"Verify Element {i+1}", action="assert_element", target=element)
                )

        return TestScenario(
            name=f"Page Load: {url}",
            description=f"Verify {url} loads correctly",
            tags=["smoke", "load"],
            steps=steps
        )

    @staticmethod
    def form_validation_test(
        url: str,
        form_fields: dict[str, dict],
        submit_selector: str,
        error_selectors: list[str]
    ) -> TestScenario:
        """Create a form validation test scenario."""
        steps = [
            TestStep(name="Navigate", action="navigate", target=url, critical=True),
        ]

        # Test empty submission
        steps.append(TestStep(name="Submit Empty Form", action="click", target=submit_selector))
        steps.append(TestStep(name="Wait", action="wait", timeout=1000))

        for selector in error_selectors:
            steps.append(
                TestStep(name=f"Check Error: {selector}", action="assert_element", target=selector)
            )

        steps.append(TestStep(name="Screenshot Validation Errors", action="screenshot", target="validation_errors"))

        return TestScenario(
            name="Form Validation Test",
            description="Test form validation rules",
            tags=["form", "validation"],
            steps=steps
        )

    @staticmethod
    def responsive_test(url: str, viewports: list[dict] = None) -> TestScenario:
        """Create a responsive design test scenario."""
        if viewports is None:
            viewports = [
                {"name": "mobile", "width": 375, "height": 667},
                {"name": "tablet", "width": 768, "height": 1024},
                {"name": "desktop", "width": 1920, "height": 1080},
            ]

        steps = [
            TestStep(name="Navigate", action="navigate", target=url, critical=True),
        ]

        for vp in viewports:
            steps.extend([
                TestStep(name=f"Screenshot {vp['name']}", action="screenshot", target=f"responsive_{vp['name']}"),
            ])

        return TestScenario(
            name="Responsive Design Test",
            description=f"Test responsive layout at {url}",
            tags=["responsive", "ui"],
            steps=steps
        )

    @staticmethod
    def accessibility_check(url: str) -> TestScenario:
        """Create an accessibility check scenario."""
        return TestScenario(
            name="Accessibility Check",
            description=f"Basic accessibility checks for {url}",
            tags=["accessibility", "a11y"],
            steps=[
                TestStep(name="Navigate", action="navigate", target=url, critical=True),
                TestStep(name="Check for Images with Alt", action="assert_element", target="img[alt]"),
                TestStep(name="Check for Form Labels", action="assert_element", target="label"),
                TestStep(name="Check for Headings", action="assert_element", target="h1"),
                TestStep(name="Screenshot", action="screenshot", target="accessibility"),
            ]
        )
