#!/usr/bin/env python3
"""
ZARAH - Expert Browser QA Testing Agent

Command-line interface for running browser tests with MCP automation.

Usage:
    python zarah.py test <url>                    # Quick page load test
    python zarah.py test <url> --text "expected"  # Test with text verification
    python zarah.py run <scenario.json>           # Run test scenario file
    python zarah.py interactive                   # Interactive testing mode
    python zarah.py demo                          # Run demo tests
"""

import asyncio
import argparse
import json
import sys
from pathlib import Path

# Add parent directory to path for imports
sys.path.insert(0, str(Path(__file__).parent))

from qa_agent import QATestingAgent, TestScenario, TestStep, TestSuite, ScenarioTemplates
from qa_agent.agent import AgentConfig


BANNER = """
╔═══════════════════════════════════════════════════════════════════╗
║                                                                   ║
║   ███████╗ █████╗ ██████╗  █████╗ ██╗  ██╗                       ║
║   ╚══███╔╝██╔══██╗██╔══██╗██╔══██╗██║  ██║                       ║
║     ███╔╝ ███████║██████╔╝███████║███████║                       ║
║    ███╔╝  ██╔══██║██╔══██╗██╔══██║██╔══██║                       ║
║   ███████╗██║  ██║██║  ██║██║  ██║██║  ██║                       ║
║   ╚══════╝╚═╝  ╚═╝╚═╝  ╚═╝╚═╝  ╚═╝╚═╝  ╚═╝                       ║
║                                                                   ║
║   Expert Browser QA Testing Agent                                 ║
║   Powered by MCP Browser Automation                               ║
║                                                                   ║
╚═══════════════════════════════════════════════════════════════════╝
"""


def print_banner():
    """Print the Zarah banner."""
    print("\033[95m" + BANNER + "\033[0m")


async def quick_test(url: str, expected_text: str = None, screenshot: bool = True):
    """Run a quick page load test."""
    print_banner()
    print(f"\n🔍 Running quick test on: {url}\n")

    agent = QATestingAgent()

    steps = [
        TestStep(name="Navigate to URL", action="navigate", target=url, critical=True),
        TestStep(name="Wait for page load", action="wait", timeout=2000),
    ]

    if expected_text:
        steps.append(
            TestStep(name=f"Verify text: {expected_text}", action="assert_text", target=expected_text)
        )

    if screenshot:
        steps.append(
            TestStep(name="Capture screenshot", action="screenshot", target="quick_test")
        )

    steps.append(TestStep(name="Close browser", action="navigate", target="about:blank"))

    scenario = TestScenario(
        name="Quick Test",
        description=f"Quick test of {url}",
        steps=steps,
        teardown_steps=[
            TestStep(name="Cleanup", action="wait", timeout=500)
        ]
    )

    result = await agent.run_scenario(scenario)
    await agent.close()

    # Print summary
    print("\n" + "=" * 50)
    if result.status == "passed":
        print("✅ TEST PASSED")
    else:
        print("❌ TEST FAILED")
    print(f"Duration: {result.duration:.2f}s")
    print(f"Steps: {result.passed_steps}/{result.total_steps} passed")
    print("=" * 50)

    return result.status == "passed"


async def run_scenario_file(filepath: str):
    """Run tests from a scenario file."""
    print_banner()
    print(f"\n📁 Loading scenario from: {filepath}\n")

    with open(filepath) as f:
        data = json.load(f)

    # Support both single scenario and suite format
    if "scenarios" in data:
        suite = TestSuite(
            name=data.get("name", "Test Suite"),
            description=data.get("description", ""),
            scenarios=[TestScenario.from_dict(s) for s in data["scenarios"]]
        )
    else:
        scenario = TestScenario.from_dict(data)
        suite = TestSuite(
            name=scenario.name,
            scenarios=[scenario]
        )

    agent = QATestingAgent()
    results = await agent.run_suite(suite)

    # Summary
    passed = all(r.status == "passed" for r in results)
    return passed


