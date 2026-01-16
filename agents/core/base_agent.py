#!/usr/bin/env python3
"""
Payverse AI Agent - Base Agent Class

Foundation for all specialized Payverse development agents.
"""

import os
import subprocess
import json
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any, Callable
from enum import Enum

import sys
sys.path.insert(0, '/root/payverse/agents')
from knowledge.payverse_kb import get_knowledge_base, PayverseKnowledgeBase


class AgentRole(str, Enum):
    """Agent roles in the Payverse team."""
    ARCHITECT = "solutions_architect"
    LEAD_ENGINEER = "lead_engineer"
    EXPERT_CODER = "expert_coder"
    API_ENGINEER = "api_integration_engineer"
    RESEARCHER = "researcher"
    DEVOPS = "devops_engineer"
    VPS_SPECIALIST = "vps_network_specialist"
    DEPLOYMENT_EXPERT = "deployment_expert"
    ORCHESTRATOR = "team_orchestrator"


class TaskPriority(str, Enum):
    """Task priority levels."""
    CRITICAL = "critical"
    HIGH = "high"
    MEDIUM = "medium"
    LOW = "low"


class TaskStatus(str, Enum):
    """Task execution status."""
    PENDING = "pending"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"
    FAILED = "failed"
    BLOCKED = "blocked"


@dataclass
class AgentTask:
    """Represents a task assigned to an agent."""
    id: str
    title: str
    description: str
    priority: TaskPriority = TaskPriority.MEDIUM
    status: TaskStatus = TaskStatus.PENDING
    assigned_to: str = ""
    created_at: datetime = field(default_factory=datetime.now)
    completed_at: datetime | None = None
    result: Any = None
    error: str | None = None
    subtasks: list["AgentTask"] = field(default_factory=list)
    context: dict = field(default_factory=dict)


@dataclass
class AgentCapability:
    """Defines what an agent can do."""
    name: str
    description: str
    handler: Callable | None = None


