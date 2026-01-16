#!/usr/bin/env python3
"""
PRIME - Payverse Team Orchestrator

Coordinates all specialized AI agents to analyze requirements, propose solutions,
implement changes, test thoroughly, and deploy confidently.
"""

import sys
sys.path.insert(0, '/root/payverse/agents')

from dataclasses import dataclass, field
from datetime import datetime
from typing import Any
from enum import Enum

from core.base_agent import BaseAgent, AgentRole, AgentTask, TaskPriority, TaskStatus
from knowledge.payverse_kb import get_knowledge_base

# Import all specialist agents
from specialists.architect import ArchitectAgent
from specialists.engineers import LeadEngineerAgent, ExpertCoderAgent, APIIntegrationEngineerAgent
from specialists.researcher import ResearcherAgent
from specialists.devops import DevOpsEngineerAgent, VPSNetworkSpecialistAgent, DeploymentExpertAgent


class RequestCategory(str, Enum):
    """Categories of requests the team can handle."""
    ARCHITECTURE = "architecture"
    DEVELOPMENT = "development"
    INTEGRATION = "integration"
    RESEARCH = "research"
    DEVOPS = "devops"
    DEPLOYMENT = "deployment"
    SECURITY = "security"
    PERFORMANCE = "performance"
    BUG_FIX = "bug_fix"
    FEATURE = "feature"
    REFACTORING = "refactoring"


@dataclass
class TeamResponse:
    """Response from the agent team."""
    request: str
    category: RequestCategory
    assigned_agents: list[str]
    analysis: dict
    plan: list[dict]
    execution_results: list[dict] = field(default_factory=list)
    status: str = "pending"
    timestamp: datetime = field(default_factory=datetime.now)


