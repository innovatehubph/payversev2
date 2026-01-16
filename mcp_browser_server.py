#!/usr/bin/env python3
"""MCP Server for Browser Use - Provides browser automation tools via MCP protocol."""

import asyncio
import base64
from typing import Any

from mcp.server import Server
from mcp.server.stdio import stdio_server
from mcp.types import Tool, TextContent, ImageContent

from playwright.async_api import async_playwright, Browser, Page

# Global browser instance
playwright_instance = None
browser: Browser | None = None
page: Page | None = None

app = Server("browser-use-mcp")


async def get_browser() -> Browser:
    """Get or create a browser instance."""
    global playwright_instance, browser
    if browser is None:
        playwright_instance = await async_playwright().start()
        browser = await playwright_instance.chromium.launch(
            headless=True,
            args=['--no-sandbox', '--disable-setuid-sandbox']
        )
    return browser


async def get_page() -> Page:
    """Get or create a page instance."""
    global page
    if page is None:
        b = await get_browser()
        page = await b.new_page()
    return page


@app.list_tools()
async def list_tools() -> list[Tool]:
    """List available browser tools."""
    return [
        Tool(
            name="browser_navigate",
            description="Navigate to a URL in the browser",
            inputSchema={
                "type": "object",
                "properties": {
                    "url": {"type": "string", "description": "The URL to navigate to"}
                },
                "required": ["url"],
            },
        ),
        Tool(
            name="browser_screenshot",
            description="Take a screenshot of the current page",
            inputSchema={
                "type": "object",
                "properties": {},
            },
        ),
        Tool(
            name="browser_click",
            description="Click on an element by selector or text",
            inputSchema={
                "type": "object",
                "properties": {
                    "selector": {"type": "string", "description": "CSS selector or text to click"},
                },
                "required": ["selector"],
            },
        ),
        Tool(
            name="browser_type",
            description="Type text into an input field",
            inputSchema={
                "type": "object",
                "properties": {
                    "selector": {"type": "string", "description": "CSS selector of input field"},
                    "text": {"type": "string", "description": "Text to type"},
                },
                "required": ["selector", "text"],
            },
        ),
        Tool(
            name="browser_get_content",
            description="Get the text content of the current page",
            inputSchema={
                "type": "object",
                "properties": {},
            },
        ),
        Tool(
            name="browser_get_html",
            description="Get the HTML content of the current page",
            inputSchema={
                "type": "object",
                "properties": {},
            },
        ),
        Tool(
            name="browser_scroll",
            description="Scroll the page up or down",
            inputSchema={
                "type": "object",
                "properties": {
                    "direction": {"type": "string", "enum": ["up", "down"], "description": "Scroll direction"},
                    "amount": {"type": "number", "description": "Amount to scroll in pixels (default 500)"},
                },
                "required": ["direction"],
            },
        ),
        Tool(
            name="browser_wait",
            description="Wait for a specified time or selector",
            inputSchema={
                "type": "object",
                "properties": {
                    "selector": {"type": "string", "description": "CSS selector to wait for (optional)"},
                    "timeout": {"type": "number", "description": "Time to wait in milliseconds (default 1000)"},
                },
            },
        ),
        Tool(
            name="browser_close",
            description="Close the browser",
            inputSchema={
                "type": "object",
                "properties": {},
            },
        ),
    ]


@app.call_tool()
async def call_tool(name: str, arguments: dict[str, Any]) -> list[TextContent | ImageContent]:
    """Handle tool calls."""
    global browser, page, playwright_instance

    try:
        if name == "browser_navigate":
            p = await get_page()
            await p.goto(arguments["url"], wait_until="domcontentloaded")
            title = await p.title()
            return [TextContent(type="text", text=f"Navigated to {arguments['url']} - Title: {title}")]

        elif name == "browser_screenshot":
            p = await get_page()
            screenshot = await p.screenshot()
            screenshot_b64 = base64.b64encode(screenshot).decode("utf-8")
            return [
                ImageContent(type="image", data=screenshot_b64, mimeType="image/png"),
                TextContent(type="text", text="Screenshot captured"),
            ]

        elif name == "browser_click":
            p = await get_page()
            selector = arguments["selector"]
            try:
                await p.click(selector, timeout=5000)
            except:
                # Try clicking by text
                await p.get_by_text(selector).click(timeout=5000)
            return [TextContent(type="text", text=f"Clicked on {selector}")]

        elif name == "browser_type":
            p = await get_page()
            await p.fill(arguments["selector"], arguments["text"])
            return [TextContent(type="text", text=f"Typed text into {arguments['selector']}")]

        elif name == "browser_get_content":
            p = await get_page()
            text = await p.evaluate("() => document.body.innerText")
            return [TextContent(type="text", text=text[:10000])]  # Limit to 10k chars

        elif name == "browser_get_html":
            p = await get_page()
            html = await p.content()
            return [TextContent(type="text", text=html[:20000])]  # Limit to 20k chars

        elif name == "browser_scroll":
            p = await get_page()
            direction = arguments["direction"]
            amount = arguments.get("amount", 500)
            if direction == "down":
                await p.evaluate(f"window.scrollBy(0, {amount})")
            else:
                await p.evaluate(f"window.scrollBy(0, -{amount})")
            return [TextContent(type="text", text=f"Scrolled {direction} by {amount}px")]

        elif name == "browser_wait":
            p = await get_page()
            selector = arguments.get("selector")
            timeout = arguments.get("timeout", 1000)
            if selector:
                await p.wait_for_selector(selector, timeout=timeout)
                return [TextContent(type="text", text=f"Element {selector} found")]
            else:
                await asyncio.sleep(timeout / 1000)
                return [TextContent(type="text", text=f"Waited {timeout}ms")]

        elif name == "browser_close":
            if page:
                await page.close()
                page = None
            if browser:
                await browser.close()
                browser = None
            if playwright_instance:
                await playwright_instance.stop()
                playwright_instance = None
            return [TextContent(type="text", text="Browser closed")]

        else:
            return [TextContent(type="text", text=f"Unknown tool: {name}")]

    except Exception as e:
        return [TextContent(type="text", text=f"Error: {str(e)}")]


async def main():
    """Run the MCP server."""
    async with stdio_server() as (read_stream, write_stream):
        await app.run(read_stream, write_stream, app.create_initialization_options())


if __name__ == "__main__":
    asyncio.run(main())