class BaseAgent(ABC):
    """
    Base class for all Payverse AI development agents.

    Provides common functionality for:
    - Project knowledge access
    - File operations
    - Code analysis
    - Task management
    - Communication with other agents
    """

    def __init__(self, name: str, role: AgentRole):
        self.name = name
        self.role = role
        self.kb: PayverseKnowledgeBase = get_knowledge_base()
        self.capabilities: list[AgentCapability] = []
        self.task_history: list[AgentTask] = []
        self.current_task: AgentTask | None = None
        self._register_capabilities()

    @abstractmethod
    def _register_capabilities(self):
        """Register agent-specific capabilities."""
        pass

    @abstractmethod
    def analyze(self, request: str) -> dict:
        """Analyze a request and determine actions needed."""
        pass

    @abstractmethod
    def execute(self, task: AgentTask) -> AgentTask:
        """Execute a task and return result."""
        pass

    def get_identity(self) -> dict:
        """Get agent identity information."""
        return {
            "name": self.name,
            "role": self.role.value,
            "capabilities": [c.name for c in self.capabilities],
        }

    # ========== File Operations ==========

    def read_file(self, filepath: str) -> str:
        """Read a file from the project."""
        full_path = filepath if filepath.startswith('/') else f"{self.kb.project.root_path}/{filepath}"
        try:
            with open(full_path, 'r') as f:
                return f.read()
        except Exception as e:
            return f"Error reading file: {e}"

    def write_file(self, filepath: str, content: str) -> bool:
        """Write content to a file."""
        full_path = filepath if filepath.startswith('/') else f"{self.kb.project.root_path}/{filepath}"
        try:
            os.makedirs(os.path.dirname(full_path), exist_ok=True)
            with open(full_path, 'w') as f:
                f.write(content)
            return True
        except Exception as e:
            print(f"Error writing file: {e}")
            return False

    def list_files(self, directory: str, pattern: str = "*") -> list[str]:
        """List files in a directory matching a pattern."""
        import glob
        full_path = directory if directory.startswith('/') else f"{self.kb.project.root_path}/{directory}"
        return glob.glob(f"{full_path}/{pattern}", recursive=True)

    def search_in_files(self, pattern: str, directory: str = "", file_pattern: str = "*.ts") -> list[dict]:
        """Search for a pattern in files."""
        import re
        results = []
        search_dir = directory if directory else self.kb.project.root_path

        for filepath in self.list_files(search_dir, f"**/{file_pattern}"):
            try:
                content = self.read_file(filepath)
                matches = list(re.finditer(pattern, content))
                if matches:
                    results.append({
                        "file": filepath,
                        "matches": len(matches),
                        "lines": [content.count('\n', 0, m.start()) + 1 for m in matches[:5]]
                    })
            except:
                pass

        return results

    # ========== Code Analysis ==========

    def analyze_typescript_file(self, filepath: str) -> dict:
        """Analyze a TypeScript file structure."""
        content = self.read_file(filepath)
        if content.startswith("Error"):
            return {"error": content}

        import re

        analysis = {
            "filepath": filepath,
            "lines": content.count('\n') + 1,
            "imports": [],
            "exports": [],
            "functions": [],
            "classes": [],
            "interfaces": [],
            "types": [],
        }

        # Extract imports
        imports = re.findall(r'import\s+(?:{[^}]+}|\w+)\s+from\s+[\'"]([^\'"]+)[\'"]', content)
        analysis["imports"] = imports

        # Extract exports
        exports = re.findall(r'export\s+(?:default\s+)?(?:const|function|class|interface|type)\s+(\w+)', content)
        analysis["exports"] = exports

        # Extract functions
        functions = re.findall(r'(?:async\s+)?function\s+(\w+)|(?:const|let)\s+(\w+)\s*=\s*(?:async\s*)?\([^)]*\)\s*(?:=>|:)', content)
        analysis["functions"] = [f[0] or f[1] for f in functions if f[0] or f[1]]

        # Extract classes
        classes = re.findall(r'class\s+(\w+)', content)
        analysis["classes"] = classes

        # Extract interfaces
        interfaces = re.findall(r'interface\s+(\w+)', content)
        analysis["interfaces"] = interfaces

        # Extract types
        types = re.findall(r'type\s+(\w+)\s*=', content)
        analysis["types"] = types

        return analysis

    def find_function(self, function_name: str, directory: str = "") -> list[dict]:
        """Find a function definition in the codebase."""
        import re
        pattern = rf'(?:async\s+)?function\s+{function_name}|(?:const|let)\s+{function_name}\s*='
        return self.search_in_files(pattern, directory)

    def find_api_endpoint(self, endpoint: str) -> list[dict]:
        """Find an API endpoint definition."""
        pattern = rf'[\'"]/?{endpoint}[\'"]'
        return self.search_in_files(pattern, "server")

    def get_dependencies(self) -> dict:
        """Get project dependencies from package.json."""
        try:
            pkg_content = self.read_file("package.json")
            pkg = json.loads(pkg_content)
            return {
                "dependencies": pkg.get("dependencies", {}),
                "devDependencies": pkg.get("devDependencies", {}),
            }
        except Exception as e:
            return {"error": str(e)}

    # ========== Command Execution ==========

    def run_command(self, command: str, cwd: str = None) -> dict:
        """Run a shell command."""
        working_dir = cwd or self.kb.project.root_path
        try:
            result = subprocess.run(
                command,
                shell=True,
                cwd=working_dir,
                capture_output=True,
                text=True,
                timeout=120
            )
            return {
                "success": result.returncode == 0,
                "stdout": result.stdout,
                "stderr": result.stderr,
                "returncode": result.returncode,
            }
        except subprocess.TimeoutExpired:
            return {"success": False, "error": "Command timed out"}
        except Exception as e:
            return {"success": False, "error": str(e)}

    def run_typescript_check(self) -> dict:
        """Run TypeScript type checking."""
        return self.run_command("npm run check")

    def run_build(self) -> dict:
        """Run project build."""
        return self.run_command("npm run build")

    def run_tests(self) -> dict:
        """Run project tests."""
        return self.run_command("npm test")

    # ========== Task Management ==========

    def create_task(self, title: str, description: str, priority: TaskPriority = TaskPriority.MEDIUM) -> AgentTask:
        """Create a new task."""
        task = AgentTask(
            id=f"{self.role.value}_{datetime.now().strftime('%Y%m%d%H%M%S')}",
            title=title,
            description=description,
            priority=priority,
            assigned_to=self.name,
        )
        return task

    def start_task(self, task: AgentTask) -> AgentTask:
        """Start working on a task."""
        task.status = TaskStatus.IN_PROGRESS
        self.current_task = task
        return task

    def complete_task(self, task: AgentTask, result: Any) -> AgentTask:
        """Mark a task as completed."""
        task.status = TaskStatus.COMPLETED
        task.completed_at = datetime.now()
        task.result = result
        self.task_history.append(task)
        self.current_task = None
        return task

    def fail_task(self, task: AgentTask, error: str) -> AgentTask:
        """Mark a task as failed."""
        task.status = TaskStatus.FAILED
        task.error = error
        self.task_history.append(task)
        self.current_task = None
        return task

    # ========== Knowledge Access ==========

    def query_knowledge(self, query: str) -> list[dict]:
        """Query the knowledge base."""
        return self.kb.search_knowledge(query)

    def get_file_for_component(self, component: str) -> str:
        """Get the file path for a component."""
        return self.kb.get_file_path(component)

    def get_api_info(self, category: str) -> dict:
        """Get API endpoint information."""
        return self.kb.get_endpoint_info(category)

    def get_integration_details(self, service: str) -> dict:
        """Get external integration details."""
        return self.kb.get_integration_info(service)

    # ========== Reporting ==========

    def generate_report(self, task: AgentTask) -> str:
        """Generate a task execution report."""
        report = f"""
## Task Report: {task.title}
**Agent:** {self.name} ({self.role.value})
**Status:** {task.status.value}
**Priority:** {task.priority.value}
**Created:** {task.created_at.strftime('%Y-%m-%d %H:%M:%S')}
"""
        if task.completed_at:
            report += f"**Completed:** {task.completed_at.strftime('%Y-%m-%d %H:%M:%S')}\n"

        if task.result:
            report += f"\n### Result\n{task.result}\n"

        if task.error:
            report += f"\n### Error\n{task.error}\n"

        return report

    def __repr__(self):
        return f"<{self.__class__.__name__} name={self.name} role={self.role.value}>"
