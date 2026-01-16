#!/usr/bin/env python3
"""
Payverse Expert Development AI Agent Team - CLI Interface

Command-line interface for interacting with the Payverse AI development team.

Usage:
    python payverse_team.py                    # Interactive mode
    python payverse_team.py team               # Show team roster
    python payverse_team.py ask "<request>"    # Process a request
    python payverse_team.py consult <agent>    # Consult specific agent
    python payverse_team.py status             # Show project status
"""

import argparse
import sys
import json
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent / "agents"))

from core.orchestrator import get_orchestrator
from knowledge.payverse_kb import get_knowledge_base


BANNER = """
\033[95m╔══════════════════════════════════════════════════════════════════════╗
║                                                                      ║
║   ██████╗  █████╗ ██╗   ██╗██╗   ██╗███████╗██████╗ ███████╗███████╗║
║   ██╔══██╗██╔══██╗╚██╗ ██╔╝██║   ██║██╔════╝██╔══██╗██╔════╝██╔════╝║
║   ██████╔╝███████║ ╚████╔╝ ██║   ██║█████╗  ██████╔╝███████╗█████╗  ║
║   ██╔═══╝ ██╔══██║  ╚██╔╝  ╚██╗ ██╔╝██╔══╝  ██╔══██╗╚════██║██╔══╝  ║
║   ██║     ██║  ██║   ██║    ╚████╔╝ ███████╗██║  ██║███████║███████╗║
║   ╚═╝     ╚═╝  ╚═╝   ╚═╝     ╚═══╝  ╚══════╝╚═╝  ╚═╝╚══════╝╚══════╝║
║                                                                      ║
║        EXPERT DEVELOPMENT AI AGENT TEAM                              ║
║                                                                      ║
╚══════════════════════════════════════════════════════════════════════╝\033[0m
"""


def print_banner():
    """Print the Payverse team banner."""
    print(BANNER)


def show_team_roster(orchestrator):
    """Display the team roster."""
    print(orchestrator.generate_summary())


def show_status(orchestrator):
    """Display project and team status."""
    status = orchestrator.quick_status()
    kb = get_knowledge_base()

    print("\n" + "=" * 60)
    print("  PAYVERSE PROJECT STATUS")
    print("=" * 60)
    print(f"\n  Orchestrator: {status['orchestrator']}")
    print(f"  Agents Online: {status['agents_online']}")
    print(f"  Requests Processed: {status['requests_processed']}")
    print("\n  Team Members:")
    for agent in status['agents']:
        print(f"    - {agent['name']} ({agent['role']})")

    print("\n" + "-" * 60)
    print("  PROJECT INFO")
    print("-" * 60)
    print(kb.get_summary())
    print("=" * 60)


def process_request(orchestrator, request: str, execute: bool = False):
    """Process a request through the team."""
    response = orchestrator.process_request(request, execute=execute)

    print("\n" + "=" * 60)
    print("  TEAM RESPONSE")
    print("=" * 60)
    print(f"\n  Request: {response.request}")
    print(f"  Category: {response.category.value}")
    print(f"  Status: {response.status}")
    print(f"\n  Assigned Agents: {', '.join(response.assigned_agents)}")

    print("\n  Analysis:")
    for agent_name, analysis in response.analysis.items():
        print(f"\n    >> {agent_name}:")
        if isinstance(analysis, dict):
            for key, value in list(analysis.items())[:5]:
                if isinstance(value, list):
                    print(f"       {key}: {len(value)} items")
                elif isinstance(value, dict):
                    print(f"       {key}: {{...}}")
                else:
                    print(f"       {key}: {str(value)[:50]}")

    print("\n  Execution Plan:")
    for step in response.plan:
        print(f"    {step['step']}. {step['action']} ({step['agent']})")

    if response.execution_results:
        print("\n  Execution Results:")
        for result in response.execution_results:
            status_icon = "✓" if result['status'] == 'success' else "✗"
            print(f"    {status_icon} Step {result['step']}: {result['action']} - {result['status']}")

    print("\n" + "=" * 60)


def consult_agent(orchestrator, agent_name: str, query: str = None):
    """Consult a specific agent."""
    agent = orchestrator.get_agent(agent_name)

    if not agent:
        print(f"\n  Error: Agent '{agent_name}' not found")
        print(f"  Available agents: {', '.join(orchestrator.agents.keys())}")
        return

    print(f"\n  Consulting {agent.name} ({agent.role.value})...")
    print(f"  Capabilities: {', '.join(c.name for c in agent.capabilities)}")

    if query:
        print(f"\n  Query: {query}")
        result = agent.analyze(query)
        print("\n  Response:")
        print(json.dumps(result, indent=2, default=str))


