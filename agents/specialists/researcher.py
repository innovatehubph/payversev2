#!/usr/bin/env python3
"""
SAGE - Research Agent

Investigates emerging technologies, evaluates tools/frameworks,
conducts feasibility studies, and proposes technical improvements.
"""

import sys
sys.path.insert(0, '/root/payverse/agents')

from core.base_agent import BaseAgent, AgentRole, AgentTask, AgentCapability


class ResearcherAgent(BaseAgent):
    """
    SAGE - Research Agent

    Responsibilities:
    - Technology research and evaluation
    - Framework and library assessment
    - Feasibility studies
    - Best practices research
    - Performance benchmarking
    - Security vulnerability research
    - Competitive analysis
    """

    def __init__(self):
        super().__init__(name="Sage", role=AgentRole.RESEARCHER)

    def _register_capabilities(self):
        self.capabilities = [
            AgentCapability("technology_research", "Research emerging technologies"),
            AgentCapability("framework_evaluation", "Evaluate frameworks and libraries"),
            AgentCapability("feasibility_study", "Conduct feasibility studies"),
            AgentCapability("best_practices", "Research best practices"),
            AgentCapability("security_research", "Research security vulnerabilities"),
            AgentCapability("performance_analysis", "Analyze performance patterns"),
            AgentCapability("dependency_audit", "Audit project dependencies"),
            AgentCapability("code_analysis", "Analyze codebase patterns"),
        ]

    def analyze(self, request: str) -> dict:
        """Analyze research request."""
        analysis = {
            "request": request,
            "research_type": self._identify_research_type(request),
            "scope": "",
            "methodology": [],
            "expected_outputs": [],
        }

        request_lower = request.lower()

        if "security" in request_lower:
            analysis["scope"] = "security"
            analysis["methodology"] = ["vulnerability scan", "dependency audit", "code review"]
        elif "performance" in request_lower:
            analysis["scope"] = "performance"
            analysis["methodology"] = ["profiling", "benchmarking", "analysis"]
        elif "technology" in request_lower or "framework" in request_lower:
            analysis["scope"] = "technology"
            analysis["methodology"] = ["evaluation", "comparison", "proof of concept"]

        return analysis

    def _identify_research_type(self, request: str) -> str:
        """Identify type of research needed."""
        request_lower = request.lower()
        if any(word in request_lower for word in ["security", "vulnerability", "audit"]):
            return "security_research"
        elif any(word in request_lower for word in ["performance", "speed", "optimize"]):
            return "performance_research"
        elif any(word in request_lower for word in ["framework", "library", "tool"]):
            return "technology_evaluation"
        elif any(word in request_lower for word in ["best practice", "pattern", "standard"]):
            return "best_practices"
        return "general_research"

    def execute(self, task: AgentTask) -> AgentTask:
        """Execute research task."""
        self.start_task(task)

        try:
            research_type = self._identify_research_type(task.description)

            if research_type == "security_research":
                result = self.security_research(task.description)
            elif research_type == "performance_research":
                result = self.performance_research()
            elif research_type == "technology_evaluation":
                result = self.evaluate_technology(task.description)
            elif research_type == "best_practices":
                result = self.research_best_practices(task.description)
            else:
                result = self.general_research(task.description)

            return self.complete_task(task, result)

        except Exception as e:
            return self.fail_task(task, str(e))

    def security_research(self, topic: str) -> dict:
        """Conduct security research."""
        research = {
            "topic": topic,
            "current_security_measures": [],
            "potential_vulnerabilities": [],
            "recommendations": [],
            "priority_fixes": [],
        }

        # Analyze current security
        security_config = self.kb.get_security_config()

        research["current_security_measures"] = [
            f"Authentication: {security_config['authentication']['method']}",
            f"Encryption: {security_config['encryption']['algorithm']}",
            f"Authorization: RBAC with {len(security_config['authorization']['roles'])} roles",
            f"PIN protection for transactions > {security_config['transaction']['pin_threshold']} PHPT",
        ]

        # Check for common vulnerabilities
        research["potential_vulnerabilities"] = [
            {
                "type": "CSRF",
                "risk": "medium",
                "description": "Cross-site request forgery protection not visible",
                "recommendation": "Add CSRF tokens for state-changing operations",
            },
            {
                "type": "Rate Limiting Coverage",
                "risk": "low",
                "description": "Ensure all sensitive endpoints have rate limiting",
                "recommendation": "Audit all endpoints for rate limiting",
            },
            {
                "type": "Input Validation",
                "risk": "medium",
                "description": "Ensure all inputs are validated with Zod schemas",
                "recommendation": "Review all API endpoints for input validation",
            },
        ]

        # Dependency audit
        deps = self.get_dependencies()
        if "dependencies" in deps:
            research["dependency_count"] = len(deps["dependencies"])
            research["recommendations"].append("Run npm audit to check for known vulnerabilities")

        return research

    def performance_research(self) -> dict:
        """Research performance optimization opportunities."""
        research = {
            "current_state": {},
            "bottlenecks": [],
            "optimization_opportunities": [],
            "recommendations": [],
        }

        # Analyze large files (potential performance issues)
        for module, info in self.kb.server.modules.items():
            if info.get("lines", 0) > 1000:
                research["bottlenecks"].append({
                    "file": f"server/{module}",
                    "issue": f"Large file ({info['lines']} lines)",
                    "impact": "Potential memory and parsing overhead",
                })

        # Analyze database patterns
        research["optimization_opportunities"] = [
            {
                "area": "Database Queries",
                "opportunity": "Add database indexes for frequently queried columns",
                "impact": "high",
            },
            {
                "area": "API Response Caching",
                "opportunity": "Cache frequently accessed data (user profile, balance)",
                "impact": "medium",
            },
            {
                "area": "Frontend Bundle",
                "opportunity": "Code splitting for large pages (admin.tsx)",
                "impact": "medium",
            },
            {
                "area": "External API Calls",
                "opportunity": "Add connection pooling and caching for PayGram/NexusPay",
                "impact": "high",
            },
        ]

        research["recommendations"] = [
            "Implement Redis caching for session and balance data",
            "Add database query profiling",
            "Lazy load admin dashboard components",
            "Implement API response compression",
        ]

        return research

    def evaluate_technology(self, description: str) -> dict:
        """Evaluate a technology for potential use."""
        evaluation = {
            "description": description,
            "current_stack": {},
            "evaluation_criteria": [],
            "alternatives": [],
            "recommendation": "",
        }

        # Current stack
        evaluation["current_stack"] = {
            "frontend": "React 19.2 + TypeScript",
            "backend": "Express.js + TypeScript",
            "database": "PostgreSQL + Drizzle ORM",
            "styling": "Tailwind CSS v4",
            "state": "TanStack React Query",
        }

        evaluation["evaluation_criteria"] = [
            "Compatibility with existing stack",
            "Learning curve for team",
            "Performance impact",
            "Maintenance burden",
            "Community support",
            "Security track record",
        ]

        description_lower = description.lower()

        # Provide relevant alternatives based on topic
        if "database" in description_lower:
            evaluation["alternatives"] = [
                {"name": "PostgreSQL (current)", "score": 9, "notes": "Excellent for financial data"},
                {"name": "MySQL", "score": 7, "notes": "Good alternative, similar features"},
                {"name": "MongoDB", "score": 5, "notes": "Not ideal for financial transactions"},
            ]
        elif "frontend" in description_lower or "react" in description_lower:
            evaluation["alternatives"] = [
                {"name": "React (current)", "score": 9, "notes": "Excellent ecosystem"},
                {"name": "Vue.js", "score": 8, "notes": "Good alternative, smaller bundle"},
                {"name": "Svelte", "score": 7, "notes": "Great performance, smaller ecosystem"},
            ]
        elif "backend" in description_lower:
            evaluation["alternatives"] = [
                {"name": "Express.js (current)", "score": 8, "notes": "Mature and flexible"},
                {"name": "Fastify", "score": 9, "notes": "Faster, better TypeScript support"},
                {"name": "NestJS", "score": 8, "notes": "More structured, steeper learning curve"},
            ]

        return evaluation

    def research_best_practices(self, topic: str) -> dict:
        """Research best practices for a topic."""
        research = {
            "topic": topic,
            "current_practices": [],
            "industry_best_practices": [],
            "gaps": [],
            "recommendations": [],
        }

        topic_lower = topic.lower()

        if "api" in topic_lower:
            research["industry_best_practices"] = [
                "Use consistent naming conventions (kebab-case for URLs)",
                "Version APIs (/api/v1/...)",
                "Use proper HTTP status codes",
                "Implement rate limiting",
                "Add request validation",
                "Document with OpenAPI/Swagger",
                "Use pagination for list endpoints",
            ]
            research["current_practices"] = [
                "Swagger documentation present",
                "Bearer token authentication",
                "JSON request/response format",
            ]
            research["gaps"] = [
                "No API versioning currently",
                "Rate limiting only on some endpoints",
            ]

        elif "security" in topic_lower:
            research["industry_best_practices"] = [
                "Use HTTPS everywhere",
                "Implement CSRF protection",
                "Use secure session management",
                "Hash passwords with bcrypt/argon2",
                "Encrypt sensitive data at rest",
                "Implement rate limiting",
                "Log security events",
                "Regular dependency audits",
            ]
            research["current_practices"] = [
                "bcrypt password hashing",
                "AES-256-GCM encryption",
                "RBAC authorization",
                "PIN protection for transfers",
            ]

        elif "database" in topic_lower:
            research["industry_best_practices"] = [
                "Use migrations for schema changes",
                "Add indexes for frequently queried columns",
                "Use transactions for multi-step operations",
                "Implement soft deletes for audit trail",
                "Regular backups",
                "Connection pooling",
            ]
            research["current_practices"] = [
                "Drizzle ORM migrations",
                "Typed schema definitions",
            ]

        return research

    def general_research(self, description: str) -> dict:
        """Conduct general research."""
        return {
            "description": description,
            "methodology": [
                "Analyze current implementation",
                "Research industry standards",
                "Evaluate alternatives",
                "Create recommendations",
            ],
            "knowledge_base_results": self.query_knowledge(description),
        }

    def audit_dependencies(self) -> dict:
        """Audit project dependencies."""
        deps = self.get_dependencies()
        audit = {
            "total_dependencies": 0,
            "production": [],
            "development": [],
            "recommendations": [],
        }

        if "dependencies" in deps:
            audit["production"] = list(deps["dependencies"].keys())
            audit["total_dependencies"] += len(audit["production"])

        if "devDependencies" in deps:
            audit["development"] = list(deps["devDependencies"].keys())
            audit["total_dependencies"] += len(audit["development"])

        # Check for common issues
        audit["recommendations"] = [
            "Run 'npm audit' to check for vulnerabilities",
            "Update outdated dependencies regularly",
            "Remove unused dependencies",
            "Lock dependency versions for production",
        ]

        return audit

    def analyze_codebase_patterns(self) -> dict:
        """Analyze patterns used in the codebase."""
        patterns = {
            "architectural_patterns": [],
            "design_patterns": [],
            "coding_patterns": [],
            "anti_patterns": [],
        }

        patterns["architectural_patterns"] = [
            "Monorepo with shared TypeScript",
            "Client-Server separation",
            "Shared schema for type safety",
            "Modular backend (separate files per feature)",
        ]

        patterns["design_patterns"] = [
            "Repository pattern (storage.ts)",
            "Adapter pattern (PayGram, NexusPay integrations)",
            "State machine (casino transactions)",
            "Context pattern (React auth/modal contexts)",
        ]

        patterns["coding_patterns"] = [
            "Async/await for async operations",
            "Zod for runtime validation",
            "React Query for data fetching",
            "Tailwind for styling",
        ]

        # Check for potential anti-patterns
        storage_info = self.kb.server.modules.get("storage.ts", {})
        if storage_info.get("lines", 0) > 1000:
            patterns["anti_patterns"].append({
                "pattern": "God Object",
                "location": "server/storage.ts",
                "description": "Single file with too many responsibilities",
                "recommendation": "Split into domain-specific storage modules",
            })

        return patterns