async def run_demo():
    """Run demonstration tests."""
    print_banner()
    print("\n🎭 Running Zarah Demo Tests\n")

    agent = QATestingAgent()

    # Demo suite
    suite = TestSuite(
        name="Zarah Demo Suite",
        description="Demonstration of Zarah QA Agent capabilities",
        scenarios=[
            # Test 1: Example.com
            TestScenario(
                name="Example.com Load Test",
                description="Verify example.com loads correctly",
                tags=["demo", "smoke"],
                steps=[
                    TestStep(name="Navigate", action="navigate", target="https://example.com", critical=True),
                    TestStep(name="Verify Title", action="assert_title", target="Example"),
                    TestStep(name="Verify Content", action="assert_text", target="Example Domain"),
                    TestStep(name="Screenshot", action="screenshot", target="example_com"),
                ]
            ),

            # Test 2: HTTPBin
            TestScenario(
                name="HTTPBin Test",
                description="Test HTTPBin service",
                tags=["demo", "api"],
                steps=[
                    TestStep(name="Navigate to HTTPBin", action="navigate", target="https://httpbin.org", critical=True),
                    TestStep(name="Verify Page", action="assert_text", target="httpbin"),
                    TestStep(name="Screenshot", action="screenshot", target="httpbin"),
                ]
            ),

            # Test 3: Navigation Flow
            TestScenario(
                name="Multi-Page Navigation",
                description="Test navigation between multiple pages",
                tags=["demo", "navigation"],
                steps=[
                    TestStep(name="Go to Example.com", action="navigate", target="https://example.com"),
                    TestStep(name="Screenshot Page 1", action="screenshot", target="nav_1"),
                    TestStep(name="Go to HTTPBin", action="navigate", target="https://httpbin.org"),
                    TestStep(name="Screenshot Page 2", action="screenshot", target="nav_2"),
                    TestStep(name="Verify HTTPBin", action="assert_text", target="HTTP"),
                ]
            ),
        ]
    )

    results = await agent.run_suite(suite)

    # Final summary
    print("\n" + "=" * 60)
    print("📊 DEMO COMPLETE")
    print("=" * 60)

    passed = sum(1 for r in results if r.status == "passed")
    failed = sum(1 for r in results if r.status == "failed")

    print(f"Scenarios: {passed} passed, {failed} failed out of {len(results)}")
    print(f"Reports saved to: /root/payverse/qa_reports/")
    print(f"Screenshots saved to: /root/payverse/qa_screenshots/")
    print("=" * 60)

    return failed == 0


async def interactive_mode():
    """Run Zarah in interactive mode."""
    print_banner()
    print("\n🎮 Zarah Interactive Mode")
    print("=" * 50)
    print("Commands:")
    print("  navigate <url>     - Navigate to URL")
    print("  click <selector>   - Click element")
    print("  type <sel> <text>  - Type into field")
    print("  screenshot [name]  - Take screenshot")
    print("  content            - Get page content")
    print("  assert <text>      - Assert text present")
    print("  wait [ms]          - Wait (default 1000ms)")
    print("  scroll <up|down>   - Scroll page")
    print("  close              - Close browser")
    print("  help               - Show commands")
    print("  quit               - Exit")
    print("=" * 50 + "\n")

    agent = QATestingAgent(AgentConfig(verbose=False))

    while True:
        try:
            cmd = input("\033[96mzarah>\033[0m ").strip()
            if not cmd:
                continue

            parts = cmd.split(maxsplit=2)
            action = parts[0].lower()

            if action == "quit" or action == "exit":
                await agent.close()
                print("👋 Goodbye!")
                break

            elif action == "help":
                print("Commands: navigate, click, type, screenshot, content, assert, wait, scroll, close, quit")

            elif action == "navigate" and len(parts) > 1:
                result = await agent.navigate(parts[1])
                if result["success"]:
                    print(f"✓ Navigated to {parts[1]}")
                else:
                    print(f"✗ Failed: {result.get('error', 'Unknown error')}")

            elif action == "click" and len(parts) > 1:
                result = await agent.click(parts[1])
                print(f"✓ Clicked {parts[1]}" if result["success"] else f"✗ Failed to click")

            elif action == "type" and len(parts) > 2:
                result = await agent.type_text(parts[1], parts[2])
                print(f"✓ Typed text" if result["success"] else f"✗ Failed to type")

            elif action == "screenshot":
                name = parts[1] if len(parts) > 1 else "interactive"
                filepath = await agent.screenshot(name)
                print(f"✓ Screenshot saved: {filepath}" if filepath else "✗ Failed")

            elif action == "content":
                content = await agent.get_content()
                print(f"\n{content[:1000]}...\n" if len(content) > 1000 else f"\n{content}\n")

            elif action == "assert" and len(parts) > 1:
                text = " ".join(parts[1:])
                result = await agent.assert_text_present(text)
                print(f"✓ Text found: {text}" if result else f"✗ Text not found: {text}")

            elif action == "wait":
                ms = int(parts[1]) if len(parts) > 1 else 1000
                await agent.wait(timeout=ms)
                print(f"✓ Waited {ms}ms")

            elif action == "scroll" and len(parts) > 1:
                direction = parts[1].lower()
                if direction in ("up", "down"):
                    await agent.scroll(direction)
                    print(f"✓ Scrolled {direction}")
                else:
                    print("Use: scroll up|down")

            elif action == "close":
                await agent.close()
                print("✓ Browser closed")

            else:
                print(f"Unknown command: {action}. Type 'help' for commands.")

        except KeyboardInterrupt:
            print("\n👋 Interrupted. Goodbye!")
            await agent.close()
            break
        except Exception as e:
            print(f"✗ Error: {e}")