class PayverseTeamOrchestrator:
    """
    PRIME - Payverse Team Orchestrator

    Coordinates the expert AI agent team to handle all development,
    deployment, and operational needs for the Payverse project.

    Team Members:
    - Atlas (Architect): System architecture and design
    - Nova (Lead Engineer): Code quality and coordination
    - Cipher (Expert Coder): Implementation and debugging
    - Nexus (API Engineer): Integrations and APIs
    - Sage (Researcher): Technology research and analysis
    - Forge (DevOps): CI/CD and automation
    - Sentinel (VPS Specialist): Server and network configuration
    - Guardian (Deployment Expert): Production deployments
    """

    def __init__(self):
        self.name = "Prime"
        self.kb = get_knowledge_base()

        # Initialize all agents
        self.agents = {
            "atlas": ArchitectAgent(),
            "nova": LeadEngineerAgent(),
            "cipher": ExpertCoderAgent(),
            "nexus": APIIntegrationEngineerAgent(),
            "sage": ResearcherAgent(),
            "forge": DevOpsEngineerAgent(),
            "sentinel": VPSNetworkSpecialistAgent(),
            "guardian": DeploymentExpertAgent(),
        }

        self.request_history: list[TeamResponse] = []

    def get_team_roster(self) -> list[dict]:
        """Get information about all team members."""
        roster = []
        for name, agent in self.agents.items():
            roster.append({
                "name": agent.name,
                "role": agent.role.value,
                "capabilities": [c.name for c in agent.capabilities],
            })
        return roster

    def categorize_request(self, request: str) -> RequestCategory:
        """Categorize a request to determine which agents to involve."""
        request_lower = request.lower()

        # Check for specific keywords
        if any(word in request_lower for word in ["architect", "design", "structure", "scalab"]):
            return RequestCategory.ARCHITECTURE
        elif any(word in request_lower for word in ["deploy", "production", "release", "rollback"]):
            return RequestCategory.DEPLOYMENT
        elif any(word in request_lower for word in ["docker", "kubernetes", "cicd", "pipeline", "container"]):
            return RequestCategory.DEVOPS
        elif any(word in request_lower for word in ["server", "nginx", "ssl", "firewall", "vps"]):
            return RequestCategory.DEVOPS
        elif any(word in request_lower for word in ["api", "integrat", "webhook", "endpoint"]):
            return RequestCategory.INTEGRATION
        elif any(word in request_lower for word in ["research", "evaluat", "investigat", "analyz"]):
            return RequestCategory.RESEARCH
        elif any(word in request_lower for word in ["security", "vulnerab", "audit", "encrypt"]):
            return RequestCategory.SECURITY
        elif any(word in request_lower for word in ["performance", "optimi", "speed", "slow"]):
            return RequestCategory.PERFORMANCE
        elif any(word in request_lower for word in ["bug", "fix", "error", "issue", "broken"]):
            return RequestCategory.BUG_FIX
        elif any(word in request_lower for word in ["refactor", "clean", "improve", "reorgan"]):
            return RequestCategory.REFACTORING
        elif any(word in request_lower for word in ["feature", "add", "implement", "create", "build"]):
            return RequestCategory.FEATURE
        else:
            return RequestCategory.DEVELOPMENT

    def assign_agents(self, category: RequestCategory) -> list[str]:
        """Assign appropriate agents based on request category."""
        assignments = {
            RequestCategory.ARCHITECTURE: ["atlas", "nova"],
            RequestCategory.DEVELOPMENT: ["nova", "cipher"],
            RequestCategory.INTEGRATION: ["nexus", "cipher"],
            RequestCategory.RESEARCH: ["sage"],
            RequestCategory.DEVOPS: ["forge", "sentinel"],
            RequestCategory.DEPLOYMENT: ["guardian", "forge"],
            RequestCategory.SECURITY: ["sage", "atlas", "sentinel"],
            RequestCategory.PERFORMANCE: ["sage", "cipher", "atlas"],
            RequestCategory.BUG_FIX: ["cipher", "nova"],
            RequestCategory.FEATURE: ["nova", "cipher", "nexus"],
            RequestCategory.REFACTORING: ["nova", "cipher", "atlas"],
        }
        return assignments.get(category, ["nova", "cipher"])

    def process_request(self, request: str, execute: bool = False) -> TeamResponse:
        """
        Process a request through the agent team.

        Args:
            request: The user's request
            execute: Whether to execute the plan or just analyze

        Returns:
            TeamResponse with analysis, plan, and optionally execution results
        """
        print(f"\n{'='*60}")
        print(f"PRIME - Payverse Team Orchestrator")
        print(f"{'='*60}")
        print(f"\nProcessing request: {request[:100]}...")

        # Categorize the request
        category = self.categorize_request(request)
        print(f"\nCategory: {category.value}")

        # Assign agents
        assigned_agent_names = self.assign_agents(category)
        print(f"Assigned agents: {', '.join([self.agents[n].name for n in assigned_agent_names])}")

        # Collect analysis from each agent
        analysis = {}
        for agent_name in assigned_agent_names:
            agent = self.agents[agent_name]
            print(f"\n>> {agent.name} ({agent.role.value}) analyzing...")
            agent_analysis = agent.analyze(request)
            analysis[agent.name] = agent_analysis

        # Create execution plan
        plan = self._create_execution_plan(request, category, analysis)

        # Create response
        response = TeamResponse(
            request=request,
            category=category,
            assigned_agents=[self.agents[n].name for n in assigned_agent_names],
            analysis=analysis,
            plan=plan,
        )

        # Execute if requested
        if execute:
            print(f"\n>> Executing plan...")
            response.execution_results = self._execute_plan(plan, assigned_agent_names)
            response.status = "completed" if all(
                r.get("status") == "success" for r in response.execution_results
            ) else "partial"
        else:
            response.status = "analyzed"

        self.request_history.append(response)
        return response

    def _create_execution_plan(self, request: str, category: RequestCategory, analysis: dict) -> list[dict]:
        """Create an execution plan based on analysis."""
        plan = []

        # Generic plan structure based on category
        if category == RequestCategory.BUG_FIX:
            plan = [
                {"step": 1, "action": "Investigate issue", "agent": "Cipher"},
                {"step": 2, "action": "Identify root cause", "agent": "Cipher"},
                {"step": 3, "action": "Implement fix", "agent": "Cipher"},
                {"step": 4, "action": "Test fix", "agent": "Nova"},
                {"step": 5, "action": "Code review", "agent": "Nova"},
            ]
        elif category == RequestCategory.FEATURE:
            plan = [
                {"step": 1, "action": "Design architecture", "agent": "Atlas"},
                {"step": 2, "action": "Plan implementation", "agent": "Nova"},
                {"step": 3, "action": "Implement backend", "agent": "Cipher"},
                {"step": 4, "action": "Implement frontend", "agent": "Cipher"},
                {"step": 5, "action": "Integration testing", "agent": "Nova"},
                {"step": 6, "action": "Code review", "agent": "Nova"},
            ]
        elif category == RequestCategory.DEPLOYMENT:
            plan = [
                {"step": 1, "action": "Pre-deployment checks", "agent": "Guardian"},
                {"step": 2, "action": "Prepare infrastructure", "agent": "Sentinel"},
                {"step": 3, "action": "Deploy application", "agent": "Guardian"},
                {"step": 4, "action": "Verify deployment", "agent": "Guardian"},
                {"step": 5, "action": "Monitor", "agent": "Guardian"},
            ]
        elif category == RequestCategory.DEVOPS:
            plan = [
                {"step": 1, "action": "Analyze requirements", "agent": "Forge"},
                {"step": 2, "action": "Create configuration", "agent": "Forge"},
                {"step": 3, "action": "Setup infrastructure", "agent": "Sentinel"},
                {"step": 4, "action": "Test setup", "agent": "Forge"},
            ]
        elif category == RequestCategory.INTEGRATION:
            plan = [
                {"step": 1, "action": "Design integration", "agent": "Nexus"},
                {"step": 2, "action": "Implement adapter", "agent": "Nexus"},
                {"step": 3, "action": "Create API endpoints", "agent": "Cipher"},
                {"step": 4, "action": "Integration testing", "agent": "Nova"},
            ]
        elif category == RequestCategory.SECURITY:
            plan = [
                {"step": 1, "action": "Security research", "agent": "Sage"},
                {"step": 2, "action": "Architecture review", "agent": "Atlas"},
                {"step": 3, "action": "Infrastructure audit", "agent": "Sentinel"},
                {"step": 4, "action": "Implement fixes", "agent": "Cipher"},
            ]
        elif category == RequestCategory.RESEARCH:
            plan = [
                {"step": 1, "action": "Research and analysis", "agent": "Sage"},
                {"step": 2, "action": "Document findings", "agent": "Sage"},
                {"step": 3, "action": "Present recommendations", "agent": "Sage"},
            ]
        else:
            plan = [
                {"step": 1, "action": "Analyze request", "agent": "Nova"},
                {"step": 2, "action": "Plan implementation", "agent": "Nova"},
                {"step": 3, "action": "Execute", "agent": "Cipher"},
                {"step": 4, "action": "Review", "agent": "Nova"},
            ]

        return plan

    def _execute_plan(self, plan: list[dict], assigned_agent_names: list[str]) -> list[dict]:
        """Execute the plan steps."""
        results = []

        for step in plan:
            agent_name = step["agent"].lower()
            if agent_name in self.agents:
                agent = self.agents[agent_name]
                task = agent.create_task(
                    title=step["action"],
                    description=step["action"],
                    priority=TaskPriority.MEDIUM
                )

                try:
                    completed_task = agent.execute(task)
                    results.append({
                        "step": step["step"],
                        "action": step["action"],
                        "agent": agent.name,
                        "status": "success" if completed_task.status == TaskStatus.COMPLETED else "failed",
                        "result": completed_task.result,
                    })
                except Exception as e:
                    results.append({
                        "step": step["step"],
                        "action": step["action"],
                        "agent": agent.name,
                        "status": "error",
                        "error": str(e),
                    })

        return results

    def get_agent(self, name: str) -> BaseAgent | None:
        """Get a specific agent by name."""
        return self.agents.get(name.lower())

    def consult_agent(self, agent_name: str, query: str) -> dict:
        """Consult a specific agent directly."""
        agent = self.get_agent(agent_name)
        if not agent:
            return {"error": f"Agent '{agent_name}' not found"}

        return agent.analyze(query)

    def generate_summary(self) -> str:
        """Generate a summary of the team and capabilities."""
        summary = """
╔══════════════════════════════════════════════════════════════════════╗
║           PAYVERSE EXPERT DEVELOPMENT AI AGENT TEAM                  ║
╠══════════════════════════════════════════════════════════════════════╣
║                                                                      ║
║  PRIME - Team Orchestrator                                           ║
║  Coordinates all agents to deliver seamless development results      ║
║                                                                      ║
╠══════════════════════════════════════════════════════════════════════╣
║  ARCHITECTURE & DESIGN                                               ║
║  ├── Atlas (Solutions Architect)                                     ║
║  │   System architecture, scalability, technical vision              ║
║                                                                      ║
╠══════════════════════════════════════════════════════════════════════╣
║  ENGINEERING & DEVELOPMENT                                           ║
║  ├── Nova (Lead Engineer)                                            ║
║  │   Code quality, task coordination, core features                  ║
║  ├── Cipher (Expert Coder)                                           ║
║  │   Implementation, debugging, full-stack development               ║
║  └── Nexus (API Integration Engineer)                                ║
║      Third-party APIs, webhooks, authentication flows                ║
║                                                                      ║
╠══════════════════════════════════════════════════════════════════════╣
║  RESEARCH & INNOVATION                                               ║
║  └── Sage (Researcher)                                               ║
║      Technology evaluation, feasibility studies, best practices      ║
║                                                                      ║
╠══════════════════════════════════════════════════════════════════════╣
║  DEVOPS & INFRASTRUCTURE                                             ║
║  ├── Forge (DevOps Engineer)                                         ║
║  │   CI/CD, Docker, Kubernetes, automation                           ║
║  ├── Sentinel (VPS & Network Specialist)                             ║
║  │   Server config, Nginx, SSL, firewall, security                   ║
║  └── Guardian (Deployment Expert)                                    ║
║      Zero-downtime deploys, monitoring, incident response            ║
║                                                                      ║
╠══════════════════════════════════════════════════════════════════════╣
║  PROJECT: Payverse P2P E-Wallet                                      ║
║  Stack: TypeScript, React 19, Express, PostgreSQL, Drizzle          ║
║  Integrations: PayGram, NexusPay, 747Live Casino                    ║
╚══════════════════════════════════════════════════════════════════════╝
"""
        return summary

    def quick_status(self) -> dict:
        """Get quick status of the team."""
        return {
            "orchestrator": self.name,
            "agents_online": len(self.agents),
            "agents": [{"name": a.name, "role": a.role.value} for a in self.agents.values()],
            "project": "Payverse",
            "requests_processed": len(self.request_history),
        }


# Singleton instance
_orchestrator_instance = None

def get_orchestrator() -> PayverseTeamOrchestrator:
    """Get the singleton orchestrator instance."""
    global _orchestrator_instance
    if _orchestrator_instance is None:
        _orchestrator_instance = PayverseTeamOrchestrator()
    return _orchestrator_instance
