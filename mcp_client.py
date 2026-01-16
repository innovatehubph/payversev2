#!/usr/bin/env python3
"""MCP Client for Browser Use - Connects to the browser MCP server."""

import asyncio
import json
import sys
from contextlib import asynccontextmanager

from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client


async def run_client():
    """Run the MCP client and test browser tools."""
    server_params = StdioServerParameters(
        command="/root/payverse/venv/bin/python",
        args=["/root/payverse/mcp_browser_server.py"],
        env={"DISPLAY": ":0"}
    )

    async with stdio_client(server_params) as (read, write):
        async with ClientSession(read, write) as session:
            # Initialize the session
            await session.initialize()

            # List available tools
            tools = await session.list_tools()
            print("Available tools:")
            for tool in tools.tools:
                print(f"  - {tool.name}: {tool.description}")

            print("\n" + "=" * 50)
            print("MCP Browser Server connected successfully!")
            print("=" * 50)

            # Test navigation
            if len(sys.argv) > 1 and sys.argv[1] == "--test":
                print("\nRunning test: Navigating to example.com...")
                result = await session.call_tool(
                    "browser_navigate",
                    {"url": "https://example.com"}
                )
                print(f"Navigation result: {result.content[0].text}")

                print("\nGetting page content...")
                result = await session.call_tool("browser_get_content", {})
                print(f"Page content (first 500 chars):\n{result.content[0].text[:500]}")

                print("\nClosing browser...")
                result = await session.call_tool("browser_close", {})
                print(f"Close result: {result.content[0].text}")

            return True


async def interactive_client():
    """Run an interactive MCP client session."""
    server_params = StdioServerParameters(
        command="/root/payverse/venv/bin/python",
        args=["/root/payverse/mcp_browser_server.py"],
        env={"DISPLAY": ":0"}
    )

    async with stdio_client(server_params) as (read, write):
        async with ClientSession(read, write) as session:
            await session.initialize()

            tools = await session.list_tools()
            tool_names = [t.name for t in tools.tools]

            print("Browser MCP Client - Interactive Mode")
            print("Available commands:")
            print("  navigate <url>  - Navigate to URL")
            print("  screenshot      - Take screenshot")
            print("  content         - Get page content")
            print("  click <sel>     - Click element")
            print("  type <sel> <txt>- Type into field")
            print("  close           - Close browser")
            print("  quit            - Exit client")
            print()

            while True:
                try:
                    cmd = input("> ").strip()
                    if not cmd:
                        continue

                    parts = cmd.split(maxsplit=2)
                    action = parts[0].lower()

                    if action == "quit":
                        break
                    elif action == "navigate" and len(parts) > 1:
                        result = await session.call_tool("browser_navigate", {"url": parts[1]})
                        print(result.content[0].text)
                    elif action == "screenshot":
                        result = await session.call_tool("browser_screenshot", {})
                        print("Screenshot captured (base64 image data available)")
                    elif action == "content":
                        result = await session.call_tool("browser_get_content", {})
                        print(result.content[0].text[:2000])
                    elif action == "click" and len(parts) > 1:
                        result = await session.call_tool("browser_click", {"selector": parts[1]})
                        print(result.content[0].text)
                    elif action == "type" and len(parts) > 2:
                        result = await session.call_tool("browser_type", {"selector": parts[1], "text": parts[2]})
                        print(result.content[0].text)
                    elif action == "close":
                        result = await session.call_tool("browser_close", {})
                        print(result.content[0].text)
                    else:
                        print(f"Unknown command: {cmd}")

                except KeyboardInterrupt:
                    break
                except Exception as e:
                    print(f"Error: {e}")

            print("Goodbye!")


if __name__ == "__main__":
    if len(sys.argv) > 1 and sys.argv[1] == "--interactive":
        asyncio.run(interactive_client())
    else:
        asyncio.run(run_client())
