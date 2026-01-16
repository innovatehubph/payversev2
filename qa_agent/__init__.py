"""
ZARAH - Expert Browser QA Testing Agent

An intelligent QA testing agent equipped with MCP browser automation
capabilities for comprehensive web application testing.
"""

from .agent import QATestingAgent, AgentConfig
from .scenarios import TestScenario, TestStep, TestSuite, StepResult, TestResult, ScenarioTemplates
from .assertions import Assertions, expect
from .reporter import TestReporter

__version__ = "1.0.0"
__author__ = "Zarah"

__all__ = [
    "QATestingAgent",
    "AgentConfig",
    "TestScenario",
    "TestStep",
    "TestSuite",
    "StepResult",
    "TestResult",
    "ScenarioTemplates",
    "Assertions",
    "expect",
    "TestReporter",
]