async def run_form_test(url: str, config_file: str = None):
    """Run a form test with configuration."""
    print_banner()

    if config_file:
        with open(config_file) as f:
            config = json.load(f)
    else:
        # Default form test config
        config = {
            "url": url,
            "form_data": {},
            "submit_selector": "button[type=submit]",
            "success_indicator": "success"
        }

    agent = QATestingAgent()
    result = await agent.test_form_submission(
        url=config["url"],
        form_data=config.get("form_data", {}),
        submit_selector=config.get("submit_selector", "button[type=submit]"),
        success_indicator=config.get("success_indicator", "success")
    )

    await agent.close()
    return result.status == "passed"


def main():
    """Main entry point."""
    parser = argparse.ArgumentParser(
        description="ZARAH - Expert Browser QA Testing Agent",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  python zarah.py test https://example.com
  python zarah.py test https://example.com --text "Example Domain"
  python zarah.py run tests/login_test.json
  python zarah.py interactive
  python zarah.py demo
        """
    )

    subparsers = parser.add_subparsers(dest="command", help="Available commands")

    # Test command
    test_parser = subparsers.add_parser("test", help="Quick page load test")
    test_parser.add_argument("url", help="URL to test")
    test_parser.add_argument("--text", "-t", help="Expected text to verify")
    test_parser.add_argument("--no-screenshot", action="store_true", help="Skip screenshot")

    # Run command
    run_parser = subparsers.add_parser("run", help="Run test scenario file")
    run_parser.add_argument("file", help="JSON scenario file path")

    # Interactive command
    subparsers.add_parser("interactive", help="Interactive testing mode")

    # Demo command
    subparsers.add_parser("demo", help="Run demonstration tests")

    # Form test command
    form_parser = subparsers.add_parser("form", help="Test form submission")
    form_parser.add_argument("url", help="Form URL")
    form_parser.add_argument("--config", "-c", help="Form config JSON file")

    args = parser.parse_args()

    if not args.command:
        print_banner()
        parser.print_help()
        return

    # Run the appropriate command
    if args.command == "test":
        success = asyncio.run(quick_test(
            args.url,
            expected_text=args.text,
            screenshot=not args.no_screenshot
        ))
        sys.exit(0 if success else 1)

    elif args.command == "run":
        success = asyncio.run(run_scenario_file(args.file))
        sys.exit(0 if success else 1)

    elif args.command == "interactive":
        asyncio.run(interactive_mode())

    elif args.command == "demo":
        success = asyncio.run(run_demo())
        sys.exit(0 if success else 1)

    elif args.command == "form":
        success = asyncio.run(run_form_test(args.url, args.config))
        sys.exit(0 if success else 1)


if __name__ == "__main__":
    main()