def interactive_mode(orchestrator):
    """Run interactive mode."""
    print_banner()
    show_team_roster(orchestrator)

    print("\n\033[96mInteractive Mode - Type 'help' for commands, 'quit' to exit\033[0m\n")

    while True:
        try:
            user_input = input("\033[92mpayverse>\033[0m ").strip()

            if not user_input:
                continue

            parts = user_input.split(maxsplit=1)
            command = parts[0].lower()
            args = parts[1] if len(parts) > 1 else ""

            if command in ("quit", "exit", "q"):
                print("\n  Goodbye! The team is always here when you need us.\n")
                break

            elif command == "help":
                print("""
  Available Commands:
  -------------------
  team              - Show team roster and capabilities
  status            - Show project status
  ask <request>     - Process a request through the team
  run <request>     - Process and execute a request
  consult <agent>   - Consult a specific agent
  agents            - List all agents
  search <query>    - Search the knowledge base
  files             - Show key project files
  apis              - Show API endpoints
  help              - Show this help message
  quit              - Exit interactive mode
                """)

            elif command == "team":
                show_team_roster(orchestrator)

            elif command == "status":
                show_status(orchestrator)

            elif command == "ask" and args:
                process_request(orchestrator, args, execute=False)

            elif command == "run" and args:
                process_request(orchestrator, args, execute=True)

            elif command == "consult":
                if args:
                    agent_parts = args.split(maxsplit=1)
                    agent_name = agent_parts[0]
                    query = agent_parts[1] if len(agent_parts) > 1 else None
                    consult_agent(orchestrator, agent_name, query)
                else:
                    print("  Usage: consult <agent_name> [query]")
                    print(f"  Available agents: {', '.join(orchestrator.agents.keys())}")

            elif command == "agents":
                print("\n  Available Agents:")
                for name, agent in orchestrator.agents.items():
                    print(f"    - {name}: {agent.name} ({agent.role.value})")

            elif command == "search" and args:
                kb = get_knowledge_base()
                results = kb.search_knowledge(args)
                print(f"\n  Search results for '{args}':")
                for result in results[:10]:
                    print(f"    - [{result['type']}] {result['name']}")

            elif command == "files":
                kb = get_knowledge_base()
                print("\n  Key Project Files:")
                for name, desc in list(kb.project.key_files.items())[:15]:
                    print(f"    - {name}: {desc}")

            elif command == "apis":
                kb = get_knowledge_base()
                print("\n  API Categories:")
                for category in ["auth", "wallet", "crypto", "casino", "admin"]:
                    endpoints = kb.get_endpoint_info(category)
                    print(f"\n    {category.upper()}:")
                    for endpoint, desc in list(endpoints.items())[:5]:
                        print(f"      {endpoint}")

            else:
                # Treat as a request
                if user_input:
                    process_request(orchestrator, user_input, execute=False)

        except KeyboardInterrupt:
            print("\n\n  Interrupted. Type 'quit' to exit.\n")
        except Exception as e:
            print(f"\n  Error: {e}\n")


def main():
    """Main entry point."""
    parser = argparse.ArgumentParser(
        description="Payverse Expert Development AI Agent Team",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  python payverse_team.py                           # Interactive mode
  python payverse_team.py team                      # Show team roster
  python payverse_team.py status                    # Show project status
  python payverse_team.py ask "add a new feature"  # Process request
  python payverse_team.py consult atlas            # Consult architect
        """
    )

    subparsers = parser.add_subparsers(dest="command", help="Available commands")

    # Team command
    subparsers.add_parser("team", help="Show team roster")

    # Status command
    subparsers.add_parser("status", help="Show project status")

    # Ask command
    ask_parser = subparsers.add_parser("ask", help="Process a request")
    ask_parser.add_argument("request", help="The request to process")
    ask_parser.add_argument("--execute", "-e", action="store_true", help="Execute the plan")

    # Consult command
    consult_parser = subparsers.add_parser("consult", help="Consult a specific agent")
    consult_parser.add_argument("agent", help="Agent name (atlas, nova, cipher, etc.)")
    consult_parser.add_argument("query", nargs="?", help="Optional query")

    args = parser.parse_args()

    # Initialize orchestrator
    orchestrator = get_orchestrator()

    if not args.command:
        # Interactive mode
        interactive_mode(orchestrator)
    elif args.command == "team":
        print_banner()
        show_team_roster(orchestrator)
    elif args.command == "status":
        print_banner()
        show_status(orchestrator)
    elif args.command == "ask":
        print_banner()
        process_request(orchestrator, args.request, execute=args.execute)
    elif args.command == "consult":
        print_banner()
        consult_agent(orchestrator, args.agent, args.query)


if __name__ == "__main__":
    main()
